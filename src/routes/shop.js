// Cart, wishlist, checkout/orders, contact form and newsletter.
const express = require('express');
const config = require('../config');
const { db, transaction } = require('../db');
const { HttpError, EMAIL_RE, str, int, requireAuth } = require('../security');

const router = express.Router();
const MAX_QTY = 10;

function getCart(userId) {
  const items = db.prepare(`
    SELECT c.book_id, c.qty, b.title, b.author, b.genre, b.price, b.stock, b.gutenberg_id, b.format, b.level, b.subject
    FROM cart_items c JOIN books b ON b.id = c.book_id WHERE c.user_id = ? ORDER BY b.title`).all(userId);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= config.FREE_SHIPPING_ABOVE ? 0 : config.SHIPPING_FEE;
  return {
    items, subtotal, shipping, discount: 0, total: subtotal + shipping,
    count: items.reduce((n, i) => n + i.qty, 0),
    free_shipping_above: config.FREE_SHIPPING_ABOVE,
  };
}

// Apply a discount code to a cart. Returns the cart with discount/shipping/total recalculated.
function applyCoupon(cart, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return cart;
  const c = config.COUPONS[code];
  if (!c) throw new HttpError(400, 'That coupon code is not valid.');
  if (c.minSubtotal && cart.subtotal < c.minSubtotal) {
    throw new HttpError(400, `${code} needs a cart total of at least ₹${c.minSubtotal}.`);
  }
  let discount = 0;
  let { shipping } = cart;
  if (c.type === 'shipping') {
    if (!shipping) throw new HttpError(400, 'Your order already has free delivery.');
    shipping = 0;
  } else {
    const base = c.academicOnly
      ? cart.items.filter((i) => i.level).reduce((s, i) => s + i.price * i.qty, 0)
      : cart.subtotal;
    if (!base) throw new HttpError(400, `${code} only applies to textbooks and exam books.`);
    discount = c.type === 'percent' ? (base * c.value) / 100 : Math.min(c.value, base);
    if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
    discount = Math.round(discount * 100) / 100;
  }
  return { ...cart, coupon: code, coupon_label: c.label, discount, shipping, total: Math.max(cart.subtotal - discount, 0) + shipping };
}

function bookOr404(id) {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  if (!book) throw new HttpError(404, 'Book not found.');
  return book;
}

/* ---------- Cart ---------- */
router.get('/cart', requireAuth, (req, res) => res.json(getCart(req.user.id)));

router.post('/cart', requireAuth, (req, res) => {
  const bookId = int(req.body.book_id, { min: 1, field: 'Book' });
  const qty = int(req.body.qty ?? 1, { min: 1, max: MAX_QTY, field: 'Quantity' });
  const book = bookOr404(bookId);
  if (book.format === 'eBook') throw new HttpError(400, 'This community book is free to read online, so there is nothing to buy.');
  if (book.stock < 1) throw new HttpError(400, 'Sorry, this book is out of stock.');
  const current = db.prepare('SELECT qty FROM cart_items WHERE user_id = ? AND book_id = ?').get(req.user.id, bookId);
  const newQty = Math.min((current?.qty || 0) + qty, MAX_QTY, book.stock);
  db.prepare(`INSERT INTO cart_items (user_id, book_id, qty) VALUES (?, ?, ?)
    ON CONFLICT (user_id, book_id) DO UPDATE SET qty = excluded.qty`).run(req.user.id, bookId, newQty);
  res.json(getCart(req.user.id));
});

router.put('/cart/:bookId', requireAuth, (req, res) => {
  const bookId = int(req.params.bookId, { min: 1, field: 'Book' });
  const qty = int(req.body.qty, { min: 0, max: MAX_QTY, field: 'Quantity' });
  if (qty === 0) {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND book_id = ?').run(req.user.id, bookId);
  } else {
    const book = bookOr404(bookId);
    if (qty > book.stock) throw new HttpError(400, `Only ${book.stock} copies left in stock.`);
    db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND book_id = ?').run(qty, req.user.id, bookId);
  }
  res.json(getCart(req.user.id));
});

router.delete('/cart/:bookId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND book_id = ?').run(req.user.id, Number(req.params.bookId));
  res.json(getCart(req.user.id));
});

// Merge a guest cart (kept in the browser) into the account after login
router.post('/cart/merge', requireAuth, (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  transaction(() => {
    for (const item of items) {
      const book = db.prepare('SELECT id, stock FROM books WHERE id = ?').get(Number(item.book_id));
      if (!book || book.stock < 1) continue;
      const current = db.prepare('SELECT qty FROM cart_items WHERE user_id = ? AND book_id = ?').get(req.user.id, book.id);
      const qty = Math.min(Math.max(current?.qty || 0, Number(item.qty) || 1), MAX_QTY, book.stock);
      db.prepare(`INSERT INTO cart_items (user_id, book_id, qty) VALUES (?, ?, ?)
        ON CONFLICT (user_id, book_id) DO UPDATE SET qty = excluded.qty`).run(req.user.id, book.id, qty);
    }
  });
  res.json(getCart(req.user.id));
});

