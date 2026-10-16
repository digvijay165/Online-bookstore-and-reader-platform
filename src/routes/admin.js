// Admin panel API: dashboard stats, book management, orders, users and messages.
const express = require('express');
const { db } = require('../db');
const { audit } = require('../audit');
const { HttpError, str, int, requireAdmin, describeDevice } = require('../security');
const { BOOK_SELECT } = require('./books');

const router = express.Router();
router.use(requireAdmin);

const ORDER_STATUSES = ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

router.get('/stats', (req, res) => {
  const totals = db.prepare(`SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM books) AS books,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status != 'Cancelled') AS revenue,
    (SELECT COUNT(*) FROM orders WHERE status IN ('Placed', 'Processing')) AS pending_orders,
    (SELECT COUNT(*) FROM messages) AS messages,
    (SELECT COUNT(*) FROM subscribers) AS subscribers,
    (SELECT COUNT(*) FROM reviews) AS reviews,
    (SELECT COUNT(*) FROM submissions WHERE status = 'pending') AS pending_submissions`).get();
  const lowStock = db.prepare('SELECT id, title, author, stock FROM books WHERE stock <= 5 ORDER BY stock ASC LIMIT 10').all();
  const topBooks = db.prepare(`SELECT title, SUM(qty) AS sold, SUM(qty * price) AS revenue FROM order_items oi
    JOIN orders o ON o.id = oi.order_id WHERE o.status != 'Cancelled' GROUP BY title ORDER BY sold DESC LIMIT 5`).all();
  const recentOrders = db.prepare(`SELECT o.id, o.total, o.status, o.created_at, u.name AS customer
    FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 6`).all();
  res.json({ totals, lowStock, topBooks, recentOrders });
});

/* ---------- Books ---------- */
function readBook(body) {
  const gid = body.gutenberg_id === '' || body.gutenberg_id == null ? null
    : int(body.gutenberg_id, { min: 1, max: 999999, field: 'Gutenberg ID' });
  return {
    title: str(body.title, { required: true, max: 200, field: 'Title' }),
    author: str(body.author, { required: true, max: 120, field: 'Author' }),
    genre: str(body.genre, { required: true, max: 60, field: 'Genre' }),
    year: body.year === '' || body.year == null ? null : int(body.year, { min: -3000, max: 2100, field: 'Year' }),
    price: (() => {
      const p = Number(body.price);
      if (!Number.isFinite(p) || p < 0 || p > 100000) throw new HttpError(400, 'Price is invalid.');
      return Math.round(p * 100) / 100;
    })(),
    stock: int(body.stock ?? 0, { min: 0, max: 100000, field: 'Stock' }),
    gutenberg_id: gid,
    description: str(body.description, { max: 3000, field: 'Description' }),
    language: str(body.language || 'English', { max: 40, field: 'Language' }),
    format: FORMATS.includes(body.format) ? body.format : 'Paperback',
    level: LEVELS.includes(body.level) ? body.level : null,
    subject: str(body.subject, { max: 60, field: 'Subject' }) || null,
    featured: body.featured ? 1 : 0,
  };
}
const FORMATS = ['Paperback', 'Hardcover', 'Comic', 'Manga', 'Magazine'];
const LEVELS = ['UG', 'PG', 'PhD', 'Competitive'];

