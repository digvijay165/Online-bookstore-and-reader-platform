// Catalog: listing, search, details, genres and reviews.
const express = require('express');
const { db } = require('../db');
const { HttpError, str, int, requireAuth } = require('../security');

const router = express.Router();

const BOOK_SELECT = `
  SELECT b.*,
    (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.book_id = b.id) AS rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id) AS review_count,
    (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi WHERE oi.book_id = b.id) AS sold,
    EXISTS (SELECT 1 FROM book_texts t WHERE t.book_id = b.id) AS has_text
  FROM books b`;

// A book can be read online if it is public domain (Gutenberg) or a community book with stored text
const READABLE_SQL = '(b.gutenberg_id IS NOT NULL OR b.id IN (SELECT book_id FROM book_texts))';

const SORTS = {
  featured: 'b.featured DESC, sold DESC, b.id ASC',
  popular: 'sold DESC, rating DESC NULLS LAST, b.featured DESC, b.id ASC',
  rating: 'rating DESC NULLS LAST, review_count DESC, b.id ASC',
  newest: 'b.year DESC, b.id DESC',
  oldest: 'b.year ASC, b.id ASC',
  price_asc: 'b.price ASC, b.id ASC',
  price_desc: 'b.price DESC, b.id ASC',
  title: 'b.title COLLATE NOCASE ASC',
  added: 'b.id DESC',
};

router.get('/books', (req, res) => {
  const where = [];
  const params = [];
  const q = str(req.query.q, { max: 100 });
  if (q) {
    for (const word of q.split(/\s+/).slice(0, 6)) {
      where.push("(b.title || ' ' || b.author || ' ' || b.genre) LIKE ?");
      params.push(`%${word}%`);
    }
  }
  if (req.query.genre) { where.push('b.genre = ?'); params.push(String(req.query.genre)); }
  if (req.query.subject) { where.push('b.subject = ?'); params.push(String(req.query.subject)); }
  if (req.query.level) { where.push('b.level = ?'); params.push(String(req.query.level)); }
  if (req.query.academic === '1') where.push('b.level IS NOT NULL');
  const FORMAT_SQL = {
    book: "b.format IN ('Paperback', 'Hardcover')",
    comic: "b.format IN ('Comic', 'Manga')",
    magazine: "b.format = 'Magazine'",
  };
  if (FORMAT_SQL[req.query.format]) where.push(FORMAT_SQL[req.query.format]);
  if (req.query.language) { where.push('b.language = ?'); params.push(String(req.query.language)); }
  if (req.query.free === '1') where.push(READABLE_SQL);
  if (req.query.community === '1') where.push('b.published_by IS NOT NULL');
  if (req.query.featured === '1') where.push('b.featured = 1');
  if (req.query.min) { where.push('b.price >= ?'); params.push(Number(req.query.min) || 0); }
  if (req.query.max) { where.push('b.price <= ?'); params.push(Number(req.query.max) || 0); }
  if (req.query.instock === '1') where.push('b.stock > 0');
  if (req.query.ids) {
    const ids = String(req.query.ids).split(',').map(Number).filter(Number.isInteger).slice(0, 100);
    where.push(`b.id IN (${ids.map(() => '?').join(',') || 'NULL'})`);
    params.push(...ids);
  }
  if (req.query.exclude) { where.push('b.id != ?'); params.push(Number(req.query.exclude) || 0); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = SORTS[req.query.sort] || SORTS.featured;
  const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM books b ${whereSql}`).get(...params);
  const items = db.prepare(`${BOOK_SELECT} ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);
  res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
});

router.get('/books/:id', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Book id' });
  const book = db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(id);
  if (!book) throw new HttpError(404, 'Book not found.');
  if (book.published_by) {
    const writer = db.prepare('SELECT name FROM users WHERE id = ?').get(book.published_by);
    book.publisher_name = writer?.name || null;
  }
  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at, r.user_id, u.name AS user_name
    FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.book_id = ? ORDER BY r.created_at DESC`).all(id);
  const related = db.prepare(`${BOOK_SELECT} WHERE b.genre = ? AND b.id != ? ORDER BY b.featured DESC, RANDOM() LIMIT 6`)
    .all(book.genre, id);
  res.json({ book, reviews, related });
});

router.get('/genres', (req, res) => {
  res.json(db.prepare(`
    SELECT genre, COUNT(*) AS count, SUM(${READABLE_SQL}) AS free_count
    FROM books b GROUP BY genre ORDER BY count DESC`).all());
});

// Counts used by the shop filters and the Academic hub
router.get('/facets', (req, res) => {
  const genre = req.query.genre ? String(req.query.genre) : null;
  res.json({
    levels: db.prepare('SELECT level, COUNT(*) AS count FROM books WHERE level IS NOT NULL GROUP BY level').all(),
    formats: db.prepare(`SELECT CASE WHEN format IN ('Comic', 'Manga') THEN 'comic' WHEN format = 'Magazine' THEN 'magazine'
      ELSE 'book' END AS format, COUNT(*) AS count FROM books GROUP BY 1`).all(),
    subjects: genre
      ? db.prepare('SELECT subject, COUNT(*) AS count FROM books WHERE genre = ? AND subject IS NOT NULL GROUP BY subject ORDER BY count DESC, subject').all(genre)
      : [],
    languages: db.prepare('SELECT language, COUNT(*) AS count FROM books GROUP BY language ORDER BY count DESC').all(),
  });
});

router.get('/stats', (req, res) => {
  res.json(db.prepare(`SELECT
    (SELECT COUNT(*) FROM books) AS books,
    (SELECT COUNT(*) FROM books b WHERE ${READABLE_SQL}) AS free_books,
    (SELECT COUNT(*) FROM books WHERE published_by IS NOT NULL) AS community_books,
    (SELECT COUNT(DISTINCT genre) FROM books) AS genres,
    (SELECT COUNT(DISTINCT author) FROM books) AS authors,
    (SELECT COUNT(*) FROM books WHERE level IS NOT NULL) AS academic,
    (SELECT COUNT(*) FROM books WHERE format IN ('Comic', 'Manga')) AS comics,
    (SELECT COUNT(*) FROM books WHERE format = 'Magazine') AS magazines,
    (SELECT COUNT(*) FROM users) AS readers`).get());
});

router.post('/books/:id/reviews', requireAuth, (req, res) => {
  const bookId = int(req.params.id, { min: 1, field: 'Book id' });
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(bookId)) throw new HttpError(404, 'Book not found.');
  const rating = int(req.body.rating, { min: 1, max: 5, field: 'Rating' });
  const comment = str(req.body.comment, { max: 2000, field: 'Review' });
  db.prepare(`INSERT INTO reviews (book_id, user_id, rating, comment) VALUES (?, ?, ?, ?)
    ON CONFLICT (book_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment,
    created_at = datetime('now')`).run(bookId, req.user.id, rating, comment);
  res.status(201).json({ ok: true });
});

router.delete('/reviews/:id', requireAuth, (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  if (!review) throw new HttpError(404, 'Review not found.');
  if (review.user_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'You can only delete your own review.');
  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.BOOK_SELECT = BOOK_SELECT;
