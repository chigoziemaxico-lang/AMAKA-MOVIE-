/* Smoke audit: DB integrity + required tables + library sanity. Run: npm run audit */
const db = require('../server/db');
const assert = require('assert');

const checks = [];
const check = (name, fn) => { try { fn(); checks.push(`PASS ${name}`); } catch (e) { checks.push(`FAIL ${name}: ${e.message}`); } };

check('movies table seeded', () => assert(db.prepare('SELECT COUNT(*) n FROM movies').get().n > 0));
check('admin user exists', () => assert(db.prepare("SELECT 1 FROM users WHERE role='admin'").get()));
check('foreign key integrity', () => assert(db.pragma('foreign_key_check').length === 0));
check('notifications table exists', () => assert(db.prepare("SELECT 1 FROM sqlite_master WHERE name='notifications'").get()));
check('audit_log table exists', () => assert(db.prepare("SELECT 1 FROM sqlite_master WHERE name='audit_log'").get()));
check('watch_history table exists', () => assert(db.prepare("SELECT 1 FROM sqlite_master WHERE name='watch_history'").get()));
check('downloads table exists', () => assert(db.prepare("SELECT 1 FROM sqlite_master WHERE name='downloads'").get()));
check('watchlist table exists', () => assert(db.prepare("SELECT 1 FROM sqlite_master WHERE name='watchlist'").get()));
check('settings present', () => assert(db.prepare('SELECT COUNT(*) n FROM settings').get().n > 0));

console.log(checks.join('\n'));
const ok = checks.every(c => c.startsWith('PASS'));
console.log(ok ? 'AUDIT PASSED' : 'AUDIT FAILED');
process.exit(ok ? 0 : 1);
