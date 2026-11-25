// Growth Engine: coding platform registry + live-stat fetchers for CodeChef, LeetCode, GeeksforGeeks, Codeforces and HackerRank.
// Self-contained: no existing module imports or depends on this file. All fetchers are best-effort and NEVER throw to the caller:
// they resolve to { ok:true, stats } or { ok:false, error }. Hosts are fixed (the username is validated and URL-encoded), so a
// user can never make the server request an arbitrary URL.
const USERNAME_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const TIMEOUT_MS = 8000;

const PLATFORMS = {
  leetcode: { key: 'leetcode', name: 'LeetCode', color: '#FFA116', live: true, hasDifficulty: true, hasRating: true,
    profile: u => `https://leetcode.com/u/${u}/`, links: [['Problems', 'https://leetcode.com/problemset/'], ['Contests', 'https://leetcode.com/contest/'], ['Study plans', 'https://leetcode.com/studyplan/']],
    features: ['Solved by difficulty', 'Contest rating', 'Daily submission calendar'] },
  codeforces: { key: 'codeforces', name: 'Codeforces', color: '#1F8ACB', live: true, hasDifficulty: false, hasRating: true,
    profile: u => `https://codeforces.com/profile/${u}`, links: [['Problemset', 'https://codeforces.com/problemset'], ['Contests', 'https://codeforces.com/contests'], ['Gym', 'https://codeforces.com/gyms']],
    features: ['Rating + max rating', 'Rank title', 'Contests attended', 'Daily accepted problems'] },
  codechef: { key: 'codechef', name: 'CodeChef', color: '#C98B4B', live: true, hasDifficulty: false, hasRating: true,
    profile: u => `https://www.codechef.com/users/${u}`, links: [['Practice', 'https://www.codechef.com/practice'], ['Contests', 'https://www.codechef.com/contests'], ['Learn', 'https://www.codechef.com/learn']],
    features: ['Rating + stars', 'Problems solved', 'Long / Starters contests'] },
  gfg: { key: 'gfg', name: 'GeeksforGeeks', color: '#2F8D46', live: true, hasDifficulty: true, hasRating: false,
    profile: u => `https://www.geeksforgeeks.org/user/${u}/`, links: [['Practice', 'https://www.geeksforgeeks.org/explore'], ['POTD', 'https://www.geeksforgeeks.org/problem-of-the-day'], ['Courses', 'https://www.geeksforgeeks.org/courses']],
    features: ['Problems solved', 'Coding score', 'Problem of the Day'] },
  hackerrank: { key: 'hackerrank', name: 'HackerRank', color: '#00B35F', live: true, hasDifficulty: false, hasRating: false,
    profile: u => `https://www.hackerrank.com/profile/${u}`, links: [['Practice', 'https://www.hackerrank.com/domains'], ['Contests', 'https://www.hackerrank.com/contests'], ['Certifications', 'https://www.hackerrank.com/skills-verification']],
    features: ['Badges + stars', 'Problems solved', 'Skill certificates'] },
};
const KEYS = Object.keys(PLATFORMS);
const validUsername = u => typeof u === 'string' && USERNAME_RE.test(u.trim());
const profileUrl = (platform, username) => PLATFORMS[platform].profile(encodeURIComponent(username));

