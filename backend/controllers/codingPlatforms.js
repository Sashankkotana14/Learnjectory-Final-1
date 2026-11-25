// Growth Engine: Coding Platforms (CodeChef, LeetCode, GeeksforGeeks, Codeforces, HackerRank).
// Purely additive: creates its own tables (CREATE TABLE IF NOT EXISTS) and never reads-for-write or alters habits, goals, logs or any other module.
const db = require('../database/db'), U = require('../utils'), P = require('../lib/codingPlatforms');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a), run = (s, ...a) => db.prepare(s).run(...a);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const log = (uid, m) => run('INSERT INTO activity_logs(user_id,message) VALUES(?,?)', uid, m);

db.exec(`CREATE TABLE IF NOT EXISTS coding_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,platform TEXT NOT NULL,username TEXT NOT NULL,total_solved INTEGER NOT NULL DEFAULT 0,easy INTEGER,medium INTEGER,hard INTEGER,rating INTEGER,max_rating INTEGER,rank_label TEXT DEFAULT '',contests INTEGER,last_synced TEXT,sync_status TEXT NOT NULL DEFAULT 'never',sync_error TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,platform));
CREATE TABLE IF NOT EXISTS coding_activity(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,platform TEXT NOT NULL,log_date TEXT NOT NULL,solved INTEGER NOT NULL,note TEXT DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS coding_snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,platform TEXT NOT NULL,snap_date TEXT NOT NULL,total_solved INTEGER NOT NULL DEFAULT 0,rating INTEGER,UNIQUE(user_id,platform,snap_date));
CREATE INDEX IF NOT EXISTS idx_cprof_user ON coding_profiles(user_id);CREATE INDEX IF NOT EXISTS idx_cact_user ON coding_activity(user_id,log_date);CREATE INDEX IF NOT EXISTS idx_csnap_user ON coding_snapshots(user_id,platform,snap_date)`);

const DAYS = 14, MAX_SOLVED = 100000, MAX_RATING = 10000;
let fetchImpl = globalThis.fetch; exports._setFetch = f => { fetchImpl = f; }; // tests only
const platformOf = req => (P.PLATFORMS[req.params.platform] ? req.params.platform : null);
const optInt = (v, max) => { if (v === undefined || v === null || v === '') return { v: null }; const n = U.toInt(v); return Number.isInteger(n) && n >= 0 && n <= max ? { v: n } : { error: true }; };

const view = (p, today) => {
  const meta = P.PLATFORMS[p.platform], snaps = all('SELECT snap_date,total_solved,rating FROM coding_snapshots WHERE user_id=? AND platform=? ORDER BY snap_date', p.user_id, p.platform);
  const base = d => { const s = snaps.filter(x => x.snap_date <= d).pop(); return s ? s.total_solved : null; };
  const b7 = base(U.addDays(today, -7)), week = all('SELECT COALESCE(SUM(solved),0) s FROM coding_activity WHERE user_id=? AND platform=? AND log_date>? AND log_date<=?', p.user_id, p.platform, U.addDays(today, -7), today)[0].s;
  return { platform: p.platform, name: meta.name, color: meta.color, username: p.username, profile_url: P.profileUrl(p.platform, p.username), total_solved: p.total_solved, easy: p.easy, medium: p.medium, hard: p.hard, rating: p.rating, max_rating: p.max_rating, rank_label: p.rank_label || '', contests: p.contests, last_synced: p.last_synced, sync_status: p.sync_status, sync_error: p.sync_error || '', solved_7d: week, solved_since_7d: b7 === null ? null : Math.max(0, p.total_solved - b7), trend: snaps.slice(-14).map(s => ({ date: s.snap_date, total_solved: s.total_solved, rating: s.rating })) };
};
const meta = () => P.KEYS.map(k => { const m = P.PLATFORMS[k]; return { key: k, name: m.name, color: m.color, hasDifficulty: m.hasDifficulty, hasRating: m.hasRating, features: m.features, links: m.links.map(([label, url]) => ({ label, url })) }; });

