/* Online Bookstore & Reader Zone - single-page frontend (vanilla JavaScript) */
'use strict';

/* =========================================================================
   Utilities
   ========================================================================= */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const app = $('#app');
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtYear = (y) => (y == null ? '-' : y < 0 ? `c. ${-y} BC` : String(y));
const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const hashStr = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
function rememberViewed(id) {
  const list = store.get('recentlyViewed', []).filter((x) => x !== id);
  list.unshift(id);
  store.set('recentlyViewed', list.slice(0, 12));
}
async function recentlyViewed(excludeId) {
  const ids = store.get('recentlyViewed', []).filter((x) => x !== excludeId);
  if (!ids.length) return [];
  const { items } = await api(`/books?limit=12&ids=${ids.join(',')}`).catch(() => ({ items: [] }));
  return ids.map((id) => items.find((b) => b.id === id)).filter(Boolean);
}
const SUPPORT_EMAIL = 'digvijaysingh5360@gmail.com';
const FREE_SHIP = 499;
const SHIP_FEE = 49;

const GENRE_ICONS = {
  'Classics': '\u{1F3DB}️', 'Fiction': '\u{1F4D6}', 'Mystery & Thriller': '\u{1F50D}', 'Science Fiction': '\u{1F680}',
  'Fantasy': '\u{1F409}', 'Adventure': '\u{1F9ED}', 'Horror': '\u{1F47B}', 'Romance': '\u{1F495}', 'Children': '\u{1F9F8}',
  'Philosophy': '\u{1F989}', 'Poetry & Drama': '\u{1F3AD}', 'Indian Literature': '\u{1FAB7}', 'Self-Help': '\u{1F331}',
  'Business & Finance': '\u{1F4BC}', 'Biography': '\u{1F464}', 'History & Science': '\u{1F52D}', 'Technology': '\u{1F4BB}',
  'Engineering': '⚙️', 'Medical': '\u{1FA7A}', 'Science & Mathematics': '\u{1F9EA}', 'Commerce & Management': '\u{1F4CA}',
  'Arts & Humanities': '\u{1F3FA}', 'Research & PhD': '\u{1F393}', 'Competitive Exams': '\u{1F4DD}',
  'Comics & Graphic Novels': '\u{1F4A5}', 'Manga': '\u{1F38C}', 'Magazines': '\u{1F4F0}', 'Hindi Literature': '\u{1F4DC}',
  'Religion & Spirituality': '\u{1F64F}', 'Cooking & Lifestyle': '\u{1F373}',
};
const genreIcon = (g) => GENRE_ICONS[g] || '\u{1F4DA}';

const LEVELS = {
  UG: { label: 'Undergraduate (UG)', short: 'UG', icon: '\u{1F393}', text: 'B.Tech, MBBS, B.Sc, B.Com, BA and more' },
  PG: { label: 'Postgraduate (PG)', short: 'PG', icon: '\u{1F4D8}', text: 'M.Tech, MBA, M.Sc, MD and advanced study' },
  PhD: { label: 'PhD & Research', short: 'PhD', icon: '\u{1F52C}', text: 'Research methods, thesis writing, statistics' },
  Competitive: { label: 'Competitive Exams', short: 'EXAM', icon: '\u{1F4DD}', text: 'UPSC, JEE, NEET, CAT, SSC, banking' },
};
const FORMATS = { book: 'Books', comic: 'Comics & Manga', magazine: 'Magazines' };
const isMagazine = (b) => b.format === 'Magazine';
const isComic = (b) => b.format === 'Comic' || b.format === 'Manga';
const isEbook = (b) => b.format === 'eBook';
const isReadable = (b) => !!(b.gutenberg_id || b.has_text);

const PALETTES = [
  ['#1f3a5f', '#2e5583', '#f4d58d'], ['#7a1f2b', '#a8323e', '#f6e3c5'], ['#0f5132', '#1f8a5b', '#eef7d9'],
  ['#3d2c5e', '#5b4391', '#f3d9fa'], ['#5c3d1e', '#8a5a2b', '#fbe7c6'], ['#14454f', '#1f6f7c', '#d9f3f0'],
  ['#262626', '#474747', '#f4b942'], ['#8a3b12', '#c2581c', '#fff1dc'], ['#283618', '#606c38', '#fefae0'],
  ['#2b1b7a', '#4361ee', '#e0e7ff'], ['#6d214f', '#b33771', '#ffe4f0'], ['#1b4332', '#2d6a4f', '#d8f3dc'],
  ['#03045e', '#0077b6', '#caf0f8'], ['#582f0e', '#7f4f24', '#ede0d4'], ['#432818', '#99582a', '#ffe6a7'],
  ['#22223b', '#4a4e69', '#f2e9e4'],
];
const palette = (b) => PALETTES[hashStr(b.title + b.author) % PALETTES.length];

function cover(b, extraClass = '') {
  const [c1, c2, fg] = palette(b);
  if (isMagazine(b)) {
    return `<div class="cover cover-mag ${extraClass}" style="background:linear-gradient(170deg,${c2},${c1});color:#fff" role="img" aria-label="Cover of ${esc(b.title)} magazine">
      <div class="m-title">${esc(b.title)}</div>
      <div class="m-strip" style="background:${fg};color:${c1}">LATEST ISSUE</div>
      <div class="m-lines"><span></span><span></span><span></span></div>
      <div class="c-author">${esc(b.subject || b.author)}</div>
    </div>`;
  }
  if (isComic(b)) {
    return `<div class="cover cover-comic ${extraClass}" style="background-color:${c2};color:#fff" role="img" aria-label="Cover of ${esc(b.title)}">
      <div class="k-tag" style="background:${fg};color:${c1}">${b.format === 'Manga' ? 'MANGA' : 'COMIC'}</div>
      <div class="k-burst" style="background:${fg}"></div>
      <div><div class="c-title">${esc(b.title)}</div><div class="c-author">${esc(b.author)}</div></div>
    </div>`;
  }
  return `<div class="cover ${extraClass}" style="background:linear-gradient(160deg,${c1},${c2});color:${fg}" role="img" aria-label="Cover of ${esc(b.title)}">
    <div class="c-genre">${esc(b.subject && b.level ? b.subject : b.genre || '')}</div>
    <div><div class="c-title">${esc(b.title)}</div><div class="c-rule"></div><div class="c-author">${esc(b.author)}</div></div>
    <span class="c-orn"></span><span class="c-orn2"></span>
  </div>`;
}
const miniCover = (b) => { const [c1, c2] = palette(b); return `<span class="mini-cover" style="background:linear-gradient(160deg,${c1},${c2})"></span>`; };

function stars(rating, count) {
  if (!rating) return '<span class="stars"><span class="off">★★★★★</span><small>No reviews yet</small></span>';
  const full = Math.round(rating);
  return `<span class="stars" title="${rating} out of 5">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span>${count != null ? `<small>${rating} (${count})</small>` : ''}</span>`;
}

const ICON_HEART = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const loadingHTML = (msg = 'Loading...') => `<div class="loading"><div class="spinner"></div><p class="mt-2">${esc(msg)}</p></div>`;
const emptyHTML = (icon, title, text, action = '') => `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${action}</div>`;

function toast(message, type = '', link) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${esc(message)}</span>${link ? `<a href="${link.href}">${esc(link.text)}</a>` : ''}`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

function navigate(path) {
  if (location.hash === '#' + path) router();
  else location.hash = '#' + path;
}

/* =========================================================================
   API client
   ========================================================================= */
async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, opts);
  } catch {
    throw new Error('Cannot reach the server. Please check your connection.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* =========================================================================
   App state: user, cart, wishlist
   ========================================================================= */
const state = { user: null, wish: new Set(), genres: [] };

function totals(items) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIP ? 0 : SHIP_FEE;
  return { items, subtotal, shipping, total: subtotal + shipping, count: items.reduce((n, i) => n + i.qty, 0) };
}

const cart = {
  data: totals([]),
  guest() { return store.get('guestCart', []); },
  saveGuest(items) { store.set('guestCart', items); },
  async load() {
    if (state.user) this.data = await api('/cart');
    else await this.loadGuest();
    updateBadges();
    return this.data;
  },
  async loadGuest() {
    const g = this.guest();
    if (!g.length) { this.data = totals([]); return; }
    const { items } = await api(`/books?limit=100&ids=${g.map((i) => i.book_id).join(',')}`);
    const byId = new Map(items.map((b) => [b.id, b]));
    const list = g.filter((i) => byId.has(i.book_id)).map((i) => {
      const b = byId.get(i.book_id);
      return { book_id: b.id, qty: Math.max(1, Math.min(i.qty, b.stock || 1, 10)), title: b.title, author: b.author, genre: b.genre, price: b.price, stock: b.stock, gutenberg_id: b.gutenberg_id };
    });
    this.data = totals(list);
  },
  async add(bookId, qty = 1) {
    if (state.user) {
      this.data = await api('/cart', { method: 'POST', body: { book_id: bookId, qty } });
    } else {
      const g = this.guest();
      const found = g.find((i) => i.book_id === bookId);
      if (found) found.qty = Math.min(found.qty + qty, 10); else g.push({ book_id: bookId, qty });
      this.saveGuest(g);
      await this.loadGuest();
    }
    updateBadges();
  },
  async setQty(bookId, qty) {
    if (state.user) {
      this.data = await api(`/cart/${bookId}`, { method: 'PUT', body: { qty } });
    } else {
      let g = this.guest();
      if (qty <= 0) g = g.filter((i) => i.book_id !== bookId);
      else g.forEach((i) => { if (i.book_id === bookId) i.qty = qty; });
      this.saveGuest(g);
      await this.loadGuest();
    }
    updateBadges();
  },
  remove(bookId) { return this.setQty(bookId, 0); },
  async mergeGuest() {
    const g = this.guest();
    if (g.length) {
      await api('/cart/merge', { method: 'POST', body: { items: g } });
      this.saveGuest([]);
    }
  },
};

async function loadWishlist() {
  state.wish = new Set();
  if (state.user) {
    const items = await api('/wishlist');
    items.forEach((b) => state.wish.add(b.id));
  }
  updateBadges();
}

async function loadSession() {
  try {
    const { user } = await api('/auth/me');
    state.user = user;
  } catch { state.user = null; }
  renderUserArea();
  await Promise.all([cart.load().catch(() => {}), loadWishlist().catch(() => {})]);
}

async function afterLogin(user) {
  state.user = user;
  await cart.mergeGuest().catch(() => {});
  await Promise.all([cart.load(), loadWishlist()]);
  renderUserArea();
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  state.wish = new Set();
  cart.data = totals([]);
  renderUserArea();
  updateBadges();
  toast('You have been logged out.');
  navigate('/');
}

function updateBadges() {
  const c = $('#cartCount');
  c.textContent = cart.data.count;
  c.hidden = !cart.data.count;
  const tc = $('#tabCartCount');
  tc.textContent = cart.data.count;
  tc.hidden = !cart.data.count;
  const w = $('#wishCount');
  w.textContent = state.wish.size;
  w.hidden = !state.wish.size;
  $$('[data-wish]').forEach((btn) => btn.classList.toggle('on', state.wish.has(Number(btn.dataset.wish))));
}

function renderUserArea() {
  const area = $('#userArea');
  $('#adminLink').hidden = state.user?.role !== 'admin';
  if (!state.user) {
    area.innerHTML = `<a class="btn btn-ghost btn-sm" href="#/login">Log in</a><a class="btn btn-primary btn-sm" href="#/register">Sign up</a>`;
    area.style.display = 'flex';
    area.style.gap = '6px';
    return;
  }
  area.style.display = '';
  const u = state.user;
  area.innerHTML = `
    <button class="user-btn" id="userBtn" aria-haspopup="true" aria-expanded="false">
      <span class="avatar">${esc(initials(u.name))}</span><span class="un">${esc(u.name.split(' ')[0])}</span>
    </button>
    <div class="dropdown" id="userMenu" hidden>
      <div class="dd-head"><strong>${esc(u.name)}</strong><span class="muted small">${esc(u.email)}</span></div>
      <a href="#/account">My account</a>
      <a href="#/account?tab=library">My reading</a>
      <a href="#/publish">Write &amp; publish</a>
      <a href="#/orders">My orders</a>
      <a href="#/wishlist">Wishlist</a>
      ${u.role === 'admin' ? '<a href="#/admin">Admin panel</a>' : ''}
      <button id="logoutBtn">Log out</button>
    </div>`;
  $('#userBtn').onclick = (e) => {
    e.stopPropagation();
    const menu = $('#userMenu');
    menu.hidden = !menu.hidden;
    $('#userBtn').setAttribute('aria-expanded', String(!menu.hidden));
  };
  $('#logoutBtn').onclick = logout;
}

async function addToCart(bookId, qty = 1, btn) {
  if (btn) btn.disabled = true;
  try {
    await cart.add(bookId, qty);
    toast('Added to your cart.', 'success', { href: '#/cart', text: 'View cart' });
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function toggleWish(bookId) {
  if (!state.user) {
    toast('Log in to save books to your wishlist.', '', { href: `#/login?next=${encodeURIComponent(currentPath())}`, text: 'Log in' });
    return;
  }
  try {
    if (state.wish.has(bookId)) {
      await api(`/wishlist/${bookId}`, { method: 'DELETE' });
      state.wish.delete(bookId);
      toast('Removed from wishlist.');
    } else {
      await api('/wishlist', { method: 'POST', body: { book_id: bookId } });
      state.wish.add(bookId);
      toast('Saved to your wishlist.', 'success', { href: '#/wishlist', text: 'View' });
    }
    updateBadges();
  } catch (e) { toast(e.message, 'error'); }
}

/* =========================================================================
   Shared components
   ========================================================================= */
function bookCard(b) {
  const ebook = isEbook(b);
  const out = !ebook && b.stock < 1;
  const free = isReadable(b);
  const badges = [
    b.published_by ? '<span class="badge badge-community">COMMUNITY</span>' : '',
    b.level && LEVELS[b.level] ? `<span class="badge badge-level">${LEVELS[b.level].short}</span>` : '',
    free ? '<span class="badge badge-free">FREE TO READ</span>' : '',
    b.sold >= 3 ? '<span class="badge badge-hot">BESTSELLER</span>' : '',
    out ? '<span class="badge badge-out">OUT OF STOCK</span>' : '',
  ].join('');
  if (ebook) {
    return `<article class="book-card">
    <a href="#/book/${b.id}" class="cover-link" aria-label="${esc(b.title)}"><span class="badges">${badges}</span>${cover(b)}</a>
    <button class="wish-btn ${state.wish.has(b.id) ? 'on' : ''}" data-wish="${b.id}" aria-label="Save to wishlist" title="Wishlist">${ICON_HEART}</button>
    <a href="#/book/${b.id}" class="b-title">${esc(b.title)}</a>
    <div class="b-author">${esc(b.author)}</div>
    <div class="b-meta"><span class="price" style="color:var(--success)">Free eBook</span>${b.rating ? stars(b.rating) : ''}</div>
    <div class="b-actions"><a class="btn btn-success btn-sm" href="#/read/${b.id}">Read now</a></div>
  </article>`;
  }
  return `<article class="book-card">
    <a href="#/book/${b.id}" class="cover-link" aria-label="${esc(b.title)}">
      <span class="badges">${badges}</span>
      ${cover(b)}
    </a>
    <button class="wish-btn ${state.wish.has(b.id) ? 'on' : ''}" data-wish="${b.id}" aria-label="Save to wishlist" title="Wishlist">${ICON_HEART}</button>
    <a href="#/book/${b.id}" class="b-title">${esc(b.title)}</a>
    <div class="b-author">${esc(b.author)}</div>
    <div class="b-meta"><span class="price">${money(b.price)}${isMagazine(b) ? '<small class="muted"> /issue</small>' : ''}</span>${b.rating ? stars(b.rating) : ''}</div>
    <div class="b-actions">
      <button class="btn btn-primary btn-sm" data-add="${b.id}" ${out ? 'disabled' : ''}>${out ? 'Sold out' : 'Add to cart'}</button>
      ${free ? `<a class="btn btn-outline btn-sm" href="#/read/${b.id}">Read free</a>` : ''}
    </div>
  </article>`;
}

function writerCTA() {
  return `<section class="section"><div class="container"><div class="writer-cta">
    <div class="wc-icon">✍️</div>
    <div class="grow"><h2>Are you a writer? Publish your book here.</h2>
      <p>Share your novel, poetry, short stories or notes with thousands of readers. Submit it in a few minutes, our editors review it, and it appears in the Reader Zone free for everyone.</p></div>
    <a class="btn btn-accent btn-lg" href="#/publish">Publish your book</a>
  </div></div></section>`;
}

function levelTiles(levels) {
  const count = (l) => levels.find((x) => x.level === l)?.count || 0;
  return `<div class="level-grid">${Object.entries(LEVELS).map(([k, l]) => `<a class="level-card" href="#/shop?level=${k}">
    <span class="lv-icon">${l.icon}</span><strong>${l.label}</strong><span class="muted small">${l.text}</span>
    <span class="lv-count">${count(k)} books →</span></a>`).join('')}</div>`;
}

const bookGrid = (books) => `<div class="book-grid">${books.map(bookCard).join('')}</div>`;
const bookRow = (books) => `<div class="book-row">${books.map(bookCard).join('')}</div>`;

function section(title, subtitle, link, inner) {
  return `<section class="section"><div class="container">
    <div class="section-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${link ? `<a class="see-all" href="${link}">See all →</a>` : ''}</div>
    ${inner}
  </div></section>`;
}

function pagination(page, pages, makeHref) {
  if (pages <= 1) return '';
  const nums = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  let html = `<a class="${page <= 1 ? 'disabled' : ''}" href="${makeHref(page - 1)}" aria-label="Previous page">‹</a>`;
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) html += '<span>…</span>';
    html += n === page ? `<span class="active">${n}</span>` : `<a href="${makeHref(n)}">${n}</a>`;
    prev = n;
  }
  html += `<a class="${page >= pages ? 'disabled' : ''}" href="${makeHref(page + 1)}" aria-label="Next page">›</a>`;
  return `<nav class="pagination" aria-label="Pagination">${html}</nav>`;
}