// `fetchImpl` is injectable so tests can run offline.
async function get(fetchImpl, url, opts = {}, as = 'json') {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(url, { ...opts, signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Learnjectory)', Accept: '*/*', ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return as === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };
const dayOf = sec => new Date(sec * 1000).toISOString().slice(0, 10);

const FETCHERS = {
  // Official public API
  async codeforces(u, f) {
    const h = encodeURIComponent(u);
    const info = await get(f, `https://codeforces.com/api/user.info?handles=${h}`);
    if (info.status !== 'OK' || !info.result?.[0]) throw new Error(info.comment || 'user not found');
    const x = info.result[0], out = { rating: num(x.rating), max_rating: num(x.maxRating), rank_label: x.rank || '', daily: {} };
    try { const r = await get(f, `https://codeforces.com/api/user.rating?handle=${h}`); out.contests = r.result?.length ?? null; } catch { /* optional */ }
    const st = await get(f, `https://codeforces.com/api/user.status?handle=${h}`);
    const solved = new Map();
    for (const s of st.result || []) if (s.verdict === 'OK') { const id = `${s.problem.contestId}-${s.problem.index}`, d = dayOf(s.creationTimeSeconds); if (!solved.has(id) || d < solved.get(id)) solved.set(id, d); }
    out.total_solved = solved.size; for (const d of solved.values()) out.daily[d] = (out.daily[d] || 0) + 1;
    return out;
  },
  // Public GraphQL endpoint
  async leetcode(u, f) {
    const q = `query($u:String!){matchedUser(username:$u){submitStatsGlobal{acSubmissionNum{difficulty count}} userCalendar{submissionCalendar}} userContestRanking(username:$u){rating attendedContestsCount}}`;
    const d = await get(f, 'https://leetcode.com/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' }, body: JSON.stringify({ query: q, variables: { u } }) });
    const m = d.data?.matchedUser; if (!m) throw new Error('user not found');
    const by = Object.fromEntries((m.submitStatsGlobal?.acSubmissionNum || []).map(r => [r.difficulty, r.count]));
    const out = { total_solved: num(by.All), easy: num(by.Easy), medium: num(by.Medium), hard: num(by.Hard), daily: {} };
    const c = d.data.userContestRanking; if (c) { out.rating = num(c.rating); out.max_rating = num(c.rating); out.contests = num(c.attendedContestsCount); }
    try { const cal = JSON.parse(m.userCalendar?.submissionCalendar || '{}'); for (const [ts, n] of Object.entries(cal)) out.daily[dayOf(+ts)] = (out.daily[dayOf(+ts)] || 0) + n; } catch { /* optional */ }
    return out;
  },
  // No official API: best-effort parse of the public profile page
  async codechef(u, f) {
    const html = await get(f, `https://www.codechef.com/users/${encodeURIComponent(u)}`, {}, 'text');
    if (/page not found|user does not exist/i.test(html.slice(0, 6000)) && !/rating-number/.test(html)) throw new Error('user not found');
    const rating = html.match(/class="rating-number"[^>]*>\s*(\d+)/), solved = html.match(/Total Problems Solved:\s*(\d+)/i), hi = html.match(/Highest Rating\s*(\d+)/i), stars = html.match(/class="rating-star"[^>]*>([\s\S]*?)<\/div>/), cont = html.match(/(\d+)\s*Contests?\s*Participated/i);
    if (!rating && !solved) throw new Error('could not read profile (CodeChef has no public API)');
    return { rating: rating ? +rating[1] : null, max_rating: hi ? +hi[1] : rating ? +rating[1] : null, total_solved: solved ? +solved[1] : null, contests: cont ? +cont[1] : null, rank_label: stars ? (stars[1].match(/★/g) || []).length ? (stars[1].match(/★/g) || []).length + '★' : '' : '', daily: {} };
  },
  // No official API: best-effort parse of embedded page data
  async gfg(u, f) {
    const html = await get(f, `https://www.geeksforgeeks.org/user/${encodeURIComponent(u)}/`, {}, 'text');
    const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); if (!nd) throw new Error('could not read profile (GeeksforGeeks has no public API)');
    const p = JSON.parse(nd[1])?.props?.pageProps || {}, info = p.userInfo || {}, by = p.userSubmissionsInfo || {};
    if (!info.total_problems_solved && info.total_problems_solved !== 0 && !Object.keys(by).length) throw new Error('user not found');
    const cnt = k => Object.keys(by[k] || {}).length;
    return { total_solved: num(info.total_problems_solved), easy: by.Easy ? cnt('Easy') + cnt('School') + cnt('Basic') : null, medium: by.Medium ? cnt('Medium') : null, hard: by.Hard ? cnt('Hard') : null, rating: num(info.score), rank_label: info.institute_rank ? `Institute rank ${info.institute_rank}` : '', daily: {} };
  },
  // Public REST endpoints used by the website itself
  async hackerrank(u, f) {
    const h = encodeURIComponent(u);
    const p = await get(f, `https://www.hackerrank.com/rest/contests/master/hackers/${h}/profile`);
    if (!p.model) throw new Error('user not found');
    const out = { total_solved: null, rank_label: '', daily: {} };
    try {
      const b = await get(f, `https://www.hackerrank.com/rest/hackers/${h}/badges`), models = b.models || [];
      out.total_solved = models.reduce((s, m) => s + (Number(m.solved) || 0), 0);
      const stars = models.reduce((s, m) => s + (Number(m.stars) || 0), 0); out.rank_label = `${models.length} badges · ${stars}★`;
    } catch { /* badges optional */ }
    return out;
  },
};

async function fetchStats(platform, username, fetchImpl = globalThis.fetch) {
  if (!PLATFORMS[platform]) return { ok: false, error: 'Unknown platform' };
  if (!validUsername(username)) return { ok: false, error: 'Invalid username' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Network access is not available on the server' };
  try { return { ok: true, stats: await FETCHERS[platform](username.trim(), fetchImpl) }; }
  catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'Timed out reaching ' + PLATFORMS[platform].name : String(e.message || e).slice(0, 160) }; }
}

module.exports = { PLATFORMS, KEYS, validUsername, profileUrl, fetchStats, USERNAME_RE };
