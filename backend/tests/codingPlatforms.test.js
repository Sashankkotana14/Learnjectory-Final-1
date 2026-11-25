// Growth Engine: coding platforms (CodeChef, LeetCode, GFG, Codeforces, HackerRank). Fully offline: network calls are mocked.
// Run:  NODE_ENV=test node --test tests/codingPlatforms.test.js        (offline: prefix NODE_PATH=tests/_shims/modules)
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `lj_test_cp_${Date.now()}.db`);
process.env.SEED_DEMO = 'false';
const { test } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), U = require('../utils'), CP = require('../controllers/codingPlatforms'), P = require('../lib/codingPlatforms'), H = require('../controllers/habits');
const uid = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run('cp', 'cp@x.com', 'x').lastInsertRowid;
const other = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run('o', 'o@x.com', 'x').lastInsertRowid;
const call = async (fn, { body, params, user = uid } = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; await fn({ user: { id: user }, body: body || {}, params: params || {}, query: {} }, res); return res; };
const T = U.todayStr(), sec = d => Date.parse(d + 'T12:00:00Z') / 1000;
const json = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
const text = t => ({ ok: true, status: 200, json: async () => ({}), text: async () => t });
const fail = s => ({ ok: false, status: s, json: async () => ({}), text: async () => '' });
let seen = [];
const mock = routes => async (url, opts) => { seen.push(url); for (const [m, r] of routes) if (url.includes(m)) return typeof r === 'function' ? r(url, opts) : r; return fail(404); };

