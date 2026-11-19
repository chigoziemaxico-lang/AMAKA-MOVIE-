# AMAKA MOVIES v2.0 — Full-Stack Open-Source Platform

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
- Auto-fetch library: admin terminal `fetch <term>` or any title, e.g. `fetch action`
- Audit log: every terminal/auth/profile action recorded in the DB

## UI Colour Rules (locked palette)
- Background `#0d0d14` · Surface `#171724` · Accent `#e5097a` · Accent-2 `#7b2ff7`
- Text `#f2f2f7` · Muted `#9a9ab0` · Terminal text `#a7f3d0` on `#080810`

## Audit
`npm run audit` → 9 integrity checks, exits non-zero on any failure.