function overview(uid) {
  const today = U.todayStr(), from = U.addDays(today, -(DAYS - 1)), profiles = all('SELECT * FROM coding_profiles WHERE user_id=?', uid).map(p => view(p, today));
  const rows = all('SELECT platform,log_date,SUM(solved) n FROM coding_activity WHERE user_id=? AND log_date>=? AND log_date<=? GROUP BY platform,log_date', uid, from, today);
  const days = Array.from({ length: DAYS }, (_, i) => { const date = U.addDays(from, i), by = {}; let total = 0; for (const r of rows) if (r.log_date === date) { by[r.platform] = r.n; total += r.n; } return { date, total, by }; });
  const dates = all("SELECT DISTINCT log_date FROM coding_activity WHERE user_id=? AND solved>0", uid).map(r => r.log_date), st = U.streaks(dates, today);
  const recent = all('SELECT id,platform,log_date,solved,note,source FROM coding_activity WHERE user_id=? ORDER BY log_date DESC,id DESC LIMIT 15', uid).map(r => ({ ...r, name: P.PLATFORMS[r.platform]?.name || r.platform }));
  return { platforms: meta(), profiles, days, recent, today, summary: { linked: profiles.length, total_solved: profiles.reduce((s, p) => s + p.total_solved, 0), solved_today: days[days.length - 1].total, solved_7d: days.slice(-7).reduce((s, d) => s + d.total, 0), current_streak: st.current, longest_streak: st.longest, best_rating: Math.max(0, ...profiles.map(p => p.max_rating || p.rating || 0)) || null } };
}
exports.overview = overview;

exports.list = (req, res) => res.json(overview(req.user.id));

// Link a platform account (or change its username / manually correct its stats)
exports.link = (req, res) => {
  const platform = platformOf(req); if (!platform) return bad(res, 'Unknown platform', 404);
  const b = req.body || {}, old = one('SELECT * FROM coding_profiles WHERE user_id=? AND platform=?', req.user.id, platform);
  const username = String(b.username ?? old?.username ?? '').trim();
  if (!P.validUsername(username)) return bad(res, 'Enter a valid username (letters, numbers, . _ -; max 40 characters)');
  const f = {}; for (const [k, max] of [['total_solved', MAX_SOLVED], ['easy', MAX_SOLVED], ['medium', MAX_SOLVED], ['hard', MAX_SOLVED], ['rating', MAX_RATING], ['max_rating', MAX_RATING], ['contests', MAX_SOLVED]]) {
    if (b[k] === undefined) continue; const r = optInt(b[k], max); if (r.error) return bad(res, `${k} must be a whole number between 0 and ${max}`); f[k] = r.v;
  }
  if (b.rank_label !== undefined) f.rank_label = String(b.rank_label || '').trim().slice(0, 60);
  if (old) {
    const changed = username.toLowerCase() !== old.username.toLowerCase();
    const set = { username, ...f, ...(changed ? { sync_status: 'never', sync_error: '', last_synced: null } : {}) }, keys = Object.keys(set);
    run(`UPDATE coding_profiles SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`, ...keys.map(k => set[k]), old.id);
  } else {
    run('INSERT INTO coding_profiles(user_id,platform,username,total_solved,easy,medium,hard,rating,max_rating,rank_label,contests) VALUES(?,?,?,?,?,?,?,?,?,?,?)', req.user.id, platform, username, f.total_solved ?? 0, f.easy ?? null, f.medium ?? null, f.hard ?? null, f.rating ?? null, f.max_rating ?? null, f.rank_label ?? '', f.contests ?? null);
    log(req.user.id, `Linked ${P.PLATFORMS[platform].name} account "${username}"`);
  }
  if (f.total_solved !== undefined || f.rating !== undefined) snapshot(req.user.id, platform);
  res.status(old ? 200 : 201).json(overview(req.user.id));
};

exports.unlink = (req, res) => {
  const platform = platformOf(req); if (!platform) return bad(res, 'Unknown platform', 404);
  const r = run('DELETE FROM coding_profiles WHERE user_id=? AND platform=?', req.user.id, platform);
  if (!r.changes) return bad(res, 'Platform is not linked', 404);
  run('DELETE FROM coding_activity WHERE user_id=? AND platform=?', req.user.id, platform); run('DELETE FROM coding_snapshots WHERE user_id=? AND platform=?', req.user.id, platform);
  res.json(overview(req.user.id));
};

function snapshot(uid, platform) {
  const p = one('SELECT total_solved,rating FROM coding_profiles WHERE user_id=? AND platform=?', uid, platform);
  run('INSERT INTO coding_snapshots(user_id,platform,snap_date,total_solved,rating) VALUES(?,?,?,?,?) ON CONFLICT(user_id,platform,snap_date) DO UPDATE SET total_solved=excluded.total_solved,rating=excluded.rating', uid, platform, U.todayStr(), p.total_solved, p.rating);
}

