# Growth Engine – Coding Platforms update

Adds **CodeChef, LeetCode, GeeksforGeeks, Codeforces and HackerRank** as a new **Coding Platforms** tab inside Growth Engine (next to Habits / Goal Milestones / Reminders).

## What each platform gets
- Link an account (username validated), profile link, quick links (problems / contests / courses)
- Live **Sync** of solved count, rating / max rating, rank, contests, difficulty split and daily activity where the platform exposes it
- **Log solved** (manual, with date + note), edit stats by hand, delete log entries, unlink
- Dashboard tab: totals, solved today / 7 days, coding streak, best rating, 14‑day stacked activity chart, performance comparison table, recent activity

## Data source reliability (be aware)
| Platform | Source | Notes |
|---|---|---|
| Codeforces | official public API | most reliable |
| LeetCode | public GraphQL endpoint | unofficial; can change |
| CodeChef / GeeksforGeeks / HackerRank | public profile pages / site REST | no official API; parsing is best‑effort and can break if the site changes |

A failed sync never throws and never overwrites saved numbers; the card shows the reason and you can update stats manually.

## Files
New: `backend/lib/codingPlatforms.js`, `backend/controllers/codingPlatforms.js`, `backend/tests/codingPlatforms.test.js`, `frontend/src/components/GrowthCoding.tsx`
Edited (additive lines only): `backend/routes/api.js` (import + `/growth/coding/*` routes, registered before the generic `/:res`), `frontend/src/pages/Growth.tsx` (import + tab)
New tables (created with `IF NOT EXISTS`): `coding_profiles`, `coding_activity`, `coding_snapshots`. No existing table, column or habit logic is touched.

## Test
`cd backend && NODE_ENV=test node --test tests/codingPlatforms.test.js tests/growthEngine.test.js` (offline: prefix `NODE_PATH=tests/_shims/modules`)
