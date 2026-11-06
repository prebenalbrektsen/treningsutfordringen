import { PoweredByStrava } from "@/components/StravaBrand";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { BackLink } from "@/components/BackLink";
import { Badges, badgesFor, Records, WeeklyChart } from "@/components/Profile";
import { RoleTag } from "@/components/RoleTag";
import { StatTiles } from "@/components/StatTiles";
import { DayDots, ProgressRing } from "@/components/WeekDashboard";
import { Pill, statusLabel, WeekProgress } from "@/components/WeekProgress";
import { WorkoutRow } from "@/components/WorkoutRow";
import { requireUser } from "@/lib/auth";
import { activeChallenge, loadBoard } from "@/lib/challenge";
import { one } from "@/lib/db";
import { firstFinishCounts, personStats } from "@/lib/leaderboard";
import { computeStats } from "@/lib/stats";
import { formatDay, isoWeekNumber, osloDate, weekStart } from "@/lib/time";

/** Someone's profile: this week, records, chart, badges and workouts – informative from day one. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const c = await activeChallenge(user.group_id);
  const board = c ? await loadBoard(c, user.id) : null;
  const p = board?.members.find((m) => m.id === Number(id));

  // In the app but not in this challenge: a simple card instead of a 404.
  if (!c || !board || !p) {
    const u = await one<{ id: number; name: string; color: string; is_admin: boolean; avatar_v: number | null }>(
      `select u.id, u.name, u.color, m.role = 'admin' as is_admin, extract(epoch from u.avatar_updated_at)::int as avatar_v
         from users u join group_members m on m.user_id = u.id and m.group_id = $2 and m.approved where u.id = $1`,
      [Number(id), user.group_id],
    );
    if (!u) notFound();
    return (
      <div className="space-y-5 pt-2">
        <BackLink />
        <div className="flex items-center gap-3">
          <Avatar p={u} size={64} />
          <div className="min-w-0">
            <h1 className="display line-clamp-2 text-4xl break-words">{u.name}</h1>
            {u.is_admin && <RoleTag title={user.admin_title} />}
          </div>
        </div>
        <p className="card p-4 text-sm text-muted">{u.name.split(" ")[0]} er ikke med i {c?.name ?? "noen utfordring"} ennå.</p>
      </div>
    );
  }

  const stats = computeStats(p.workouts);
  const pStats = (await personStats(c, board, "alt")).find((x) => x.m.id === p.id)!;
  const firsts = await firstFinishCounts(c);
  const passed = p.results.filter((r) => r.state === "done" && r.passed).length;
  const done = p.results.filter((r) => r.state === "done").length;
  const week = board.weeks.includes(board.currentWeek) ? board.currentWeek : null;
  const thisWeek = week ? p.results[board.weeks.indexOf(week)] : null;
  const first = p.name.split(" ")[0];

  return (
    <div className="space-y-4 pt-2">
      <BackLink />
      <div className="flex items-center gap-4">
        <Avatar p={p} size={68} />
        <div className="min-w-0">
          <h1 className="display line-clamp-2 text-4xl break-words sm:text-5xl">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            {p.is_admin && <RoleTag title={user.admin_title} />}
            <span className="rounded-full bg-line/70 px-2 py-0.5">Med siden {formatDay(osloDate(new Date(p.joined_at)) < c.starts_on ? c.starts_on : osloDate(new Date(p.joined_at)))}</span>
            {p.strava_athlete_id && <span className="rounded-full bg-[#FC5200]/15 px-2 py-0.5 text-[#c2410c]">På Strava</span>}
          </div>
          {done > 0 && <p className="mt-1 text-sm text-muted">{passed} av {done} ferdige uker i boks</p>}
        </div>
      </div>

      {thisWeek && thisWeek.state !== "before" && week && (
        <section className="card flex items-center gap-4 p-4">
          <ProgressRing c={c} r={thisWeek} size={88} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-wider text-muted uppercase">Uke {isoWeekNumber(week)}</p>
            <p className="display mt-0.5 text-2xl">{statusLabel(c, thisWeek).text}</p>
            <div className="mt-2"><DayDots c={c} r={thisWeek} week={week} /></div>
          </div>
        </section>
      )}
      {thisWeek?.state === "before" && <p className="card p-4 text-sm text-muted">{first} er med fra neste uke.</p>}

      <Records p={pStats} />
      {stats.sessions > 0 && <WeeklyChart c={c} m={p} />}
      <Badges badges={badgesFor(pStats, c, firsts.get(p.id) ?? 0)} />
      {stats.sessions > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Totalt i {c.name}</h2>
          <StatTiles s={stats} />
        </section>
      )}

      {p.results.some((r) => r.state === "done") && (
        <section className="card p-4">
          <h2 className="mb-2 font-bold">Ukene</h2>
          <ul className="divide-y divide-line">
            {p.results.filter((r) => r.state !== "future" && r.state !== "before").reverse().map((r) => {
              const s = statusLabel(c, r);
              return (
                <li key={r.week} className="flex items-center gap-3 py-2.5">
                  <span className="w-16 shrink-0 font-semibold">Uke {isoWeekNumber(r.week)}</span>
                  <div className="flex-1"><WeekProgress c={c} r={r} small /></div>
                  <Pill tone={s.tone}>{s.text}</Pill>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-bold">Øktene til {first}</h2>
        <ul className="divide-y divide-line">
          {p.workouts.filter((w) => w.checked_in_at || p.id === user.id).map((w) => (
            <WorkoutRow key={w.id} w={w} me={user.id} task={board.tasks.get(weekStart(osloDate(new Date(w.started_at)), c))} c={c} isAdmin={user.is_admin} />
          ))}
          {user.is_admin && p.id !== user.id && (() => {
            // The Kontrollør may nudge, but sees no details before the person shares them.
            const waiting = p.workouts.filter((w) => w.status === "pending").length;
            return waiting > 0 ? <li className="py-3 text-sm font-semibold text-warn">{waiting === 1 ? "1 økt venter" : `${waiting} økter venter`} på innsjekk</li> : null;
          })()}
          {!p.workouts.some((w) => w.checked_in_at) && <li className="py-3 text-sm text-muted">Ingen innsjekkede økter ennå – gi {first} et heiarop i Prat! 📣</li>}
        </ul>
      </section>
      <PoweredByStrava className="block pt-2 pb-4" />
    </div>
  );
}
