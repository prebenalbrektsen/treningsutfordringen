import Link from "next/link";
import type { Challenge, WeeklyTask, Workout } from "@/lib/challenge";
import { meetsTask, workoutCredit } from "@/lib/challenge";
import { sportIcon, sportLabel } from "@/lib/sports";
import { fmtKm } from "@/lib/stats";
import { formatMinutes, relativeTime } from "@/lib/time";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { KudosButton } from "./KudosButton";
import { RoleTag } from "./RoleTag";

type Who = { id: number; name: string; color: string; avatar_v: number | null; is_admin: boolean };

const RUNLIKE = ["Run", "TrailRun", "Walk", "Hike"];

/** One workout as a feed post: who, the photo full width, the numbers, kudos and comments. */
export function FeedCard({ w, who, c, me, task }: { w: Workout; who: Who; c: Challenge; me: number; task?: WeeklyTask }) {
  const km = w.distance_m ? w.distance_m / 1000 : 0;
  const pace = km && RUNLIKE.includes(w.sport) ? w.duration_min / km : 0;
  const facts = [
    { label: "Tid", value: formatMinutes(w.duration_min) },
    km ? { label: "Distanse", value: `${fmtKm(km)} km` } : null,
    pace ? { label: "Tempo", value: `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, "0")}` } : null,
    w.avg_hr ? { label: "Puls", value: `${w.avg_hr}` } : null,
  ].filter(Boolean).slice(0, 3) as { label: string; value: string }[];
  const credit = workoutCredit(c, w);

  return (
    // Mobile: edge to edge, like a photo feed (cancels the page's side padding). Wider screens: a card.
    <article className="-mx-4 overflow-hidden border-y border-line bg-card sm:mx-0 sm:rounded-[14px] sm:border">
      <header className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <Link href={`/person/${who.id}`}><Avatar p={who} size={38} /></Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-bold">
            <Link href={`/person/${who.id}`} className="truncate">{who.name}</Link>
            {who.is_admin && <RoleTag compact />}
          </p>
          <p className="truncate text-xs text-muted">
            {sportLabel(w.sport)} · {relativeTime(new Date(w.started_at))}{w.source === "strava" ? " · Strava" : ""}
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${who.color}1f`, color: who.color }}>
          <Icon name={sportIcon(w.sport)} label={sportLabel(w.sport)} />
        </span>
      </header>

      {w.title && <p className="px-4 pb-2.5 font-semibold">{w.title}</p>}
      {w.parts && <p className="px-4 pb-2.5 text-xs font-semibold text-muted">🔗 Slått sammen: {w.parts.map((p) => `${sportLabel(p.sport)} ${formatMinutes(p.minutes)}`).join(" + ")}</p>}

      {w.has_proof ? (
        <Link href={`/okt/${w.id}`} className="block bg-line/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/bilde/${w.id}`} alt={`Bilde fra ${who.name.split(" ")[0]} sin økt`} loading="lazy" className="aspect-[4/5] w-full object-cover sm:max-h-[560px]" />
        </Link>
      ) : null}

      <div className="grid grid-cols-3 gap-2 px-4 pt-3">
        {facts.map((f) => (
          <div key={f.label}>
            <p className="text-[10px] font-bold tracking-wider text-muted uppercase">{f.label}</p>
            <p className="display text-2xl">{f.value}</p>
          </div>
        ))}
      </div>

      {(credit > 1 || w.status === "sameday" || w.status === "short" || (task && meetsTask(w, task))) && (
        <p className="flex flex-wrap gap-1.5 px-4 pt-2 text-xs font-semibold">
          {credit > 1 && w.status === "counts" && <span className="rounded bg-ok-soft px-1.5 py-0.5 text-ok">Langøkt – teller ×{credit}</span>}
          {w.status === "sameday" && <span className="rounded bg-line px-1.5 py-0.5 text-muted">Teller ikke – maks {c.max_per_day} per dag</span>}
          {w.status === "short" && <span className="rounded bg-line px-1.5 py-0.5 text-muted">Under {c.session_minutes} min – teller ikke</span>}
          {task && meetsTask(w, task) && <span className="rounded bg-ok-soft px-1.5 py-0.5 text-ok">✓ {task.title}</span>}
        </p>
      )}

      <footer className="flex items-center gap-2 px-4 pt-3 pb-3.5">
        <KudosButton workoutId={w.id} given={w.kudos_by.includes(me)} count={w.kudos_by.length} own={w.user_id === me} />
        <Link href={`/okt/${w.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-line/60 px-3 text-sm font-semibold text-muted">
          <Icon name="comment" className="h-4 w-4" />{w.comment_count ? `${w.comment_count}` : "Kommenter"}
        </Link>
      </footer>
    </article>
  );
}
