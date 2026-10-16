// Security logging: sign-in events (for users) and admin actions (audit log).
const { db } = require('./db');

const insertEvent = db.prepare('INSERT INTO login_events (user_id, email, event, success, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)');
const insertAudit = db.prepare('INSERT INTO audit_log (user_id, user_name, action, details, ip) VALUES (?, ?, ?, ?, ?)');

function logEvent(req, { userId = null, email = null, event, success }) {
  insertEvent.run(userId, email, event, success ? 1 : 0, req.ip || null, String(req.get('user-agent') || '').slice(0, 300));
}

function audit(req, action, details = '') {
  insertAudit.run(req.user?.id ?? null, req.user?.name ?? null, action, String(details).slice(0, 500), req.ip || null);
}

module.exports = { logEvent, audit };
