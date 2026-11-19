# AMAKA MOVIES v2.0 — Full Stack Platform

Full build: Part 1 + Part 2. Node.js + Express + SQLite backend, vanilla JS frontend.

## Quick Start
1. `npm install`
2. `cp .env.example .env` → set `JWT_SECRET` and `ADMIN_BOOTSTRAP_PASSWORD`
3. `npm run seed` (creates admin + sample movies)
4. `npm start` → open http://localhost:3000

## Features
- **Auth**: register/login (JWT, bcrypt, rate-limited)
- **Browse & Search**: home, browse, genre filters, live search
- **Movie Detail Pages**: poster, metadata, trailer, player, download, watchlist
- **User Profiles**: stats (watchlist/downloads/history), editable bio + avatar
- **Downloads**: logged per user, premium gating, notification on download
- **Notifications**: bell with unread badge, broadcasts, auto-mark-read
- **Watch History**: "Continue Watching" on profile
- **Dola AI**: assistant panel (recommendations, download help)
- **Hidden Admin Terminal**: press **Ctrl+Shift+A** (admin account only)
  - Commands: `help`, `movies`, `users`, `stats`, `addmovie Title|Year|Genre|Rating`,
    `delmovie <id>`, `notify <message>`, `clear`
  - Admin login: `admin` / value of `ADMIN_BOOTSTRAP_PASSWORD`
- **Audit log**: terminal + auth + profile actions recorded in DB
- **Security**: helmet, CORS, rate limiting, JWT 7-day expiry, bcrypt(10)

## Audit
Run `npm run audit` for the DB/data integrity smoke test (8 checks, exits non-zero on failure).

## Notes
- Seed idempotent: admin is created independently; re-running never duplicates data.
- Poster/stream URLs are null in seed data — placeholders render until you add real media.
