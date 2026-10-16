// Registration, login (with lockout and two-factor), sessions/devices, account security and privacy.
const crypto = require('node:crypto');
const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');
const { db, transaction } = require('../db');
const { logEvent, audit } = require('../audit');
const {
  hashPassword, verifyPassword, DUMMY_HASH, HttpError, rateLimiter, EMAIL_RE, str, requireAuth, checkPassword,
  newTotpSecret, verifyTotp, hashToken, newBackupCodes, normalizeBackupCode, describeDevice,
} = require('../security');

const router = express.Router();
const loginLimit = rateLimiter(10, 10 * 60 * 1000);
const registerLimit = rateLimiter(10, 60 * 60 * 1000);
const mfaLimit = rateLimiter(10, 10 * 60 * 1000);
const sensitiveLimit = rateLimiter(10, 15 * 60 * 1000);

// Pending two-factor logins: token -> { userId, expires, attempts }
const pendingMfa = new Map();

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address,
    city: u.city, state: u.state, pincode: u.pincode, created_at: u.created_at,
    totp_enabled: !!u.totp_enabled, password_changed_at: u.password_changed_at || null,
  };
}

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = config.SESSION_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, ip, user_agent, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(token, userId, now + maxAge, req.ip || null, String(req.get('user-agent') || '').slice(0, 300), now, now);
  res.cookie('session', token, {
    httpOnly: true, sameSite: 'lax', secure: config.HTTPS_ONLY || req.secure, maxAge, path: '/',
  });
}

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

// Re-check the password before sensitive changes
function confirmPassword(req, password) {
  sensitiveLimit(`pw:${req.user.id}`);
  const user = getUser(req.user.id);
  if (!verifyPassword(String(password || ''), user.password_hash)) {
    logEvent(req, { userId: user.id, email: user.email, event: 'password check failed', success: false });
    throw new HttpError(400, 'Your password is incorrect.');
  }
  return user;
}

// Accept either a 6-digit authenticator code or an unused backup code
function checkSecondFactor(user, code) {
  const step = verifyTotp(user.totp_secret, code, user.totp_last_step);
  if (step) {
    db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id);
    return 'authenticator';
  }
  const normalized = normalizeBackupCode(code);
  if (normalized.length === 11) {
    const row = db.prepare('SELECT id FROM backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
      .get(user.id, hashToken(normalized));
    if (row) {
      db.prepare("UPDATE backup_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);
      return 'backup code';
    }
  }
  return null;
}

function saveBackupCodes(userId) {
  const codes = newBackupCodes();
  db.prepare('DELETE FROM backup_codes WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT INTO backup_codes (user_id, code_hash) VALUES (?, ?)');
  for (const c of codes) insert.run(userId, hashToken(c));
  return codes;
}

/* ---------- Sign up / sign in ---------- */
router.post('/register', (req, res) => {
  registerLimit(req.ip);
  const name = str(req.body.name, { required: true, max: 80, field: 'Name' });
  const email = str(req.body.email, { required: true, max: 120, field: 'Email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  checkPassword(req.body.password, { email, name });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'An account with this email already exists. Try logging in.');
  }
  const { lastInsertRowid } = db.prepare("INSERT INTO users (name, email, password_hash, password_changed_at) VALUES (?, ?, ?, datetime('now'))")
    .run(name, email, hashPassword(req.body.password));
  const userId = Number(lastInsertRowid);
  logEvent(req, { userId, email, event: 'account created', success: true });
  startSession(req, res, userId);
  res.status(201).json({ user: publicUser(getUser(userId)) });
});

router.post('/login', (req, res) => {
  loginLimit(req.ip);
  const email = str(req.body.email, { required: true, max: 120, field: 'Email' }).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    verifyPassword(password, DUMMY_HASH); // same timing as a real check
    logEvent(req, { email, event: 'sign-in failed', success: false });
    throw new HttpError(401, 'Incorrect email or password.');
  }
  const now = Date.now();
  if (user.locked_until > now) {
    logEvent(req, { userId: user.id, email, event: 'sign-in blocked (account locked)', success: false });
    const mins = Math.ceil((user.locked_until - now) / 60000);
    throw new HttpError(423, `Too many failed attempts. For your safety this account is locked for ${mins} more minute${mins === 1 ? '' : 's'}.`);
  }
  if (!verifyPassword(password, user.password_hash)) {
    const fails = user.failed_logins + 1;
    const lock = fails >= config.MAX_FAILED_LOGINS;
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
      .run(lock ? 0 : fails, lock ? now + config.LOCK_MINUTES * 60000 : 0, user.id);
    logEvent(req, { userId: user.id, email, event: lock ? 'account locked after failed sign-ins' : 'wrong password', success: false });
    if (lock) throw new HttpError(423, `Too many failed attempts. For your safety this account is locked for ${config.LOCK_MINUTES} minutes.`);
    throw new HttpError(401, 'Incorrect email or password.');
  }
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').run(user.id);

  if (user.totp_enabled) {
    const mfaToken = crypto.randomBytes(24).toString('hex');
    pendingMfa.set(mfaToken, { userId: user.id, expires: now + 5 * 60000, attempts: 0 });
    for (const [k, v] of pendingMfa) if (v.expires < now) pendingMfa.delete(k);
    logEvent(req, { userId: user.id, email, event: 'password accepted, waiting for 2FA code', success: true });
    return res.json({ mfa_required: true, mfa_token: mfaToken });
  }
  logEvent(req, { userId: user.id, email, event: 'signed in', success: true });
  startSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/login/2fa', (req, res) => {
  mfaLimit(req.ip);
  const pending = pendingMfa.get(String(req.body.mfa_token || ''));
  if (!pending || pending.expires < Date.now()) throw new HttpError(401, 'Your sign-in has expired. Please enter your password again.');
  const user = getUser(pending.userId);
  const method = checkSecondFactor(user, req.body.code);
  if (!method) {
    pending.attempts++;
    logEvent(req, { userId: user.id, email: user.email, event: 'wrong 2FA code', success: false });
    if (pending.attempts >= 5) {
      pendingMfa.delete(req.body.mfa_token);
      throw new HttpError(401, 'Too many wrong codes. Please sign in again.');
    }
    throw new HttpError(401, 'That code is not correct. Check your authenticator app and try again.');
  }
  pendingMfa.delete(req.body.mfa_token);
  logEvent(req, { userId: user.id, email: user.email, event: `signed in with 2FA (${method})`, success: true });
  startSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  res.clearCookie('session', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(getUser(req.user.id)) : null });
});

