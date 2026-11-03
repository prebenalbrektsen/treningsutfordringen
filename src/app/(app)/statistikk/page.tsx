import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { StatTiles } from "@/components/StatTiles";
import { requireUser } from "@/lib/auth";
import { BOARDS, personStats, rank, sportBoards, type Period } from "@/lib/leaderboard";
import { activeChallenge, loadBoard } from "@/lib/challenge";
import { Icon } from "@/components/Icon";
import { sportIcon, sportLabel } from "@/lib/sports";
import { computeStats, fmtHours, fmtKm } from "@/lib/stats";
import { addDays, isoWeekNumber, osloDate } from "@/lib/time";

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ tavle?: string; periode?: string }> }) {
  const user = await requireUser();
  const { tavle, periode } = await searchParams;
  const c = await activeChallenge();
  if (!c) return <p className="pt-6 text-muted">Ingen utfordring ennå.</p>;
  const board = await loadBoard(c, user.id);
  const period: Period = periode === "uke" ? "uke" : "alt";
  const statsForPeriod = await personStats(c, board, period);
  const perSport = sportBoards(statsForPeriod);
  const boardId = [...BOARDS, ...perSport].some((b) => b.id === tavle) ? tavle! : "uker";
  // On a per-sport board, only people who actually did that kind of training.
  const ranking = rank(statsForPeriod, boardId).filter((r) => !boardId.startsWith("sport-") || r.value > 0);
  const best = Math.max(1, ...ranking.map((r) => r.value));
  const link = (t: string, p: string) => `?tavle=${t}&periode=${p}`;
  const all = computeStats(board.members.flatMap((m) => m.workouts));
  const doneWeeks = board.weeks.filter((w) => addDays(w, 6) < osloDate()).length;
  const teamWeekly = board.weeks.map((w, i) => ({ w, min: board.members.reduce((s, m) => s + m.results[i].minutes, 0) }));
  const maxWeek = Math.max(1, ...teamWeekly.map((t) => t.min));

  return (
    <div className="space-y-6 pt-2">
      <section>
        <h1 className="display text-5xl">Statistikk</h1>
        <p className="mt-1 text-muted">{c.name} · alle sammen</p>
      </section>
      <StatTiles s={all} />

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-bold">Tavla</h2>
          <div className="flex rounded-full bg-line/60 p-0.5 text-xs font-semibold">
            <Link href={link(boardId, "uke")} className={`rounded-full px-3 py-1.5 ${period === "uke" ? "bg-ink text-paper" : "text-muted"}`}>Denne uka</Link>
            <Link href={link(boardId, "alt")} className={`rounded-full px-3 py-1.5 ${period === "alt" ? "bg-ink text-paper" : "text-muted"}`}>Hele utfordringen</Link>
          </div>
        </div>
        <nav className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Velg tavle">
          {BOARDS.filter((b) => period === "alt" || b.id !== "streak").map((b) => (
            <Link key={b.id} href={link(b.id, period)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${boardId === b.id ? "border-ink bg-ink text-paper" : "border-line"}`}>{b.label}</Link>
          ))}
        </nav>
        {perSport.length > 0 && (
          <>
            <p className="mb-1.5 text-xs font-bold tracking-wider text-muted uppercase">Per treningsform</p>
            <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Velg treningsform">
              {perSport.map((b) => (
                <Link key={b.id} href={link(b.id, period)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${boardId === b.id ? "border-heat bg-heat text-white" : "border-line"}`}>{b.label}</Link>
              ))}
            </nav>
          </>
        )}
        <ol className="space-y-3">
          {ranking.map(({ p, value, text }, i) => (
            <li key={p.m.id} className={p.m.id === user.id ? "-mx-2 rounded-xl bg-heat-soft/60 px-2 py-1" : ""}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/person/${p.m.id}`} className="flex min-w-0 items-center gap-2 font-semibold">
                  <span className="w-6 shrink-0 text-right">{value > 0 && i < 3 ? ["🥇", "🥈", "🥉"][i] : <span className="text-muted">{i + 1}.</span>}</span>
                  <Avatar p={p.m} size={24} /><span className="truncate">{p.m.name}</span>
                </Link>
                <span className="shrink-0 font-semibold">{text}</span>
              </div>
              <div className="mt-1 ml-8 h-2 rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${(value / best) * 100}%`, background: p.m.color }} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Uke for uke</h2>
        {/* Name column pinned, weeks scroll sideways if they don't fit. */}
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="border-separate border-spacing-0 text-center text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] bg-card pr-3 pb-2 text-left font-semibold text-muted">Uke</th>
                {board.weeks.map((w) => (
                  <th key={w} className={`w-10 min-w-10 pb-2 font-semibold ${w === board.currentWeek ? "text-ink" : "text-muted"}`}>{isoWeekNumber(w)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.members.map((m) => (
                <tr key={m.id}>
                  <td className="sticky left-0 z-[1] max-w-28 truncate border-t border-line bg-card py-2 pr-3 text-left font-semibold">{m.name.split(" ")[0]}</td>
                  {m.results.map((r) => (
                    <td key={r.week} className={`border-t border-line py-2 ${r.week === board.currentWeek ? "bg-line/40" : ""}`} title={`${r.qualifying} økter, ${r.minutes} min`}>
                      {r.state === "future" || r.state === "before" ? <span className="text-muted/40">–</span>
                        : r.passed ? <span className="font-bold text-ok" aria-label="I boks">✓</span>
                        : r.state === "running" ? <span className="font-semibold text-warn">{r.qualifying}</span>
                        : <span className="font-bold text-bad" aria-label="Bot">✗</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">✓ i boks · ✗ bot · tall = økter så langt denne uka · – ikke med · {doneWeeks} av {board.weeks.length} uker ferdig</p>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Minutter per uke – hele gjengen</h2>
        <div className="flex h-36 items-end gap-2">
          {teamWeekly.map(({ w, min }) => (
            <div key={w} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted">{min || ""}</span>
              <div className="w-full rounded-t-md bg-heat" style={{ height: `${(min / maxWeek) * 100}px` }} />
              <span className="text-xs text-muted">{isoWeekNumber(w)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-bold">Hva vi trener</h2>
        <ul className="divide-y divide-line">
          {all.bySport.map((s) => (
            <li key={s.sport} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2"><Icon name={sportIcon(s.sport)} className="h-4 w-4 text-muted" /><strong>{sportLabel(s.sport)}</strong></span>
              <span className="text-muted">{s.count} økter · {fmtHours(s.minutes)} t{s.km > 0 && ` · ${fmtKm(s.km)} km`}</span>
            </li>
          ))}
          {!all.bySport.length && <li className="py-2 text-sm text-muted">Ingen økter ennå.</li>}
        </ul>
      </section>
    </div>
  );
}