router.post('/books', (req, res) => {
  const b = readBook(req.body);
  const { lastInsertRowid } = db.prepare(`INSERT INTO books
    (title, author, genre, year, price, stock, gutenberg_id, description, language, format, level, subject, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    b.title, b.author, b.genre, b.year, b.price, b.stock, b.gutenberg_id, b.description, b.language,
    b.format, b.level, b.subject, b.featured,
  );
  audit(req, 'book added', `#${lastInsertRowid} ${b.title}`);
  res.status(201).json(db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(lastInsertRowid));
});

router.put('/books/:id', (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const b = readBook(req.body);
  const { changes } = db.prepare(`UPDATE books SET title=?, author=?, genre=?, year=?, price=?, stock=?,
    gutenberg_id=?, description=?, language=?, format=?, level=?, subject=?, featured=? WHERE id=?`).run(
    b.title, b.author, b.genre, b.year, b.price, b.stock, b.gutenberg_id, b.description, b.language,
    b.format, b.level, b.subject, b.featured, id,
  );
  if (!changes) throw new HttpError(404, 'Book not found.');
  audit(req, 'book edited', `#${id} ${b.title}`);
  res.json(db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(id));
});

router.delete('/books/:id', (req, res) => {
  const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(Number(req.params.id));
  if (!book) throw new HttpError(404, 'Book not found.');
  db.prepare('DELETE FROM books WHERE id = ?').run(book.id);
  audit(req, 'book deleted', `#${book.id} ${book.title}`);
  res.json({ ok: true });
});

/* ---------- Orders ---------- */
router.get('/orders', (req, res) => {
  const params = [];
  let where = '';
  if (ORDER_STATUSES.includes(req.query.status)) { where = 'WHERE o.status = ?'; params.push(req.query.status); }
  const orders = db.prepare(`SELECT o.*, u.name AS customer, u.email AS customer_email,
    (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o JOIN users u ON u.id = o.user_id ${where} ORDER BY o.id DESC LIMIT 200`).all(...params);
  res.json(orders);
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare(`SELECT o.*, u.name AS customer, u.email AS customer_email FROM orders o
    JOIN users u ON u.id = o.user_id WHERE o.id = ?`).get(Number(req.params.id));
  if (!order) throw new HttpError(404, 'Order not found.');
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json(order);
});

router.put('/orders/:id', (req, res) => {
  const status = String(req.body.status || '');
  if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');
  const { changes } = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  if (!changes) throw new HttpError(404, 'Order not found.');
  audit(req, 'order status changed', `order #${req.params.id} -> ${status}`);
  res.json({ ok: true });
});

/* ---------- Users ---------- */
router.get('/users', (req, res) => {
  res.json(db.prepare(`SELECT u.id, u.name, u.email, u.role, u.created_at, u.totp_enabled, u.locked_until,
    (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS orders,
    (SELECT COALESCE(SUM(total), 0) FROM orders WHERE user_id = u.id AND status != 'Cancelled') AS spent
    FROM users u ORDER BY u.id DESC`).all());
});

router.put('/users/:id/role', (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const role = req.body.role === 'admin' ? 'admin' : 'customer';
  if (id === req.user.id) throw new HttpError(400, 'You cannot change your own role.');
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'User not found.');
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  // Role changes take effect immediately: sign the user out everywhere
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit(req, 'role changed', `${target.email} -> ${role}`);
  res.json({ ok: true });
});

/* ---------- Security ---------- */
router.get('/security', (req, res) => {
  const failed = db.prepare(`SELECT e.email, e.event, e.ip, e.user_agent, e.created_at FROM login_events e
    WHERE e.success = 0 ORDER BY e.id DESC LIMIT 50`).all().map((e) => ({ ...e, device: describeDevice(e.user_agent).label, user_agent: undefined }));
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM login_events WHERE success = 0 AND created_at > datetime('now', '-1 day')) AS failed_24h,
    (SELECT COUNT(*) FROM login_events WHERE event = 'signed in' OR event LIKE 'signed in with 2FA%') AS sign_ins,
    (SELECT COUNT(*) FROM users WHERE locked_until > ?) AS locked,
    (SELECT COUNT(*) FROM users WHERE totp_enabled = 1) AS with_2fa,
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM users WHERE role = 'admin' AND totp_enabled = 0) AS admins_without_2fa,
    (SELECT COUNT(*) FROM sessions WHERE expires_at > ?) AS active_sessions`).get(Date.now(), Date.now());
  const locked = db.prepare('SELECT id, name, email, locked_until FROM users WHERE locked_until > ?').all(Date.now());
  const auditLog = db.prepare('SELECT user_name, action, details, ip, created_at FROM audit_log ORDER BY id DESC LIMIT 100').all();
  res.json({ counts, failed, locked, audit: auditLog });
});

router.post('/users/:id/unlock', (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'User not found.');
  db.prepare('UPDATE users SET locked_until = 0, failed_logins = 0 WHERE id = ?').run(id);
  audit(req, 'account unlocked', target.email);
  res.json({ ok: true });
});

router.post('/users/:id/signout', (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'User not found.');
  const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(id, req.sessionToken);
  audit(req, 'user signed out everywhere', `${target.email} (${changes} session(s))`);
  res.json({ ok: true, count: changes });
});

/* ---------- Messages ---------- */
router.get('/messages', (req, res) => {
  res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all());
});

router.delete('/messages/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id));
  if (changes) audit(req, 'message deleted', `#${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
