/* AMAKA MOVIES frontend — Part 1 + Part 2 (final) */
let token = localStorage.getItem('amaka_token') || null;
let user = JSON.parse(localStorage.getItem('amaka_user') || 'null');
const view = document.getElementById('view');
const nav = document.getElementById('nav');

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}

function setAuth(t, u) {
  token = t; user = u;
  localStorage.setItem('amaka_token', t || '');
  localStorage.setItem('amaka_user', JSON.stringify(u));
  renderNav();
}

function renderNav() {
  const items = [
    ['Home', () => route('home')],
    ['Browse', () => route('browse')],
    ...(user ? [['Watchlist', () => route('watchlist')], ['Profile', () => route('profile')]] : []),
    ...(user ? [['Logout', logout]] : [['Login', () => route('login')]])
  ];
  nav.innerHTML = '';
  for (const [label, fn] of items) {
    const a = document.createElement('a'); a.textContent = label; a.onclick = fn; nav.appendChild(a);
  }
}

function logout() { setAuth(null, null); route('home'); toast('Logged out'); }

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const PLACEHOLDER = 'https://via.placeholder.com/300x450/26263a/9a9ab0?text=AMAKA';

function movieCard(m) {
  return `<div class="card" onclick="route('detail',${m.id})">
    <img src="${esc(m.poster_url) || PLACEHOLDER}" alt="${esc(m.title)}">
    <div class="card-body">
      <div class="card-title">${esc(m.title)}${m.is_premium ? '<span class="premium-tag">PREMIUM</span>' : ''}</div>
      <div class="card-meta">${m.year || ''} · ★ ${m.rating ?? '–'}</div>
    </div></div>`;
}

/* ---------- routes ---------- */
async function route(name, arg) {
  try {
    if (name === 'home') return await homeView();
    if (name === 'browse') return await browseView();
    if (name === 'detail') return await detailView(arg);
    if (name === 'login') return loginView();
    if (name === 'register') return registerView();
    if (name === 'watchlist') return await watchlistView();
    if (name === 'profile') return await profileView();
    if (name === 'downloads') return await downloadsView();
    if (name === 'notifications') return await notificationsView();
  } catch (e) { toast(e.message); }
}
window.route = route;

async function homeView() {
  const movies = await api('/movies');
  view.innerHTML = `<div class="hero"><h1>Welcome to AMAKA MOVIES</h1>
    <p style="margin:8px 0 18px;color:#f0d9ff">Stream, download and discover. Powered by Dola AI. 100% open-source — no payment, ever.</p>
    <button class="btn" onclick="route('browse')">Browse Movies</button></div>
    <h1>Trending Now</h1><div class="grid">${movies.map(movieCard).join('')}</div>`;
}

