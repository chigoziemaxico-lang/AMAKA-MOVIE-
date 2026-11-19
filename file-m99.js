const db = require('./db');
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