/* ---------- Wishlist ---------- */
router.get('/wishlist', requireAuth, (req, res) => {
  const { BOOK_SELECT } = require('./books');
  res.json(db.prepare(`${BOOK_SELECT} JOIN wishlist w ON w.book_id = b.id WHERE w.user_id = ? ORDER BY w.created_at DESC`)
    .all(req.user.id));
});

router.post('/wishlist', requireAuth, (req, res) => {
  const bookId = int(req.body.book_id, { min: 1, field: 'Book' });
  bookOr404(bookId);
  db.prepare('INSERT OR IGNORE INTO wishlist (user_id, book_id) VALUES (?, ?)').run(req.user.id, bookId);
  res.status(201).json({ ok: true });
});

router.delete('/wishlist/:bookId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND book_id = ?').run(req.user.id, Number(req.params.bookId));
  res.json({ ok: true });
});

/* ---------- Coupons ---------- */
router.get('/coupons', (req, res) => {
  res.json(Object.entries(config.COUPONS).map(([code, c]) => ({ code, label: c.label })));
});

router.post('/coupons/apply', requireAuth, (req, res) => {
  res.json(applyCoupon(getCart(req.user.id), req.body.code));
});

/* ---------- Orders ---------- */
const PAYMENT_METHODS = { cod: 'Cash on Delivery', upi: 'UPI', card: 'Credit / Debit Card' };

function ordersWithItems(orders) {
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

router.post('/orders', requireAuth, (req, res) => {
  const ship = {
    name: str(req.body.name, { required: true, max: 80, field: 'Full name' }),
    phone: str(req.body.phone, { required: true, max: 20, field: 'Phone number' }),
    address: str(req.body.address, { required: true, max: 300, field: 'Address' }),
    city: str(req.body.city, { required: true, max: 60, field: 'City' }),
    state: str(req.body.state, { required: true, max: 60, field: 'State' }),
    pincode: str(req.body.pincode, { required: true, max: 10, field: 'PIN code' }),
  };
  if (!/^\+?[0-9][0-9\s-]{8,14}$/.test(ship.phone)) throw new HttpError(400, 'Please enter a valid phone number.');
  if (!/^\d{6}$/.test(ship.pincode)) throw new HttpError(400, 'PIN code must be 6 digits.');
  const payment = String(req.body.payment_method || '');
  if (!PAYMENT_METHODS[payment]) throw new HttpError(400, 'Please choose a payment method.');

  const orderId = transaction(() => {
    const base = getCart(req.user.id);
    if (!base.items.length) throw new HttpError(400, 'Your cart is empty.');
    for (const item of base.items) {
      if (item.qty > item.stock) throw new HttpError(400, `Only ${item.stock} copies of "${item.title}" are left.`);
    }
    const cart = applyCoupon(base, req.body.coupon);
    const { lastInsertRowid } = db.prepare(`INSERT INTO orders
      (user_id, subtotal, shipping, discount, coupon, total, payment_method, ship_name, ship_phone, ship_address, ship_city, ship_state, ship_pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, cart.subtotal, cart.shipping, cart.discount, cart.coupon || null, cart.total, PAYMENT_METHODS[payment],
      ship.name, ship.phone, ship.address, ship.city, ship.state, ship.pincode,
    );
    const addItem = db.prepare('INSERT INTO order_items (order_id, book_id, title, author, price, qty) VALUES (?, ?, ?, ?, ?, ?)');
    const takeStock = db.prepare('UPDATE books SET stock = stock - ? WHERE id = ?');
    for (const item of cart.items) {
      addItem.run(lastInsertRowid, item.book_id, item.title, item.author, item.price, item.qty);
      takeStock.run(item.qty, item.book_id);
    }
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
    // Remember the address for next time
    db.prepare('UPDATE users SET phone=?, address=?, city=?, state=?, pincode=? WHERE id=?')
      .run(ship.phone, ship.address, ship.city, ship.state, ship.pincode, req.user.id);
    return Number(lastInsertRowid);
  });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  res.status(201).json(ordersWithItems([order])[0]);
});

router.get('/orders', requireAuth, (req, res) => {
  res.json(ordersWithItems(db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id)));
});

router.get('/orders/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!order) throw new HttpError(404, 'Order not found.');
  res.json(ordersWithItems([order])[0]);
});

router.post('/orders/:id/cancel', requireAuth, (req, res) => {
  transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (!['Placed', 'Processing'].includes(order.status)) throw new HttpError(400, `A ${order.status.toLowerCase()} order cannot be cancelled.`);
    db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(order.id);
    for (const item of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id)) {
      if (item.book_id) db.prepare('UPDATE books SET stock = stock + ? WHERE id = ?').run(item.qty, item.book_id);
    }
  });
  res.json({ ok: true });
});

/* ---------- Contact & newsletter ---------- */
router.post('/contact', (req, res) => {
  const name = str(req.body.name, { required: true, max: 80, field: 'Name' });
  const email = str(req.body.email, { required: true, max: 120, field: 'Email' });
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  const subject = str(req.body.subject, { max: 150, field: 'Subject' });
  const message = str(req.body.message, { required: true, max: 3000, field: 'Message' });
  db.prepare('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)').run(name, email, subject, message);
  res.status(201).json({ ok: true });
});

router.post('/newsletter', (req, res) => {
  const email = str(req.body.email, { required: true, max: 120, field: 'Email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email);
  res.status(201).json({ ok: true });
});

module.exports = router;
