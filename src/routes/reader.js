// Reader Zone: full text of public-domain books, reading progress and bookmarks.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const express = require('express');
const { db, DATA_DIR } = require('../db');
const { HttpError, str, int, requireAuth } = require('../security');

const router = express.Router();
const TEXT_DIR = path.join(DATA_DIR, 'texts');
const inFlight = new Map();

// Remove the Project Gutenberg licence header/footer, keep only the book itself.
function cleanText(raw) {
  let text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  if (start !== -1) text = text.slice(text.indexOf('\n', start) + 1);
  const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (end !== -1) text = text.slice(0, end);
  return text.trim();
}

async function download(gid) {
  const urls = [
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.txt`,
    `https://www.gutenberg.org/files/${gid}/${gid}-0.txt`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'OnlineBookstoreReaderZone/1.0' }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return cleanText(await res.text());
    } catch { /* try next mirror */ }
  }
  throw new HttpError(502, 'We could not download this book right now. Please check your internet connection and try again.');
}

async function getText(gid) {
  const file = path.join(TEXT_DIR, `${gid}.txt`);
  if (fs.existsSync(file)) return fs.promises.readFile(file, 'utf8');
  if (!inFlight.has(gid)) {
    inFlight.set(gid, download(gid)
      .then(async (text) => { await fs.promises.writeFile(file, text, 'utf8'); return text; })
      .finally(() => inFlight.delete(gid)));
  }
  return inFlight.get(gid);
}

router.get('/books/:id/text', async (req, res, next) => {
  try {
    const book = db.prepare('SELECT id, title, gutenberg_id FROM books WHERE id = ?').get(Number(req.params.id));
    if (!book) throw new HttpError(404, 'Book not found.');
    const stored = db.prepare('SELECT content FROM book_texts WHERE book_id = ?').get(book.id);
    if (!stored && !book.gutenberg_id) throw new HttpError(403, 'This book is not available in the Reader Zone. You can buy a copy from the store.');
    const text = stored ? stored.content : await getText(Number(book.gutenberg_id));
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'private, max-age=86400');
    if (req.acceptsEncodings('gzip')) {
      res.set('Content-Encoding', 'gzip');
      return res.send(zlib.gzipSync(text));
    }
    res.send(text);
  } catch (err) {
    next(err);
  }
});

/* ---------- Reading progress ---------- */
router.get('/progress', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT p.book_id, p.page, p.total_pages, p.updated_at, b.title, b.author, b.genre
    FROM reading_progress p JOIN books b ON b.id = p.book_id
    WHERE p.user_id = ? ORDER BY p.updated_at DESC`).all(req.user.id));
});

router.get('/progress/:bookId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT page, total_pages FROM reading_progress WHERE user_id = ? AND book_id = ?')
    .get(req.user.id, Number(req.params.bookId)) || { page: 0, total_pages: 0 });
});

router.put('/progress/:bookId', requireAuth, (req, res) => {
  const bookId = int(req.params.bookId, { min: 1, field: 'Book' });
  const page = int(req.body.page, { min: 0, max: 100000, field: 'Page' });
  const total = int(req.body.total_pages, { min: 0, max: 100000, field: 'Total pages' });
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(bookId)) throw new HttpError(404, 'Book not found.');
  db.prepare(`INSERT INTO reading_progress (user_id, book_id, page, total_pages) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, book_id) DO UPDATE SET page = excluded.page, total_pages = excluded.total_pages,
    updated_at = datetime('now')`).run(req.user.id, bookId, page, total);
  res.json({ ok: true });
});

router.delete('/progress/:bookId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM reading_progress WHERE user_id = ? AND book_id = ?').run(req.user.id, Number(req.params.bookId));
  res.json({ ok: true });
});

/* ---------- Bookmarks ---------- */
router.get('/bookmarks', requireAuth, (req, res) => {
  const params = [req.user.id];
  let sql = `SELECT k.*, b.title, b.author FROM bookmarks k JOIN books b ON b.id = k.book_id WHERE k.user_id = ?`;
  if (req.query.book_id) { sql += ' AND k.book_id = ?'; params.push(Number(req.query.book_id)); }
  res.json(db.prepare(`${sql} ORDER BY k.book_id, k.page`).all(...params));
});

router.post('/bookmarks', requireAuth, (req, res) => {
  const bookId = int(req.body.book_id, { min: 1, field: 'Book' });
  const page = int(req.body.page, { min: 0, max: 100000, field: 'Page' });
  const note = str(req.body.note, { max: 300, field: 'Note' });
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(bookId)) throw new HttpError(404, 'Book not found.');
  const { lastInsertRowid } = db.prepare('INSERT INTO bookmarks (user_id, book_id, page, note) VALUES (?, ?, ?, ?)')
    .run(req.user.id, bookId, page, note);
  res.status(201).json(db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(lastInsertRowid));
});

router.delete('/bookmarks/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
