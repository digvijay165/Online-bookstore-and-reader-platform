// Online Bookstore & Reader Zone - Express server entry point.
const path = require('node:path');
const express = require('express');
const config = require('./src/config');
const { db } = require('./src/db');
const { parseCookies, HttpError, rateLimiter } = require('./src/security');

const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', 1);
// Small JSON bodies everywhere, except book manuscripts submitted for publishing
const jsonSmall = express.json({ limit: '200kb' });
const jsonLarge = express.json({ limit: '6mb' });
app.use((req, res, next) => (req.path.startsWith('/api/submissions') ? jsonLarge : jsonSmall)(req, res, next));

// Security headers. The Content Security Policy only allows our own scripts, so injected scripts cannot run.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (config.HTTPS_ONLY) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

// Basic flood protection for the API
const apiLimit = rateLimiter(600, 5 * 60 * 1000, 'You are sending too many requests. Please slow down and try again shortly.');
app.use('/api', (req, res, next) => {
  try { apiLimit(req.ip); next(); } catch (err) { next(err); }
});

// Load the logged-in user from the session cookie (sessions also expire after a period of inactivity)
const findSession = db.prepare(`
  SELECT u.id, u.name, u.email, u.role, u.phone, u.address, u.city, u.state, u.pincode, u.created_at, s.last_seen
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ?`);
const touchSession = db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?');
const dropSession = db.prepare('DELETE FROM sessions WHERE token = ?');
const IDLE_MS = config.SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000;
app.use((req, res, next) => {
  const token = parseCookies(req.headers.cookie).session;
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const now = Date.now();
    const row = findSession.get(token, now);
    if (row && row.last_seen && now - row.last_seen > IDLE_MS) {
      dropSession.run(token);
    } else if (row) {
      const { last_seen: lastSeen, ...user } = row;
      req.user = user;
      req.sessionToken = token;
      if (now - lastSeen > 5 * 60 * 1000) touchSession.run(now, token);
    }
  }
  next();
});

// CSRF guard: state-changing API calls must come from our own pages
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') return next(new HttpError(403, 'Invalid request origin.'));
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* invalid */ }
    if (host !== req.get('host')) return next(new HttpError(403, 'Invalid request origin.'));
  }
  next();
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/books'));
app.use('/api', require('./src/routes/shop'));
app.use('/api', require('./src/routes/reader'));
app.use('/api', require('./src/routes/publish'));
app.use('/api', (req, res, next) => next(new HttpError(404, 'API route not found.')));

// Frontend (single-page app)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

app.listen(config.PORT, config.HOST, () => {
  console.log(`\n  Online Bookstore & Reader Zone is running at http://${config.HOST}:${config.PORT}\n`);
});
