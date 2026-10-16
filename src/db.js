// SQLite database (Node's built-in node:sqlite) - schema, seed data and helpers.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { hashPassword } = require('./security');

const DATA_DIR = path.join(__dirname, '..', 'data');
// The database and cached book texts can live elsewhere (e.g. a persistent disk) via DATA_DIR
const STORE_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : DATA_DIR;
fs.mkdirSync(path.join(STORE_DIR, 'texts'), { recursive: true });

const db = new DatabaseSync(path.join(STORE_DIR, 'bookstore.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  phone TEXT, address TEXT, city TEXT, state TEXT, pincode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  genre TEXT NOT NULL,
  year INTEGER,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  gutenberg_id INTEGER,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  format TEXT NOT NULL DEFAULT 'Paperback',
  level TEXT,
  subject TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (book_id, user_id)
);
CREATE TABLE IF NOT EXISTS cart_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, book_id)
);
CREATE TABLE IF NOT EXISTS wishlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtotal REAL NOT NULL, shipping REAL NOT NULL, total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Placed',
  payment_method TEXT NOT NULL,
  ship_name TEXT, ship_phone TEXT, ship_address TEXT, ship_city TEXT, ship_state TEXT, ship_pincode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
  title TEXT NOT NULL, author TEXT, price REAL NOT NULL, qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Every sign-in attempt (successful or not), shown in the user's security centre
CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  event TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, id);
-- One-time backup codes for two-factor sign-in (stored hashed)
CREATE TABLE IF NOT EXISTS backup_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT
);
-- Record of admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Full text of books written by community members (kept apart so catalog queries stay small)
CREATE TABLE IF NOT EXISTS book_texts (
  book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  content TEXT NOT NULL
);
-- Books submitted by users, waiting for (or after) admin review
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author_name TEXT NOT NULL,
  genre TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'English',
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_books_genre ON books(genre);
`);

// Migration: databases created before format/level/subject existed
const bookCols = db.prepare('PRAGMA table_info(books)').all().map((c) => c.name);
for (const [col, def] of [['format', "TEXT NOT NULL DEFAULT 'Paperback'"], ['level', 'TEXT'], ['subject', 'TEXT'],
  ['published_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL']]) {
  if (!bookCols.includes(col)) db.exec(`ALTER TABLE books ADD COLUMN ${col} ${def}`);
}
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const [col, def] of [
  ['totp_secret', 'TEXT'], ['totp_enabled', 'INTEGER NOT NULL DEFAULT 0'], ['totp_last_step', 'INTEGER NOT NULL DEFAULT 0'],
  ['failed_logins', 'INTEGER NOT NULL DEFAULT 0'], ['locked_until', 'INTEGER NOT NULL DEFAULT 0'], ['password_changed_at', 'TEXT'],
]) {
  if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
}
const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
for (const [col, def] of [['ip', 'TEXT'], ['user_agent', 'TEXT'], ['created_at', 'INTEGER NOT NULL DEFAULT 0'], ['last_seen', 'INTEGER NOT NULL DEFAULT 0']]) {
  if (!sessionCols.includes(col)) db.exec(`ALTER TABLE sessions ADD COLUMN ${col} ${def}`);
}
const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
for (const [col, def] of [['discount', 'REAL NOT NULL DEFAULT 0'], ['coupon', 'TEXT']]) {
  if (!orderCols.includes(col)) db.exec(`ALTER TABLE orders ADD COLUMN ${col} ${def}`);
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
`);

// Run fn inside a transaction; rolls back on error.
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Bump this whenever books.json gains new titles; missing titles are added on next start
// without touching users, orders or books an admin has edited.
const CATALOG_VERSION = 2;

function seed() {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version < CATALOG_VERSION) {
    const books = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'books.json'), 'utf8'));
    const find = db.prepare('SELECT id FROM books WHERE title = ? AND author = ?');
    const insert = db.prepare(`INSERT INTO books
      (title, author, genre, year, price, stock, gutenberg_id, description, language, format, level, subject, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const tag = db.prepare('UPDATE books SET format = ?, level = ?, subject = ?, language = ? WHERE id = ?');
    let added = 0;
    transaction(() => {
      for (const b of books) {
        const row = find.get(b.title, b.author);
        if (row) {
          tag.run(b.format || 'Paperback', b.level || null, b.subject || null, b.language || 'English', row.id);
          continue;
        }
        insert.run(b.title, b.author, b.genre, b.year ?? null, b.price, b.stock, b.gutenberg_id ?? null, b.description,
          b.language || 'English', b.format || 'Paperback', b.level || null, b.subject || null, b.featured || 0);
        added++;
      }
      db.exec(`PRAGMA user_version = ${CATALOG_VERSION}`);
    });
    if (added) console.log(`Added ${added} books to the catalog.`);
  }
  // Create the first admin only when the store has none (later changes are made on the website)
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) {
    let password = config.ADMIN_PASSWORD;
    if (!password) {
      password = crypto.randomBytes(12).toString('base64url');
      console.log(`\n  No ADMIN_PASSWORD set in .env. Generated admin password (shown once): ${password}\n`);
    }
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run(config.ADMIN_NAME, config.ADMIN_EMAIL.toLowerCase(), hashPassword(password));
    console.log(`Created admin account ${config.ADMIN_EMAIL}.`);
  }
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare("DELETE FROM login_events WHERE created_at < datetime('now', '-180 days')").run();
}

seed();

module.exports = { db, transaction, DATA_DIR, STORE_DIR };
