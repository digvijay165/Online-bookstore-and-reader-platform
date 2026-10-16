// Server configuration. Secrets come from the private .env file (see .env.example) or real environment variables.
require('./env');

module.exports = {
  HOST: process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.PORT) || 3000,
  HTTPS_ONLY: process.env.HTTPS_ONLY === '1',
  // Set to 1 when running behind a hosting proxy (Render, Railway, Nginx) so visitor IPs and HTTPS are detected correctly
  TRUST_PROXY: process.env.TRUST_PROXY === '1',

  // The admin account is created on first start if it does not exist (values from .env).
  ADMIN_NAME: process.env.ADMIN_NAME || 'Store Admin',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@bookstore.local',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '', // empty: a random password is generated and printed once

  SESSION_DAYS: 7,
  SESSION_IDLE_DAYS: 2, // sign out after this many days without activity

  // Brute-force protection
  MAX_FAILED_LOGINS: 5, // wrong passwords in a row before the account is locked
  LOCK_MINUTES: 15,
  FREE_SHIPPING_ABOVE: 499,
  SHIPPING_FEE: 49,

  // Discount codes shown at checkout.
  // type: 'percent' (value %), 'flat' (value rupees) or 'shipping' (free delivery).
  // academicOnly: discount applies only to textbooks/exam books (books with an academic level).
  COUPONS: {
    WELCOME10: { type: 'percent', value: 10, minSubtotal: 299, maxDiscount: 200, label: '10% off your order (up to ₹200)' },
    STUDENT15: { type: 'percent', value: 15, academicOnly: true, maxDiscount: 500, label: '15% off textbooks & exam books (up to ₹500)' },
    READ50: { type: 'flat', value: 50, minSubtotal: 499, label: '₹50 off orders over ₹499' },
    FREESHIP: { type: 'shipping', label: 'Free delivery on any order' },
  },
};
