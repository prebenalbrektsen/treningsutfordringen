import { PoweredByStrava } from "@/components/StravaBrand";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { notFound } from "next/navigation";
import { effectivePrefs, redact, type ShareState } from "@/lib/sharing";
import { Avatar } from "@/components/Avatar";
import { CheckIn } from "@/components/CheckIn";
import { RoleTag } from "@/components/RoleTag";
import { CommentForm } from "@/components/CommentForm";
import { requireUser } from "@/lib/auth";
import { activeChallenge, annotate, checkInDeadline, WORKOUT_COLUMNS, type Workout, applyVerdicts } from "@/lib/challenge";
import { one, query } from "@/lib/db";
import { sportIcon, sportLabel } from "@/lib/sports";
import { fmtKm } from "@/lib/stats";
import { ago, formatMinutes, osloDate, relativeTime, weekStart } from "@/lib/time";
import { deleteComment } from "../../actions";
import { KudosButton } from "@/components/KudosButton";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await one<Workout & ShareState & { name: string; color: string }>(
    `select ${WORKOUT_COLUMNS.replace(/\bid,/, "workouts.id,")}, u.name, u.color,
            u.share_distance, u.share_elevation, u.share_hr, u.share_title, u.strava_athlete_id::text, u.strava_consent_at
       from workouts join users u on u.id = workouts.user_id where workouts.id = $1`,
    [Number(id)],
  );
  // Nothing is shared until the owner checks it in, not even by guessing the address.
  if (!row || (!row.checked_in_at && row.user_id !== user.id)) notFound();
  // Only people in the group you're viewing: someone else's group's workouts aren't yours to see.
  if (row.user_id !== user.id && !(await one("select 1 from group_members where group_id = $1 and user_id = $2 and approved", [user.group_id, row.user_id]))) notFound();
  await applyVerdicts(user.group_id, [row]);
  const w = row.user_id === user.id ? row : redact(row, effectivePrefs(row));
  const c = await activeChallenge(user.group_id);
  // The status depends on the person's other workouts that day (one per day counts).
  if (c) {
    const week = await query<Workout>(
      `select ${WORKOUT_COLUMNS} from workouts where user_id = $1
         and started_at >= ($2::date)::timestamp at time zone 'Europe/Oslo' and started_at < ($2::date + 7)::timestamp at time zone 'Europe/Oslo'`,
      [w.user_id, weekStart(osloDate(new Date(w.started_at)), c)],
    );
    await applyVerdicts(user.group_id, week);
    w.status = annotate(c, week).find((x) => x.id === w.id)?.status;
  }
  const [comments, kudosNames] = await Promise.all([
    query<{ id: number; user_id: number; name: string; color: string; avatar_v: number | null; is_admin: boolean; body: string; created_at: Date }>(
      `select c.id, c.user_id, u.name, u.color, extract(epoch from u.avatar_updated_at)::int as avatar_v, gm.role = 'admin' as is_admin, c.body, c.created_at
         from comments c join users u on u.id = c.user_id left join group_members gm on gm.group_id = c.group_id and gm.user_id = c.user_id
        where c.workout_id = $1 and c.group_id = $2 order by c.created_at`,
      [w.id, user.group_id],
    ),
    query<{ name: string; user_id: number }>("select u.name, k.user_id from kudos k join users u on u.id = k.user_id where k.workout_id = $1 and k.group_id = $2 order by k.created_at", [w.id, user.group_id]),
  ]);
  w.kudos_by = kudosNames.map((k) => k.user_id);
  w.comment_count = comments.length;
  const mine = w.user_id === user.id;
  const facts = [
    ["Varighet", formatMinutes(w.duration_min)],
    w.distance_m ? ["Distanse", `${fmtKm(w.distance_m / 1000)} km`] : null,
    w.distance_m && ["Run", "TrailRun", "Walk", "Hike"].includes(w.sport)
      ? ["Tempo", (() => { const pace = w.duration_min / (w.distance_m! / 1000); return `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, "0")} /km`; })()]
      : null,
    w.avg_hr ? ["Snittpuls", `${w.avg_hr} bpm`] : null,
    w.elevation_m ? ["Høydemeter", `${w.elevation_m} m`] : null,
  ].filter(Boolean) as [string, string][];

  return (
    <div className="space-y-4 pt-2">
      <BackLink />
      <section>
        <Link href={`/person/${w.user_id}`} className="font-bold" style={{ color: w.color }}>{w.name}</Link>
        <h1 className="display mt-1 flex items-center gap-2 text-4xl"><Icon name={sportIcon(w.sport)} className="h-8 w-8 shrink-0" />{w.title || sportLabel(w.sport)}</h1>
        <p className="mt-1 text-sm text-muted">{w.title ? `${sportLabel(w.sport)} · ` : ""}{relativeTime(new Date(w.started_at))} · {w.source === "strava" ? "fra Strava" : "logget manuelt"}</p>
      </section>

      {c && w.status && w.status !== "counts" && (
        <section className={`rounded-2xl p-4 ${w.status === "pending" ? "bg-warn-soft text-warn" : w.status === "rejected" ? "bg-bad-soft text-bad" : "bg-line/60 text-muted"}`}>
          <p className="font-bold">
            {{
              pending: `Venter på innsjekk – frist ${relativeTime(checkInDeadline(c, w))}`,
              expired: "Ikke sjekket inn i tide – teller ikke",
              short: `Under ${c.session_minutes} min – teller ikke som ukeøkt`,
              sameday: `Teller ikke – maks ${c.max_per_day} økt${c.max_per_day === 1 ? "" : "er"} per dag`,
              rejected: `Underkjent av ${user.admin_title} – teller ikke`,
              merged: "Slått sammen med økta før – telles og sjekkes inn der",
            }[w.status]}
          </p>
          {w.status === "pending" && mine && <p className="mt-1 text-sm">{c.proof_required ? "Legg ved et bilde for å sjekke inn." : "Trykk «Sjekk inn» så teller den."}</p>}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="card p-3">
            <p className="text-xs font-bold tracking-wider text-muted uppercase">{label}</p>
            <p className="display mt-1 text-2xl">{value}</p>
          </div>
        ))}
      </section>

      {w.has_proof && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/bilde/${w.id}`} alt="Dokumentasjon" className="w-full rounded-2xl border border-line" />
      )}
      {w.source === "strava" && w.strava_id && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href={`https://www.strava.com/activities/${w.strava_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#FC5200] underline">View on Strava</a>
          <PoweredByStrava />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {w.checked_in_at && <KudosButton workoutId={w.id} given={w.kudos_by.includes(user.id)} count={w.kudos_by.length} own={mine} big />}
        {kudosNames.length > 0 && <span className="text-sm text-muted">fra {kudosNames.map((k) => k.name).join(", ")}</span>}
        {(mine || user.is_admin) && <CheckIn workoutId={w.id} checkedIn={!!w.checked_in_at} hasPhoto={w.has_proof} proofRequired={c?.proof_required ?? true} />}
      </div>

      <section className="card p-4">
        <h2 className="mb-2 font-bold">Kommentarer</h2>
        <ul className="mb-3 space-y-3">
          {comments.map((cm) => (
            <li key={cm.id} className="flex gap-2.5 text-sm">
              <Avatar p={{ id: cm.user_id, name: cm.name, color: cm.color, avatar_v: cm.avatar_v }} size={28} />
              <div className="min-w-0 flex-1">
              <span className="font-bold" style={{ color: cm.color }}>{cm.name}</span>{cm.is_admin && <> <RoleTag title={user.admin_title} /></>}{" "}
              <span className="text-xs text-muted">{ago(new Date(cm.created_at))}</span>
              <p className="whitespace-pre-wrap">{cm.body}</p>
              {(cm.user_id === user.id || user.is_admin) && (
                <form action={deleteComment.bind(null, cm.id)}><button className="text-xs text-muted underline">Slett</button></form>
              )}
              </div>
            </li>
          ))}
          {!comments.length && <li className="text-sm text-muted">Ingen kommentarer ennå.</li>}
        </ul>
        <CommentForm workoutId={w.id} />
      </section>
    </div>
  );
}
