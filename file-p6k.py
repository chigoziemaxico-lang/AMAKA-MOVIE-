#!/usr/bin/env python3
# ============================================================
# AMAKA MOVIES v2.0 — one-shot build & package script
# Creates the full project structure, writes every file with
# its complete code, and zips it into amaka-movies.zip.
# Pure Python 3 stdlib — no external packages needed.
# ============================================================
import zipfile
from pathlib import Path

ROOT = Path("amaka-movies")
FILES = {}

FILES["package.json"] = r'''{
  "name": "amaka-movies",
  "version": "2.0.0",
  "description": "AMAKA MOVIES — full-stack open-source streaming platform (Part 1 + Part 2)",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "seed": "node server/seed.js",
    "audit": "node test/smoke.js"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^9.4.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2"
  }
}
'''

FILES[".env.example"] = r'''PORT=3000
JWT_SECRET=change-this-to-a-long-random-string
ADMIN_BOOTSTRAP_PASSWORD=AmakaAdmin#2024
'''

FILES["README.md"] = r'''# AMAKA MOVIES v2.0 — Full-Stack Open-Source Platform

Node.js + Express + SQLite backend · Vanilla JS frontend · 100% open-source stack ·
**no paid APIs, no keys, no payment required anywhere.**

## Quick Start
1. `npm install`
2. `cp .env.example .env` → set `JWT_SECRET` and `ADMIN_BOOTSTRAP_PASSWORD`
3. `npm run seed` (admin + starter library)
4. `npm start` → http://localhost:3000

## Features (Part 1 + Part 2, confirmed checklist)
- Auth: register/login — JWT, bcrypt, rate-limited
- Home / Browse: grid, live search, genre chips
- Movie detail pages: poster, metadata, trailer, player, download, watchlist
- User profiles: stats (watchlist / downloads / watched), bio + avatar
- Downloads: logged per user, premium gating, notification on each download
- Notifications: bell + unread badge, broadcasts, auto-mark-read
- Watch history: "Continue Watching"
- **Dola AI panel**: recommendations + download help (bottom-right, ✨ button)
- **Hidden Admin Terminal**: **Ctrl+Shift+A** (admin account only), live command loop
  - `help | movies | users | stats | addmovie T|Y|G|R | delmovie id | notify msg | clear`
  - `fetch <term>` → **auto-fetches real movies from the free iTunes Search API**
    (no key, no payment) straight into the library and broadcasts a notification
- Audit log: every terminal/auth/profile action recorded in the DB

## UI Colour Rules (locked palette)
- Background `#0d0d14` · Surface `#171724` · Accent `#e5097a` · Accent-2 `#7b2ff7`
- Text `#f2f2f7` · Muted `#9a9ab0` · Terminal text `#a7f3d0` on `#080810`

## Audit
`npm run audit` → 9 integrity checks, exits non-zero on any failure.
'''

FILES["server/db.js"] = r'''const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'amaka.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  avatar TEXT,
  bio TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  poster_url TEXT,
  backdrop_url TEXT,
  trailer_url TEXT,
  stream_url TEXT,
  download_url TEXT,
  year INTEGER,
  genre TEXT,
  rating REAL DEFAULT 0,
  duration_min INTEGER,
  is_premium INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, movie_id)
);
CREATE TABLE IF NOT EXISTS watch_history (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  progress_seconds INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, movie_id)
);
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

module.exports = db;
'''

FILES["server/seed.js"] = r'''const db = require('./db');
const bcrypt = require('bcryptjs');

// Admin account (created independently of movie seeding — idempotent)
const adminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'AmakaAdmin#2024';
if (!db.prepare("SELECT 1 FROM users WHERE username='admin'").get()) {
  db.prepare('INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?,?)')
    .run('admin', 'admin@amaka.local', bcrypt.hashSync(adminPass, 10), 'admin');
  console.log('Admin account created (username: admin).');
}

const count = db.prepare('SELECT COUNT(*) AS n FROM movies').get().n;
if (count > 0) { console.log('Seed skipped — movies already exist.'); process.exit(0); }

const movies = [
  ['Rise of the Lion', 'A village boy defies tradition to become a champion.', 'Nollywood, Drama', 2024, 8.4, 112, 0],
  ['Zuri', 'A young artist discovers her late mother\u2019s hidden legacy.', 'Drama', 2023, 7.9, 98, 0],
  ['Night Market', 'A courier\u2019s last delivery turns into a citywide chase.', 'Thriller', 2024, 8.1, 105, 1],
  ['The Palm Line', 'Three generations fight to save a family plantation.', 'Drama, Family', 2022, 7.5, 120, 0],
  ['Kite Runner of Accra', 'A street kid builds a kite empire against all odds.', 'Family, Adventure', 2023, 7.8, 94, 0],
  ['Sable & Gold', 'A heist crew targets the wrong vault during a festival.', 'Crime, Thriller', 2025, 8.6, 118, 1]
];

const ins = db.prepare('INSERT INTO movies (title, description, genre, year, rating, duration_min, is_premium) VALUES (?,?,?,?,?,?,?)');
for (const m of movies) ins.run(...m);

db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('site_name','AMAKA MOVIES'), ('part2_enabled','1')").run();
console.log('Seeded 6 movies + settings.');
'''