function passwordField(name, label, { autocomplete = 'current-password', meter = false, placeholder = '' } = {}) {
  return `<div class="field"><label for="f-${name}">${label}</label>
    <div class="pw-wrap"><input id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" required>
    <button type="button" class="pw-toggle" data-pw="f-${name}">Show</button></div>
    ${meter ? '<div class="pw-meter"><span></span></div><span class="hint" id="pwHint">Use 8+ characters with letters and numbers.</span>' : ''}
  </div>`;
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Please wait...'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

function showError(form, message) {
  let box = $('.alert-error', form);
  if (!box) { box = document.createElement('div'); box.className = 'alert alert-error'; form.prepend(box); }
  box.textContent = message;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function modal(title, bodyHTML) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">${bodyHTML}</div></div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  return { el: wrap, close };
}

const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

/* =========================================================================
   Router
   ========================================================================= */
let routeToken = 0;
let cleanup = null;

function parseHash() {
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', params: new URLSearchParams(qs || '') };
}
const currentPath = () => location.hash.slice(1) || '/';

const routes = [
  [/^\/$/, pageHome],
  [/^\/shop$/, pageShop],
  [/^\/academic$/, pageAcademic],
  [/^\/publish$/, pagePublish],
  [/^\/security$/, pageSecurityInfo],
  [/^\/book\/(\d+)$/, pageBook],
  [/^\/reader$/, pageReaderZone],
  [/^\/read\/(\d+)$/, pageRead],
  [/^\/cart$/, pageCart],
  [/^\/checkout$/, pageCheckout],
  [/^\/order-success\/(\d+)$/, pageOrderSuccess],
  [/^\/orders$/, pageOrders],
  [/^\/wishlist$/, pageWishlist],
  [/^\/login$/, pageLogin],
  [/^\/register$/, pageRegister],
  [/^\/account$/, pageAccount],
  [/^\/admin$/, pageAdmin],
  [/^\/about$/, pageAbout],
  [/^\/contact$/, pageContact],
];

async function router() {
  const { path, params } = parseHash();
  if (cleanup) { cleanup(); cleanup = null; }
  $('#mainNav').classList.remove('open');
  $('#searchSuggest').hidden = true;
  const menu = $('#userMenu'); if (menu) menu.hidden = true;
  document.body.classList.toggle('reader-mode', path.startsWith('/read/'));

  // Highlight the active nav link
  const full = currentPath();
  $$('.main-nav a').forEach((a) => {
    const target = a.getAttribute('href').slice(1);
    a.classList.toggle('active', target === full || (target === path && !full.includes('?') && target !== '/') || (target === '/' && full === '/'));
  });
  $$('.tabbar a').forEach((a) => {
    const t = a.dataset.tab;
    a.classList.toggle('active', t === '/' ? path === '/' : path.startsWith(t) || (t === '/account' && ['/orders', '/wishlist', '/login', '/register'].includes(path)));
  });

  const token = ++routeToken;
  const ctx = {
    params,
    token,
    alive: () => token === routeToken,
    render(html) { if (token === routeToken) app.innerHTML = html; },
  };
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    ctx.args = m.slice(1);
    app.innerHTML = loadingHTML();
    window.scrollTo(0, 0);
    try {
      await fn(ctx);
    } catch (e) {
      if (e.status === 401) { navigate(`/login?next=${encodeURIComponent(full)}`); return; }
      ctx.render(`<div class="page container">${emptyHTML('⚠️', 'Something went wrong', e.message, '<a class="btn btn-primary mt-2" href="#/">Go home</a>')}</div>`);
    }
    return;
  }
  document.title = 'Page not found | Online Bookstore';
  ctx.render(`<div class="page container">${emptyHTML('\u{1F4D5}', 'Page not found', 'The page you are looking for does not exist.', '<a class="btn btn-primary mt-2" href="#/">Back to home</a>')}</div>`);
}

function setTitle(t) { document.title = t ? `${t} | Online Bookstore & Reader Zone` : 'Online Bookstore & Reader Zone'; }

function requireLogin(ctx) {
  if (state.user) return true;
  navigate(`/login?next=${encodeURIComponent(currentPath())}`);
  return false;
}

/* =========================================================================
   Page: Home
   ========================================================================= */
async function pageHome(ctx) {
  setTitle('');
  const [stats, genres, featured, popular, free, indian, selfhelp, recent, engineering, comics, magazines, facets] = await Promise.all([
    api('/stats'), api('/genres'),
    api('/books?featured=1&limit=12'),
    api('/books?sort=popular&limit=12'),
    api('/books?free=1&sort=featured&limit=12'),
    api('/books?genre=Indian%20Literature&limit=12'),
    api('/books?genre=Self-Help&limit=12'),
    api('/books?sort=newest&format=book&limit=12'),
    api('/books?genre=Engineering&limit=12'),
    api('/books?format=comic&limit=12'),
    api('/books?format=magazine&limit=12'),
    api('/facets'),
  ]);
  state.genres = genres;
  let continueHTML = '';
  if (state.user) {
    const progress = await api('/progress').catch(() => []);
    if (progress.length) continueHTML = section('Continue reading', 'Pick up right where you left off.', '#/account?tab=library', `<div class="continue-row">${progress.slice(0, 3).map(progressCard).join('')}</div>`);
  }
  const viewed = await recentlyViewed();
  if (viewed.length) continueHTML += section('Recently viewed', 'Books you looked at recently.', '', bookRow(viewed));
  const community = (await api('/books?community=1&sort=added&limit=12').catch(() => ({ items: [] }))).items;
  const heroBooks = featured.items.slice(0, 3);
  ctx.render(`
    <section class="hero">
      <div class="container hero-inner">
        <div>
          <span class="eyebrow">✨ New: Read 240+ classics free in the Reader Zone</span>
          <h1>Find your next <em>favourite book</em>, or start reading right now.</h1>
          <p class="lead">Shop bestsellers, timeless classics and Indian literature at honest prices, delivered to your door. Or open the Reader Zone and read public-domain classics free in your browser.</p>
          <div class="hero-cta">
            <a class="btn btn-accent btn-lg" href="#/shop">Shop books</a>
            <a class="btn btn-outline btn-lg" href="#/reader">Open Reader Zone</a>
          </div>
          <div class="hero-stats">
            <div><strong>${stats.books}+</strong><span>Books in store</span></div>
            <div><strong>${stats.free_books}</strong><span>Free to read</span></div>
            <div><strong>${stats.authors}</strong><span>Authors</span></div>
            <div><strong>${stats.genres}</strong><span>Genres</span></div>
          </div>
        </div>
        <div class="hero-books">${heroBooks.map((b) => `<a href="#/book/${b.id}" class="hb">${cover(b)}</a>`).join('')}</div>
      </div>
    </section>
    <div class="container">
      <div class="features">
        <div class="feature"><div class="f-icon">\u{1F69A}</div><div><strong>Free delivery</strong><span>On orders above ${money(FREE_SHIP)}</span></div></div>
        <div class="feature"><div class="f-icon">\u{1F4D6}</div><div><strong>Read free online</strong><span>${stats.free_books} classics in the Reader Zone</span></div></div>
        <div class="feature"><div class="f-icon">\u{1F512}</div><div><strong>Secure checkout</strong><span>Cash on delivery, UPI and cards</span></div></div>
        <div class="feature"><div class="f-icon">↩️</div><div><strong>Easy returns</strong><span>7-day hassle-free returns</span></div></div>
      </div>
    </div>
    ${continueHTML}
    ${section('Featured picks', 'Hand-picked by our booksellers this month.', '#/shop?featured=1', bookRow(featured.items))}
    ${section('Browse by genre', 'From thrillers to philosophy, find your shelf.', '#/shop', `<div class="genre-grid">${genres.map((g) => {
      const [c1, c2] = PALETTES[hashStr(g.genre) % PALETTES.length];
      return `<a class="genre-card" href="#/shop?genre=${encodeURIComponent(g.genre)}" style="background:linear-gradient(135deg,${c1},${c2})">
        <span class="g-icon">${genreIcon(g.genre)}</span><div><strong>${esc(g.genre)}</strong><br><span>${g.count} books${g.free_count ? ` · ${g.free_count} free` : ''}</span></div></a>`;
    }).join('')}</div>`)}
    ${section('Study smarter', `${stats.academic} textbooks and study guides for every stage of your education.`, '#/academic', levelTiles(facets.levels))}
    ${section('Bestsellers', 'What our readers are buying right now.', '#/shop?sort=popular', bookRow(popular.items))}
    ${section('Engineering essentials', 'Standard textbooks for every branch, from first year to M.Tech.', '#/shop?genre=Engineering', bookRow(engineering.items))}
    ${section('Comics, graphic novels & manga', 'Superheroes, Indian classics and the best of Japanese manga.', '#/shop?format=comic', bookRow(comics.items))}
    ${section('Magazines', 'The latest issues of news, business, science, exam prep and lifestyle magazines.', '#/shop?format=magazine', bookRow(magazines.items))}
    <section class="section"><div class="container">
      <div class="promo">
        <div>
          <span class="badge badge-hot">READER ZONE</span>
          <h2 class="mt-1">Read ${stats.free_books} timeless classics, completely free.</h2>
          <p>Pride and Prejudice, Sherlock Holmes, Frankenstein, Gitanjali and many more. Adjustable fonts, day, sepia and night themes, bookmarks, and your progress saved across devices.</p>
          <a class="btn btn-accent btn-lg mt-1" href="#/reader">Start reading free</a>
        </div>
        <div class="stack">${free.items.slice(0, 3).map((b) => `<a href="#/read/${b.id}" class="stack-item">${cover(b)}</a>`).join('')}</div>
      </div>
    </div></section>
    ${section('Free classics to read now', 'Public-domain masterpieces, available instantly.', '#/reader', bookRow(free.items))}
    ${community.length ? section('From our community writers', 'Original books written by our readers, free to read.', '#/shop?community=1', bookRow(community)) : ''}
    ${writerCTA()}
    ${section('Indian Literature', 'Stories from Tagore to Arundhati Roy.', '#/shop?genre=Indian%20Literature', bookRow(indian.items))}
    ${section('Grow every day', 'Bestselling self-help to build better habits.', '#/shop?genre=Self-Help', bookRow(selfhelp.items))}
    ${section('Modern favourites', 'Recent releases readers love.', '#/shop?sort=newest', bookRow(recent.items))}
  `);
}

/* =========================================================================
   Page: Shop
   ========================================================================= */
function shopHref(params, changes) {
  const p = new URLSearchParams(params);
  for (const [k, v] of Object.entries(changes)) {
    if (v === '' || v == null) p.delete(k); else p.set(k, v);
  }
  if (!('page' in changes)) p.delete('page');
  const qs = p.toString();
  return `#/shop${qs ? '?' + qs : ''}`;
}

