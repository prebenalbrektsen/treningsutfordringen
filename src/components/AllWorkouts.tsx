import Link from "next/link";
import { FeedCard } from "@/components/FeedCard";
import type { Board, Challenge } from "@/lib/challenge";
import { dayHeading, osloDate, weekStart } from "@/lib/time";

/** Everyone's checked-in workouts, newest first, grouped by day like a feed. */
export function AllWorkouts({ c, board, me }: { c: Challenge; board: Board; me: number; isAdmin?: boolean }) {
  const feed = board.members
    .flatMap((m) => m.workouts.filter((w) => w.checked_in_at).map((w) => ({ w, m })))
    .sort((a, b) => +new Date(b.w.started_at) - +new Date(a.w.started_at));
  if (!feed.length) return <p className="card p-4 text-sm text-muted">Ingen innsjekkede økter ennå. Hvem blir først?</p>;
  const days: { day: string; items: typeof feed }[] = [];
  for (const it of feed) {
    const day = osloDate(new Date(it.w.started_at));
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(it);
  }
  return (
    <div className="space-y-4">
      {days.map(({ day, items }) => (
        <section key={day}>
          <h2 className="mb-1.5 px-1 text-xs font-bold tracking-wider text-muted uppercase">{dayHeading(new Date(`${day}T12:00:00Z`))}</h2>
          <div className="space-y-3">
            {items.map(({ w, m }) => (
              <FeedCard key={w.id} w={w} who={m} me={me} c={c} task={board.tasks.get(weekStart(day, c))} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** «Mine» / «Alle» at the top of the workouts tab. */
export function WorkoutsSwitch({ all, mineLabel }: { all: boolean; mineLabel: string }) {
  const cls = (on: boolean) => `flex-1 rounded-full py-2 text-center text-sm font-semibold transition-colors ${on ? "bg-ink text-paper" : "text-muted"}`;
  return (
    <nav className="flex rounded-full bg-line/60 p-1" aria-label="Vis økter">
      <Link href="/logg" className={cls(!all)} aria-current={!all ? "page" : undefined}>{mineLabel}</Link>
      <Link href="/logg?vis=alle" className={cls(all)} aria-current={all ? "page" : undefined}>Alle</Link>
    </nav>
  );
}