async function browseView() {
  const movies = await api('/movies');
  const genres = [...new Set(movies.flatMap(m => (m.genre || '').split(',').map(g => g.trim()).filter(Boolean)))];
  view.innerHTML = `<h1>Browse</h1>
    <input id="searchBox" placeholder="Search movies…" oninput="filterGrid(this.value)">
    <div class="btn-row">${genres.map(g => `<button class="tag" onclick="filterGrid('${esc(g)}')">${esc(g)}</button>`).join('')}</div>
    <div class="grid" id="movieGrid">${movies.map(movieCard).join('')}</div>`;
  window.filterGrid = (q) => {
    q = String(q).toLowerCase();
    document.querySelectorAll('#movieGrid .card').forEach(c => {
      c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  };
}

async function detailView(id) {
  const m = await api(`/movies/${id}`);
  view.innerHTML = `<div class="detail">
    <img src="${esc(m.poster_url) || PLACEHOLDER}" alt="${esc(m.title)}">
    <div>
      <h1>${esc(m.title)} ${m.is_premium ? '<span class="premium-tag">PREMIUM</span>' : ''}</h1>
      <p class="card-meta">${m.year || ''} · ${esc(m.genre) || '—'} · ★ ${m.rating ?? '–'} · ${m.duration_min || '?'} min</p>
      <p style="margin:14px 0;color:#c9c9dd">${esc(m.description) || 'No description yet.'}</p>
      <div class="btn-row">
        <button class="btn" onclick="playMovie(${m.id})">▶ Watch Now</button>
        <button class="btn secondary" onclick="downloadMovie(${m.id})">📥 Download</button>
        <button class="btn secondary" onclick="addWatchlist(${m.id})">＋ Watchlist</button>
        <button class="btn secondary" onclick="openTrailer('${esc(m.trailer_url)}')" ${m.trailer_url ? '' : 'disabled'}>🎬 Trailer</button>
      </div>
      <video id="player" controls style="width:100%;border-radius:12px;background:#000" ${m.stream_url ? `src="${esc(m.stream_url)}"` : 'hidden'}></video>
    </div></div>`;
  window.playMovie = async (mid) => {
    if (!user) return route('login');
    await api(`/history/${mid}`, { method: 'POST', body: JSON.stringify({ progress_seconds: 0 }) });
    const v = document.getElementById('player');
    if (v && v.src) { v.play(); toast('Playback started'); } else toast('Stream URL not configured for this title');
  };
  window.downloadMovie = async (mid) => {
    if (!user) return route('login');
    try { const r = await api(`/downloads/${mid}`, { method: 'POST' }); toast('Download started'); if (r.url) window.open(r.url, '_blank'); }
    catch (e) { toast(e.message); }
  };
  window.addWatchlist = async (mid) => {
    if (!user) return route('login');
    await api(`/watchlist/${mid}`, { method: 'POST' }); toast('Added to watchlist');
  };
}
window.openTrailer = (url) => { if (url && url !== 'null') window.open(url, '_blank'); };

function loginView() {
  view.innerHTML = `<div class="auth-card"><h1>Login</h1>
    <form onsubmit="doLogin(event)">
      <label>Username or email</label><input id="loginUser" required>
      <label>Password</label><input id="loginPass" type="password" required>
      <button class="btn" style="width:100%">Login</button>
      <p style="margin-top:12px;color:var(--muted);font-size:13px">No account? <a href="#" onclick="route('register');return false" style="color:var(--accent)">Register</a></p>
    </form></div>`;
}
window.doLogin = async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: document.getElementById('loginUser').value, password: document.getElementById('loginPass').value }) });
    setAuth(r.token, r.user); toast('Welcome back, ' + r.user.username + '!'); route('home'); refreshBell();
  } catch (err) { toast(err.message); }
};

function registerView() {
  view.innerHTML = `<div class="auth-card"><h1>Create Account</h1>
    <form onsubmit="doRegister(event)">
      <label>Username</label><input id="regUser" required>
      <label>Email</label><input id="regEmail" type="email" required>
      <label>Password (6+ chars)</label><input id="regPass" type="password" minlength="6" required>
      <button class="btn" style="width:100%">Register</button>
    </form></div>`;
}
window.doRegister = async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: document.getElementById('regUser').value, email: document.getElementById('regEmail').value, password: document.getElementById('regPass').value }) });
    setAuth(r.token, r.user); toast('Account created!'); route('home'); refreshBell();
  } catch (err) { toast(err.message); }
};

async function watchlistView() {
  if (!user) return route('login');
  const items = await api('/watchlist');
  view.innerHTML = `<h1>My Watchlist</h1>${items.length ? `<div class="grid">${items.map(movieCard).join('')}</div>` : '<p style="color:var(--muted)">Nothing here yet. Browse and add some movies!</p>'}`;
}

async function profileView() {
  if (!user) return route('login');
  const { user: u, stats } = await api('/profile');
  view.innerHTML = `<h1>My Profile</h1>
    <div class="stats-row">
      <div class="stat"><b>${stats.watchlist}</b>Watchlist</div>
      <div class="stat"><b>${stats.downloads}</b>Downloads</div>
      <div class="stat"><b>${stats.history}</b>Watched</div>
    </div>
    <div class="auth-card" style="margin:0">
      <label>Bio</label><textarea id="bioInput">${esc(u.bio)}</textarea>
      <label>Avatar URL</label><input id="avatarInput" value="${esc(u.avatar)}">
      <button class="btn" onclick="saveProfile()">Save Profile</button>
    </div>
    <h1 style="margin-top:30px">Continue Watching</h1><div id="histWrap"><em style="color:var(--muted)">Loading…</em></div>
    <div class="btn-row" style="margin-top:20px"><button class="btn secondary" onclick="route('downloads')">My Downloads</button>
    <button class="btn secondary" onclick="route('notifications')">Notifications</button></div>`;
  api('/history').then(h => document.getElementById('histWrap').innerHTML =
    h.length ? `<div class="grid">${h.map(movieCard).join('')}</div>` : '<p style="color:var(--muted)">No history yet.</p>');
}
window.saveProfile = async () => {
  try {
    await api('/profile', { method: 'PUT', body: JSON.stringify({ bio: document.getElementById('bioInput').value, avatar: document.getElementById('avatarInput').value }) });
    toast('Profile saved');
  } catch (e) { toast(e.message); }
};

