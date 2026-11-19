require('dotenv').config();
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
