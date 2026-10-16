// Password hashing, sessions, auth middleware and small request helpers.
const crypto = require('node:crypto');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Used when an email is unknown so a failed login takes as long as a real one (no account enumeration by timing)
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return out;
}

// Simple in-memory limiter: max `limit` hits per `windowMs` per key.
function rateLimiter(limit, windowMs, message = 'Too many attempts. Please wait a few minutes and try again.') {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    if (hits.size > 20000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (list.length > limit) throw new HttpError(429, message);
  };
}

/* ---------- Password policy ---------- */
const COMMON_PASSWORDS = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123',
  'qwertyuiop', 'iloveyou', 'admin123', 'admin@123', 'welcome1', 'welcome123', 'abc12345', 'abcd1234', 'letmein1', 'india123',
  'passw0rd', 'p@ssw0rd', 'football1', 'sunshine1', 'monkey123', 'dragon123', 'princess1', 'bookstore1', 'books123']);

function checkPassword(pw, { email = '', name = '' } = {}) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (pw.length > 128) throw new HttpError(400, 'Password is too long.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'Password must contain letters and numbers.');
  const lower = pw.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) throw new HttpError(400, 'That password is too common. Please choose something harder to guess.');
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) throw new HttpError(400, 'Your password should not contain your email address.');
  if (/^(.)\1+$/.test(pw)) throw new HttpError(400, 'Please choose a less predictable password.');
  return true;
}

/* ---------- Two-factor authentication (TOTP, RFC 6238) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  let bits = 0; let value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

function totpAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1000000).toString();
  return code.padStart(6, '0');
}

// Returns the matched time step (to block reuse), or 0 if the code is wrong. Allows one step of clock drift.
function verifyTotp(secret, code, lastStep = 0) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) return 0;
  const now = Math.floor(Date.now() / 30000);
  for (const step of [now, now - 1, now + 1]) {
    if (step <= lastStep) continue;
    const expected = totpAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return 0;
}

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
function newBackupCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const raw = crypto.randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
const normalizeBackupCode = (c) => String(c || '').toLowerCase().replace(/[^0-9a-f]/g, '').replace(/^(.{5})(.{5})$/, '$1-$2');

/* ---------- Devices ---------- */
function describeDevice(ua = '') {
  const s = String(ua);
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Chrome\//.test(s) ? 'Chrome'
    : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : /curl|node|fetch/i.test(s) ? 'Script' : 'Browser';
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS'
    : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : 'Unknown device';
  const mobile = /Mobile|Android|iPhone/.test(s);
  return { browser, os, mobile, label: `${browser} on ${os}` };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(value, { max = 500, required = false, field = 'Field' } = {}) {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (required && !s) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters).`);
  return s;
}

function int(value, { min = -Infinity, max = Infinity, field = 'Value' } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} is invalid.`);
  return n;
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Admin access only.'));
  next();
}

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, HttpError, parseCookies, rateLimiter, EMAIL_RE, str, int, requireAuth, requireAdmin,
  checkPassword, newTotpSecret, verifyTotp, totpAt, hashToken, newBackupCodes, normalizeBackupCode, describeDevice,
};
