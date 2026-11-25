import { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, Trash2, Plus, X, Link2, Code2, Flame, Trophy, Target, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { fmtDate, todayStr } from '../dates';

// Growth Engine addition: Coding Platforms (CodeChef, LeetCode, GeeksforGeeks, Codeforces, HackerRank).
// Talks only to the /growth/coding endpoints; habits, goals and every other module are untouched.
const Sum = ({ icon: I, label, v, sub }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{label}</div><div className="text-2xl font-extrabold">{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
const Stat = ({ l, v }: { l: string; v: any }) => <div className="rounded-xl bg-white/5 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-sky-100/60">{l}</div><div className="text-lg font-bold">{v ?? '—'}</div></div>;
const syncedText = (p: any) => p.sync_status === 'ok' ? `Synced ${fmtDate(p.last_synced.slice(0, 10))}` : p.sync_status === 'failed' ? 'Last sync failed' : 'Not synced yet';

function Card({ m, p, reload, setErr }: { m: any; p: any; reload: (d: any) => void; setErr: (s: string) => void }) {
  const [busy, setBusy] = useState(false), [mode, setMode] = useState<'' | 'link' | 'log' | 'edit'>(''), [user, setUser] = useState(''), [n, setN] = useState(''), [date, setDate] = useState(''), [note, setNote] = useState(''), [ed, setEd] = useState<any>({});
  const act = async (fn: () => Promise<any>, after?: () => void) => { setErr(''); setBusy(true); try { const d = await fn(); reload(d); after?.(); } catch (x: any) { setErr(x.message); } setBusy(false); };
  const base = '/growth/coding/' + m.key;
  const Links = <div className="mt-3 flex flex-wrap gap-2">{m.links.map((l: any) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="chip bg-white/5 !px-2.5 !py-1 hover:bg-white/10">{l.label}<ExternalLink className="ml-1 inline h-3 w-3" /></a>)}</div>;
  const head = <div className="mb-3 flex items-start justify-between gap-2"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: m.color }} /><div className="font-bold">{m.name}</div></div>{p && <div className="flex gap-2 text-sky-300"><button aria-label={`Sync ${m.name}`} disabled={busy} title="Sync now" onClick={() => act(() => api(base + '/sync', 'POST'))}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button><button aria-label={`Unlink ${m.name}`} title="Unlink" onClick={() => { if (confirm(`Unlink ${m.name} and remove its coding activity?`)) act(() => api(base, 'DELETE')); }}><Trash2 className="h-4 w-4" /></button></div>}</div>;
  if (!p) return (
    <div className="card" data-platform={m.key}>{head}
      <ul className="mb-3 space-y-1 text-xs text-sky-100/70">{m.features.map((f: string) => <li key={f}>• {f}</li>)}</ul>
      {mode === 'link' ? <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); act(async () => { await api(base, 'PUT', { username: user.trim() }); return api(base + '/sync', 'POST'); }, () => { setMode(''); setUser(''); }); }}>
        <input className="inp !w-auto min-w-[9rem] flex-1 !py-1" autoFocus required maxLength={40} aria-label={`${m.name} username`} placeholder="Your username" value={user} onChange={e => setUser(e.target.value)} />
        <button className="btn !px-3 !py-1" disabled={busy || !user.trim()}>{busy ? 'Linking…' : 'Link & sync'}</button><button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setMode('')}><X className="h-3 w-3" /></button></form>
        : <button className="btn !px-3 !py-1 text-xs" onClick={() => { setErr(''); setMode('link'); }}><Link2 className="h-3 w-3" />Link account</button>}
      {Links}
    </div>);
  const diff = m.hasDifficulty && (p.easy !== null || p.medium !== null || p.hard !== null);
  return (
    <div className="card" data-platform={m.key}>{head}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><a href={p.profile_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-300 hover:underline">@{p.username}<ExternalLink className="ml-1 inline h-3 w-3" /></a>
        <span className={`chip ${p.sync_status === 'failed' ? 'bg-rose-400/20 text-rose-200' : 'bg-indigo-400/20 text-indigo-100'}`}>{syncedText(p)}</span>{p.rank_label && <span className="chip bg-sky-400/20 text-sky-100">{p.rank_label}</span>}</div>
      {p.sync_status === 'failed' && <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-2 text-xs text-rose-200"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{p.sync_error}. Your saved numbers are unchanged — you can update them manually.</span></div>}
      <div className="mb-3 grid grid-cols-2 gap-2"><Stat l="Solved" v={p.total_solved} />{m.hasRating ? <Stat l="Rating" v={p.rating} /> : <Stat l="Last 7 days" v={p.solved_7d} />}
        {m.hasRating && <Stat l="Max rating" v={p.max_rating} />}{m.hasRating && <Stat l="Last 7 days" v={p.solved_7d} />}{p.contests !== null && <Stat l="Contests" v={p.contests} />}</div>
      {diff && <div className="mb-3"><div className="mb-1 flex gap-3 text-[11px]"><span className="text-emerald-300">Easy {p.easy ?? 0}</span><span className="text-amber-300">Medium {p.medium ?? 0}</span><span className="text-rose-300">Hard {p.hard ?? 0}</span></div>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/10">{[['easy', 'bg-emerald-400'], ['medium', 'bg-amber-400'], ['hard', 'bg-rose-400']].map(([k, c]) => { const tot = (p.easy || 0) + (p.medium || 0) + (p.hard || 0) || 1; return <div key={k} className={c} style={{ width: ((p[k] || 0) / tot * 100) + '%' }} />; })}</div></div>}
      <div className="flex flex-wrap gap-2 text-xs"><button className="btn !px-3 !py-1" onClick={() => { setErr(''); setMode(mode === 'log' ? '' : 'log'); }}><Plus className="h-3 w-3" />Log solved</button><button className="btn-ghost !px-3 !py-1" onClick={() => { setErr(''); setEd({ username: p.username, total_solved: p.total_solved, rating: p.rating ?? '', max_rating: p.max_rating ?? '' }); setMode(mode === 'edit' ? '' : 'edit'); }}>Edit</button></div>
      {mode === 'log' && <form className="mt-3 grid gap-2 rounded-xl bg-white/5 p-3 sm:grid-cols-[6rem_1fr]" onSubmit={e => { e.preventDefault(); act(() => api(base + '/log', 'POST', { solved: Number(n), date: date || undefined, note }), () => { setMode(''); setN(''); setNote(''); setDate(''); }); }}>
        <input className="inp" type="number" required min={1} max={500} aria-label="Problems solved" placeholder="Solved" value={n} onChange={e => setN(e.target.value)} />
        <input className="inp" type="date" aria-label="Date solved" max={todayStr()} value={date} onChange={e => setDate(e.target.value)} />
        <input className="inp sm:col-span-2" maxLength={200} placeholder="Note (optional), e.g. Weekly contest" value={note} onChange={e => setNote(e.target.value)} />
        <div className="flex gap-2 sm:col-span-2"><button className="btn !px-3 !py-1" disabled={busy || !n}>Save</button><button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setMode('')}>Cancel</button></div></form>}
      {mode === 'edit' && <form className="mt-3 grid gap-2 rounded-xl bg-white/5 p-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); act(() => api(base, 'PUT', { username: ed.username, total_solved: ed.total_solved, ...(m.hasRating ? { rating: ed.rating, max_rating: ed.max_rating } : {}) }), () => setMode('')); }}>
        <label className="text-xs text-sky-200 sm:col-span-2">Username<input className="inp mt-1" required maxLength={40} value={ed.username} onChange={e => setEd({ ...ed, username: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Total solved<input className="inp mt-1" type="number" min={0} max={100000} value={ed.total_solved} onChange={e => setEd({ ...ed, total_solved: e.target.value })} /></label>
        {m.hasRating && <label className="text-xs text-sky-200">Rating<input className="inp mt-1" type="number" min={0} max={10000} value={ed.rating} onChange={e => setEd({ ...ed, rating: e.target.value })} /></label>}
        {m.hasRating && <label className="text-xs text-sky-200">Max rating<input className="inp mt-1" type="number" min={0} max={10000} value={ed.max_rating} onChange={e => setEd({ ...ed, max_rating: e.target.value })} /></label>}
        <div className="flex gap-2 sm:col-span-2"><button className="btn !px-3 !py-1" disabled={busy}>Save</button><button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setMode('')}>Cancel</button></div></form>}
      {Links}
    </div>);
}

export function GrowthCoding() {
  const [data, setData] = useState<any>(null), [err, setErr] = useState(''), [info, setInfo] = useState('');
  const load = () => api('/growth/coding').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const reload = (d: any) => { if (d?.sync) setInfo(d.sync.ok ? 'Synced successfully.' : ''); else setInfo(''); setData(d); };
  const S = data?.summary, max = Math.max(1, ...(data?.days || []).map((d: any) => d.total)), byKey = (k: string) => data?.profiles.find((p: any) => p.platform === k);
  const del = (id: number) => api('/growth/coding/activity/' + id, 'DELETE').then(setData).catch(e => setErr(e.message));
  return (
    <div>
      <div className="mb-4"><h2 className="flex items-center gap-2 text-lg font-extrabold"><Code2 className="h-5 w-5 text-sky-300" />Coding Platforms</h2><p className="text-xs text-sky-100/70">Link your accounts, sync live stats where the platform allows it, and log practice by hand for the rest.</p></div>
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}{info && <div className="mb-3 text-sm text-emerald-300">{info}</div>}
      {S && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Sum icon={Target} label="Problems solved" v={S.total_solved} sub={`${S.linked}/5 platforms linked`} />
        <Sum icon={CheckCircle2} label="Solved today" v={S.solved_today} sub={`${S.solved_7d} in the last 7 days`} />
        <Sum icon={Flame} label="Coding streak" v={`${S.current_streak} day${S.current_streak === 1 ? '' : 's'}`} sub={`longest ${S.longest_streak}`} />
        <Sum icon={Trophy} label="Best rating" v={S.best_rating ?? '—'} sub="across rated platforms" /></div>}
      {data && S.linked > 0 && <div className="card mb-4 !p-4"><h3 className="mb-3 font-bold">Last 14 days</h3>
        <div className="flex h-24 items-end gap-1" role="img" aria-label="Problems solved per day">{data.days.map((d: any) => <div key={d.date} title={`${fmtDate(d.date)}: ${d.total} solved`} className="flex h-full flex-1 flex-col justify-end">{d.total > 0 ? <div className="flex flex-col-reverse overflow-hidden rounded-t" style={{ height: Math.max(8, d.total / max * 100) + '%' }}>{data.platforms.filter((m: any) => d.by[m.key]).map((m: any) => <div key={m.key} style={{ background: m.color, flex: d.by[m.key] }} />)}</div> : <div className="h-1 rounded bg-white/10" />}</div>)}</div>
        <div className="mt-1 flex justify-between text-[10px] text-sky-100/60"><span>{fmtDate(data.days[0].date)}</span><span>Today</span></div></div>}
      {data && S.linked > 1 && <div className="card mb-4 overflow-x-auto !p-4"><h3 className="mb-3 font-bold">Performance</h3>
        <table className="w-full min-w-[460px] text-center text-xs"><thead><tr className="text-sky-300"><th className="pb-2 text-left font-semibold">Platform</th><th>Solved</th><th>Rating</th><th>Max</th><th>7 days</th></tr></thead><tbody>
          {data.platforms.filter((m: any) => byKey(m.key)).map((m: any) => { const p = byKey(m.key); return <tr key={m.key} className="border-t border-white/10"><td className="py-1.5 text-left"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />{m.name}</td><td className="font-bold">{p.total_solved}</td><td>{p.rating ?? '—'}</td><td>{p.max_rating ?? '—'}</td><td>{p.solved_7d}</td></tr>; })}</tbody></table></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data?.platforms.map((m: any) => <Card key={m.key} m={m} p={byKey(m.key)} reload={reload} setErr={setErr} />)}</div>
      {data && data.recent.length > 0 && <div className="card mt-4 !p-4"><h3 className="mb-3 font-bold">Recent coding activity</h3><div className="space-y-1.5">{data.recent.map((r: any) => <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm"><div className="min-w-0"><span className="font-semibold">{r.name}</span> · {r.solved} solved{r.note ? <span className="text-sky-100/60"> — {r.note}</span> : null}<div className="text-[11px] text-sky-100/60">{fmtDate(r.log_date)} · {r.source === 'sync' ? 'synced' : 'logged'}</div></div>{r.source === 'manual' && <button aria-label="Delete entry" className="text-sky-300" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></button>}</div>)}</div></div>}
    </div>
  );
}