async function pageShop(ctx) {
  const p = ctx.params;
  const query = new URLSearchParams();
  for (const k of ['q', 'genre', 'subject', 'level', 'format', 'academic', 'community', 'language', 'sort', 'free', 'min', 'max', 'page', 'featured', 'instock']) if (p.get(k)) query.set(k, p.get(k));
  query.set('limit', '24');
  const genre = p.get('genre') || '';
  const level = p.get('level') || '';
  const format = p.get('format') || '';
  const subject = p.get('subject') || '';
  const [genres, result, facets] = await Promise.all([
    api('/genres'), api('/books?' + query), api(`/facets${genre ? `?genre=${encodeURIComponent(genre)}` : ''}`),
  ]);
  state.genres = genres;
  const q = p.get('q') || '';
  const title = q ? `Results for “${q}”`
    : subject ? `${subject} books` : genre || (level && LEVELS[level] ? `${LEVELS[level].label} books` : '')
      || FORMATS[format] || (p.get('community') ? 'Community writers' : '') || (p.get('academic') ? 'Textbooks & study books' : p.get('free') ? 'Free to read' : p.get('featured') ? 'Featured books' : 'All books');
  setTitle(title);
  const levelCount = (l) => facets.levels.find((x) => x.level === l)?.count || 0;
  const formatCount = (f) => facets.formats.find((x) => x.format === f)?.count || 0;

  const chips = [];
  if (q) chips.push(['Search: ' + q, { q: '' }]);
  if (genre) chips.push([genre, { genre: '', subject: '' }]);
  if (subject) chips.push([subject, { subject: '' }]);
  if (level && LEVELS[level]) chips.push([LEVELS[level].label, { level: '' }]);
  if (FORMATS[format]) chips.push([FORMATS[format], { format: '' }]);
  if (p.get('academic')) chips.push(['Textbooks', { academic: '' }]);
  if (p.get('community')) chips.push(['Community writers', { community: '' }]);
  if (p.get('language')) chips.push([p.get('language'), { language: '' }]);
  if (p.get('free')) chips.push(['Free to read', { free: '' }]);
  if (p.get('featured')) chips.push(['Featured', { featured: '' }]);
  if (p.get('instock')) chips.push(['In stock', { instock: '' }]);
  if (p.get('min') || p.get('max')) chips.push([`${money(p.get('min') || 0)} - ${p.get('max') ? money(p.get('max')) : 'any'}`, { min: '', max: '' }]);
  const priceRanges = [['Under ₹150', '', '150'], ['₹150 - ₹300', '150', '300'], ['₹300 - ₹500', '300', '500'], ['Over ₹500', '500', '']];

  ctx.render(`<div class="page container">
    <div class="breadcrumbs"><a href="#/">Home</a> / <a href="#/shop">Shop</a>${genre ? ` / ${esc(genre)}` : ''}</div>
    <div class="page-head"><h1>${esc(title)}</h1><p class="muted">${result.total} book${result.total === 1 ? '' : 's'} found</p></div>
    <div class="shop-layout">
      <aside class="filters" id="filters" aria-label="Filters">
        <h3>Type</h3>
        <div class="filter-list">
          <a href="${shopHref(p, { format: '' })}" class="${!format ? 'active' : ''}"><span>Everything</span></a>
          ${Object.entries(FORMATS).map(([k, label]) => `<a href="${shopHref(p, { format: k })}" class="${format === k ? 'active' : ''}"><span>${{ book: '\u{1F4D6}', comic: '\u{1F4A5}', magazine: '\u{1F4F0}' }[k]} ${label}</span><span class="n">${formatCount(k)}</span></a>`).join('')}
        </div>
        <h3>Academic level</h3>
        <div class="filter-list">
          <a href="${shopHref(p, { level: '', academic: '' })}" class="${!level && !p.get('academic') ? 'active' : ''}"><span>Any level</span></a>
          ${Object.entries(LEVELS).map(([k, l]) => `<a href="${shopHref(p, { level: k, academic: '' })}" class="${level === k ? 'active' : ''}"><span>${l.icon} ${l.label}</span><span class="n">${levelCount(k)}</span></a>`).join('')}
        </div>
        <h3>Genre</h3>
        <div class="filter-list">
          <a href="${shopHref(p, { genre: '', subject: '' })}" class="${!genre ? 'active' : ''}"><span>All genres</span></a>
          ${genres.map((g) => `<a href="${shopHref(p, { genre: g.genre, subject: '' })}" class="${g.genre === genre ? 'active' : ''}"><span>${genreIcon(g.genre)} ${esc(g.genre)}</span><span class="n">${g.count}</span></a>`).join('')}
        </div>
        ${facets.subjects.length > 1 ? `<h3>${genre === 'Engineering' ? 'Branch' : 'Subject'}</h3>
        <div class="filter-list">
          <a href="${shopHref(p, { subject: '' })}" class="${!subject ? 'active' : ''}"><span>All</span></a>
          ${facets.subjects.map((s) => `<a href="${shopHref(p, { subject: s.subject })}" class="${s.subject === subject ? 'active' : ''}"><span>${esc(s.subject)}</span><span class="n">${s.count}</span></a>`).join('')}
        </div>` : ''}
        <h3>Language</h3>
        <div class="filter-list">
          ${facets.languages.map((l) => `<a href="${shopHref(p, { language: p.get('language') === l.language ? '' : l.language })}" class="${p.get('language') === l.language ? 'active' : ''}"><span>${esc(l.language)}</span><span class="n">${l.count}</span></a>`).join('')}
        </div>
        <h3>Price</h3>
        <div class="filter-list">
          ${priceRanges.map(([label, min, max]) => `<a href="${shopHref(p, { min, max })}" class="${(p.get('min') || '') === min && (p.get('max') || '') === max && (min || max) ? 'active' : ''}"><span>${label}</span></a>`).join('')}
        </div>
        <form class="price-inputs mt-1" id="priceForm">
          <input type="number" name="min" min="0" placeholder="Min" value="${esc(p.get('min') || '')}" aria-label="Minimum price">
          <input type="number" name="max" min="0" placeholder="Max" value="${esc(p.get('max') || '')}" aria-label="Maximum price">
          <button class="btn btn-outline btn-sm" type="submit">Go</button>
        </form>
        <h3>Availability</h3>
        <label class="checkbox"><input type="checkbox" id="fFree" ${p.get('free') ? 'checked' : ''}> Free to read online</label>
        <label class="checkbox mt-1"><input type="checkbox" id="fStock" ${p.get('instock') ? 'checked' : ''}> In stock only</label>
        <a class="btn btn-ghost btn-sm btn-block mt-3" href="#/shop">Clear all filters</a>
      </aside>
      <div>
        <div class="toolbar">
          <div class="flex">
            <button class="btn btn-outline btn-sm filter-toggle" id="filterToggle">☰ Filters</button>
            <div class="chips">${chips.map(([label, ch]) => `<a class="chip active" href="${shopHref(p, ch)}">${esc(label)} <span class="x">✕</span></a>`).join('')}</div>
          </div>
          <label class="flex small">Sort by
            <select id="sortSel" aria-label="Sort books">
              ${[['featured', 'Featured'], ['popular', 'Bestselling'], ['rating', 'Top rated'], ['newest', 'Newest first'], ['oldest', 'Oldest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['title', 'Title A-Z']]
                .map(([v, l]) => `<option value="${v}" ${p.get('sort') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
        </div>
        ${result.items.length ? bookGrid(result.items) : emptyHTML('\u{1F50E}', 'No books found', 'Try a different search or remove some filters.', '<a class="btn btn-primary mt-2" href="#/shop">Browse all books</a>')}
        ${pagination(result.page, result.pages, (n) => shopHref(p, { page: n }))}
      </div>
    </div>
  </div>`);
  if (!ctx.alive()) return;
  $('#sortSel').onchange = (e) => { location.hash = shopHref(p, { sort: e.target.value }); };
  $('#fFree').onchange = (e) => { location.hash = shopHref(p, { free: e.target.checked ? '1' : '' }); };
  $('#fStock').onchange = (e) => { location.hash = shopHref(p, { instock: e.target.checked ? '1' : '' }); };
  $('#filterToggle').onclick = () => $('#filters').classList.toggle('open');
  $('#priceForm').onsubmit = (e) => {
    e.preventDefault();
    const d = formData(e.target);
    location.hash = shopHref(p, { min: d.min, max: d.max });
  };
}

/* =========================================================================
   Page: Academic & Exams hub
   ========================================================================= */
const DISCIPLINES = [
  ['Computer Science', '\u{1F4BB}', 'Engineering', 'Computer Science'],
  ['Mechanical', '⚙️', 'Engineering', 'Mechanical'],
  ['Electrical', '⚡', 'Engineering', 'Electrical'],
  ['Electronics', '\u{1F50C}', 'Engineering', 'Electronics'],
  ['Civil', '\u{1F3D7}️', 'Engineering', 'Civil'],
  ['Chemical', '⚗️', 'Engineering', 'Chemical'],
  ['Engineering Maths', '➗', 'Engineering', 'Mathematics'],
  ['Medical (MBBS / MD)', '\u{1FA7A}', 'Medical', ''],
  ['Science & Maths', '\u{1F9EA}', 'Science & Mathematics', ''],
  ['Commerce & MBA', '\u{1F4CA}', 'Commerce & Management', ''],
  ['Arts & Humanities', '\u{1F3FA}', 'Arts & Humanities', ''],
  ['Research & PhD', '\u{1F52C}', 'Research & PhD', ''],
  ['UPSC', '\u{1F3DB}️', 'Competitive Exams', 'UPSC'],
  ['JEE & NEET', '\u{1F3AF}', 'Competitive Exams', 'JEE & NEET'],
  ['SSC & Banking', '\u{1F3E6}', 'Competitive Exams', 'SSC & Banking'],
  ['CAT & MBA entrance', '\u{1F4C8}', 'Competitive Exams', 'CAT & MBA'],
];

async function pageAcademic(ctx) {
  setTitle('Academic & Exams');
  const [facets, ug, pg, phd, exam, mags] = await Promise.all([
    api('/facets'),
    api('/books?level=UG&sort=featured&limit=12'),
    api('/books?level=PG&sort=featured&limit=12'),
    api('/books?level=PhD&sort=featured&limit=12'),
    api('/books?genre=Competitive%20Exams&sort=featured&limit=12'),
    api('/books?format=magazine&level=Competitive&limit=12'),
  ]);
  const total = facets.levels.reduce((n, l) => n + l.count, 0);
  ctx.render(`
    <section class="rz-hero academic-hero"><div class="container">
      <span class="badge badge-hot">ACADEMIC &amp; EXAM ZONE</span>
      <h1 class="mt-1">Every textbook from first year to PhD.</h1>
      <p>${total} standard textbooks, reference books and exam guides for engineering, medical, science, commerce, humanities, research and competitive exams.</p>
      <form class="rz-search" id="acSearch"><input name="q" placeholder="Search a textbook, author or subject, e.g. Grewal, Thermodynamics, UPSC" aria-label="Search textbooks"><button class="btn btn-primary">Search</button></form>
    </div></section>
    ${section('Choose your level', '', '', levelTiles(facets.levels))}
    ${section('Browse by discipline', 'Jump straight to the books for your course or exam.', '', `<div class="disc-grid">${DISCIPLINES.map(([label, icon, genre, subject]) =>
      `<a class="disc-card" href="#/shop?genre=${encodeURIComponent(genre)}${subject ? `&subject=${encodeURIComponent(subject)}` : ''}"><span>${icon}</span>${esc(label)}</a>`).join('')}</div>`)}
    ${section('Undergraduate essentials', 'B.Tech, MBBS, B.Sc, B.Com and BA textbooks.', '#/shop?level=UG', bookRow(ug.items))}
    ${section('Postgraduate', 'Advanced texts for M.Tech, M.Sc, MBA and MD.', '#/shop?level=PG', bookRow(pg.items))}
    ${section('PhD &amp; research', 'Research methods, statistics and thesis writing.', '#/shop?level=PhD', bookRow(phd.items))}
    ${section('Competitive exam preparation', 'UPSC, JEE, NEET, CAT, SSC and banking.', '#/shop?level=Competitive', bookRow(exam.items))}
    ${mags.items.length ? section('Magazines for aspirants', 'Monthly current affairs for exam preparation.', '#/shop?format=magazine&level=Competitive', bookRow(mags.items)) : ''}
    <section class="section"><div class="container"><div class="card student-note">
      <div><h3>\u{1F393} Student offer</h3><p class="muted" style="margin:0">Use code <strong>STUDENT15</strong> at checkout for 15% off textbooks and exam guides.</p></div>
      <a class="btn btn-primary" href="#/shop?academic=1">Shop textbooks</a>
    </div></div></section>
  `);
  if (!ctx.alive()) return;
  $('#acSearch').onsubmit = (e) => {
    e.preventDefault();
    const q = formData(e.target).q.trim();
    location.hash = `#/shop?academic=1${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  };
}

/* =========================================================================
   Page: Write & Publish (community books)
   ========================================================================= */
const PUBLISH_LANGUAGES = ['English', 'Hindi', 'Bengali', 'Marathi', 'Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu', 'Other'];
const SUB_STATUS = {
  pending: { label: 'In review', cls: 'status-Processing', icon: '⏳' },
  approved: { label: 'Published', cls: 'status-Delivered', icon: '✅' },
  rejected: { label: 'Needs changes', cls: 'status-Cancelled', icon: '✏️' },
};
const wordCount = (t) => (String(t).match(/\S+/g) || []).length;

function previewModal(title, author, text) {
  const { pages, chapters } = paginate(text);
  modal(`Preview: ${title || 'Untitled'}`, `
    <p class="muted small">${pages.length} page${pages.length === 1 ? '' : 's'} · ${chapters.length} chapter${chapters.length === 1 ? '' : 's'} detected · ${wordCount(text).toLocaleString('en-IN')} words${author ? ` · by ${esc(author)}` : ''}</p>
    ${chapters.length ? `<p class="small"><strong>Contents:</strong> ${chapters.slice(0, 12).map((c) => esc(c.title)).join(' · ')}${chapters.length > 12 ? ' …' : ''}</p>` : '<p class="alert alert-info small">Tip: put chapter titles such as <strong>Chapter 1</strong> on their own line, with a blank line before and after, so readers get a table of contents.</p>'}
    <div class="preview-page reader-page">${pages.slice(0, 2).join('<hr>')}</div>
    ${pages.length > 2 ? `<p class="muted small center mt-2">Showing the first 2 of ${pages.length} pages.</p>` : ''}`);
}

async function pagePublish(ctx) {
  setTitle('Write & publish your book');
  const editId = Number(ctx.params.get('edit')) || 0;
  const hero = `<section class="rz-hero publish-hero"><div class="container">
    <span class="badge badge-hot">FOR WRITERS · FREE</span>
    <h1 class="mt-1">Publish your book. Reach real readers.</h1>
    <p>Novels, short stories, poetry, memoirs or study notes: share your writing with our community. Our editors review every submission, and approved books appear in the Reader Zone free for everyone to read.</p>
  </div></section>
  <section class="section" style="padding-top:32px"><div class="container"><div class="steps-grid">
    <div class="step-card"><b>1</b><strong>Write or upload</strong><span>Paste your text or upload a .txt file.</span></div>
    <div class="step-card"><b>2</b><strong>Submit for review</strong><span>Add a title, genre and a short description.</span></div>
    <div class="step-card"><b>3</b><strong>Editor approval</strong><span>We check it within 2-3 days and may suggest changes.</span></div>
    <div class="step-card"><b>4</b><strong>Published!</strong><span>Your book is live in the Reader Zone, free to read.</span></div>
  </div></div></section>`;

  if (!state.user) {
    ctx.render(`${hero}<div class="container" style="padding-bottom:60px"><div class="card center" style="max-width:620px;margin:0 auto">
      <h2>Log in to start publishing</h2>
      <p class="muted">You need a free account so we can let you know when your book is approved.</p>
      <div class="flex" style="justify-content:center"><a class="btn btn-primary btn-lg" href="#/login?next=/publish">Log in</a><a class="btn btn-outline btn-lg" href="#/register?next=/publish">Create free account</a></div>
    </div></div>`);
    return;
  }

  const [genres, mine, editing] = await Promise.all([
    api('/genres'), api('/submissions/mine'), editId ? api(`/submissions/${editId}`) : null,
  ]);
  const draft = editing || store.get('publishDraft', null) || {};
  const genreNames = [...new Set(['Fiction', 'Poetry & Drama', 'Children', ...genres.map((g) => g.genre)])].filter((g) => g !== 'Magazines');

  const subCard = (s) => {
    const st = SUB_STATUS[s.status];
    return `<div class="sub-card">
      <div class="grow">
        <div class="flex" style="gap:8px"><strong style="font-size:16px">${esc(s.title)}</strong><span class="status ${st.cls}">${st.icon} ${st.label}</span></div>
        <div class="muted small">${esc(s.genre)} · ${esc(s.language)} · ${s.word_count.toLocaleString('en-IN')} words · submitted ${fmtDate(s.created_at)}</div>
        ${s.admin_note ? `<div class="editor-note"><strong>Note from the editor:</strong> ${esc(s.admin_note)}</div>` : ''}
      </div>
      <div class="flex" style="gap:6px">
        ${s.status === 'approved' && s.book_id ? `<a class="btn btn-success btn-sm" href="#/read/${s.book_id}">Read</a><a class="btn btn-outline btn-sm" href="#/book/${s.book_id}">View page</a>` : ''}
        ${s.status !== 'approved' ? `<a class="btn btn-outline btn-sm" href="#/publish?edit=${s.id}">Edit</a><button class="btn btn-danger btn-sm" data-withdraw="${s.id}">Withdraw</button>` : ''}
      </div>
    </div>`;
  };

  ctx.render(`${hero}
  <div class="container" style="padding-bottom:60px">
    ${mine.length ? `<h2 id="mySubs">My submissions</h2><div class="sub-list">${mine.map(subCard).join('')}</div>` : ''}
    <div class="publish-layout mt-3">
      <form class="card" id="pubForm" novalidate>
        <h2 style="margin-bottom:4px">${editing ? `Edit “${esc(editing.title)}”` : 'Submit a new book'}</h2>
        <p class="muted small">${editing ? 'Saving sends your book back to the review queue.' : 'Your draft is saved in this browser automatically while you type.'}</p>
        <div class="form-grid mt-2">
          <div class="field full"><label for="pb-title">Book title *</label><input id="pb-title" name="title" maxlength="200" required value="${esc(draft.title || '')}" placeholder="e.g. Monsoon Letters"></div>
          <div class="field"><label for="pb-author">Author / pen name</label><input id="pb-author" name="author_name" maxlength="120" value="${esc(draft.author_name || state.user.name)}"></div>
          <div class="field"><label for="pb-genre">Genre *</label><select id="pb-genre" name="genre" required>
            <option value="">Choose a genre</option>${genreNames.map((g) => `<option ${draft.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
          <div class="field"><label for="pb-lang">Language</label><select id="pb-lang" name="language">${PUBLISH_LANGUAGES.map((l) => `<option ${(draft.language || 'English') === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>&nbsp;</label><label class="btn btn-outline upload-btn" for="pb-file">\u{1F4C4} Upload a .txt file</label><input type="file" id="pb-file" accept=".txt,text/plain" hidden></div>
          <div class="field full"><label for="pb-desc">Short description * <span class="hint" id="descCount"></span></label>
            <textarea id="pb-desc" name="description" maxlength="1500" style="min-height:90px" placeholder="What is your book about? This appears on the book page (30-1500 characters).">${esc(draft.description || '')}</textarea></div>
          <div class="field full"><label for="pb-content">Your book *</label>
            <textarea id="pb-content" name="content" class="manuscript" placeholder="Chapter 1&#10;&#10;Start writing or paste your book here...">${esc(draft.content || '')}</textarea>
            <div class="flex between small muted"><span id="wc">0 words</span><span>Put chapter titles like <strong>Chapter 1</strong> on their own line for an automatic table of contents.</span></div></div>
          <label class="checkbox full"><input type="checkbox" name="rights" ${editing ? 'checked' : ''}> I wrote this book (or have permission) and agree to let Online Bookstore publish it free to read online.</label>
        </div>
        <div class="flex mt-3">
          <button class="btn btn-primary btn-lg" type="submit">${editing ? 'Save & resubmit' : 'Submit for review'}</button>
          <button class="btn btn-outline btn-lg" type="button" id="previewBtn">Preview</button>
          ${editing ? '<a class="btn btn-ghost" href="#/publish">Cancel editing</a>' : '<button class="btn btn-ghost" type="button" id="clearDraft">Clear draft</button>'}
        </div>
      </form>
      <aside class="card guidelines">
        <h3>\u{1F4CB} Publishing guidelines</h3>
        <ul>
          <li>Only submit work you wrote yourself or have the rights to share.</li>
          <li>At least 500 characters. Longer works are welcome (up to about 350,000 words).</li>
          <li>No hate speech, explicit content, plagiarism or personal information about others.</li>
          <li>Use a clear title and an honest description so readers know what to expect.</li>
          <li>Editors may ask for changes. You can edit and resubmit at any time before approval.</li>
        </ul>
        <h3 class="mt-2">\u{1F4A1} Formatting tips</h3>
        <ul>
          <li>Leave a blank line between paragraphs.</li>
          <li>Put chapter titles such as <em>Chapter 1</em>, <em>Part Two</em> or <em>Prologue</em> on their own line.</li>
          <li>Write _like this_ for <em>italics</em>.</li>
          <li>Use <strong>Preview</strong> to see exactly how readers will see it.</li>
        </ul>
      </aside>
    </div>
  </div>`);
  if (!ctx.alive()) return;

  const form = $('#pubForm');
  const content = $('#pb-content');
  const desc = $('#pb-desc');
  const updateCounts = () => {
    const w = wordCount(content.value);
    $('#wc').textContent = `${w.toLocaleString('en-IN')} words · about ${Math.max(1, Math.round(w / 230))} min read`;
    $('#descCount').textContent = `${desc.value.length}/1500`;
  };
  updateCounts();
  const saveDraft = debounce(() => {
    if (editing) return;
    const d = formData(form);
    store.set('publishDraft', { title: d.title, author_name: d.author_name, genre: d.genre, language: d.language, description: d.description, content: d.content });
  }, 600);
  form.addEventListener('input', () => { updateCounts(); saveDraft(); });

  $('#pb-file').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('That file is larger than 5 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      content.value = String(reader.result).replace(/\r\n?/g, '\n');
      if (!$('#pb-title').value) $('#pb-title').value = file.name.replace(/\.txt$/i, '').replace(/[_-]+/g, ' ');
      updateCounts();
      saveDraft();
      toast(`Loaded ${file.name}.`, 'success');
    };
    reader.readAsText(file);
  };
  $('#previewBtn').onclick = () => {
    if (!content.value.trim()) { toast('Write or upload some text first.', 'error'); return; }
    previewModal($('#pb-title').value, $('#pb-author').value, content.value);
  };
  const clear = $('#clearDraft');
  if (clear) clear.onclick = () => {
    if (!confirm('Clear the whole draft?')) return;
    store.del('publishDraft');
    router();
  };
  $$('[data-withdraw]').forEach((btn) => btn.onclick = async () => {
    if (!confirm('Withdraw this submission? It will be deleted.')) return;
    try { await api(`/submissions/${btn.dataset.withdraw}`, { method: 'DELETE' }); toast('Submission withdrawn.'); router(); } catch (e) { toast(e.message, 'error'); }
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form);
    if (!d.title.trim() || !d.genre) { showError(form, 'Please add a title and choose a genre.'); return; }
    if (d.description.trim().length < 30) { showError(form, 'Please write a description of at least 30 characters.'); return; }
    if (d.content.trim().length < 500) { showError(form, 'Your book needs at least 500 characters of text.'); return; }
    if (!d.rights) { showError(form, 'Please confirm you have the right to publish this book.'); return; }
    const btn = $('button[type=submit]', form);
    setBusy(btn, true, 'Submitting...');
    try {
      await api(editing ? `/submissions/${editing.id}` : '/submissions', { method: editing ? 'PUT' : 'POST', body: { ...d, rights: true } });
      if (!editing) store.del('publishDraft');
      toast(editing ? 'Saved. Your book is back in the review queue.' : 'Submitted! Our editors will review your book soon.', 'success');
      location.hash = '#/publish';
      if (!editing) router();
      setTimeout(() => $('#mySubs')?.scrollIntoView({ behavior: 'smooth' }), 400);
    } catch (err) {
      setBusy(btn, false);
      showError(form, err.message);
    }
  };
}

/* =========================================================================
   Page: Book details
   ========================================================================= */
async function pageBook(ctx) {
  const id = Number(ctx.args[0]);
  const { book: b, reviews, related } = await api(`/books/${id}`);
  setTitle(`${b.title} by ${b.author}`);
  const free = isReadable(b);
  const ebook = isEbook(b);
  rememberViewed(b.id);
  const stockHTML = b.stock < 1 ? '<span class="stock-out">● Out of stock</span>'
    : b.stock <= 5 ? `<span class="stock-low">● Only ${b.stock} left - order soon</span>`
      : '<span class="stock-ok">● In stock, ships in 1-2 days</span>';
  const myReview = state.user && reviews.find((r) => r.user_id === state.user.id);
  const dist = [5, 4, 3, 2, 1].map((n) => [n, reviews.filter((r) => r.rating === n).length]);

  ctx.render(`<div class="page container">
    <div class="breadcrumbs"><a href="#/">Home</a> / <a href="#/shop?genre=${encodeURIComponent(b.genre)}">${esc(b.genre)}</a> / ${esc(b.title)}</div>
    <div class="book-detail">
      <div class="cover-col">${cover(b)}</div>
      <div>
        <div class="flex">${b.published_by ? '<span class="badge badge-community">COMMUNITY WRITER</span>' : ''}<span class="badge badge-soft">${genreIcon(b.genre)} ${esc(b.genre)}</span>${b.level && LEVELS[b.level] ? `<span class="badge badge-level">${LEVELS[b.level].label}</span>` : ''}${free ? '<span class="badge badge-free">FREE TO READ</span>' : ''}${b.featured ? '<span class="badge badge-hot">STAFF PICK</span>' : ''}</div>
        <h1 class="mt-1">${esc(b.title)}</h1>
        <div class="by">${isMagazine(b) ? 'Published by' : 'by'} <a href="#/shop?q=${encodeURIComponent(b.author)}">${esc(b.author)}</a>${b.year != null ? ` · ${fmtYear(b.year)}` : ''}</div>
        <div class="flex" style="gap:14px"><a href="#reviews" class="flex" style="gap:6px">${stars(b.rating, b.review_count)}</a>
          <button class="btn btn-ghost btn-sm" id="shareBtn" title="Share this book">\u{1F517} Share</button></div>
        <p class="mt-2" style="font-size:16px;white-space:pre-line">${esc(b.description)}</p>

        ${ebook ? `<div class="price-box">
          <div class="flex between">
            <div><div class="big-price" style="color:var(--success)">Free</div><span class="muted small">Community eBook · read online, no purchase needed</span></div>
            ${b.publisher_name ? `<div class="small muted">Published on our site by<br><strong style="color:var(--text)">${esc(b.publisher_name)}</strong></div>` : ''}
          </div>
          <div class="flex mt-2">
            <a class="btn btn-success btn-lg grow" href="#/read/${b.id}">\u{1F4D6} Start reading</a>
            <button class="btn btn-outline btn-lg wish-btn-lg ${state.wish.has(b.id) ? 'on' : ''}" data-wish="${b.id}" aria-label="Save to wishlist" title="Wishlist">${ICON_HEART}</button>
          </div>
          <p class="small muted mt-2" style="margin-bottom:0">Written by a member of our community and approved by our editors. <a href="#/publish">Publish your own book →</a></p>
        </div>` : `<div class="price-box">
          <div class="flex between">
            <div><div class="big-price">${money(b.price)}</div><span class="muted small">Inclusive of all taxes · ${isMagazine(b) ? 'Per issue' : esc(b.format)}</span></div>
            <div>${stockHTML}</div>
          </div>
          <div class="flex mt-2">
            <div class="qty" aria-label="Quantity">
              <button type="button" id="qMinus" aria-label="Decrease quantity">−</button><span id="qVal">1</span><button type="button" id="qPlus" aria-label="Increase quantity">+</button>
            </div>
            <button class="btn btn-primary btn-lg grow" id="addBtn" ${b.stock < 1 ? 'disabled' : ''}>Add to cart</button>
            <button class="btn btn-accent btn-lg grow" id="buyBtn" ${b.stock < 1 ? 'disabled' : ''}>Buy now</button>
            <button class="btn btn-outline btn-lg wish-btn-lg ${state.wish.has(b.id) ? 'on' : ''}" data-wish="${b.id}" aria-label="Save to wishlist" title="Wishlist">${ICON_HEART}</button>
          </div>
          <div class="perks">
            <div>\u{1F69A} Free delivery over ${money(FREE_SHIP)}</div>
            <div>↩️ 7-day easy returns</div>
            <div>\u{1F4B5} Cash on delivery</div>
          </div>
        </div>`}

        ${free && !ebook ? `<div class="read-free-box"><span class="rf-icon">\u{1F4D6}</span><div class="grow"><strong>This book is free to read online.</strong><br><span class="small muted">It is in the public domain. Read it now in the Reader Zone, no purchase needed.</span></div><a class="btn btn-success" href="#/read/${b.id}">Read now</a></div>` : ''}

        <h3 class="mt-3">Book details</h3>
        <table class="detail-table">
          <tr><th>Title</th><td>${esc(b.title)}</td></tr>
          <tr><th>${isMagazine(b) ? 'Publisher' : 'Author'}</th><td>${esc(b.author)}</td></tr>
          <tr><th>Category</th><td><a href="#/shop?genre=${encodeURIComponent(b.genre)}">${esc(b.genre)}</a></td></tr>
          ${b.subject ? `<tr><th>Subject</th><td><a href="#/shop?genre=${encodeURIComponent(b.genre)}&subject=${encodeURIComponent(b.subject)}">${esc(b.subject)}</a></td></tr>` : ''}
          ${b.level && LEVELS[b.level] ? `<tr><th>Academic level</th><td><a href="#/shop?level=${b.level}">${LEVELS[b.level].label}</a></td></tr>` : ''}
          ${isMagazine(b) ? '' : `<tr><th>First published</th><td>${fmtYear(b.year)}</td></tr>`}
          <tr><th>Language</th><td>${esc(b.language)}</td></tr>
          <tr><th>Format</th><td>${isMagazine(b) ? 'Magazine · latest single issue' : esc(b.format)}${b.level ? ' · latest edition' : ''}${free ? ' · Free online edition' : ''}</td></tr>
          <tr><th>Item code</th><td>OBRZ-${String(b.id).padStart(5, '0')}</td></tr>
        </table>
      </div>
    </div>

    <section class="section" id="reviews">
      <div class="section-head"><h2>Reader reviews</h2></div>
      <div class="reviews-wrap">
        <div>
          <div class="card rating-summary">
            <div class="big">${b.rating || '-'}</div>
            ${stars(b.rating)}
            <div class="muted small">${b.review_count} review${b.review_count === 1 ? '' : 's'}</div>
            <div class="rating-bars">${dist.map(([n, c]) => `<div class="rb"><span>${n} ★</span><div class="bar"><span style="width:${reviews.length ? (c / reviews.length) * 100 : 0}%"></span></div><span>${c}</span></div>`).join('')}</div>
          </div>
          <div class="card mt-2">
            ${state.user ? `
              <h3 style="font-size:17px">${myReview ? 'Update your review' : 'Write a review'}</h3>
              <form id="reviewForm">
                <div class="star-input" role="radiogroup" aria-label="Your rating">
                  ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="st${n}" name="rating" value="${n}" ${myReview?.rating === n ? 'checked' : ''}><label for="st${n}" title="${n} star${n > 1 ? 's' : ''}">★</label>`).join('')}
                </div>
                <div class="field mt-1"><textarea name="comment" placeholder="What did you think of this book?" maxlength="2000">${esc(myReview?.comment || '')}</textarea></div>
                <button class="btn btn-primary btn-block mt-1" type="submit">${myReview ? 'Update review' : 'Submit review'}</button>
              </form>` : `<p class="muted">Share your thoughts with other readers.</p><a class="btn btn-primary btn-block" href="#/login?next=${encodeURIComponent(currentPath())}">Log in to write a review</a>`}
          </div>
        </div>
        <div>
          ${reviews.length ? reviews.map((r) => `<div class="review">
            <div class="review-head"><span class="avatar">${esc(initials(r.user_name))}</span><div class="grow"><strong>${esc(r.user_name)}</strong><div class="muted small">${fmtDate(r.created_at)}</div></div>${stars(r.rating)}
            ${state.user && (state.user.id === r.user_id || state.user.role === 'admin') ? `<button class="link-btn" data-del-review="${r.id}">Delete</button>` : ''}</div>
            ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
          </div>`).join('') : emptyHTML('\u{1F4AC}', 'No reviews yet', 'Be the first to review this book.')}
        </div>
      </div>
    </section>

    ${related.length ? `<section class="section"><div class="section-head"><div><h2>More in ${esc(b.genre)}</h2></div><a class="see-all" href="#/shop?genre=${encodeURIComponent(b.genre)}">See all →</a></div>${bookRow(related)}</section>` : ''}
  </div>`);
  if (!ctx.alive()) return;

  $('#shareBtn').onclick = async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: b.title, text: `${b.title} by ${b.author}`, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied to clipboard.', 'success'); }
    } catch { /* user cancelled */ }
  };
  if (!ebook) {
    let qty = 1;
    const maxQty = Math.min(10, b.stock || 1);
    const setQ = (n) => { qty = Math.max(1, Math.min(maxQty, n)); $('#qVal').textContent = qty; };
    $('#qMinus').onclick = () => setQ(qty - 1);
    $('#qPlus').onclick = () => setQ(qty + 1);
    $('#addBtn').onclick = (e) => addToCart(b.id, qty, e.currentTarget);
    $('#buyBtn').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try {
        await cart.add(b.id, qty);
        navigate(state.user ? '/checkout' : '/login?next=/checkout');
      } catch (err) { toast(err.message, 'error'); setBusy(e.currentTarget, false); }
    };
  }
  const rf = $('#reviewForm');
  if (rf) rf.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(rf);
    if (!d.rating) { toast('Please choose a star rating.', 'error'); return; }
    try {
      await api(`/books/${b.id}/reviews`, { method: 'POST', body: { rating: Number(d.rating), comment: d.comment } });
      toast('Thanks for your review!', 'success');
      router();
    } catch (err) { toast(err.message, 'error'); }
  };
  $$('[data-del-review]').forEach((btn) => btn.onclick = async () => {
    if (!confirm('Delete this review?')) return;
    try { await api(`/reviews/${btn.dataset.delReview}`, { method: 'DELETE' }); toast('Review deleted.'); router(); } catch (err) { toast(err.message, 'error'); }
  });
}

/* =========================================================================
   Page: Cart
   ========================================================================= */
function shipProgress(subtotal) {
  if (subtotal >= FREE_SHIP) return '<div class="ship-progress" style="background:var(--success-50);color:var(--success)">\u{1F389} You have unlocked <strong>free delivery</strong>!</div>';
  const pct = Math.min(100, (subtotal / FREE_SHIP) * 100);
  return `<div class="ship-progress">Add <strong>${money(FREE_SHIP - subtotal)}</strong> more for free delivery.<div class="bar"><span style="width:${pct}%"></span></div></div>`;
}

async function pageCart(ctx) {
  setTitle('Your cart');
  const data = await cart.load();
  if (!data.items.length) {
    ctx.render(`<div class="page container"><div class="page-head"><h1>Your cart</h1></div>
      ${emptyHTML('\u{1F6D2}', 'Your cart is empty', 'Looks like you have not added any books yet.', '<a class="btn btn-primary mt-2" href="#/shop">Start shopping</a>')}</div>`);
    return;
  }
  ctx.render(`<div class="page container">
    <div class="page-head"><h1>Your cart</h1><p class="muted">${data.count} item${data.count === 1 ? '' : 's'}</p></div>
    <div class="cart-layout">
      <div class="card">
        ${data.items.map((i) => `<div class="cart-item">
          <a href="#/book/${i.book_id}">${cover(i)}</a>
          <div>
            <h3><a href="#/book/${i.book_id}" style="color:inherit">${esc(i.title)}</a></h3>
            <div class="muted small">${esc(i.author)}</div>
            <div class="small mt-1">${i.stock <= 5 ? `<span class="stock-low">Only ${i.stock} left</span>` : '<span class="stock-ok">In stock</span>'}</div>
            ${i.gutenberg_id ? `<a class="small" href="#/read/${i.book_id}">\u{1F4D6} Also free to read online</a>` : ''}
          </div>
          <div class="ci-right">
            <span class="price">${money(i.price * i.qty)}</span>
            <div class="qty"><button data-q="${i.book_id}" data-d="-1" aria-label="Decrease">−</button><span>${i.qty}</span><button data-q="${i.book_id}" data-d="1" aria-label="Increase">+</button></div>
            <button class="link-btn" data-remove="${i.book_id}">Remove</button>
          </div>
        </div>`).join('')}
      </div>
      <aside class="card summary">
        <h3>Order summary</h3>
        ${shipProgress(data.subtotal)}
        <div class="summary-row"><span>Subtotal (${data.count} items)</span><span>${money(data.subtotal)}</span></div>
        <div class="summary-row"><span>Delivery</span><span>${data.shipping ? money(data.shipping) : '<span class="stock-ok">FREE</span>'}</span></div>
        <div class="summary-row total"><span>Total</span><span>${money(data.total)}</span></div>
        <a class="btn btn-accent btn-lg btn-block mt-2" href="${state.user ? '#/checkout' : '#/login?next=/checkout'}">Proceed to checkout</a>
        <a class="btn btn-ghost btn-block mt-1" href="#/shop">Continue shopping</a>
        <p class="small muted center mt-2">\u{1F512} Secure checkout · 7-day returns</p>
      </aside>
    </div>
  </div>`);
  if (!ctx.alive()) return;
  $$('[data-q]').forEach((btn) => btn.onclick = async () => {
    const id = Number(btn.dataset.q);
    const item = cart.data.items.find((i) => i.book_id === id);
    const next = item.qty + Number(btn.dataset.d);
    if (next > Math.min(10, item.stock)) { toast(`You can order up to ${Math.min(10, item.stock)} copies.`, 'error'); return; }
    try { await cart.setQty(id, next); router(); } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-remove]').forEach((btn) => btn.onclick = async () => {
    try { await cart.remove(Number(btn.dataset.remove)); toast('Removed from cart.'); router(); } catch (e) { toast(e.message, 'error'); }
  });
}

/* =========================================================================
   Page: Checkout
   ========================================================================= */
async function pageCheckout(ctx) {
  if (!requireLogin(ctx)) return;
  setTitle('Checkout');
  const data = await cart.load();
  if (!data.items.length) { navigate('/cart'); return; }
  const u = state.user;
  ctx.render(`<div class="page container">
    <div class="steps"><span class="st done"><b>✓</b>Cart</span><span class="line"></span><span class="st cur"><b>2</b>Delivery &amp; payment</span><span class="line"></span><span class="st"><b>3</b>Confirmation</span></div>
    <form class="cart-layout" id="checkoutForm" novalidate>
      <div>
        <div class="card">
          <h3>Delivery address</h3>
          <div class="form-grid mt-2">
            <div class="field"><label for="c-name">Full name</label><input id="c-name" name="name" required value="${esc(u.name)}" autocomplete="name"></div>
            <div class="field"><label for="c-phone">Mobile number</label><input id="c-phone" name="phone" required value="${esc(u.phone || '')}" placeholder="10-digit mobile number" autocomplete="tel" inputmode="tel"></div>
            <div class="field full"><label for="c-address">Address</label><textarea id="c-address" name="address" required placeholder="House no., building, street, area" autocomplete="street-address" style="min-height:80px">${esc(u.address || '')}</textarea></div>
            <div class="field"><label for="c-city">City</label><input id="c-city" name="city" required value="${esc(u.city || '')}" autocomplete="address-level2"></div>
            <div class="field"><label for="c-state">State</label><select id="c-state" name="state" required><option value="">Select state</option>${STATES.map((s) => `<option ${u.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="field"><label for="c-pin">PIN code</label><input id="c-pin" name="pincode" required value="${esc(u.pincode || '')}" placeholder="6 digits" inputmode="numeric" maxlength="6" autocomplete="postal-code"></div>
          </div>
        </div>
        <div class="card mt-2">
          <h3>Payment method</h3>
          <div class="pay-options mt-2">
            <label class="pay-option"><input type="radio" name="payment_method" value="cod" checked><div><strong>\u{1F4B5} Cash on Delivery</strong><span>Pay in cash or UPI when your books arrive.</span></div></label>
            <label class="pay-option"><input type="radio" name="payment_method" value="upi"><div><strong>\u{1F4F1} UPI</strong><span>Google Pay, PhonePe, Paytm and more.</span></div></label>
            <label class="pay-option"><input type="radio" name="payment_method" value="card"><div><strong>\u{1F4B3} Credit / Debit card</strong><span>Visa, Mastercard, RuPay.</span></div></label>
          </div>
          <p class="alert alert-info mt-2 small" style="margin-bottom:0">Demo store: online payments are simulated. No money is charged and no card details are collected.</p>
        </div>
      </div>
      <aside class="card summary">
        <h3>Your order</h3>
        <div class="mini-items">${data.items.map((i) => `<div class="mini-item">${cover(i)}<div><strong>${esc(i.title)}</strong><div class="muted">Qty ${i.qty}</div></div><span>${money(i.price * i.qty)}</span></div>`).join('')}</div>
        <div id="couponBox"></div>
        <div id="sumBox"></div>
        <button class="btn btn-accent btn-lg btn-block mt-2" type="submit" id="placeBtn">Place order</button>
        <p class="small muted center mt-1">By placing your order you agree to our terms of sale.</p>
      </aside>
    </form>
  </div>`);
  if (!ctx.alive()) return;
  const form = $('#checkoutForm');

  // Order summary + coupon codes
  let applied = null;
  const coupons = await api('/coupons').catch(() => []);
  const renderSummary = (t) => {
    $('#sumBox').innerHTML = `
      <div class="summary-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.discount ? `<div class="summary-row" style="color:var(--success)"><span>Discount (${esc(t.coupon)})</span><span>−${money(t.discount)}</span></div>` : ''}
      <div class="summary-row"><span>Delivery</span><span>${t.shipping ? money(t.shipping) : '<span class="stock-ok">FREE</span>'}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(t.total)}</span></div>`;
    $('#placeBtn').textContent = `Place order · ${money(t.total)}`;
    $('#couponBox').innerHTML = t.coupon
      ? `<div class="coupon-applied"><span>✓ <strong>${esc(t.coupon)}</strong> applied: ${esc(t.coupon_label)}</span><button type="button" class="link-btn" id="rmCoupon">Remove</button></div>`
      : `<label class="small" for="couponIn" style="font-weight:600">Have a coupon code?</label>
        <div class="coupon-row"><input id="couponIn" placeholder="Enter code" autocomplete="off"><button type="button" class="btn btn-outline btn-sm" id="applyCoupon">Apply</button></div>
        ${coupons.length ? `<div class="coupon-hints">Try: ${coupons.map((c) => `<button type="button" data-code="${esc(c.code)}" title="${esc(c.label)}">${esc(c.code)}</button>`).join('')}</div>` : ''}`;
    const apply = async (code) => {
      if (!code) return;
      try {
        const res = await api('/coupons/apply', { method: 'POST', body: { code } });
        applied = res.coupon;
        renderSummary(res);
        toast(`Coupon applied. You save ${money(res.discount || data.shipping)}!`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    };
    const btn = $('#applyCoupon');
    if (btn) {
      btn.onclick = () => apply($('#couponIn').value.trim());
      $('#couponIn').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(e.target.value.trim()); } };
      $$('[data-code]', $('#couponBox')).forEach((b) => b.onclick = () => apply(b.dataset.code));
    }
    const rm = $('#rmCoupon');
    if (rm) rm.onclick = () => { applied = null; renderSummary(data); };
  };
  renderSummary(data);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = { ...formData(form), coupon: applied || '' };
    if (!d.name || !d.phone || !d.address || !d.city || !d.state || !d.pincode) { showError(form.firstElementChild, 'Please fill in every delivery field.'); return; }
    if (!/^\d{6}$/.test(d.pincode)) { showError(form.firstElementChild, 'PIN code must be 6 digits.'); return; }
    const btn = $('#placeBtn');
    setBusy(btn, true, 'Placing your order...');
    try {
      const order = await api('/orders', { method: 'POST', body: d });
      cart.data = totals([]);
      updateBadges();
      state.user = { ...state.user, phone: d.phone, address: d.address, city: d.city, state: d.state, pincode: d.pincode };
      navigate(`/order-success/${order.id}`);
    } catch (err) {
      setBusy(btn, false);
      showError(form.firstElementChild, err.message);
    }
  };
}

async function pageOrderSuccess(ctx) {
  if (!requireLogin(ctx)) return;
  const order = await api(`/orders/${ctx.args[0]}`);
  setTitle('Order placed');
  ctx.render(`<div class="page container" style="max-width:760px">
    <div class="steps"><span class="st done"><b>✓</b>Cart</span><span class="line"></span><span class="st done"><b>✓</b>Delivery &amp; payment</span><span class="line"></span><span class="st cur"><b>3</b>Confirmation</span></div>
    <div class="card success-hero">
      <div class="check">✓</div>
      <h1>Thank you, your order is placed!</h1>
      <p class="muted">Order <strong>#${order.id}</strong> · ${fmtDate(order.created_at)} · ${esc(order.payment_method)}</p>
      <p>We will deliver to <strong>${esc(order.ship_name)}</strong>, ${esc(order.ship_address)}, ${esc(order.ship_city)}, ${esc(order.ship_state)} - ${esc(order.ship_pincode)}.<br>Estimated delivery: <strong>${new Date(Date.now() + 5 * 864e5).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></p>
      <div class="order-items mt-3" style="text-align:left">${order.items.map((i) => `<div class="oi"><span>${esc(i.title)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
        ${order.discount ? `<div class="oi" style="color:var(--success)"><span>Coupon ${esc(order.coupon || '')}</span><span>−${money(order.discount)}</span></div>` : ''}
        <div class="oi"><span class="muted">Delivery</span><span>${order.shipping ? money(order.shipping) : 'FREE'}</span></div>
        <div class="oi" style="border-top:1px solid var(--border);padding-top:10px"><strong>Total paid${order.payment_method === 'Cash on Delivery' ? ' on delivery' : ''}</strong><strong>${money(order.total)}</strong></div></div>
      <div class="flex mt-3" style="justify-content:center"><a class="btn btn-primary" href="#/orders">Track my orders</a><a class="btn btn-outline" href="#/shop">Continue shopping</a></div>
    </div>
  </div>`);
}

/* =========================================================================
   Page: Orders
   ========================================================================= */
const ORDER_FLOW = ['Placed', 'Processing', 'Shipped', 'Delivered'];

function tracker(status) {
  if (status === 'Cancelled') return '';
  const idx = ORDER_FLOW.indexOf(status);
  return `<div class="tracker">${ORDER_FLOW.map((s, i) => `<div class="tk ${i <= idx ? 'on' : ''}"><i></i>${s}</div>`).join('')}</div>`;
}

async function pageOrders(ctx) {
  if (!requireLogin(ctx)) return;
  setTitle('My orders');
  const orders = await api('/orders');
  ctx.render(`<div class="page container" style="max-width:960px">
    <div class="page-head"><h1>My orders</h1><p class="muted">Track, review and manage your purchases.</p></div>
    ${orders.length ? orders.map((o) => `<div class="order-card">
      <div class="order-head">
        <div><span class="oh-label">Order placed</span><strong>${fmtDate(o.created_at)}</strong></div>
        <div><span class="oh-label">Total</span><strong>${money(o.total)}</strong></div>
        <div><span class="oh-label">Payment</span><strong>${esc(o.payment_method)}</strong></div>
        <div><span class="oh-label">Ship to</span><strong>${esc(o.ship_name)}, ${esc(o.ship_city)}</strong></div>
        <div><span class="oh-label">Order #</span><strong>${o.id}</strong></div>
      </div>
      <div class="order-body">
        <div class="flex between"><span class="status status-${esc(o.status)}">${esc(o.status)}</span>
          ${['Placed', 'Processing'].includes(o.status) ? `<button class="btn btn-danger btn-sm" data-cancel="${o.id}">Cancel order</button>` : ''}</div>
        ${tracker(o.status)}
        <div class="order-items mt-2">${o.items.map((i) => `<div class="oi"><span>${i.book_id ? `<a href="#/book/${i.book_id}">${esc(i.title)}</a>` : esc(i.title)} <span class="muted">× ${i.qty}</span></span><span>${money(i.price * i.qty)}</span></div>`).join('')}</div>
      </div>
    </div>`).join('') : emptyHTML('\u{1F4E6}', 'No orders yet', 'When you buy books, your orders will show up here.', '<a class="btn btn-primary mt-2" href="#/shop">Start shopping</a>')}
  </div>`);
  if (!ctx.alive()) return;
  $$('[data-cancel]').forEach((btn) => btn.onclick = async () => {
    if (!confirm('Cancel this order?')) return;
    try { await api(`/orders/${btn.dataset.cancel}/cancel`, { method: 'POST' }); toast('Order cancelled.'); router(); } catch (e) { toast(e.message, 'error'); }
  });
}

/* =========================================================================
   Page: Wishlist
   ========================================================================= */
async function pageWishlist(ctx) {
  if (!requireLogin(ctx)) return;
  setTitle('Wishlist');
  const items = await api('/wishlist');
  state.wish = new Set(items.map((b) => b.id));
  updateBadges();
  ctx.render(`<div class="page container">
    <div class="page-head"><h1>My wishlist</h1><p class="muted">${items.length} saved book${items.length === 1 ? '' : 's'}</p></div>
    ${items.length ? bookGrid(items) : emptyHTML('❤️', 'Your wishlist is empty', 'Tap the heart on any book to save it for later.', '<a class="btn btn-primary mt-2" href="#/shop">Discover books</a>')}
  </div>`);
}

/* =========================================================================
   Pages: Login & Register
   ========================================================================= */
function authSide(title, text) {
  return `<div class="auth-side">
    <div>
      <h2>${title}</h2>
      <p>${text}</p>
      <ul>
        <li><b>✓</b> Save your cart and wishlist across devices</li>
        <li><b>✓</b> Track orders and delivery</li>
        <li><b>✓</b> Sync reading progress and bookmarks</li>
        <li><b>✓</b> Review and rate the books you love</li>
      </ul>
    </div>
    <div class="auth-books" id="authBooks"></div>
  </div>`;
}

async function fillAuthBooks(ctx) {
  try {
    const { items } = await api('/books?featured=1&limit=4');
    if (ctx.alive() && $('#authBooks')) $('#authBooks').innerHTML = items.map((b) => cover(b)).join('');
  } catch { /* decorative only */ }
}

function safeNext(params) {
  const next = params.get('next') || '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

async function pageLogin(ctx) {
  setTitle('Log in');
  const next = safeNext(ctx.params);
  if (state.user) { navigate(next); return; }
  ctx.render(`<div class="page container"><div class="auth-wrap">
    ${authSide('Welcome back, reader.', 'Log in to continue where you left off.')}
    <div class="auth-form">
      <h1>Log in</h1>
      <p class="muted">New here? <a href="#/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}">Create a free account</a></p>
      <form id="loginForm" novalidate>
        <div class="field"><label for="f-email">Email address</label><input id="f-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        ${passwordField('password', 'Password')}
        <button class="btn btn-primary btn-lg btn-block" type="submit">Log in</button>
      </form>
      <p class="auth-switch">Just browsing? <a href="#/reader">Read free classics without an account</a></p>
    </div>
  </div></div>`);
  if (!ctx.alive()) return;
  fillAuthBooks(ctx);
  const form = $('#loginForm');
  $('#f-email').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form);
    if (!d.email || !d.password) { showError(form, 'Please enter your email and password.'); return; }
    const btn = $('button[type=submit]', form);
    setBusy(btn, true, 'Logging in...');
    try {
      const res = await api('/auth/login', { method: 'POST', body: d });
      if (res.mfa_required) { showMfaStep(form, res.mfa_token, next); return; }
      await finishLogin(res.user, next);
    } catch (err) {
      setBusy(btn, false);
      showError(form, err.message);
    }
  };
}

async function finishLogin(user, next) {
  await afterLogin(user);
  toast(`Welcome back, ${user.name.split(' ')[0]}!`, 'success');
  navigate(next);
}

// Second sign-in step for accounts with two-factor authentication
function showMfaStep(form, mfaToken, next) {
  const wrap = form.parentElement;
  form.remove();
  const box = document.createElement('form');
  box.id = 'mfaForm';
  box.noValidate = true;
  box.innerHTML = `
    <div class="mfa-icon">\u{1F510}</div>
    <h2 style="margin:0">Two-step verification</h2>
    <p class="muted" style="margin:0">Open your authenticator app and enter the 6-digit code for <strong>Online Bookstore</strong>.</p>
    <div class="field"><label for="mfa-code">Verification code</label>
      <input id="mfa-code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="11" placeholder="123456" required></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit">Verify and sign in</button>
    <p class="small muted center" style="margin:0">Lost your phone? Enter one of your backup codes (like <code>a1b2c-3d4e5</code>) instead.</p>
    <a class="small center" href="#/login" id="mfaBack">← Use a different account</a>`;
  wrap.insertBefore(box, wrap.querySelector('.auth-switch'));
  const input = $('#mfa-code', box);
  input.focus();
  $('#mfaBack', box).onclick = (e) => { e.preventDefault(); router(); };
  box.onsubmit = async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (!code) { showError(box, 'Please enter the code from your app.'); return; }
    const btn = $('button[type=submit]', box);
    setBusy(btn, true, 'Verifying...');
    try {
      const { user } = await api('/auth/login/2fa', { method: 'POST', body: { mfa_token: mfaToken, code } });
      await finishLogin(user, next);
    } catch (err) {
      setBusy(btn, false);
      input.select();
      showError(box, err.message);
      if (/expired|sign in again/i.test(err.message)) setTimeout(router, 1800);
    }
  };
}

function pwStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

async function pageRegister(ctx) {
  setTitle('Create account');
  const next = safeNext(ctx.params);
  if (state.user) { navigate(next); return; }
  ctx.render(`<div class="page container"><div class="auth-wrap">
    ${authSide('Join our community of readers.', 'A free account unlocks everything the store has to offer.')}
    <div class="auth-form">
      <h1>Create your account</h1>
      <p class="muted">Already have one? <a href="#/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}">Log in</a></p>
      <form id="regForm" novalidate>
        <div class="field"><label for="f-name">Full name</label><input id="f-name" name="name" autocomplete="name" placeholder="Your name" required></div>
        <div class="field"><label for="f-email">Email address</label><input id="f-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        ${passwordField('password', 'Password', { autocomplete: 'new-password', meter: true })}
        ${passwordField('confirm', 'Confirm password', { autocomplete: 'new-password' })}
        <label class="checkbox"><input type="checkbox" name="terms" required> I agree to the Terms of Use and Privacy Policy</label>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Create account</button>
      </form>
    </div>
  </div></div>`);
  if (!ctx.alive()) return;
  fillAuthBooks(ctx);
  const form = $('#regForm');
  $('#f-name').focus();
  $('#f-password').addEventListener('input', (e) => {
    const s = pwStrength(e.target.value);
    const colors = ['#c0392b', '#c0392b', '#e0a325', '#e0a325', '#1f8a5b', '#1f8a5b'];
    const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
    const bar = $('.pw-meter span', form);
    bar.style.width = `${(s / 5) * 100}%`;
    bar.style.background = colors[s];
    $('#pwHint').textContent = e.target.value ? `Strength: ${labels[s]}` : 'Use 8+ characters with letters and numbers.';
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form);
    if (!d.name || !d.email || !d.password) { showError(form, 'Please fill in all fields.'); return; }
    if (d.password.length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password)) { showError(form, 'Password must be at least 8 characters and contain letters and numbers.'); return; }
    if (pwStrength(d.password) < 2) { showError(form, 'That password is too easy to guess. Try making it longer or mixing upper and lower case.'); return; }
    if (d.password !== d.confirm) { showError(form, 'Passwords do not match.'); return; }
    if (!d.terms) { showError(form, 'Please accept the terms to continue.'); return; }
    const btn = $('button[type=submit]', form);
    setBusy(btn, true, 'Creating account...');
    try {
      const { user } = await api('/auth/register', { method: 'POST', body: { name: d.name, email: d.email, password: d.password } });
      await afterLogin(user);
      toast(`Welcome, ${user.name.split(' ')[0]}! Your account is ready.`, 'success');
      navigate(next);
    } catch (err) {
      setBusy(btn, false);
      showError(form, err.message);
    }
  };
}

/* =========================================================================
   Page: Account (profile, library, bookmarks, security)
   ========================================================================= */
function progressCard(p) {
  const pct = p.total_pages ? Math.round(((p.page + 1) / p.total_pages) * 100) : 0;
  return `<div class="progress-card">
    <a href="#/read/${p.book_id}">${cover(p)}</a>
    <div style="min-width:0">
      <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.title)}</strong>
      <span class="muted small">${esc(p.author)}</span>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <span class="small muted">${pct}% · page ${p.page + 1} of ${p.total_pages || '?'}</span>
    </div>
    <a class="btn btn-success btn-sm" href="#/read/${p.book_id}">${pct >= 100 ? 'Read again' : 'Continue'}</a>
  </div>`;
}

async function pageAccount(ctx) {
  if (!requireLogin(ctx)) return;
  const tab = ctx.params.get('tab') || 'profile';
  const u = state.user;
  setTitle('My account');
  const tabs = [['profile', '\u{1F464}', 'Profile'], ['library', '\u{1F4D6}', 'My reading'], ['bookmarks', '\u{1F516}', 'Bookmarks'], ['security', '\u{1F6E1}️', 'Security']];
  let content = '';
  let sec = null;

  if (tab === 'profile') {
    const [orders, wish, progress] = await Promise.all([api('/orders'), api('/wishlist'), api('/progress')]);
    content = `
      <div class="stat-grid">
        <div class="stat"><span class="s-icon">\u{1F4E6}</span><div class="s-label">Orders</div><div class="s-value">${orders.length}</div></div>
        <div class="stat"><span class="s-icon">❤️</span><div class="s-label">Wishlist</div><div class="s-value">${wish.length}</div></div>
        <div class="stat"><span class="s-icon">\u{1F4D6}</span><div class="s-label">Books reading</div><div class="s-value">${progress.length}</div></div>
      </div>
      <div class="card mt-3">
        <h3>Personal details</h3>
        <form id="profileForm" class="form-grid mt-2">
          <div class="field"><label for="p-name">Full name</label><input id="p-name" name="name" value="${esc(u.name)}" required></div>
          <div class="field"><label for="p-email">Email</label><input id="p-email" value="${esc(u.email)}" disabled><span class="hint">Email cannot be changed.</span></div>
          <div class="field"><label for="p-phone">Mobile number</label><input id="p-phone" name="phone" value="${esc(u.phone || '')}"></div>
          <div class="field"><label for="p-pin">PIN code</label><input id="p-pin" name="pincode" value="${esc(u.pincode || '')}" maxlength="6"></div>
          <div class="field full"><label for="p-address">Address</label><textarea id="p-address" name="address" style="min-height:70px">${esc(u.address || '')}</textarea></div>
          <div class="field"><label for="p-city">City</label><input id="p-city" name="city" value="${esc(u.city || '')}"></div>
          <div class="field"><label for="p-state">State</label><select id="p-state" name="state"><option value="">Select state</option>${STATES.map((s) => `<option ${u.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="full"><button class="btn btn-primary" type="submit">Save changes</button></div>
        </form>
      </div>`;
  } else if (tab === 'library') {
    const progress = await api('/progress');
    content = `<h2>My reading</h2><p class="muted">Books you have opened in the Reader Zone. Your place is saved automatically.</p>
      ${progress.length ? `<div class="continue-row">${progress.map(progressCard).join('')}</div>` : emptyHTML('\u{1F4D6}', 'Nothing here yet', 'Open any free classic and your progress will appear here.', '<a class="btn btn-success mt-2" href="#/reader">Browse the Reader Zone</a>')}`;
  } else if (tab === 'bookmarks') {
    const marks = await api('/bookmarks');
    content = `<h2>Bookmarks</h2><p class="muted">Pages you have bookmarked while reading.</p>
      ${marks.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Book</th><th>Page</th><th>Note</th><th>Saved</th><th></th></tr></thead><tbody>
        ${marks.map((m) => `<tr><td><strong>${esc(m.title)}</strong><div class="muted small">${esc(m.author)}</div></td><td>${m.page + 1}</td><td>${esc(m.note || '-')}</td><td class="small">${fmtDate(m.created_at)}</td>
        <td style="white-space:nowrap"><a class="btn btn-success btn-sm" href="#/read/${m.book_id}?page=${m.page}">Open</a> <button class="btn btn-danger btn-sm" data-del-bm="${m.id}">Delete</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyHTML('\u{1F516}', 'No bookmarks yet', 'Use the bookmark button while reading to save a page.')}`;
  } else {
    sec = await api('/auth/security');
    content = securityCentreHTML(sec);
  }

  ctx.render(`<div class="page container">
    <div class="page-head"><h1>My account</h1></div>
    <div class="account-layout">
      <nav class="side-menu" aria-label="Account">
        <div class="sm-user"><span class="avatar lg">${esc(initials(u.name))}</span><div><strong>${esc(u.name)}</strong><span class="muted small">Member since ${fmtDate(u.created_at)}</span></div></div>
        ${tabs.map(([key, icon, label]) => `<a href="#/account?tab=${key}" class="${tab === key ? 'active' : ''}">${icon} ${label}</a>`).join('')}
        <a href="#/publish">✍️ My published books</a>
        <a href="#/orders">\u{1F4E6} My orders</a>
        <a href="#/wishlist">❤️ Wishlist</a>
        ${u.role === 'admin' ? '<a href="#/admin">\u{1F6E0}️ Admin panel</a>' : ''}
        <button id="acctLogout">\u{1F6AA} Log out</button>
      </nav>
      <div>${content}</div>
    </div>
  </div>`);
  if (!ctx.alive()) return;
  $('#acctLogout').onclick = logout;

  const pf = $('#profileForm');
  if (pf) pf.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { user } = await api('/auth/profile', { method: 'PUT', body: formData(pf) });
      state.user = user;
      renderUserArea();
      toast('Profile updated.', 'success');
    } catch (err) { showError(pf, err.message); }
  };
  if (sec) bindSecurityCentre(sec);
  $$('[data-del-bm]').forEach((btn) => btn.onclick = async () => {
    await api(`/bookmarks/${btn.dataset.delBm}`, { method: 'DELETE' });
    toast('Bookmark deleted.');
    router();
  });
}

/* =========================================================================
   Account: Security centre
   ========================================================================= */
const timeAgo = (ms) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const fmtDateTime = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function securityCentreHTML(sec) {
  const checks = [
    [sec.totp_enabled, 'Two-step verification is on', 'Turn on two-step verification', 'Protects your account even if someone learns your password.'],
    [!!sec.password_changed_at, `Password set ${sec.password_changed_at ? fmtDate(sec.password_changed_at) : ''}`, 'Update your password', 'Use a long password you do not use on other sites.'],
    [sec.failed_last_30_days === 0, 'No failed sign-ins in the last 30 days', `${sec.failed_last_30_days} failed sign-in attempt${sec.failed_last_30_days === 1 ? '' : 's'} in 30 days`, 'If this was not you, change your password and turn on two-step verification.'],
    [sec.sessions.length <= 3, `Signed in on ${sec.sessions.length} device${sec.sessions.length === 1 ? '' : 's'}`, `Signed in on ${sec.sessions.length} devices`, 'Sign out of devices you no longer use.'],
  ];
  const score = checks.filter((c) => c[0]).length;
  const level = score === 4 ? ['Strong', 'good'] : score >= 2 ? ['Fair', 'fair'] : ['Needs attention', 'weak'];
  return `
    <div class="sec-head card">
      <div class="sec-score ${level[1]}"><span>${score}/4</span></div>
      <div class="grow"><h2 style="margin:0">Security checkup: ${level[0]}</h2>
        <p class="muted" style="margin:4px 0 0">Review the items below to keep your account safe.</p></div>
    </div>
    <div class="check-list">${checks.map(([ok, good, bad, tip]) => `<div class="check-item ${ok ? 'ok' : 'warn'}"><span class="ci-mark">${ok ? '✓' : '!'}</span>
      <div><strong>${esc(ok ? good : bad)}</strong>${ok ? '' : `<div class="muted small">${esc(tip)}</div>`}</div></div>`).join('')}</div>

    <div class="sec-grid">
      <div class="card">
        <h3>\u{1F510} Two-step verification</h3>
        ${sec.totp_enabled ? `
          <p><span class="status status-Delivered">ON</span> Each sign-in needs your password <em>and</em> a code from your authenticator app.</p>
          <p class="small muted">${sec.backup_codes_left} unused backup code${sec.backup_codes_left === 1 ? '' : 's'} left.</p>
          <div class="flex"><button class="btn btn-outline btn-sm" id="newCodes">New backup codes</button><button class="btn btn-danger btn-sm" id="disable2fa">Turn off</button></div>`
        : `
          <p><span class="status status-Cancelled">OFF</span> Add a second step to sign-in using a free app like Google Authenticator, Microsoft Authenticator or Authy.</p>
          <button class="btn btn-primary" id="enable2fa">Turn on two-step verification</button>`}
      </div>
      <div class="card">
        <h3>\u{1F511} Change password</h3>
        <form id="pwForm" style="display:flex;flex-direction:column;gap:12px" novalidate>
          ${passwordField('current_password', 'Current password')}
          ${passwordField('new_password', 'New password', { autocomplete: 'new-password', meter: true })}
          ${passwordField('confirm', 'Confirm new password', { autocomplete: 'new-password' })}
          <button class="btn btn-primary" type="submit">Update password</button>
          <p class="small muted" style="margin:0">Changing your password signs you out on all other devices.</p>
        </form>
      </div>
    </div>

    <div class="card mt-3">
      <div class="flex between"><h3 style="margin:0">\u{1F4BB} Where you're signed in</h3>
        ${sec.sessions.length > 1 ? '<button class="btn btn-danger btn-sm" id="revokeOthers">Sign out all other devices</button>' : ''}</div>
      <div class="device-list mt-2">${sec.sessions.map((s) => `<div class="device">
        <span class="dv-icon">${s.device.mobile ? '\u{1F4F1}' : '\u{1F5A5}️'}</span>
        <div class="grow"><strong>${esc(s.device.label)}</strong> ${s.current ? '<span class="badge badge-free">THIS DEVICE</span>' : ''}
          <div class="muted small">IP ${esc(s.ip || 'unknown')} · signed in ${fmtDate(new Date(s.created_at || Date.now()).toISOString())} · active ${s.last_seen ? timeAgo(s.last_seen) : 'recently'}</div></div>
        ${s.current ? '' : `<button class="btn btn-outline btn-sm" data-revoke="${esc(s.id)}">Sign out</button>`}
      </div>`).join('')}</div>
    </div>

    <div class="card mt-3">
      <h3>\u{1F4DC} Recent sign-in activity</h3>
      <div class="table-wrap" style="border:0"><table class="data"><thead><tr><th>Event</th><th>Device</th><th>IP address</th><th>When</th></tr></thead><tbody>
        ${sec.events.map((e) => `<tr><td><span class="ev-dot ${e.success ? 'ok' : 'bad'}"></span>${esc(e.event)}</td><td class="small">${esc(e.device)}</td><td class="small">${esc(e.ip || '-')}</td><td class="small">${fmtDateTime(e.created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted center">No activity yet</td></tr>'}
      </tbody></table></div>
      <p class="small muted" style="margin-bottom:0">Don't recognise something? Change your password, sign out other devices and contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
    </div>

    <div class="card mt-3">
      <h3>\u{1F4E6} Your data &amp; privacy</h3>
      <div class="flex between">
        <div><strong>Download your data</strong><div class="muted small">A copy of your profile, orders, reviews, reading history and sign-in history (JSON file).</div></div>
        <button class="btn btn-outline btn-sm" id="exportData">Download</button>
      </div>
      <hr class="sep">
      <div class="flex between">
        <div><strong style="color:var(--danger)">Delete your account</strong><div class="muted small">Permanently removes your account and all its data. This cannot be undone.</div></div>
        <button class="btn btn-danger btn-sm" id="deleteAccount">Delete account</button>
      </div>
    </div>`;
}

function backupCodesHTML(codes) {
  return `<div class="alert alert-info small">Save these backup codes somewhere safe (a password manager or printed copy). Each code works once if you lose your phone. <strong>They will not be shown again.</strong></div>
    <div class="backup-codes">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
    <div class="flex mt-2"><button class="btn btn-outline btn-sm" id="copyCodes">Copy</button><button class="btn btn-outline btn-sm" id="dlCodes">Download .txt</button></div>`;
}

function bindBackupCodeButtons(root, codes) {
  const text = `Online Bookstore backup codes (each works once)\n\n${codes.join('\n')}\n`;
  $('#copyCodes', root).onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Backup codes copied.', 'success'); } catch { toast('Could not copy. Please write them down.', 'error'); }
  };
  $('#dlCodes', root).onclick = () => downloadFile('bookstore-backup-codes.txt', text, 'text/plain');
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Ask for the password (and optionally a code) in a small dialog; resolves with the values or null
function askPassword(title, text, { withCode = false, danger = false, confirmWord = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(title, `<form id="askForm" style="display:flex;flex-direction:column;gap:14px" novalidate>
      <p style="margin:0">${text}</p>
      ${passwordField('ask_password', 'Your password')}
      ${withCode ? '<div class="field"><label for="ask-code">Code from your authenticator app (or a backup code)</label><input id="ask-code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="11"></div>' : ''}
      ${confirmWord ? `<div class="field"><label for="ask-confirm">Type <strong>${confirmWord}</strong> to confirm</label><input id="ask-confirm" name="confirm" autocomplete="off"></div>` : ''}
      <div class="flex"><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="submit">Continue</button><button class="btn btn-ghost" type="button" data-close>Cancel</button></div>
    </form>`);
    const f = $('#askForm', m.el);
    $('#f-ask_password', m.el).focus();
    const observer = new MutationObserver(() => { if (!document.body.contains(m.el) && !done) { done = true; observer.disconnect(); resolve(null); } });
    observer.observe(document.body, { childList: true });
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(f);
      if (!d.ask_password) { showError(f, 'Please enter your password.'); return; }
      if (confirmWord && d.confirm !== confirmWord) { showError(f, `Please type ${confirmWord} to confirm.`); return; }
      done = true;
      observer.disconnect();
      resolve({ password: d.ask_password, code: d.code, confirm: d.confirm, modal: m, form: f });
    };
  });
}

function bindSecurityCentre(sec) {
  const pw = $('#pwForm');
  const newPw = $('#f-new_password');
  newPw.addEventListener('input', () => {
    const s = pwStrength(newPw.value);
    const bar = $('.pw-meter span', pw);
    bar.style.width = `${(s / 5) * 100}%`;
    bar.style.background = ['#c0392b', '#c0392b', '#e0a325', '#e0a325', '#1f8a5b', '#1f8a5b'][s];
    $('#pwHint').textContent = newPw.value ? `Strength: ${['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][s]}` : 'Use 8+ characters with letters and numbers.';
  });
  pw.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(pw);
    if (d.new_password !== d.confirm) { showError(pw, 'New passwords do not match.'); return; }
    try {
      await api('/auth/password', { method: 'PUT', body: d });
      toast('Password updated. Other devices have been signed out.', 'success');
      router();
    } catch (err) { showError(pw, err.message); }
  };

  $$('[data-revoke]').forEach((btn) => btn.onclick = async () => {
    try { await api(`/auth/sessions/${btn.dataset.revoke}`, { method: 'DELETE' }); toast('That device has been signed out.', 'success'); router(); } catch (err) { toast(err.message, 'error'); }
  });
  const ro = $('#revokeOthers');
  if (ro) ro.onclick = async () => {
    if (!confirm('Sign out of every other device?')) return;
    try { const r = await api('/auth/sessions/revoke-others', { method: 'POST' }); toast(`Signed out ${r.count} other device${r.count === 1 ? '' : 's'}.`, 'success'); router(); } catch (err) { toast(err.message, 'error'); }
  };

  const en = $('#enable2fa');
  if (en) en.onclick = async () => {
    const a = await askPassword('Turn on two-step verification', 'First, confirm it’s you.');
    if (!a) return;
    let setup;
    try { setup = await api('/auth/2fa/setup', { method: 'POST', body: { password: a.password } }); } catch (err) { showError(a.form, err.message); return; }
    a.modal.close();
    const m = modal('Set up your authenticator app', `
      <ol class="setup-steps">
        <li>Install an authenticator app such as <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> or <strong>Authy</strong>.</li>
        <li>In the app, tap <strong>+</strong> and scan this QR code:</li>
      </ol>
      <div class="qr-box">${setup.qr}</div>
      <p class="small muted center">Can't scan? Choose "Enter a setup key" and type:<br><code class="setup-key">${esc(setup.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
      <form id="enableForm" style="display:flex;flex-direction:column;gap:12px" novalidate>
        <div class="field"><label for="en-code">3. Enter the 6-digit code shown in the app</label><input id="en-code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"></div>
        <button class="btn btn-primary" type="submit">Verify and turn on</button>
      </form>`);
    const f = $('#enableForm', m.el);
    $('#en-code', m.el).focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/auth/2fa/enable', { method: 'POST', body: { code: formData(f).code } });
        $('.modal-body', m.el).innerHTML = `<div class="center"><div class="mfa-icon">✅</div><h3>Two-step verification is on</h3></div>${backupCodesHTML(r.backup_codes)}
          <button class="btn btn-primary btn-block mt-3" data-close>I've saved my codes</button>`;
        bindBackupCodeButtons(m.el, r.backup_codes);
        state.user = { ...state.user, totp_enabled: true };
        const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); router(); } });
        obs.observe(document.body, { childList: true });
      } catch (err) { showError(f, err.message); }
    };
  };

  const dis = $('#disable2fa');
  if (dis) dis.onclick = async () => {
    const a = await askPassword('Turn off two-step verification', 'Your account will be protected by your password only.', { withCode: true, danger: true });
    if (!a) return;
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: { password: a.password, code: a.code } });
      a.modal.close();
      toast('Two-step verification turned off.');
      router();
    } catch (err) { showError(a.form, err.message); }
  };

  const nc = $('#newCodes');
  if (nc) nc.onclick = async () => {
    const a = await askPassword('New backup codes', 'Your old backup codes will stop working.');
    if (!a) return;
    try {
      const r = await api('/auth/2fa/backup-codes', { method: 'POST', body: { password: a.password } });
      $('.modal-body', a.modal.el).innerHTML = `${backupCodesHTML(r.backup_codes)}<button class="btn btn-primary btn-block mt-3" data-close>Done</button>`;
      bindBackupCodeButtons(a.modal.el, r.backup_codes);
      const obs = new MutationObserver(() => { if (!document.body.contains(a.modal.el)) { obs.disconnect(); router(); } });
      obs.observe(document.body, { childList: true });
    } catch (err) { showError(a.form, err.message); }
  };

  $('#exportData').onclick = async () => {
    try {
      const data = await api('/auth/export');
      downloadFile('my-bookstore-data.json', JSON.stringify(data, null, 2), 'application/json');
      toast('Your data has been downloaded.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  $('#deleteAccount').onclick = async () => {
    const a = await askPassword('Delete your account', '<strong>This permanently deletes your account, orders, reviews, reading history and published books.</strong> This cannot be undone.', { danger: true, confirmWord: 'DELETE' });
    if (!a) return;
    try {
      await api('/auth/account', { method: 'DELETE', body: { password: a.password, confirm: a.confirm } });
      a.modal.close();
      state.user = null;
      state.wish = new Set();
      cart.data = totals([]);
      renderUserArea();
      updateBadges();
      toast('Your account has been deleted.');
      navigate('/');
    } catch (err) { showError(a.form, err.message); }
  };
}

/* =========================================================================
   Page: Security & privacy (public)
   ========================================================================= */
function pageSecurityInfo(ctx) {
  setTitle('Security & privacy');
  const items = [
    ['\u{1F512}', 'Encrypted passwords', 'Passwords are never stored as plain text. They are hashed with scrypt, a slow, salted algorithm designed to resist cracking.'],
    ['\u{1F510}', 'Two-step verification', 'Add a code from an authenticator app to every sign-in, with one-time backup codes if you lose your phone.'],
    ['\u{1F6AB}', 'Brute-force protection', 'After several wrong passwords an account is locked for 15 minutes, and repeated attempts from one network are slowed down.'],
    ['\u{1F36A}', 'Secure sessions', 'Sign-in cookies cannot be read by scripts, are tied to our site only, and expire after inactivity. You can sign out any device remotely.'],
    ['\u{1F6E1}️', 'Protection against attacks', 'A strict Content Security Policy blocks injected scripts, every request is checked against cross-site forgery, and all database queries are parameterised.'],
    ['\u{1F4DC}', 'Activity you can see', 'Your Security centre shows every sign-in attempt with device and IP address, so you can spot anything unusual.'],
    ['\u{1F4B3}', 'No card details stored', 'We never ask for or store card numbers on this site.'],
    ['\u{1F4E6}', 'Your data, your choice', 'Download a copy of your data or permanently delete your account at any time.'],
  ];
  ctx.render(`
    <section class="rz-hero security-hero"><div class="container">
      <span class="badge badge-hot">SECURITY &amp; PRIVACY</span>
      <h1 class="mt-1">Your account and data, protected.</h1>
      <p>Here is how Online Bookstore &amp; Reader Zone keeps your account, orders and reading history safe, and what you can do to stay secure.</p>
      <div class="flex mt-2">${state.user ? '<a class="btn btn-accent btn-lg" href="#/account?tab=security">Open my Security centre</a>' : '<a class="btn btn-accent btn-lg" href="#/login?next=%2Faccount%3Ftab%3Dsecurity">Log in to check your security</a>'}</div>
    </div></section>
    ${section('How we protect you', '', '', `<div class="feature-grid">${items.map(([i, t, d]) => `<div class="card"><div class="h-icon">${i}</div><h3>${t}</h3><p class="muted small" style="margin:0">${d}</p></div>`).join('')}</div>`)}
    ${section('Keep your account safe', '', '', `<div class="card"><ul class="tips">
      <li>Use a <strong>unique password</strong> of at least 12 characters that you don't use anywhere else. A password manager helps.</li>
      <li>Turn on <strong>two-step verification</strong> in your <a href="#/account?tab=security">Security centre</a>.</li>
      <li>We will <strong>never</strong> ask for your password, OTP or bank details by phone, email or WhatsApp.</li>
      <li>Check the address bar before signing in, and sign out on shared or public computers.</li>
      <li>Review your <strong>recent sign-in activity</strong> now and then, and sign out devices you don't recognise.</li>
    </ul></div>`)}
    ${section('Report a problem', '', '', `<div class="card flex between">
      <div><strong>Found a security issue or suspicious activity?</strong><div class="muted small">Email us and we'll look into it promptly. Please don't share passwords in your message.</div></div>
      <a class="btn btn-primary" href="mailto:${SUPPORT_EMAIL}?subject=Security%20report">${SUPPORT_EMAIL}</a>
    </div>`)}
    <div style="height:40px"></div>`);
}

/* =========================================================================
   Page: Admin panel
   ========================================================================= */
async function pageAdmin(ctx) {
  if (!requireLogin(ctx)) return;
  if (state.user.role !== 'admin') {
    ctx.render(`<div class="page container">${emptyHTML('\u{1F512}', 'Admins only', 'You do not have permission to view this page.', '<a class="btn btn-primary mt-2" href="#/">Go home</a>')}</div>`);
    return;
  }
  const tab = ctx.params.get('tab') || 'dashboard';
  setTitle('Admin panel');
  const pendingSubs = (await api('/admin/submissions?status=pending')).length;
  const tabs = [['dashboard', 'Dashboard'], ['submissions', `Book submissions${pendingSubs ? ` <span class="tab-count">${pendingSubs}</span>` : ''}`],
    ['books', 'Books'], ['orders', 'Orders'], ['users', 'Customers'], ['messages', 'Messages'], ['security', '\u{1F6E1}️ Security']];
  let content = '';

  if (tab === 'security') {
    const s = await api('/admin/security');
    const c = s.counts;
    content = `
      ${c.admins_without_2fa ? `<a class="alert alert-error" style="display:block" href="#/account?tab=security">⚠️ ${c.admins_without_2fa} admin account${c.admins_without_2fa === 1 ? ' does' : 's do'} not use two-step verification. Admin accounts should always have it on. <strong>Turn it on now →</strong></a>` : ''}
      <div class="stat-grid">
        <div class="stat"><span class="s-icon">\u{1F6A8}</span><div class="s-label">Failed sign-ins (24 h)</div><div class="s-value">${c.failed_24h}</div></div>
        <div class="stat"><span class="s-icon">\u{1F512}</span><div class="s-label">Locked accounts</div><div class="s-value">${c.locked}</div></div>
        <div class="stat"><span class="s-icon">\u{1F510}</span><div class="s-label">Users with 2-step</div><div class="s-value">${c.with_2fa} / ${c.users}</div></div>
        <div class="stat"><span class="s-icon">\u{1F4BB}</span><div class="s-label">Active sessions</div><div class="s-value">${c.active_sessions}</div></div>
      </div>
      ${s.locked.length ? `<h3 class="mt-3">Locked accounts</h3><div class="table-wrap"><table class="data"><tbody>
        ${s.locked.map((u) => `<tr><td><strong>${esc(u.name)}</strong><div class="muted small">${esc(u.email)}</div></td><td class="small">unlocks in ${Math.max(1, Math.ceil((u.locked_until - Date.now()) / 60000))} min</td>
        <td><button class="btn btn-outline btn-sm" data-unlock="${u.id}">Unlock now</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <h3 class="mt-3">Recent failed sign-ins</h3>
      <div class="table-wrap"><table class="data"><thead><tr><th>Email tried</th><th>What happened</th><th>Device</th><th>IP</th><th>When</th></tr></thead><tbody>
        ${s.failed.map((e) => `<tr><td>${esc(e.email || '-')}</td><td>${esc(e.event)}</td><td class="small">${esc(e.device)}</td><td class="small">${esc(e.ip || '-')}</td><td class="small">${fmtDateTime(e.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted center">No failed sign-ins \u{1F389}</td></tr>'}
      </tbody></table></div>
      <h3 class="mt-3">Admin audit log</h3>
      <div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody>
        ${s.audit.map((a) => `<tr><td class="small">${fmtDateTime(a.created_at)}</td><td>${esc(a.user_name || '-')}</td><td><strong>${esc(a.action)}</strong></td><td class="small">${esc(a.details || '')}</td><td class="small">${esc(a.ip || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted center">No admin actions recorded yet</td></tr>'}
      </tbody></table></div>`;
  } else if (tab === 'submissions') {
    const filter = ctx.params.get('status') || 'pending';
    const subs = await api(`/admin/submissions${filter === 'all' ? '' : `?status=${filter}`}`);
    ctx.adminSubs = subs;
    content = `
      <div class="chips" style="margin-bottom:16px">${[['pending', 'Waiting for review'], ['approved', 'Published'], ['rejected', 'Sent back'], ['all', 'All']]
        .map(([k, l]) => `<a class="chip ${filter === k ? 'active' : ''}" href="#/admin?tab=submissions&status=${k}">${l}${k === 'pending' && pendingSubs ? ` (${pendingSubs})` : ''}</a>`).join('')}</div>
      ${subs.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Book</th><th>Writer</th><th>Genre</th><th>Words</th><th>Submitted</th><th>Status</th><th></th></tr></thead><tbody>
        ${subs.map((s) => `<tr>
          <td><strong>${esc(s.title)}</strong><div class="muted small">by ${esc(s.author_name)} · ${esc(s.language)}</div></td>
          <td>${esc(s.user_name)}<div class="muted small">${esc(s.user_email)}</div></td>
          <td>${esc(s.genre)}</td><td>${s.word_count.toLocaleString('en-IN')}</td><td class="small">${fmtDate(s.updated_at)}</td>
          <td><span class="status ${SUB_STATUS[s.status].cls}">${SUB_STATUS[s.status].label}</span></td>
          <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-review="${s.id}">${s.status === 'pending' ? 'Review' : 'View'}</button>
            ${s.book_id ? `<a class="btn btn-ghost btn-sm" href="#/book/${s.book_id}">Book page</a>` : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>` : emptyHTML('\u{1F4ED}', filter === 'pending' ? 'No books waiting for review' : 'Nothing here', filter === 'pending' ? 'New submissions from writers will appear here.' : 'Try another filter.')}`;
  } else if (tab === 'dashboard') {
    const s = await api('/admin/stats');
    const t = s.totals;
    content = `
      ${t.pending_submissions ? `<a class="alert alert-info flex between" href="#/admin?tab=submissions" style="display:flex">✍️ <span class="grow"><strong>${t.pending_submissions} book submission${t.pending_submissions === 1 ? '' : 's'}</strong> waiting for your review.</span><span>Review now →</span></a>` : ''}
      <div class="stat-grid">
        <div class="stat"><span class="s-icon">\u{1F4B0}</span><div class="s-label">Revenue</div><div class="s-value">${money(t.revenue)}</div></div>
        <div class="stat"><span class="s-icon">\u{1F4E6}</span><div class="s-label">Orders</div><div class="s-value">${t.orders}</div><span class="small muted">${t.pending_orders} to fulfil</span></div>
        <div class="stat"><span class="s-icon">\u{1F465}</span><div class="s-label">Customers</div><div class="s-value">${t.users}</div></div>
        <div class="stat"><span class="s-icon">\u{1F4DA}</span><div class="s-label">Books</div><div class="s-value">${t.books}</div></div>
        <div class="stat"><span class="s-icon">⭐</span><div class="s-label">Reviews</div><div class="s-value">${t.reviews}</div></div>
        <div class="stat"><span class="s-icon">✉️</span><div class="s-label">Messages / subscribers</div><div class="s-value">${t.messages} / ${t.subscribers}</div></div>
      </div>
      <div class="cart-layout mt-3" style="grid-template-columns:1.4fr 1fr">
        <div><h3>Recent orders</h3><div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>
          ${s.recentOrders.map((o) => `<tr><td>${o.id}</td><td>${esc(o.customer)}</td><td>${fmtDate(o.created_at)}</td><td>${money(o.total)}</td><td><span class="status status-${esc(o.status)}">${esc(o.status)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted center">No orders yet</td></tr>'}
        </tbody></table></div></div>
        <div>
          <h3>Top sellers</h3><div class="table-wrap"><table class="data"><tbody>
            ${s.topBooks.map((b) => `<tr><td>${esc(b.title)}</td><td>${b.sold} sold</td></tr>`).join('') || '<tr><td class="muted center">No sales yet</td></tr>'}
          </tbody></table></div>
          <h3 class="mt-3">Low stock</h3><div class="table-wrap"><table class="data"><tbody>
            ${s.lowStock.map((b) => `<tr><td>${esc(b.title)}</td><td><span class="${b.stock ? 'stock-low' : 'stock-out'}">${b.stock} left</span></td></tr>`).join('') || '<tr><td class="muted center">All books well stocked</td></tr>'}
          </tbody></table></div>
        </div>
      </div>`;
  } else if (tab === 'books') {
    const q = ctx.params.get('q') || '';
    const page = Number(ctx.params.get('page')) || 1;
    const res = await api(`/books?sort=added&limit=25&page=${page}&q=${encodeURIComponent(q)}`);
    content = `
      <div class="toolbar">
        <form id="adminSearch" class="flex grow"><input class="input" name="q" value="${esc(q)}" placeholder="Search books..." style="max-width:360px"><button class="btn btn-outline">Search</button></form>
        <button class="btn btn-primary" id="addBook">+ Add new book</button>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>ID</th><th>Book</th><th>Genre</th><th>Price</th><th>Stock</th><th>Free</th><th></th></tr></thead><tbody>
        ${res.items.map((b) => `<tr><td>${b.id}</td><td><a href="#/book/${b.id}"><strong>${esc(b.title)}</strong></a><div class="muted small">${esc(b.author)} · ${fmtYear(b.year)}</div></td>
        <td>${esc(b.genre)}</td><td>${money(b.price)}</td><td><span class="${b.stock > 5 ? 'stock-ok' : b.stock ? 'stock-low' : 'stock-out'}">${b.stock}</span></td><td>${b.gutenberg_id ? '✓' : ''}</td>
        <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-edit="${b.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del="${b.id}">Delete</button></td></tr>`).join('')}
      </tbody></table></div>
      ${pagination(res.page, res.pages, (n) => `#/admin?tab=books&q=${encodeURIComponent(q)}&page=${n}`)}`;
    ctx.adminBooks = res.items;
  } else if (tab === 'orders') {
    const filter = ctx.params.get('status') || '';
    const orders = await api(`/admin/orders${filter ? `?status=${filter}` : ''}`);
    content = `
      <div class="chips" style="margin-bottom:16px">${['', ...ORDER_FLOW, 'Cancelled'].map((s) => `<a class="chip ${s === filter ? 'active' : ''}" href="#/admin?tab=orders${s ? `&status=${s}` : ''}">${s || 'All'}</a>`).join('')}</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead><tbody>
        ${orders.map((o) => `<tr><td>${o.id}</td><td><strong>${esc(o.customer)}</strong><div class="muted small">${esc(o.customer_email)}</div></td><td>${fmtDate(o.created_at)}</td><td>${o.item_count}</td><td>${money(o.total)}</td><td class="small">${esc(o.payment_method)}</td>
        <td><select data-status="${o.id}">${[...ORDER_FLOW, 'Cancelled'].map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><button class="btn btn-outline btn-sm" data-view-order="${o.id}">View</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted center">No orders found</td></tr>'}
      </tbody></table></div>`;
  } else if (tab === 'users') {
    const users = await api('/admin/users');
    content = `<div class="table-wrap"><table class="data"><thead><tr><th>Customer</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Security</th><th>Role</th></tr></thead><tbody>
      ${users.map((u) => `<tr><td><div class="flex" style="flex-wrap:nowrap"><span class="avatar">${esc(initials(u.name))}</span><div><strong>${esc(u.name)}</strong><div class="muted small">${esc(u.email)}</div></div></div></td>
      <td>${fmtDate(u.created_at)}</td><td>${u.orders}</td><td>${money(u.spent)}</td>
      <td style="white-space:nowrap">${u.totp_enabled ? '<span class="badge badge-free">2-STEP ON</span>' : '<span class="badge badge-soft">password only</span>'}
        ${u.locked_until > Date.now() ? ` <button class="btn btn-outline btn-sm" data-unlock="${u.id}">Unlock</button>` : ''}
        ${u.id !== state.user.id ? ` <button class="btn btn-ghost btn-sm" data-signout-user="${u.id}" title="Sign this user out on all devices">Sign out</button>` : ''}</td>
      <td>${u.id === state.user.id ? '<span class="badge badge-soft">admin (you)</span>' : `<select data-role="${u.id}"><option value="customer" ${u.role === 'customer' ? 'selected' : ''}>customer</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option></select>`}</td></tr>`).join('')}
    </tbody></table></div>`;
  } else {
    const msgs = await api('/admin/messages');
    content = msgs.length ? msgs.map((m) => `<div class="card" style="margin-bottom:12px">
      <div class="flex between"><div><strong>${esc(m.subject || '(no subject)')}</strong><div class="muted small">${esc(m.name)} &lt;${esc(m.email)}&gt; · ${fmtDate(m.created_at)}</div></div>
      <button class="btn btn-danger btn-sm" data-del-msg="${m.id}">Delete</button></div>
      <p class="mt-1" style="white-space:pre-wrap;margin-bottom:0">${esc(m.message)}</p></div>`).join('') : emptyHTML('✉️', 'No messages', 'Messages from the contact form will appear here.');
  }

  ctx.render(`<div class="page container">
    <div class="page-head flex between"><div><h1>Admin panel</h1><p class="muted">Manage your store, orders and customers.</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/admin?tab=${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div>    ${content}
  </div>`);
  if (!ctx.alive()) return;

  const as = $('#adminSearch');
  if (as) as.onsubmit = (e) => { e.preventDefault(); location.hash = `#/admin?tab=books&q=${encodeURIComponent(formData(as).q)}`; };
  const addBtn = $('#addBook');
  if (addBtn) addBtn.onclick = () => bookEditor(null);
  $$('[data-edit]').forEach((btn) => btn.onclick = () => bookEditor(ctx.adminBooks.find((b) => b.id === Number(btn.dataset.edit))));
  $$('[data-del]').forEach((btn) => btn.onclick = async () => {
    if (!confirm('Delete this book permanently? Past orders keep their record.')) return;
    try { await api(`/admin/books/${btn.dataset.del}`, { method: 'DELETE' }); toast('Book deleted.'); router(); } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-status]').forEach((sel) => sel.onchange = async () => {
    try { await api(`/admin/orders/${sel.dataset.status}`, { method: 'PUT', body: { status: sel.value } }); toast(`Order #${sel.dataset.status} marked ${sel.value}.`, 'success'); } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-view-order]').forEach((btn) => btn.onclick = async () => {
    const o = await api(`/admin/orders/${btn.dataset.viewOrder}`);
    modal(`Order #${o.id}`, `
      <p><span class="status status-${esc(o.status)}">${esc(o.status)}</span> · ${fmtDate(o.created_at)} · ${esc(o.payment_method)}</p>
      <p><strong>${esc(o.ship_name)}</strong> (${esc(o.ship_phone)})<br>${esc(o.ship_address)}, ${esc(o.ship_city)}, ${esc(o.ship_state)} - ${esc(o.ship_pincode)}<br><span class="muted">${esc(o.customer_email)}</span></p>
      <div class="order-items">${o.items.map((i) => `<div class="oi"><span>${esc(i.title)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <div class="oi"><span class="muted">Delivery</span><span>${money(o.shipping)}</span></div>
      <div class="oi"><strong>Total</strong><strong>${money(o.total)}</strong></div></div>`);
  });
  $$('[data-role]').forEach((sel) => sel.onchange = async () => {
    try { await api(`/admin/users/${sel.dataset.role}/role`, { method: 'PUT', body: { role: sel.value } }); toast('Role updated.', 'success'); } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-del-msg]').forEach((btn) => btn.onclick = async () => {
    await api(`/admin/messages/${btn.dataset.delMsg}`, { method: 'DELETE' });
    router();
  });
  $$('[data-review]').forEach((btn) => btn.onclick = () => reviewSubmission(Number(btn.dataset.review)));
  $$('[data-unlock]').forEach((btn) => btn.onclick = async () => {
    try { await api(`/admin/users/${btn.dataset.unlock}/unlock`, { method: 'POST' }); toast('Account unlocked.', 'success'); router(); } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-signout-user]').forEach((btn) => btn.onclick = async () => {
    if (!confirm('Sign this user out on all their devices?')) return;
    try { const r = await api(`/admin/users/${btn.dataset.signoutUser}/signout`, { method: 'POST' }); toast(`Signed out of ${r.count} session${r.count === 1 ? '' : 's'}.`, 'success'); } catch (e) { toast(e.message, 'error'); }
  });
}

// Admin: read a submitted book, then approve (publish) or send it back with a note
async function reviewSubmission(id) {
  let s;
  try { s = await api(`/submissions/${id}`); } catch (e) { toast(e.message, 'error'); return; }
  const { pages, chapters } = paginate(s.content);
  const st = SUB_STATUS[s.status];
  let shown = 3;
  const m = modal(`Review: ${s.title}`, `
    <div class="flex between"><span class="status ${st.cls}">${st.icon} ${st.label}</span><span class="muted small">Submitted ${fmtDate(s.created_at)}${s.reviewed_at ? ` · reviewed ${fmtDate(s.reviewed_at)}` : ''}</span></div>
    <table class="detail-table mt-2">
      <tr><th>Title</th><td>${esc(s.title)}</td></tr>
      <tr><th>Author name</th><td>${esc(s.author_name)}</td></tr>
      <tr><th>Genre / language</th><td>${esc(s.genre)} · ${esc(s.language)}</td></tr>
      <tr><th>Length</th><td>${s.word_count.toLocaleString('en-IN')} words · ${pages.length} pages · ${chapters.length} chapters</td></tr>
    </table>
    <h4 class="mt-2">Description</h4><p style="white-space:pre-line">${esc(s.description)}</p>
    <h4>Manuscript</h4>
    <div class="preview-page reader-page" id="revText">${pages.slice(0, shown).join('<hr>')}</div>
    ${pages.length > shown ? '<button class="btn btn-ghost btn-sm btn-block" id="moreText">Show more pages</button>' : ''}
    ${s.admin_note ? `<div class="editor-note mt-2"><strong>Previous note:</strong> ${esc(s.admin_note)}</div>` : ''}
    ${s.status !== 'approved' ? `<form id="reviewForm2" class="mt-3">
      <div class="field"><label for="rv-note">Note to the writer</label><textarea id="rv-note" name="note" maxlength="1000" placeholder="Required when sending back. Optional when approving." style="min-height:80px"></textarea></div>
      <label class="checkbox mt-1"><input type="checkbox" name="featured"> Feature on the home page after publishing</label>
      <div class="flex mt-2"><button class="btn btn-success" type="button" id="approveBtn">✅ Approve &amp; publish</button>
      <button class="btn btn-danger" type="button" id="rejectBtn">✏️ Send back for changes</button></div>
    </form>` : `<a class="btn btn-success mt-2" href="#/read/${s.book_id}" data-close>Open in Reader Zone</a>`}`);
  const more = $('#moreText', m.el);
  if (more) more.onclick = () => {
    shown += 5;
    $('#revText', m.el).innerHTML = pages.slice(0, shown).join('<hr>');
    if (shown >= pages.length) more.remove();
  };
  const f = $('#reviewForm2', m.el);
  if (!f) return;
  $('#approveBtn', m.el).onclick = async (e) => {
    const d = formData(f);
    setBusy(e.currentTarget, true, 'Publishing...');
    try {
      const r = await api(`/admin/submissions/${s.id}/approve`, { method: 'POST', body: { note: d.note, featured: !!d.featured } });
      m.close();
      toast(`“${s.title}” is now published.`, 'success', { href: `#/book/${r.book_id}`, text: 'View' });
      router();
    } catch (err) { setBusy(e.currentTarget, false); showError(f, err.message); }
  };
  $('#rejectBtn', m.el).onclick = async (e) => {
    const d = formData(f);
    if (!d.note.trim()) { showError(f, 'Please tell the writer what to change.'); $('#rv-note', m.el).focus(); return; }
    setBusy(e.currentTarget, true, 'Sending...');
    try {
      await api(`/admin/submissions/${s.id}/reject`, { method: 'POST', body: { note: d.note } });
      m.close();
      toast('Sent back to the writer with your note.');
      router();
    } catch (err) { setBusy(e.currentTarget, false); showError(f, err.message); }
  };
}

function bookEditor(book) {
  const b = book || { title: '', author: '', genre: '', year: '', price: '', stock: 20, gutenberg_id: '', language: 'English', description: '', featured: 0, format: 'Paperback', level: '', subject: '' };
  const m = modal(book ? 'Edit book' : 'Add a new book', `
    <form id="bookForm" class="form-grid" novalidate>
      <div class="field full"><label>Title</label><input name="title" value="${esc(b.title)}" required></div>
      <div class="field"><label>Author</label><input name="author" value="${esc(b.author)}" required></div>
      <div class="field"><label>Genre</label><input name="genre" value="${esc(b.genre)}" list="genreList" required>
        <datalist id="genreList">${state.genres.map((g) => `<option value="${esc(g.genre)}">`).join('')}</datalist></div>
      <div class="field"><label>Price (₹)</label><input name="price" type="number" min="0" step="1" value="${esc(b.price)}" required></div>
      <div class="field"><label>Stock</label><input name="stock" type="number" min="0" value="${esc(b.stock)}" required></div>
      <div class="field"><label>Year first published</label><input name="year" type="number" value="${esc(b.year ?? '')}"><span class="hint">Use a negative number for BC.</span></div>
      <div class="field"><label>Language</label><input name="language" value="${esc(b.language)}"></div>
      <div class="field"><label>Format</label><select name="format">${['Paperback', 'Hardcover', 'Comic', 'Manga', 'Magazine'].map((f) => `<option ${b.format === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="field"><label>Academic level</label><select name="level"><option value="">Not a textbook</option>${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${b.level === k ? 'selected' : ''}>${l.label}</option>`).join('')}</select></div>
      <div class="field full"><label>Subject / branch (optional)</label><input name="subject" value="${esc(b.subject || '')}" placeholder="e.g. Computer Science, Mechanical, UPSC"></div>
      <div class="field full"><label>Project Gutenberg ID (optional)</label><input name="gutenberg_id" type="number" min="1" value="${esc(b.gutenberg_id ?? '')}"><span class="hint">Set this for public-domain books so they can be read free in the Reader Zone.</span></div>
      <div class="field full"><label>Description</label><textarea name="description">${esc(b.description)}</textarea></div>
      <label class="checkbox full"><input type="checkbox" name="featured" ${b.featured ? 'checked' : ''}> Feature on the home page</label>
      <div class="full flex"><button class="btn btn-primary" type="submit">${book ? 'Save changes' : 'Add book'}</button><button type="button" class="btn btn-ghost" data-close>Cancel</button></div>
    </form>`);
  const form = $('#bookForm', m.el);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form);
    d.featured = !!d.featured;
    try {
      await api(book ? `/admin/books/${book.id}` : '/admin/books', { method: book ? 'PUT' : 'POST', body: d });
      m.close();
      toast(book ? 'Book updated.' : 'Book added.', 'success');
      router();
    } catch (err) { showError(form, err.message); }
  };
}

/* =========================================================================
   Page: Reader Zone (free library)
   ========================================================================= */
async function pageReaderZone(ctx) {
  setTitle('Reader Zone - read free classics');
  const q = ctx.params.get('q') || '';
  const genre = ctx.params.get('genre') || '';
  const [genres, community, books] = await Promise.all([
    api('/genres'),
    api('/books?community=1&sort=added&limit=12'),
    api(`/books?free=1&limit=100&sort=featured${q ? `&q=${encodeURIComponent(q)}` : ''}${genre ? `&genre=${encodeURIComponent(genre)}` : ''}`),
  ]);
  let progress = [];
  if (state.user) progress = await api('/progress').catch(() => []);
  else progress = Object.values(store.get('localProgress', {})).sort((a, b) => b.t - a.t);

  const rzHref = (ch) => {
    const p = new URLSearchParams(ctx.params);
    for (const [k, v] of Object.entries(ch)) { if (v) p.set(k, v); else p.delete(k); }
    return `#/reader${p.toString() ? '?' + p : ''}`;
  };

  ctx.render(`
    <section class="rz-hero"><div class="container">
      <span class="badge badge-hot">READER ZONE · 100% FREE</span>
      <h1 class="mt-1">Read timeless classics, free, right in your browser.</h1>
      <p>${books.total && !q && !genre ? books.total : '99'} public-domain books with a comfortable reader: adjustable text, day, sepia and night themes, chapters, bookmarks and synced progress.</p>
      <form class="rz-search" id="rzSearch"><input name="q" value="${esc(q)}" placeholder="Search free books by title or author..." aria-label="Search free books"><button class="btn btn-success">Search</button></form>
    </div></section>

    ${progress.length ? section('Continue reading', state.user ? 'Synced to your account.' : '<a href="#/login?next=/reader">Log in</a> to sync your progress across devices.', state.user ? '#/account?tab=library' : '', `<div class="continue-row">${progress.slice(0, 3).map(progressCard).join('')}</div>`) : ''}

    <section class="section"><div class="container">
      <div class="section-head"><div><h2>${q ? `Results for “${esc(q)}”` : genre ? esc(genre) : 'The free library'}</h2><p>${books.total} book${books.total === 1 ? '' : 's'} free to read</p></div></div>
      <div class="chips" style="margin-bottom:24px">
        <a class="chip ${!genre ? 'active' : ''}" href="${rzHref({ genre: '' })}">All</a>
        ${genres.filter((g) => g.free_count).map((g) => `<a class="chip ${genre === g.genre ? 'active' : ''}" href="${rzHref({ genre: g.genre })}">${genreIcon(g.genre)} ${esc(g.genre)} <span class="muted">${g.free_count}</span></a>`).join('')}
      </div>
      ${books.items.length ? bookGrid(books.items) : emptyHTML('\u{1F50E}', 'No free books found', 'Try another search.', `<a class="btn btn-success mt-2" href="#/reader">Show all free books</a>`)}
    </div></section>

    ${community.items.length && !q && !genre ? section('From our community writers', 'Original books by our readers, reviewed by our editors.', '#/shop?community=1', bookRow(community.items)) : ''}
    ${writerCTA()}

    <section class="section"><div class="container">
      <div class="section-head"><h2>How the Reader Zone works</h2></div>
      <div class="how-grid">
        <div class="card"><div class="h-icon">\u{1F4DA}</div><h3>Pick a classic</h3><p class="muted small">Every book here is in the public domain, so it is free for everyone.</p></div>
        <div class="card"><div class="h-icon">\u{1F3A8}</div><h3>Make it yours</h3><p class="muted small">Change font, size, spacing and switch between day, sepia and night modes.</p></div>
        <div class="card"><div class="h-icon">\u{1F516}</div><h3>Bookmark pages</h3><p class="muted small">Save pages with notes and jump straight back to them later.</p></div>
        <div class="card"><div class="h-icon">\u{1F504}</div><h3>Sync progress</h3><p class="muted small">Log in and your place is saved to your account on every device.</p></div>
      </div>
    </div></section>
  `);
  if (!ctx.alive()) return;
  $('#rzSearch').onsubmit = (e) => { e.preventDefault(); location.hash = rzHref({ q: formData(e.target).q.trim() }); };
}

/* =========================================================================
   Page: Reader (read a book)
   ========================================================================= */
const textCache = new Map();
const CHAPTER_RE = /^(chapter|book|part|act|scene|stave|canto|letter|volume|section|prologue|epilogue|preface|introduction|story)\b/i;

function paginate(text, perPage = 2600) {
  const paras = text.replace(/\[Illustration[^\]]*\]/gi, '').split(/\n\s*\n/).map((p) => p.replace(/^\s*\n|\s+$/g, '')).filter((p) => p.trim());
  const pages = [];
  let chapters = [];
  let cur = [];
  let len = 0;
  let afterHeading = true;
  const flush = () => { if (cur.length) { pages.push(cur.join('')); cur = []; len = 0; } };
  for (const raw of paras) {
    const trimmed = raw.trim();
    const lines = raw.split('\n');
    let html;
    if (trimmed.length < 80 && lines.length <= 3 && CHAPTER_RE.test(trimmed)) {
      if (len > 700) flush();
      const title = lines.map((l) => l.trim()).filter(Boolean).join(' — ');
      chapters.push({ title, page: pages.length });
      html = `<h2 class="chap">${esc(title)}</h2>`;
      afterHeading = true;
    } else {
      const avg = raw.length / lines.length;
      const verse = lines.length > 2 && avg < 58;
      const body = verse ? esc(lines.map((l) => l.trim()).join('\n')) : esc(trimmed.replace(/\s*\n\s*/g, ' '));
      const cls = verse ? 'verse' : afterHeading && trimmed.length > 200 ? 'first-letter' : '';
      html = `<p${cls ? ` class="${cls}"` : ''}>${body.replace(/_([^_]{1,2000}?)_/g, '<em>$1</em>')}</p>`;
      afterHeading = false;
    }
    cur.push(html);
    len += raw.length;
    if (len >= perPage) flush();
  }
  flush();
  // Drop table-of-contents clusters: keep only the last heading found on any page.
  chapters = chapters.filter((c, i) => !chapters[i + 1] || chapters[i + 1].page !== c.page);
  return { pages: pages.length ? pages : ['<p>This book appears to be empty.</p>'], chapters };
}

const READER_DEFAULTS = { theme: 'light', size: 19, font: 'serif', width: 720, line: 1.8 };
const FONTS = { serif: "'Merriweather', Georgia, serif", classic: "Georgia, 'Times New Roman', serif", sans: "'Inter', system-ui, sans-serif" };

async function pageRead(ctx) {
  const id = Number(ctx.args[0]);
  const { book } = await api(`/books/${id}`);
  setTitle(`Reading: ${book.title}`);
  if (!isReadable(book)) {
    document.body.classList.remove('reader-mode');
    ctx.render(`<div class="page container">${emptyHTML('\u{1F512}', 'Not available to read online', `"${book.title}" is still under copyright, so it cannot be read for free. You can buy a paperback copy instead.`, `<a class="btn btn-primary mt-2" href="#/book/${id}">View in store</a> <a class="btn btn-outline mt-2" href="#/reader">Browse free books</a>`)}</div>`);
    return;
  }

  let settings = { ...READER_DEFAULTS, ...store.get('readerSettings', {}) };
  ctx.render(`<div class="reader theme-${settings.theme}" id="reader">
    <div class="reader-bar">
      <a class="r-btn" href="#/book/${id}" title="Back to book">← <span class="r-label">Back</span></a>
      <button class="r-btn" id="tocBtn" title="Contents">☰ <span class="r-label">Contents</span></button>
      <div class="rb-title"><strong>${esc(book.title)}</strong><span>${esc(book.author)}</span></div>
      <button class="r-btn" id="bmBtn" title="Bookmark this page">\u{1F516}</button>
      <button class="r-btn" id="bmListBtn" title="Bookmarks">\u{1F4D1} <span class="r-label">Bookmarks</span></button>
      <button class="r-btn" id="setBtn" title="Reading settings">Aa</button>
      <button class="r-btn" id="fsBtn" title="Full screen">⛶</button>
    </div>
    <div class="reader-progress-top"><span id="topProg"></span></div>
    <div class="reader-loading" id="rLoading"><div><div class="spinner"></div><p class="mt-2">Opening <strong>${esc(book.title)}</strong>...</p>${book.gutenberg_id ? '<p class="small" style="color:var(--r-muted)">The first time a book is opened it is downloaded from Project Gutenberg. This can take a few seconds.</p>' : ''}</div></div>
    <div class="reader-body" id="rBody" hidden><article class="reader-page" id="rPage" tabindex="-1"></article></div>
    <div class="reader-foot" id="rFoot" hidden>
      <button class="r-btn" id="prevBtn">‹ <span class="r-label">Previous</span></button>
      <input type="range" id="pgRange" min="1" value="1" aria-label="Go to page">
      <span class="pg" id="pgLabel"></span>
      <button class="r-btn" id="nextBtn"><span class="r-label">Next</span> ›</button>
    </div>
  </div>`);

  const reader = $('#reader');
  const applySettings = () => {
    reader.className = `reader theme-${settings.theme}`;
    reader.style.setProperty('--r-size', settings.size + 'px');
    reader.style.setProperty('--r-font', FONTS[settings.font]);
    reader.style.setProperty('--r-width', settings.width + 'px');
    reader.style.setProperty('--r-line', settings.line);
    store.set('readerSettings', settings);
  };
  applySettings();

  let text = textCache.get(id);
  if (!text) {
    const res = await fetch(`/api/books/${id}/text`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (!ctx.alive()) return;
      $('#rLoading').innerHTML = `<div><p style="font-size:40px">\u{1F4E1}</p><h3>Could not open this book</h3><p style="color:var(--r-muted)">${esc(err.error || 'Please try again.')}</p><button class="r-btn mt-2" id="retryRead">Try again</button></div>`;
      $('#retryRead').onclick = () => router();
      return;
    }
    text = await res.text();
    textCache.set(id, text);
  }
  if (!ctx.alive()) return;
  const { pages, chapters } = paginate(text);
  const total = pages.length;

  // Restore position: ?page= param, then account progress, then this browser
  let page = 0;
  const local = store.get('localProgress', {})[id];
  if (ctx.params.has('page')) page = Number(ctx.params.get('page')) || 0;
  else if (state.user) { const p = await api(`/progress/${id}`).catch(() => null); page = p?.page || 0; }
  else if (local) page = local.page;
  page = Math.max(0, Math.min(total - 1, page));

  let bookmarks = state.user ? await api(`/bookmarks?book_id=${id}`).catch(() => []) : store.get(`bookmarks:${id}`, []);
  if (!ctx.alive()) return;

  $('#rLoading').hidden = true;
  $('#rBody').hidden = false;
  $('#rFoot').hidden = false;
  const range = $('#pgRange');
  range.max = total;

  const saveProgress = debounce(() => {
    const all = store.get('localProgress', {});
    all[id] = { book_id: id, page, total_pages: total, title: book.title, author: book.author, genre: book.genre, t: Date.now() };
    store.set('localProgress', all);
    if (state.user) api(`/progress/${id}`, { method: 'PUT', body: { page, total_pages: total } }).catch(() => {});
  }, 700);

  const currentChapter = () => [...chapters].reverse().find((c) => c.page <= page);
  const show = (n, focus = true) => {
    page = Math.max(0, Math.min(total - 1, n));
    $('#rPage').innerHTML = pages[page];
    range.value = page + 1;
    const pct = Math.round(((page + 1) / total) * 100);
    const ch = currentChapter();
    $('#pgLabel').textContent = `Page ${page + 1} of ${total} · ${pct}%`;
    $('#topProg').style.width = pct + '%';
    $('.rb-title span', reader).textContent = ch ? `${book.author} · ${ch.title}` : book.author;
    $('#prevBtn').disabled = page === 0;
    $('#nextBtn').disabled = page === total - 1;
    $('#bmBtn').classList.toggle('on', bookmarks.some((b) => b.page === page));
    window.scrollTo(0, 0);
    if (focus) $('#rPage').focus({ preventScroll: true });
    saveProgress();
  };
  show(page, false);

  $('#prevBtn').onclick = () => show(page - 1);
  $('#nextBtn').onclick = () => show(page + 1);
  range.oninput = () => { $('#pgLabel').textContent = `Page ${range.value} of ${total}`; };
  range.onchange = () => show(Number(range.value) - 1);

  // Side panels: contents, bookmarks, settings
  let panel = null;
  const closePanel = () => { if (panel) { panel.remove(); panel = null; } };
  const openPanel = (title, html, bind) => {
    closePanel();
    panel = document.createElement('aside');
    panel.className = 'reader-panel';
    panel.innerHTML = `<div class="rp-head"><h3>${title}</h3><button class="r-btn" data-close-panel aria-label="Close">✕</button></div><div class="rp-body">${html}</div>`;
    reader.appendChild(panel);
    $('[data-close-panel]', panel).onclick = closePanel;
    if (bind) bind(panel);
  };

  $('#tocBtn').onclick = () => {
    const ch = currentChapter();
    openPanel('Contents', chapters.length
      ? chapters.map((c, i) => `<a data-go="${c.page}" class="${c === ch ? 'cur' : ''}"><span>${esc(c.title)}</span><span class="pgn">p. ${c.page + 1}</span></a>`).join('')
      : `<p style="padding:10px;color:var(--r-muted)">This book has no chapter markers. Use the slider at the bottom to jump to any page.</p>`,
    (p) => $$('[data-go]', p).forEach((a) => a.onclick = () => { closePanel(); show(Number(a.dataset.go)); }));
    const curEl = panel && $('.cur', panel);
    if (curEl) curEl.scrollIntoView({ block: 'center' });
  };

  const renderBookmarks = () => openPanel('Bookmarks', bookmarks.length
    ? bookmarks.slice().sort((a, b) => a.page - b.page).map((b) => `<div class="bm" data-go="${b.page}"><span><strong>Page ${b.page + 1}</strong>${b.note ? `<br><span class="small" style="color:var(--r-muted)">${esc(b.note)}</span>` : ''}</span><button class="r-btn" data-del-bm="${b.id}" title="Delete" style="height:30px;min-width:30px;padding:0 8px">✕</button></div>`).join('')
    : '<p style="padding:10px;color:var(--r-muted)">No bookmarks yet. Tap \u{1F516} at the top to bookmark the page you are on.</p>',
  (p) => {
    $$('[data-go]', p).forEach((el) => el.onclick = (e) => { if (e.target.closest('[data-del-bm]')) return; closePanel(); show(Number(el.dataset.go)); });
    $$('[data-del-bm]', p).forEach((btn) => btn.onclick = async () => {
      const bmId = btn.dataset.delBm;
      if (state.user) await api(`/bookmarks/${bmId}`, { method: 'DELETE' }).catch(() => {});
      bookmarks = bookmarks.filter((b) => String(b.id) !== bmId);
      if (!state.user) store.set(`bookmarks:${id}`, bookmarks);
      show(page, false);
      renderBookmarks();
    });
  });
  $('#bmListBtn').onclick = renderBookmarks;

  $('#bmBtn').onclick = async () => {
    const existing = bookmarks.find((b) => b.page === page);
    if (existing) {
      if (state.user) await api(`/bookmarks/${existing.id}`, { method: 'DELETE' }).catch(() => {});
      bookmarks = bookmarks.filter((b) => b !== existing);
      toast('Bookmark removed.');
    } else {
      const note = (prompt('Add a note to this bookmark (optional):', '') || '').slice(0, 300);
      try {
        const bm = state.user ? await api('/bookmarks', { method: 'POST', body: { book_id: id, page, note } }) : { id: Date.now(), page, note };
        bookmarks.push(bm);
        toast(`Page ${page + 1} bookmarked.`, 'success');
      } catch (e) { toast(e.message, 'error'); }
    }
    if (!state.user) store.set(`bookmarks:${id}`, bookmarks);
    show(page, false);
  };

  $('#setBtn').onclick = () => openPanel('Reading settings', `
    <div class="settings-group"><h4>Theme</h4><div class="swatches">
      ${[['light', '#fbfaf7', '#23262b'], ['sepia', '#f4ecd8', '#4b3b2a'], ['dark', '#16181d', '#d6d3cd'], ['night', '#000', '#b9b4a8']].map(([t, bg, fg]) => `<button class="swatch ${settings.theme === t ? 'on' : ''}" data-theme="${t}" style="background:${bg};color:${fg}" title="${t}">Aa</button>`).join('')}
    </div></div>
    <div class="settings-group"><h4>Text size</h4><div class="seg"><button class="r-btn" data-size="-1">A−</button><span class="r-btn" style="border:0" id="sizeVal">${settings.size}px</span><button class="r-btn" data-size="1">A+</button></div></div>
    <div class="settings-group"><h4>Font</h4><div class="seg">${[['serif', 'Merriweather'], ['classic', 'Georgia'], ['sans', 'Sans-serif']].map(([k, l]) => `<button class="r-btn ${settings.font === k ? 'on' : ''}" data-font="${k}" style="font-family:${FONTS[k]}">${l}</button>`).join('')}</div></div>
    <div class="settings-group"><h4>Line spacing</h4><div class="seg">${[[1.5, 'Compact'], [1.8, 'Normal'], [2.1, 'Relaxed']].map(([v, l]) => `<button class="r-btn ${settings.line === v ? 'on' : ''}" data-line="${v}">${l}</button>`).join('')}</div></div>
    <div class="settings-group"><h4>Page width</h4><div class="seg">${[[600, 'Narrow'], [720, 'Medium'], [900, 'Wide']].map(([v, l]) => `<button class="r-btn ${settings.width === v ? 'on' : ''}" data-width="${v}">${l}</button>`).join('')}</div></div>
    <div class="settings-group" style="border:0"><button class="r-btn" data-reset>Reset to defaults</button>
    <p class="small" style="color:var(--r-muted);margin-top:14px">Keyboard: ← / → to turn pages. On phones, swipe left or right.</p></div>`,
  (p) => {
    const rerender = () => { applySettings(); $('#setBtn').click(); };
    $$('[data-theme]', p).forEach((b) => b.onclick = () => { settings.theme = b.dataset.theme; rerender(); });
    $$('[data-size]', p).forEach((b) => b.onclick = () => { settings.size = Math.max(14, Math.min(30, settings.size + Number(b.dataset.size))); rerender(); });
    $$('[data-font]', p).forEach((b) => b.onclick = () => { settings.font = b.dataset.font; rerender(); });
    $$('[data-line]', p).forEach((b) => b.onclick = () => { settings.line = Number(b.dataset.line); rerender(); });
    $$('[data-width]', p).forEach((b) => b.onclick = () => { settings.width = Number(b.dataset.width); rerender(); });
    $('[data-reset]', p).onclick = () => { settings = { ...READER_DEFAULTS }; rerender(); };
  });

  $('#fsBtn').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else reader.requestFullscreen?.().catch(() => {});
  };

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); show(page + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(page - 1); }
    else if (e.key === 'Escape') closePanel();
  };
  let touchX = null;
  let touchY = null;
  const onTouchStart = (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; };
  const onTouchEnd = (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) show(page + (dx < 0 ? 1 : -1));
    touchX = null;
  };
  document.addEventListener('keydown', onKey);
  $('#rBody').addEventListener('touchstart', onTouchStart, { passive: true });
  $('#rBody').addEventListener('touchend', onTouchEnd);
  cleanup = () => {
    document.removeEventListener('keydown', onKey);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}

/* =========================================================================
   Pages: About & Contact
   ========================================================================= */
async function pageAbout(ctx) {
  setTitle('About us');
  const stats = await api('/stats');
  const { items } = await api('/books?featured=1&limit=4');
  ctx.render(`<div class="page container">
    <div class="about-grid">
      <div>
        <span class="badge badge-soft">OUR STORY</span>
        <h1 class="mt-1" style="font-size:42px">A bookshop for every kind of reader.</h1>
        <p style="font-size:17px">Online Bookstore &amp; Reader Zone started with a simple belief: everyone deserves access to great books. We sell carefully chosen new books at fair prices and deliver them across India.</p>
        <p style="font-size:17px">And because the world's greatest classics belong to everyone, our <a href="#/reader">Reader Zone</a> lets you read ${stats.free_books} public-domain books completely free, with a reader designed for long, comfortable sessions.</p>
        <div class="hero-stats" style="color:var(--text)">
          <div><strong style="color:var(--primary)">${stats.books}+</strong><span class="muted">Books</span></div>
          <div><strong style="color:var(--primary)">${stats.authors}</strong><span class="muted">Authors</span></div>
          <div><strong style="color:var(--primary)">${stats.free_books}</strong><span class="muted">Free classics</span></div>
        </div>
      </div>
      <div class="book-grid" style="grid-template-columns:repeat(2,1fr)">${items.map((b) => `<a href="#/book/${b.id}">${cover(b)}</a>`).join('')}</div>
    </div>
    <section class="section">
      <div class="section-head"><h2>What we believe in</h2></div>
      <div class="values">
        <div class="card"><h3>\u{1F4DA} Curated, not cluttered</h3><p class="muted">Every title is chosen by readers, for readers. Quality over endless lists.</p></div>
        <div class="card"><h3>\u{1F30F} Reading for all</h3><p class="muted">Free classics online, honest prices and cash on delivery across India.</p></div>
        <div class="card"><h3>\u{1F91D} Real support</h3><p class="muted">Questions about an order? Our team replies within one working day.</p></div>
      </div>
    </section>
  </div>`);
}

async function pageContact(ctx) {
  setTitle('Contact us');
  const u = state.user;
  ctx.render(`<div class="page container">
    <div class="page-head"><h1>Help &amp; contact</h1><p class="muted">We usually reply within one working day.</p></div>
    <div class="contact-grid">
      <div class="contact-info">
        <div class="ci"><div class="ci-icon">✉️</div><div><strong>Email</strong><br><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></div></div>
        <div class="ci"><div class="ci-icon">\u{1F552}</div><div><strong>Support hours</strong><br><span class="muted">Monday to Saturday, 9 am - 7 pm IST</span></div></div>
        <div class="ci"><div class="ci-icon">\u{1F4E6}</div><div><strong>Order help</strong><br><span class="muted">Track or cancel orders from <a href="#/orders">My orders</a>.</span></div></div>
        <h3 class="mt-3">Frequently asked questions</h3>
        <div class="faq">
          <details><summary>Are the Reader Zone books really free?</summary><p>Yes. They are public-domain classics, free for everyone. You do not even need an account, but logging in syncs your progress and bookmarks.</p></details>
          <details><summary>How long does delivery take?</summary><p>Most orders arrive within 3-7 working days. Delivery is free on orders above ${money(FREE_SHIP)}.</p></details>
          <details><summary>Can I cancel my order?</summary><p>You can cancel any order that has not shipped yet from the My orders page.</p></details>
          <details><summary>Which payment methods do you accept?</summary><p>Cash on delivery, UPI and credit or debit cards.</p></details>
        </div>
      </div>
      <div class="card">
        <h3>Send us a message</h3>
        <form id="contactForm" class="form-grid mt-2" novalidate>
          <div class="field"><label for="m-name">Name</label><input id="m-name" name="name" required value="${esc(u?.name || '')}"></div>
          <div class="field"><label for="m-email">Email</label><input id="m-email" name="email" type="email" required value="${esc(u?.email || '')}"></div>
          <div class="field full"><label for="m-subject">Subject</label><input id="m-subject" name="subject" placeholder="Order, delivery, book request..."></div>
          <div class="field full"><label for="m-msg">Message</label><textarea id="m-msg" name="message" required style="min-height:160px"></textarea></div>
          <div class="full"><button class="btn btn-primary btn-lg" type="submit">Send message</button></div>
        </form>
      </div>
    </div>
  </div>`);
  if (!ctx.alive()) return;
  const form = $('#contactForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    setBusy(btn, true, 'Sending...');
    try {
      await api('/contact', { method: 'POST', body: formData(form) });
      form.innerHTML = '<div class="full alert alert-success">Thanks! Your message has been sent. We will get back to you soon.</div>';
    } catch (err) { setBusy(btn, false); showError(form, err.message); }
  };
}

/* =========================================================================
   Global behaviour: header search, menus, delegated clicks
   ========================================================================= */
function initHeader() {
  const form = $('#headerSearch');
  const input = $('input', form);
  const box = $('#searchSuggest');
  let active = -1;

  form.onsubmit = (e) => {
    e.preventDefault();
    const sel = $$('a', box)[active];
    if (!box.hidden && sel) { location.hash = sel.getAttribute('href'); box.hidden = true; return; }
    const q = input.value.trim();
    box.hidden = true;
    location.hash = q ? `#/shop?q=${encodeURIComponent(q)}` : '#/shop';
  };
  const suggest = debounce(async () => {
    const q = input.value.trim();
    active = -1;
    if (q.length < 2) { box.hidden = true; return; }
    try {
      const { items, total } = await api(`/books?q=${encodeURIComponent(q)}&limit=6&sort=popular`);
      if (input.value.trim() !== q) return;
      box.innerHTML = items.length
        ? items.map((b) => `<a href="#/book/${b.id}">${miniCover(b)}<span><span class="s-title">${esc(b.title)}</span><br><span class="s-meta">${esc(b.author)} · ${money(b.price)}${b.gutenberg_id ? ' · Free to read' : ''}</span></span></a>`).join('') + `<a class="s-all" href="#/shop?q=${encodeURIComponent(q)}">See all ${total} results →</a>`
        : `<div style="padding:14px" class="muted small">No books match “${esc(q)}”.</div>`;
      box.hidden = false;
    } catch { box.hidden = true; }
  }, 200);
  input.addEventListener('input', suggest);
  input.addEventListener('keydown', (e) => {
    const links = $$('a', box);
    if (box.hidden || !links.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((a, i) => a.classList.toggle('active', i === active));
    } else if (e.key === 'Escape') { box.hidden = true; }
  });
  box.addEventListener('click', () => { box.hidden = true; input.value = ''; });

  $('#menuToggle').onclick = () => {
    const nav = $('#mainNav');
    nav.classList.toggle('open');
    $('#menuToggle').setAttribute('aria-expanded', String(nav.classList.contains('open')));
  };

  $('#newsletterForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/newsletter', { method: 'POST', body: formData(e.target) });
      e.target.reset();
      toast('Subscribed! Watch your inbox for book picks.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#year').textContent = new Date().getFullYear();

  // Dark / light mode
  const themeBtn = $('#themeToggle');
  const syncThemeLabel = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  syncThemeLabel();
  themeBtn.onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('siteTheme', next); } catch { /* ignore */ }
    syncThemeLabel();
  };

  // Back to top
  const toTop = $('#toTop');
  window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 700; }, { passive: true });
  toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // Press "/" anywhere to jump to search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest?.('input, textarea, select, [contenteditable]') && !document.body.classList.contains('reader-mode')) {
      e.preventDefault();
      input.focus();
    }
  });
}

document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { e.preventDefault(); addToCart(Number(add.dataset.add), 1, add); return; }
  const wish = e.target.closest('[data-wish]');
  if (wish) { e.preventDefault(); toggleWish(Number(wish.dataset.wish)); return; }
  const pw = e.target.closest('[data-pw]');
  if (pw) {
    const input = document.getElementById(pw.dataset.pw);
    input.type = input.type === 'password' ? 'text' : 'password';
    pw.textContent = input.type === 'password' ? 'Show' : 'Hide';
    return;
  }
  if (!e.target.closest('.user-area')) { const m = $('#userMenu'); if (m) m.hidden = true; }
  if (!e.target.closest('.header-search')) $('#searchSuggest').hidden = true;
});

window.addEventListener('hashchange', router);

(async function start() {
  initHeader();
  renderUserArea();
  await loadSession();
  router();
})();