async function downloadsView() {
  if (!user) return route('login');
  const items = await api('/downloads');
  view.innerHTML = `<h1>My Downloads</h1>${items.length
    ? items.map(d => `<div class="notif-item">📥 <b>${esc(d.title)}</b> — downloaded ${esc(d.created_at)}${d.download_url ? ` · <a href="${esc(d.download_url)}" target="_blank" rel="noopener" style="color:var(--accent)">Get file</a>` : ''}</div>`).join('')
    : '<p style="color:var(--muted)">No downloads yet.</p>'}`;
}

async function notificationsView() {
  if (!user) return route('login');
  const items = await api('/notifications');
  view.innerHTML = `<h1>Notifications</h1>${items.length
    ? items.map(n => `<div class="notif-item ${n.is_read ? '' : 'unread'}"><b>${esc(n.title)}</b><p style="color:var(--muted);font-size:13px">${esc(n.body)}</p><small style="color:var(--muted)">${esc(n.created_at)}</small></div>`).join('')
    : '<p style="color:var(--muted)">No notifications yet.</p>'}`;
  api('/notifications/read', { method: 'POST' }).then(refreshBell);
}

/* ---------- notifications bell ---------- */
async function refreshBell() {
  if (!user) return;
  try {
    const items = await api('/notifications');
    const unread = items.filter(n => !n.is_read).length;
    const badge = document.getElementById('bellBadge');
    if (unread) { badge.textContent = unread; badge.classList.remove('hidden'); } else badge.classList.add('hidden');
  } catch { /* silent */ }
}

/* ---------- Dola AI ---------- */
const dolaPanel = document.getElementById('dolaPanel');
document.getElementById('dolaBtn').onclick = () => dolaPanel.classList.toggle('hidden');
document.getElementById('dolaClose').onclick = () => dolaPanel.classList.add('hidden');
document.getElementById('dolaForm').onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById('dolaInput');
  const msg = input.value.trim(); if (!msg) return;
  input.value = '';
  const box = document.getElementById('dolaMessages');
  box.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(msg)}</div>`);
  let reply = 'Login to chat with me.';
  try { if (token) reply = (await api('/dola', { method: 'POST', body: JSON.stringify({ message: msg }) })).reply; } catch {}
  box.insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(reply)}</div>`);
  box.scrollTop = box.scrollHeight;
};

/* ---------- Hidden live Admin Terminal (Ctrl+Shift+A) ---------- */
const term = document.getElementById('adminTerminal');
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); term.classList.toggle('hidden'); document.getElementById('termInput').focus(); }
});
document.getElementById('termClose').onclick = () => term.classList.add('hidden');
document.getElementById('termForm').onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById('termInput');
  const cmd = input.value.trim(); if (!cmd) return;
  input.value = '';
  const termLog = document.getElementById('termLog');
  termLog.textContent += `> ${cmd}\n`;
  termLog.scrollTop = termLog.scrollHeight;
  try {
    const r = await api('/admin/terminal', { method: 'POST', body: JSON.stringify({ command: cmd }) });
    if (r.output === '__CLEAR__') termLog.textContent = '';
    else termLog.textContent += r.output + '\n';
  } catch (err) { termLog.textContent += 'Error: ' + err.message + '\n'; }
  termLog.scrollTop = termLog.scrollHeight;
};

/* ---------- boot ---------- */
renderNav();
route('home');
refreshBell();
setInterval(refreshBell, 30000);
console.log('%cAMAKA MOVIES v2.0 — press Ctrl+Shift+A for admin terminal', 'color:#e5097a;font-weight:bold');