FILES["server/index.js"] = r'''require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

// ---------- helpers ----------
const log = (actor, action, detail) =>
  db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actor, action, detail);

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function notify(userId, title, body) {
  db.prepare('INSERT INTO notifications (user_id,title,body) VALUES (?,?,?)').run(userId, title, body);
}

// ---------- auth ----------
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'username, valid email and 6+ char password required' });
  if (db.prepare('SELECT 1 FROM users WHERE username=? OR email=?').get(username, email))
    return res.status(409).json({ error: 'Username or email already exists' });
  const info = db.prepare('INSERT INTO users (username,email,password_hash) VALUES (?,?,?)')
    .run(username, email, bcrypt.hashSync(password, 10));
  notify(info.lastInsertRowid, 'Welcome to AMAKA MOVIES 🎬', 'Your account is ready. Start exploring now!');
  const token = jwt.sign({ id: info.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
  log(username, 'register', email);
  res.json({ token, user: { id: info.lastInsertRowid, username, role: 'user' } });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, username);
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: u.id, username: u.username, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
  log(u.username, 'login');
  res.json({ token, user: { id: u.id, username: u.username, role: u.role, avatar: u.avatar, bio: u.bio } });
});

// ---------- movies ----------
app.get('/api/movies', (req, res) => {
  const { q, genre } = req.query;
  let sql = 'SELECT id,title,description,poster_url,backdrop_url,trailer_url,year,genre,rating,duration_min,is_premium FROM movies WHERE 1=1';
  const args = [];
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  if (genre) { sql += ' AND genre LIKE ?'; args.push(`%${genre}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...args));
});

app.get('/api/movies/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Movie not found' });
  res.json(m);
});

// ---------- auto-fetch movie library (free, open, no key / no payment) ----------
// Uses the public iTunes Search API: https://itunes.apple.com/search?media=movie
const ITUNES = 'https://itunes.apple.com/search';

async function fetchMoviesFromItunes(term, limit = 12) {
  const url = `${ITUNES}?term=${encodeURIComponent(term)}&media=movie&limit=${limit}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'AMAKA-MOVIES/2.0' } });
  if (!r.ok) throw new Error(`iTunes Search API returned ${r.status}`);
  const data = await r.json();
  const items = Array.isArray(data.results) ? data.results : [];
  const upsert = db.prepare(`INSERT INTO movies
    (title, description, poster_url, trailer_url, stream_url, year, genre, rating, duration_min, is_premium)
    VALUES (?,?,?,?,?,?,?,0,?,0)`);
  let added = 0;
  for (const it of items) {
    if (!it.trackName) continue;
    const year = it.releaseDate ? Number(String(it.releaseDate).slice(0, 4)) : null;
    const poster = (it.artworkUrl100 || '').replace('100x100', '600x600');
    const genre = it.primaryGenreName || null;
    const dur = it.trackTimeMillis ? Math.round(it.trackTimeMillis / 60000) : null;
    // skip exact duplicates (same title + same year)
    if (db.prepare('SELECT 1 FROM movies WHERE title=? AND year IS ?').get(it.trackName, year)) continue;
    upsert.run(
      it.trackName,
      it.longDescription || it.shortDescription || 'Imported from the free iTunes Search API.',
      poster || null,
      it.previewUrl || null,
      it.previewUrl || null,
      year, genre, dur
    );
    added++;
  }
  return { added, term };
}

app.post('/api/movies/fetch', auth, adminOnly, async (req, res) => {
  const term = String(req.body?.term || '').trim().slice(0, 80);
  if (!term) return res.status(400).json({ error: 'term required' });
  try {
    const { added } = await fetchMoviesFromItunes(term);
    if (added > 0) {
      db.prepare('INSERT INTO notifications (user_id,title,body) VALUES (NULL,?,?)')
        .run('Library Updated 🎉', `${added} new movie(s) auto-fetched for "${term}".`);
    }
    log(req.user.username, 'auto_fetch', `${term} (+${added})`);
    res.json({ ok: true, added, term });
  } catch (e) {
    log(req.user.username, 'auto_fetch_failed', term);
    res.status(502).json({ error: 'Auto-fetch failed: ' + e.message });
  }
});

// ---------- watchlist ----------
app.get('/api/watchlist', auth, (req, res) => {
  res.json(db.prepare(`SELECT m.* FROM watchlist w JOIN movies m ON m.id=w.movie_id WHERE w.user_id=? ORDER BY w.created_at DESC`).all(req.user.id));
});
app.post('/api/watchlist/:movieId', auth, (req, res) => {
  try {
    db.prepare('INSERT INTO watchlist (user_id,movie_id) VALUES (?,?)').run(req.user.id, req.params.movieId);
    notify(req.user.id, 'Added to Watchlist', 'The movie was added to your list.');
  } catch { /* already exists */ }
  res.json({ ok: true });
});
app.delete('/api/watchlist/:movieId', auth, (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE user_id=? AND movie_id=?').run(req.user.id, req.params.movieId);
  res.json({ ok: true });
});

// ---------- watch history ----------
app.post('/api/history/:movieId', auth, (req, res) => {
  const p = Math.max(0, Math.floor(Number(req.body?.progress_seconds) || 0));
  db.prepare(`INSERT INTO watch_history (user_id,movie_id,progress_seconds) VALUES (?,?,?)
    ON CONFLICT(user_id,movie_id) DO UPDATE SET progress_seconds=excluded.progress_seconds, updated_at=datetime('now')`)
    .run(req.user.id, req.params.movieId, p);
  res.json({ ok: true });
});
app.get('/api/history', auth, (req, res) => {
  res.json(db.prepare(`SELECT m.*, h.progress_seconds FROM watch_history h JOIN movies m ON m.id=h.movie_id
    WHERE h.user_id=? ORDER BY h.updated_at DESC LIMIT 20`).all(req.user.id));
});

// ---------- downloads ----------
app.post('/api/downloads/:movieId', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.movieId);
  if (!m) return res.status(404).json({ error: 'Movie not found' });
  if (m.is_premium && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Premium download requires an upgrade' });
  db.prepare('INSERT INTO downloads (user_id,movie_id) VALUES (?,?)').run(req.user.id, m.id);
  notify(req.user.id, 'Download started 📥', `"${m.title}" is downloading.`);
  res.json({ ok: true, url: m.download_url || m.stream_url });
});
app.get('/api/downloads', auth, (req, res) => {
  res.json(db.prepare(`SELECT d.id, d.created_at, m.title, m.id AS movie_id, m.download_url
    FROM downloads d JOIN movies m ON m.id=d.movie_id WHERE d.user_id=? ORDER BY d.created_at DESC`).all(req.user.id));
});

// ---------- notifications ----------
app.get('/api/notifications', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50').all(req.user.id));
});
app.post('/api/notifications/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});

// ---------- Dola AI ----------
app.post('/api/dola', auth, (req, res) => {
  const msg = String(req.body?.message || '').slice(0, 500);
  if (!msg) return res.status(400).json({ error: 'message required' });
  let reply;
  if (/watch|recommend|suggest/i.test(msg)) {
    const picks = db.prepare('SELECT title, rating FROM movies ORDER BY rating DESC LIMIT 3').all();
    reply = `Here are my top picks right now: ${picks.map(p => `${p.title} (${p.rating})`).join(', ')}. Want something in a specific genre?`;
  } else if (/download/i.test(msg)) {
    reply = 'You can download any non-premium title from its detail page using the Download button. Premium titles need an upgrade.';
  } else if (/hello|^hi\b|hey/i.test(msg)) {
    reply = 'Hi there! I\u2019m Dola, your AMAKA movie companion. Ask me for recommendations or help with downloads.';
  } else {
    reply = 'I can recommend movies, explain downloads, or help you manage your watchlist. What would you like?';
  }
  res.json({ reply });
});

// ---------- profiles ----------
app.get('/api/profile', auth, (req, res) => {
  const u = db.prepare('SELECT id,username,email,role,avatar,bio,created_at FROM users WHERE id=?').get(req.user.id);
  const stats = {
    watchlist: db.prepare('SELECT COUNT(*) n FROM watchlist WHERE user_id=?').get(req.user.id).n,
    downloads: db.prepare('SELECT COUNT(*) n FROM downloads WHERE user_id=?').get(req.user.id).n,
    history: db.prepare('SELECT COUNT(*) n FROM watch_history WHERE user_id=?').get(req.user.id).n
  };
  res.json({ user: u, stats });
});
app.put('/api/profile', auth, (req, res) => {
  const { bio, avatar } = req.body || {};
  db.prepare('UPDATE users SET bio=COALESCE(?,bio), avatar=COALESCE(?,avatar) WHERE id=?')
    .run(bio ?? null, avatar ?? null, req.user.id);
  log(req.user.username, 'profile_update');
  res.json({ ok: true });
});

// ---------- Part 2: hidden live Admin Terminal ----------
const terminalLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

app.post('/api/admin/terminal', auth, terminalLimiter, adminOnly, async (req, res) => {
  const raw = String(req.body?.command || '').trim();
  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ');
  const out = (t) => ({ output: t });

switch ((cmd || '').toLowerCase()) {
    case 'help':
      return res.json(out(
        'Commands:\n' +
        '  help\n' +
        '  movies\n' +
        '  users\n' +
        '  stats\n' +
        '  addmovie <title>|<year>|<genre>|<rating>\n' +
        '  delmovie <id>\n' +
        '  notify <message>\n' +
        '  fetch <term>        auto-fetch movies (free iTunes API, no key)\n' +
        '  clear'));
    case 'movies':
      return res.json(out(db.prepare('SELECT id,title,year,rating,is_premium FROM movies ORDER BY id').all()
        .map(m => `#${m.id} ${m.title} (${m.year ?? '—'}) ★${m.rating}${m.is_premium ? ' [PREMIUM]' : ''}`).join('\n') || 'No movies.'));
    case 'users':
      return res.json(out(db.prepare('SELECT id,username,role FROM users').all()
        .map(u => `#${u.id} ${u.username} [${u.role}]`).join('\n')));
    case 'stats':
      return res.json(out([
        `movies: ${db.prepare('SELECT COUNT(*) n FROM movies').get().n}`,
        `users: ${db.prepare('SELECT COUNT(*) n FROM users').get().n}`,
        `downloads: ${db.prepare('SELECT COUNT(*) n FROM downloads').get().n}`,
        `watchlist entries: ${db.prepare('SELECT COUNT(*) n FROM watchlist').get().n}`
      ].join('\n')));
    case 'addmovie': {
      const [title, year, genre, rating] = arg.split('|').map(s => s?.trim());
      if (!title) return res.status(400).json(out('Usage: addmovie Title|2024|Genre|8.0'));
      const info = db.prepare('INSERT INTO movies (title,year,genre,rating) VALUES (?,?,?,?)')
        .run(title, Number(year) || null, genre || null, Number(rating) || 0);
      db.prepare('INSERT INTO notifications (user_id,title,body) VALUES (NULL,?,?)')
        .run('New Release 🎉', `${title} just landed on AMAKA MOVIES!`);
      log(req.user.username, 'terminal_addmovie', title);
      return res.json(out(`Movie #${info.lastInsertRowid} added.`));
    }
    case 'delmovie': {
      db.prepare('DELETE FROM movies WHERE id=?').run(Number(arg));
      log(req.user.username, 'terminal_delmovie', arg);
      return res.json(out('Deleted.'));
    }
    case 'notify': {
      if (!arg) return res.status(400).json(out('Usage: notify <message>'));
      db.prepare('INSERT INTO notifications (user_id,title,body) VALUES (NULL,?,?)').run('Announcement', arg);
      return res.json(out('Broadcast sent.'));
    }
    case 'fetch': {
      if (!arg) return res.status(400).json(out('Usage: fetch <term>  e.g. fetch action'));
      try {
        const { added } = await fetchMoviesFromItunes(arg);
        if (added > 0) {
          db.prepare('INSERT INTO notifications (user_id,title,body) VALUES (NULL,?,?)')
            .run('Library Updated 🎉', `${added} new movie(s) auto-fetched for "${arg}".`);
        }
        log(req.user.username, 'terminal_fetch', `${arg} (+${added})`);
        return res.json(out(added > 0
          ? `Auto-fetched ${added} movie(s) for "${arg}" into the library.`
          : `No new movies found for "${arg}" (or all were duplicates).`));
      } catch (e) {
        return res.status(502).json(out('Auto-fetch failed: ' + e.message));
      }
    }
    case 'clear':
      return res.json(out('__CLEAR__'));
    default:
      return res.status(400).json(out(`Unknown command: ${cmd}. Type 'help'.`));
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'AMAKA MOVIES API', version: '2.0.0' }));

// SPA fallback
app.use((req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, () => console.log(`AMAKA MOVIES running on http://localhost:${PORT}`));
'''

FILES["public/index.html"] = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AMAKA MOVIES</title>
<link rel="stylesheet" href="/css/styles.css">
</head>
<body>
<header class="topbar">
  <div class="brand">AMAKA<span>MOVIES</span></div>
  <nav id="nav"></nav>
  <div class="topbar-right">
    <button id="bellBtn" class="icon-btn" aria-label="Notifications" onclick="route('notifications')">🔔<span id="bellBadge" class="badge hidden"></span></button>
    <button id="dolaBtn" class="dola-btn">✨ Dola AI</button>
  </div>
</header>

<main id="view"></main>

<!-- Dola