router.put('/profile', requireAuth, (req, res) => {
  const name = str(req.body.name, { required: true, max: 80, field: 'Name' });
  const phone = str(req.body.phone, { max: 20, field: 'Phone' });
  const address = str(req.body.address, { max: 300, field: 'Address' });
  const city = str(req.body.city, { max: 60, field: 'City' });
  const state = str(req.body.state, { max: 60, field: 'State' });
  const pincode = str(req.body.pincode, { max: 10, field: 'PIN code' });
  db.prepare('UPDATE users SET name=?, phone=?, address=?, city=?, state=?, pincode=? WHERE id=?')
    .run(name, phone, address, city, state, pincode, req.user.id);
  res.json({ user: publicUser(getUser(req.user.id)) });
});

router.put('/password', requireAuth, (req, res) => {
  const user = confirmPassword(req, req.body.current_password);
  checkPassword(req.body.new_password, { email: user.email, name: user.name });
  if (verifyPassword(req.body.new_password, user.password_hash)) throw new HttpError(400, 'Your new password must be different from the current one.');
  db.prepare("UPDATE users SET password_hash = ?, password_changed_at = datetime('now') WHERE id = ?").run(hashPassword(req.body.new_password), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, req.sessionToken);
  logEvent(req, { userId: user.id, email: user.email, event: 'password changed', success: true });
  res.json({ ok: true });
});

/* ---------- Security centre ---------- */
const sessionId = (token) => hashToken(token).slice(0, 16);

router.get('/security', requireAuth, (req, res) => {
  const user = getUser(req.user.id);
  const sessions = db.prepare('SELECT token, ip, user_agent, created_at, last_seen FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC')
    .all(user.id, Date.now())
    .map((s) => ({
      id: sessionId(s.token), current: s.token === req.sessionToken, device: describeDevice(s.user_agent),
      ip: s.ip, created_at: s.created_at, last_seen: s.last_seen,
    }));
  const events = db.prepare('SELECT event, success, ip, user_agent, created_at FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT 25')
    .all(user.id).map((e) => ({ ...e, device: describeDevice(e.user_agent).label, user_agent: undefined }));
  const failed30 = db.prepare("SELECT COUNT(*) AS n FROM login_events WHERE user_id = ? AND success = 0 AND created_at > datetime('now', '-30 days')").get(user.id).n;
  const backupLeft = db.prepare('SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ? AND used_at IS NULL').get(user.id).n;
  res.json({
    totp_enabled: !!user.totp_enabled, backup_codes_left: backupLeft, password_changed_at: user.password_changed_at,
    created_at: user.created_at, failed_last_30_days: failed30, sessions, events,
  });
});

router.delete('/sessions/:id', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT token FROM sessions WHERE user_id = ?').all(req.user.id);
  const target = rows.find((r) => sessionId(r.token) === req.params.id);
  if (!target) throw new HttpError(404, 'That device is already signed out.');
  db.prepare('DELETE FROM sessions WHERE token = ?').run(target.token);
  logEvent(req, { userId: req.user.id, email: req.user.email, event: 'signed out a device remotely', success: true });
  res.json({ ok: true, current: target.token === req.sessionToken });
});

