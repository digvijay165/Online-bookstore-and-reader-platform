// Community publishing: members submit their own books, admins approve them into the Reader Zone.
const express = require('express');
const { db, transaction } = require('../db');
const { audit } = require('../audit');
const { HttpError, str, int, requireAuth, requireAdmin, rateLimiter } = require('../security');

const router = express.Router();
const submitLimit = rateLimiter(10, 24 * 60 * 60 * 1000);

const MIN_CHARS = 500;
const MAX_CHARS = 2_000_000; // about 350,000 words
const LANGUAGES = ['English', 'Hindi', 'Bengali', 'Marathi', 'Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu', 'Other'];

const countWords = (text) => (text.match(/\S+/g) || []).length;

function readSubmission(body, user) {
  const content = typeof body.content === 'string' ? body.content.replace(/\r\n?/g, '\n').trim() : '';
  if (content.length < MIN_CHARS) throw new HttpError(400, `Your book is too short. Please add at least ${MIN_CHARS} characters of text.`);
  if (content.length > MAX_CHARS) throw new HttpError(400, 'Your book is too long for one upload (about 350,000 words maximum).');
  const description = str(body.description, { required: true, max: 1500, field: 'Description' });
  if (description.length < 30) throw new HttpError(400, 'Please write a description of at least 30 characters.');
  if (!body.rights) throw new HttpError(400, 'Please confirm that you wrote this book and have the right to publish it.');
  return {
    title: str(body.title, { required: true, max: 200, field: 'Title' }),
    author_name: str(body.author_name, { max: 120, field: 'Author name' }) || user.name,
    genre: str(body.genre, { required: true, max: 60, field: 'Genre' }),
    language: LANGUAGES.includes(body.language) ? body.language : 'English',
    description,
    content,
    word_count: countWords(content),
  };
}

function ownSubmission(id, user) {
  const s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
  if (!s) throw new HttpError(404, 'Submission not found.');
  if (s.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'This is not your submission.');
  return s;
}

const LIST_COLS = 'id, user_id, title, author_name, genre, language, description, word_count, status, admin_note, book_id, created_at, updated_at, reviewed_at';

/* ---------- Members ---------- */
router.get('/submissions/mine', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT ${LIST_COLS} FROM submissions WHERE user_id = ? ORDER BY id DESC`).all(req.user.id));
});

router.get('/submissions/:id', requireAuth, (req, res) => {
  res.json(ownSubmission(int(req.params.id, { min: 1 }), req.user));
});

router.post('/submissions', requireAuth, (req, res) => {
  submitLimit(`submit:${req.user.id}`);
  const s = readSubmission(req.body, req.user);
  const { lastInsertRowid } = db.prepare(`INSERT INTO submissions
    (user_id, title, author_name, genre, language, description, content, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, s.title, s.author_name, s.genre, s.language, s.description, s.content, s.word_count);
  res.status(201).json(db.prepare(`SELECT ${LIST_COLS} FROM submissions WHERE id = ?`).get(lastInsertRowid));
});

// Edit a pending or rejected submission; it goes back into the review queue
router.put('/submissions/:id', requireAuth, (req, res) => {
  const current = ownSubmission(int(req.params.id, { min: 1 }), req.user);
  if (current.user_id !== req.user.id) throw new HttpError(403, 'Only the writer can edit a submission.');
  if (current.status === 'approved') throw new HttpError(400, 'This book is already published. Contact us to make changes.');
  const s = readSubmission(req.body, req.user);
  db.prepare(`UPDATE submissions SET title=?, author_name=?, genre=?, language=?, description=?, content=?, word_count=?,
    status='pending', admin_note=NULL, updated_at=datetime('now') WHERE id=?`)
    .run(s.title, s.author_name, s.genre, s.language, s.description, s.content, s.word_count, current.id);
  res.json(db.prepare(`SELECT ${LIST_COLS} FROM submissions WHERE id = ?`).get(current.id));
});

router.delete('/submissions/:id', requireAuth, (req, res) => {
  const s = ownSubmission(int(req.params.id, { min: 1 }), req.user);
  if (s.status === 'approved' && req.user.role !== 'admin') throw new HttpError(400, 'Published books cannot be withdrawn here. Please contact us.');
  db.prepare('DELETE FROM submissions WHERE id = ?').run(s.id);
  res.json({ ok: true });
});

/* ---------- Admin review ---------- */
router.get('/admin/submissions', requireAdmin, (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  res.json(db.prepare(`SELECT ${LIST_COLS.split(', ').map((c) => 's.' + c).join(', ')}, u.name AS user_name, u.email AS user_email
    FROM submissions s JOIN users u ON u.id = s.user_id ${status ? 'WHERE s.status = ?' : ''}
    ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.id DESC`).all(...(status ? [status] : [])));
});

router.post('/admin/submissions/:id/approve', requireAdmin, (req, res) => {
  const note = str(req.body.note, { max: 1000, field: 'Note' });
  const featured = req.body.featured ? 1 : 0;
  const bookId = transaction(() => {
    const s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(int(req.params.id, { min: 1 }));
    if (!s) throw new HttpError(404, 'Submission not found.');
    if (s.status === 'approved') throw new HttpError(400, 'This submission is already published.');
    const { lastInsertRowid } = db.prepare(`INSERT INTO books
      (title, author, genre, year, price, stock, description, language, format, featured, published_by)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?, 'eBook', ?, ?)`)
      .run(s.title, s.author_name, s.genre, new Date().getFullYear(), s.description, s.language, featured, s.user_id);
    db.prepare('INSERT INTO book_texts (book_id, content) VALUES (?, ?)').run(lastInsertRowid, s.content);
    db.prepare(`UPDATE submissions SET status='approved', admin_note=?, book_id=?, reviewed_at=datetime('now') WHERE id=?`)
      .run(note || null, lastInsertRowid, s.id);
    return Number(lastInsertRowid);
  });
  audit(req, 'book submission approved', `submission #${req.params.id} -> book #${bookId}`);
  res.json({ ok: true, book_id: bookId });
});

router.post('/admin/submissions/:id/reject', requireAdmin, (req, res) => {
  const note = str(req.body.note, { required: true, max: 1000, field: 'Reason' });
  const s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(int(req.params.id, { min: 1 }));
  if (!s) throw new HttpError(404, 'Submission not found.');
  if (s.status === 'approved') throw new HttpError(400, 'This book is already published. Delete it from the Books tab instead.');
  db.prepare(`UPDATE submissions SET status='rejected', admin_note=?, reviewed_at=datetime('now') WHERE id=?`).run(note, s.id);
  audit(req, 'book submission sent back', `submission #${s.id} ${s.title}`);
  res.json({ ok: true });
});

module.exports = router;
module.exports.LANGUAGES = LANGUAGES;