test('registry covers exactly the five platforms with links, features and profile URLs', () => {
  assert.deepEqual([...P.KEYS].sort(), ['codechef', 'codeforces', 'gfg', 'hackerrank', 'leetcode']);
  for (const k of P.KEYS) { const m = P.PLATFORMS[k]; assert.ok(m.name && m.color && m.features.length && m.links.length >= 3); assert.match(P.profileUrl(k, 'a b'), /^https:\/\/[^/]+\//); assert.ok(!P.profileUrl(k, 'a b').includes(' ')); }
  assert.equal(P.profileUrl('leetcode', 'neo'), 'https://leetcode.com/u/neo/'); assert.equal(P.profileUrl('codeforces', 'tourist'), 'https://codeforces.com/profile/tourist');
  const o = call(CP.list); return o.then(r => { assert.equal(r.body.platforms.length, 5); assert.equal(r.body.profiles.length, 0); assert.equal(r.body.summary.linked, 0); });
});

test('username validation blocks URL / path injection', async () => {
  for (const bad of ['', 'a/b', '../x', 'a b', 'x?y=1', 'a'.repeat(41), 'http://evil']) { const r = await call(CP.link, { params: { platform: 'leetcode' }, body: { username: bad } }); assert.equal(r.code, 400, bad); }
  assert.equal((await call(CP.link, { params: { platform: 'nope' }, body: { username: 'x' } })).code, 404);
  assert.equal((await P.fetchStats('leetcode', '../../etc', mock([]))).ok, false); assert.equal(seen.length, 0, 'no request is made for an invalid username');
});

test('link / update / unlink each platform; data is per user', async () => {
  for (const k of P.KEYS) { const r = await call(CP.link, { params: { platform: k }, body: { username: 'user_' + k } }); assert.equal(r.code, 201); }
  let o = (await call(CP.list)).body; assert.equal(o.profiles.length, 5); assert.equal(o.summary.linked, 5);
  assert.equal((await call(CP.list, { user: other })).body.profiles.length, 0, 'other users see nothing');
  const u = await call(CP.link, { params: { platform: 'leetcode' }, body: { username: 'user_leetcode', total_solved: 120, easy: 60, medium: 50, hard: 10, rating: 1700 } }); assert.equal(u.code, 200);
  const lc = u.body.profiles.find(p => p.platform === 'leetcode'); assert.equal(lc.total_solved, 120); assert.equal(lc.hard, 10); assert.equal(lc.rating, 1700);
  assert.equal((await call(CP.link, { params: { platform: 'leetcode' }, body: { username: 'user_leetcode', total_solved: -1 } })).code, 400);
  assert.equal((await call(CP.unlink, { params: { platform: 'hackerrank' } })).body.profiles.length, 4);
  assert.equal((await call(CP.unlink, { params: { platform: 'hackerrank' } })).code, 404);
  assert.equal((await call(CP.sync, { params: { platform: 'hackerrank' } })).code, 404, 'cannot sync an unlinked platform');
  await call(CP.link, { params: { platform: 'hackerrank' }, body: { username: 'user_hackerrank' } });
});

test('LeetCode sync: solved by difficulty, contest rating, daily calendar', async () => {
  CP._setFetch(mock([['leetcode.com/graphql', json({ data: { matchedUser: { submitStatsGlobal: { acSubmissionNum: [{ difficulty: 'All', count: 200 }, { difficulty: 'Easy', count: 100 }, { difficulty: 'Medium', count: 80 }, { difficulty: 'Hard', count: 20 }] }, userCalendar: { submissionCalendar: JSON.stringify({ [sec(T)]: 3, [sec(U.addDays(T, -2))]: 2 }) } }, userContestRanking: { rating: 1850.6, attendedContestsCount: 12 } } })]]));
  const r = await call(CP.sync, { params: { platform: 'leetcode' } }); assert.equal(r.body.sync.ok, true);
  const p = r.body.profiles.find(x => x.platform === 'leetcode'); assert.deepEqual([p.total_solved, p.easy, p.medium, p.hard, p.rating, p.contests, p.sync_status], [200, 100, 80, 20, 1851, 12, 'ok']);
  assert.equal(r.body.days.at(-1).total, 3); assert.equal(r.body.days.at(-3).total, 2); assert.ok(p.last_synced);
  const again = await call(CP.sync, { params: { platform: 'leetcode' } }); assert.equal(again.body.days.at(-1).total, 3, 're-sync never double counts');
});

test('Codeforces sync: rating, rank, unique solved problems, contests, per-day activity', async () => {
  CP._setFetch(mock([['user.info', json({ status: 'OK', result: [{ rating: 1520, maxRating: 1610, rank: 'specialist' }] })], ['user.rating', json({ status: 'OK', result: [{}, {}, {}] })],
    ['user.status', json({ status: 'OK', result: [{ verdict: 'OK', creationTimeSeconds: sec(T), problem: { contestId: 1, index: 'A' } }, { verdict: 'OK', creationTimeSeconds: sec(T), problem: { contestId: 1, index: 'A' } }, { verdict: 'WRONG_ANSWER', creationTimeSeconds: sec(T), problem: { contestId: 1, index: 'B' } }, { verdict: 'OK', creationTimeSeconds: sec(U.addDays(T, -1)), problem: { contestId: 2, index: 'C' } }] })]]));
  const r = await call(CP.sync, { params: { platform: 'codeforces' } }); const p = r.body.profiles.find(x => x.platform === 'codeforces');
  assert.deepEqual([p.rating, p.max_rating, p.rank_label, p.contests, p.total_solved], [1520, 1610, 'specialist', 3, 2]); assert.equal(r.body.days.at(-1).by.codeforces, 1); assert.equal(r.body.days.at(-2).by.codeforces, 1);
});

test('CodeChef, GFG and HackerRank sync parse their public data', async () => {
  CP._setFetch(mock([['codechef.com/users', text('<div class="rating-number">1745</div> Highest Rating 1800 <h3>Total Problems Solved: 77</h3> 9 Contests Participated')],
    ['geeksforgeeks.org/user', text('<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { pageProps: { userInfo: { total_problems_solved: 150, score: 640, institute_rank: 3 }, userSubmissionsInfo: { Easy: { a: 1, b: 1 }, Medium: { c: 1 }, Hard: {} } } } }) + '</script>')],
    ['/badges', json({ models: [{ solved: 30, stars: 4 }, { solved: 12, stars: 3 }] })], ['/profile', json({ model: { username: 'x' } })]]));
  const cc = (await call(CP.sync, { params: { platform: 'codechef' } })).body.profiles.find(x => x.platform === 'codechef'); assert.deepEqual([cc.rating, cc.max_rating, cc.total_solved, cc.contests], [1745, 1800, 77, 9]);
  const gf = (await call(CP.sync, { params: { platform: 'gfg' } })).body.profiles.find(x => x.platform === 'gfg'); assert.deepEqual([gf.total_solved, gf.rating, gf.easy, gf.medium], [150, 640, 2, 1]);
  const hr = (await call(CP.sync, { params: { platform: 'hackerrank' } })).body.profiles.find(x => x.platform === 'hackerrank'); assert.equal(hr.total_solved, 42); assert.match(hr.rank_label, /2 badges/);
});

test('failed / timed-out / unreadable sync is reported, never throws, and keeps stored numbers', async () => {
  const before = (await call(CP.list)).body.profiles.find(x => x.platform === 'gfg').total_solved;
  for (const f of [mock([]), async () => { throw new Error('ECONNREFUSED'); }, mock([['geeksforgeeks', text('<html>nothing</html>')]])]) {
    CP._setFetch(f); const r = await call(CP.sync, { params: { platform: 'gfg' } }); assert.equal(r.code, 200); assert.equal(r.body.sync.ok, false); const p = r.body.profiles.find(x => x.platform === 'gfg'); assert.equal(p.sync_status, 'failed'); assert.ok(p.sync_error); assert.equal(p.total_solved, before);
  }
  CP._setFetch(null); const r = await call(CP.sync, { params: { platform: 'gfg' } }); assert.equal(r.body.sync.ok, false);
  CP._setFetch(mock([['user.info', json({ status: 'FAILED', comment: 'handles: User not found' })]])); const cf = await call(CP.sync, { params: { platform: 'codeforces' } }); assert.match(cf.body.sync.error, /not found/);
});

test('manual activity log updates totals, summary, streak; delete reverses it', async () => {
  const before = (await call(CP.list)).body, cc0 = before.profiles.find(p => p.platform === 'codechef').total_solved;
  const r = await call(CP.logActivity, { params: { platform: 'codechef' }, body: { solved: 4, note: 'Starters', date: T } }); assert.equal(r.code, 201);
  assert.equal(r.body.profiles.find(p => p.platform === 'codechef').total_solved, cc0 + 4); assert.ok(r.body.summary.solved_today >= 4); assert.ok(r.body.summary.current_streak >= 1);
  await call(CP.logActivity, { params: { platform: 'codechef' }, body: { solved: 1, date: U.addDays(T, -1) } });
  assert.ok((await call(CP.list)).body.summary.current_streak >= 2);
  for (const bad of [{ solved: 0 }, { solved: 501 }, { solved: 'x' }, { solved: 1, date: '2020-02-30' }, { solved: 1, date: U.addDays(T, 3) }, { solved: 1, date: U.addDays(T, -400) }]) assert.equal((await call(CP.logActivity, { params: { platform: 'codechef' }, body: bad })).code, 400, JSON.stringify(bad));
  const entry = r.body.recent.find(x => x.note === 'Starters'); assert.ok(entry);
  assert.equal((await call(CP.removeActivity, { params: { id: entry.id }, user: other })).code, 404, 'cannot delete another user\'s entry');
  const d = await call(CP.removeActivity, { params: { id: entry.id } }); assert.equal(d.body.profiles.find(p => p.platform === 'codechef').total_solved, cc0 + 1);
});

test('performance tracking: snapshots trend + 7-day solved; summary totals add up', async () => {
  const o = (await call(CP.list)).body, s = o.summary;
  assert.equal(s.total_solved, o.profiles.reduce((a, p) => a + p.total_solved, 0)); assert.ok(s.best_rating >= 1851);
  assert.ok(o.profiles.find(p => p.platform === 'leetcode').trend.length >= 1); assert.equal(o.days.length, 14);
  db.prepare("INSERT INTO coding_snapshots(user_id,platform,snap_date,total_solved,rating) VALUES(?,?,?,?,?)").run(uid, 'leetcode', U.addDays(T, -8), 150, 1800);
  assert.equal((await call(CP.list)).body.profiles.find(p => p.platform === 'leetcode').solved_since_7d, 50);
});

test('Growth Engine isolation: habits, habit logs and streaks are untouched by coding activity', async () => {
  const hid = db.prepare('INSERT INTO habits(user_id,name,daily_target) VALUES(?,?,1)').run(uid, 'Read').lastInsertRowid;
  [0, 1, 2].forEach(n => db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(?,?,?,1)').run(uid, hid, U.addDays(T, -n)));
  const snapView = () => { let out; H.list({ user: { id: uid } }, { json: b => { out = b; } }); return JSON.stringify([db.prepare('SELECT * FROM habit_logs ORDER BY id').all(), db.prepare('SELECT * FROM habits ORDER BY id').all(), out.habits]); };
  const before = snapView();
  await call(CP.logActivity, { params: { platform: 'leetcode' }, body: { solved: 2 } }); await call(CP.sync, { params: { platform: 'leetcode' } }); await call(CP.unlink, { params: { platform: 'leetcode' } });
  assert.equal(snapView(), before);
});