router.post('/sessions/revoke-others', requireAuth, (req, res) => {
  const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.sessionToken);
  logEvent(req, { userId: req.user.id, email: req.user.email, event: `signed out ${changes} other device(s)`, success: true });
  res.json({ ok: true, count: changes });
});

/* ---------- Two-factor authentication ---------- */
router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const user = confirmPassword(req, req.body.password);
    if (user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is already on.');
    const secret = newTotpSecret();
    db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = 0 WHERE id = ?').run(secret, user.id);
    const label = encodeURIComponent(`Online Bookstore:${user.email}`);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Online Bookstore')}&algorithm=SHA1&digits=6&period=30`;
    const qr = await QRCode.toString(otpauth, { type: 'svg', margin: 1, width: 200, errorCorrectionLevel: 'M' });
    res.json({ secret, otpauth, qr });
  } catch (err) { next(err); }
});

router.post('/2fa/enable', requireAuth, (req, res) => {
  sensitiveLimit(`2fa:${req.user.id}`);
  const user = getUser(req.user.id);
  if (user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is already on.');
  if (!user.totp_secret) throw new HttpError(400, 'Please start the setup again.');
  const step = verifyTotp(user.totp_secret, req.body.code, 0);
  if (!step) throw new HttpError(400, 'That code is not correct. Make sure the time on your phone is set automatically, then try the newest code.');
  const codes = transaction(() => {
    db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, user.id);
    return saveBackupCodes(user.id);
  });
  logEvent(req, { userId: user.id, email: user.email, event: 'two-factor authentication turned on', success: true });
  res.json({ ok: true, backup_codes: codes });
});

router.post('/2fa/disable', requireAuth, (req, res) => {
  const user = confirmPassword(req, req.body.password);
  if (!user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is already off.');
  if (!checkSecondFactor(user, req.body.code)) throw new HttpError(400, 'That code is not correct.');
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM backup_codes WHERE user_id = ?').run(user.id);
  logEvent(req, { userId: user.id, email: user.email, event: 'two-factor authentication turned off', success: true });
  res.json({ ok: true });
});

router.post('/2fa/backup-codes', requireAuth, (req, res) => {
  const user = confirmPassword(req, req.body.password);
  if (!user.totp_enabled) throw new HttpError(400, 'Turn on two-factor authentication first.');
  const codes = saveBackupCodes(user.id);
  logEvent(req, { userId: user.id, email: user.email, event: 'new backup codes created', success: true });
  res.json({ backup_codes: codes });
});

/* ---------- Privacy: export and delete ---------- */
router.get('/export', requireAuth, (req, res) => {
  const id = req.user.id;
  const all = (sql) => db.prepare(sql).all(id);
  const data = {
    exported_at: new Date().toISOString(),
    profile: publicUser(getUser(id)),
    orders: all('SELECT * FROM orders WHERE user_id = ?').map((o) => ({ ...o, items: db.prepare('SELECT title, author, price, qty FROM order_items WHERE order_id = ?').all(o.id) })),
    reviews: all('SELECT r.rating, r.comment, r.created_at, b.title FROM reviews r JOIN books b ON b.id = r.book_id WHERE r.user_id = ?'),
    wishlist: all('SELECT b.title, b.author, w.created_at FROM wishlist w JOIN books b ON b.id = w.book_id WHERE w.user_id = ?'),
    reading_progress: all('SELECT b.title, p.page, p.total_pages, p.updated_at FROM reading_progress p JOIN books b ON b.id = p.book_id WHERE p.user_id = ?'),
    bookmarks: all('SELECT b.title, k.page, k.note, k.created_at FROM bookmarks k JOIN books b ON b.id = k.book_id WHERE k.user_id = ?'),
    submissions: all('SELECT title, author_name, genre, status, admin_note, created_at FROM submissions WHERE user_id = ?'),
    sign_in_history: all('SELECT event, success, ip, created_at FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT 500'),
  };
  logEvent(req, { userId: id, email: req.user.email, event: 'downloaded account data', success: true });
  res.set('Content-Disposition', 'attachment; filename="my-bookstore-data.json"');
  res.json(data);
});

router.delete('/account', requireAuth, (req, res) => {
  const user = confirmPassword(req, req.body.password);
  if (req.body.confirm !== 'DELETE') throw new HttpError(400, 'Please type DELETE to confirm.');
  if (user.role === 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n <= 1) {
    throw new HttpError(400, 'You are the only admin. Make another account an admin before deleting yours.');
  }
  audit(req, 'account deleted', `${user.email} deleted their own account`);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.clearCookie('session', { path: '/' });
  res.json({ ok: true });
});

module.exports = router;