// Pull live stats. Failure is reported on the profile (sync_status 'failed' + message) and never changes the stored numbers.
exports.sync = async (req, res) => {
  const platform = platformOf(req); if (!platform) return bad(res, 'Unknown platform', 404);
  const uid = req.user.id, p = one('SELECT * FROM coding_profiles WHERE user_id=? AND platform=?', uid, platform); if (!p) return bad(res, 'Link this platform first', 404);
  const r = await P.fetchStats(platform, p.username, fetchImpl), now = new Date().toISOString();
  if (!r.ok) { run("UPDATE coding_profiles SET sync_status='failed',sync_error=? WHERE id=?", r.error, p.id); return res.json({ ...overview(uid), sync: { ok: false, platform, error: r.error } }); }
  const s = r.stats, pick = (k, cur) => (s[k] === undefined || s[k] === null ? cur : s[k]), total = pick('total_solved', p.total_solved);
  const prevSnap = one('SELECT total_solved FROM coding_snapshots WHERE user_id=? AND platform=? ORDER BY snap_date DESC LIMIT 1', uid, platform);
  run("UPDATE coding_profiles SET total_solved=?,easy=?,medium=?,hard=?,rating=?,max_rating=?,rank_label=?,contests=?,last_synced=?,sync_status='ok',sync_error='' WHERE id=?", total, pick('easy', p.easy), pick('medium', p.medium), pick('hard', p.hard), pick('rating', p.rating), pick('max_rating', p.max_rating), s.rank_label || p.rank_label || '', pick('contests', p.contests), now, p.id);
  // Coding activity: per-day counts from the platform when available (replaces earlier synced rows in that window), otherwise the growth since the last snapshot.
  const today = U.todayStr(), from = U.addDays(today, -(DAYS - 1)), tx = db.transaction(() => {
    const daily = Object.entries(s.daily || {}).filter(([d]) => d >= from && d <= today);
    if (daily.length) { run("DELETE FROM coding_activity WHERE user_id=? AND platform=? AND source='sync' AND log_date>=?", uid, platform, from); for (const [d, n] of daily) if (n > 0) run("INSERT INTO coding_activity(user_id,platform,log_date,solved,note,source) VALUES(?,?,?,?,?,'sync')", uid, platform, d, n, 'Synced from ' + P.PLATFORMS[platform].name); }
    else if (prevSnap && total > prevSnap.total_solved) { run("DELETE FROM coding_activity WHERE user_id=? AND platform=? AND source='sync' AND log_date=?", uid, platform, today); run("INSERT INTO coding_activity(user_id,platform,log_date,solved,note,source) VALUES(?,?,?,?,?,'sync')", uid, platform, today, total - prevSnap.total_solved, 'Synced from ' + P.PLATFORMS[platform].name); }
    snapshot(uid, platform);
  }); tx();
  log(uid, `Synced ${P.PLATFORMS[platform].name} stats (${total} solved)`);
  res.json({ ...overview(uid), sync: { ok: true, platform } });
};

// Manual activity log (for platforms that cannot be read live, or for practice done offline)
exports.logActivity = (req, res) => {
  const platform = platformOf(req); if (!platform) return bad(res, 'Unknown platform', 404);
  const uid = req.user.id, b = req.body || {}, p = one('SELECT * FROM coding_profiles WHERE user_id=? AND platform=?', uid, platform); if (!p) return bad(res, 'Link this platform first', 404);
  const n = U.toInt(b.solved); if (!Number.isInteger(n) || n < 1 || n > 500) return bad(res, 'solved must be a whole number between 1 and 500');
  const date = b.date === undefined || b.date === '' ? U.todayStr() : b.date; if (!U.isDate(date)) return bad(res, 'date must be YYYY-MM-DD');
  if (date > U.todayStr()) return bad(res, 'date cannot be in the future'); if (date < U.addDays(U.todayStr(), -365)) return bad(res, 'date is too far in the past');
  run("INSERT INTO coding_activity(user_id,platform,log_date,solved,note,source) VALUES(?,?,?,?,?,'manual')", uid, platform, date, n, String(b.note || '').trim().slice(0, 200));
  run('UPDATE coding_profiles SET total_solved=total_solved+? WHERE id=?', n, p.id); snapshot(uid, platform);
  log(uid, `Logged ${n} ${P.PLATFORMS[platform].name} problem${n === 1 ? '' : 's'} solved`);
  res.status(201).json(overview(uid));
};

exports.removeActivity = (req, res) => {
  const id = U.toInt(req.params.id), a = Number.isInteger(id) ? one('SELECT * FROM coding_activity WHERE id=? AND user_id=?', id, req.user.id) : null; if (!a) return bad(res, 'Entry not found', 404);
  run('DELETE FROM coding_activity WHERE id=?', a.id);
  if (a.source === 'manual') { run('UPDATE coding_profiles SET total_solved=MAX(0,total_solved-?) WHERE user_id=? AND platform=?', a.solved, req.user.id, a.platform); if (one('SELECT 1 x FROM coding_profiles WHERE user_id=? AND platform=?', req.user.id, a.platform)) snapshot(req.user.id, a.platform); }
  res.json(overview(req.user.id));
};
