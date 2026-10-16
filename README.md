# Online Bookstore & Reader Platform

A full-stack online bookstore with a free online reader for public-domain classics, community publishing,
textbooks from UG to PhD, comics, manga and magazines.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/digvijay165/online-bookstore-and-reader-platform)

- **Frontend:** HTML5, CSS3, vanilla JavaScript (single-page app, no build step)
- **Backend:** Node.js + Express
- **Database:** SQLite (Node's built-in `node:sqlite`, so no database server to install)

## Run it

Requires **Node.js 22.13 or newer** (tested with Node 24).

```bash
npm install
npm start
```

Then open http://127.0.0.1:3000. On Windows you can also double-click `start.bat`.
Copy `.env.example` to `.env` first and set your admin email and password.

## Deploy to Render

1. Click the **Deploy to Render** button above (or in Render choose **New → Blueprint** and pick this repository).
2. Enter a strong `ADMIN_PASSWORD` when Render asks. It is stored by Render, never in the repository.
3. Click **Apply**. After a few minutes the site is live at `https://online-bookstore-and-reader-platform.onrender.com`
   (or a similar address Render shows you).

`render.yaml` uses Render's **free plan**: the site sleeps after 15 minutes without visitors (the first visit
then takes about a minute) and the SQLite database is reset when the service restarts or redeploys. To keep users
and orders permanently, upgrade to a paid instance, add a disk (for example mounted at `/var/data`), set the
environment variable `DATA_DIR=/var/data`, and redeploy.

## Admin login

The first admin account is created from the private `.env` file (`ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`;
see `.env.example`) the first time the server starts with no admin. After that, change the password on the website in
**My account → Security**. Keep `.env` secret: it is listed in `.gitignore`. If `ADMIN_PASSWORD` is empty, a random
password is generated and printed once in the server console.

Open **Admin Panel** from the menu after logging in. **Turn on two-step verification for every admin account.**

Set `HTTPS_ONLY=1` in `.env` when the site runs behind HTTPS so cookies are marked Secure and HSTS is sent.

## Features

**Store**
- 371 titles across 30 categories: classics and fiction, **engineering** (CS, mechanical, electrical, electronics, civil, chemical),
  **medical**, science & maths, commerce & MBA, humanities, **PhD & research methods**, **competitive exams** (UPSC, JEE/NEET, CAT, SSC),
  **comics & graphic novels**, **manga**, **magazines**, Hindi literature, religion and cooking
- Filters by type (books / comics & manga / magazines), academic level (UG / PG / PhD / Competitive), genre, subject or branch,
  language, price and availability, with search suggestions, sorting and pagination
- Academic & Exams hub page with level and discipline shortcuts
- Book pages with details, star ratings and reviews, related books, wishlist
- Cart (works without an account and merges into your account when you log in), free delivery over ₹499
- Checkout with delivery address and Cash on Delivery / UPI / Card (online payments are **simulated**)
- Order history with a delivery tracker and cancellation (stock is returned on cancel)
- Coupon codes at checkout (`WELCOME10`, `STUDENT15`, `READ50`, `FREESHIP`), defined in `src/config.js`
- Dark mode, a bottom tab bar on phones, recently viewed books, share buttons, and the `/` key to jump to search

**Write & Publish (community books)**
- Any member can submit their own book: paste text or upload a `.txt` file, with live word count, preview and an auto-saved draft
- Admins review submissions in **Admin Panel → Book submissions**: read the manuscript, then approve (optionally featuring it)
  or send it back with a note; writers can edit and resubmit
- Approved books get their own page and appear in the Reader Zone, free to read

**Reader Zone**
- 106 public-domain classics readable free in the browser (text fetched from Project Gutenberg on first open, then cached in `data/texts/`)
- Pages, chapter list, page slider, keyboard arrows and swipe on phones
- Day / sepia / dark / night themes, font, text size, line spacing and page width
- Bookmarks with notes, reading progress saved to your account (or the browser when logged out)

**Accounts & security**
- Sign up / log in / log out, password strength meter, profile and saved address
- **Security centre** (My account → Security): security checkup score, two-step verification with an authenticator app
  (QR code setup, 8 one-time backup codes), change password, list of signed-in devices with remote sign-out,
  recent sign-in activity, download your data, delete your account
- Public **Security & privacy** page (`#/security`) explaining protections, safety tips and how to report a problem
- Passwords hashed with salted scrypt; common and weak passwords rejected
- Account locks for 15 minutes after 5 wrong passwords; per-IP limits on sign-in, sign-up and 2FA attempts; site-wide API rate limit
- Sessions: random 256-bit tokens in HttpOnly SameSite cookies, 7-day lifetime, sign-out after 2 days idle,
  all other devices signed out on password change
- CSRF protection (custom header + Origin check), strict Content Security Policy, X-Frame-Options, Permissions-Policy,
  COOP/CORP headers, `no-store` on API responses, parameterised SQL everywhere, output escaping in the UI
- Admin **Security** tab: failed sign-ins, locked accounts (unlock), users without 2FA, and an **audit log** of admin actions
- Help and security contact: digvijaysingh5360@gmail.com

**Admin panel**
- Dashboard: revenue, orders, customers, top sellers, low stock
- Add, edit and delete books; update order status; manage customer roles; read contact-form messages

## Project structure

```
server.js            Express app: security headers, sessions, routes, static files
.env                 Private settings: admin account, HTTPS flag (never commit or share)
src/config.js        Port, security limits, shipping and coupon settings
src/db.js            SQLite schema, migrations and first-run seeding
src/security.js      Password hashing and policy, two-step codes (TOTP), auth middleware, validation helpers
src/audit.js         Sign-in event log and admin audit log
src/routes/          auth, books, shop (cart/wishlist/orders/coupons), reader, publish, admin APIs
data/books.json      The book catalog used to seed the database
data/bookstore.db    The database (created on first start; delete it to reset)
public/              index.html, css/style.css, js/app.js (the frontend)
```

## Resetting

Stop the server and delete `data/bookstore.db*` to start again with a fresh catalog and no users or orders.
