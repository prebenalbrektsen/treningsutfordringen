import { CelebrationsFor } from "@/components/CelebrationsFor";
import { ConnectWithStrava, PoweredByStrava } from "@/components/StravaBrand";
import { LogForm } from "@/components/LogForm";
import { SyncButton } from "@/components/SyncButton";
import { WorkoutRow } from "@/components/WorkoutRow";
import { requireUser } from "@/lib/auth";
import { AllWorkouts, WorkoutsSwitch } from "@/components/AllWorkouts";
import { activeChallenge, annotate, evaluateWeek, loadBoard, WORKOUT_COLUMNS, type WeeklyTask, type Workout } from "@/lib/challenge";
import { Pill, statusLabel, WeekProgress } from "@/components/WeekProgress";
import { WatchGuide } from "@/components/WatchGuide";
import { Icon } from "@/components/Icon";
import { one, query } from "@/lib/db";
import { stravaConfigured } from "@/lib/strava";
import { addDays, ago, mondayOf, osloDate, toOsloLocalInput } from "@/lib/time";

export default async function LogPage({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const user = await requireUser();
  const c = await activeChallenge(user.group_id);
  if (!c) return <p className="pt-6 text-muted">Ingen utfordring er i gang.</p>;
  const mineLabel = user.strava_athlete_id ? "Mine" : "Logg ny";

  // «Alle»: everyone's checked-in workouts, grouped by day.
  if ((await searchParams).vis === "alle") {
    const board = await loadBoard(c, user.id);
    return (
      <div className="space-y-4 pt-2">
        <h1 className="display text-5xl">Økter</h1>
        <WorkoutsSwitch all mineLabel={mineLabel} />
        <AllWorkouts c={c} board={board} me={user.id} isAdmin={user.is_admin} />
      </div>
    );
  }
  const week = mondayOf(osloDate());
  const task = await one<WeeklyTask>("select id, week_start, title, description, auto_sports from weekly_tasks where challenge_id = $1 and week_start = $2", [c.id, week]);
  const form = (
    <LogForm
      today={osloDate()}
      yesterday={addDays(osloDate(), -1)}
      nowTime={toOsloLocalInput(new Date()).slice(11)}
      task={task ? { title: task.title, auto: task.auto_sports } : null}
      sessionMinutes={c.session_minutes}
      proofRequired={c.proof_required}
    />
  );

  // On Strava: the watch does the logging, the participant checks each workout in (with a
  // photo) so it counts. Typing a workout in is the exception.
  if (user.strava_athlete_id) {
    const recent = annotate(c, await query<Workout>(
      `select ${WORKOUT_COLUMNS} from workouts
        where user_id = $1 and started_at >= ($2::date)::timestamp at time zone 'Europe/Oslo'
        order by started_at desc`,
      [user.id, week],
    ));
    const result = { ...evaluateWeek(c, week, recent, task ?? undefined), fine: null };
    // Waiting for check-in first: that is the thing to do on this screen.
    recent.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
    const celebrationBoard = await loadBoard(c, user.id);
    return (
      <div className="space-y-4 pt-2">
        <CelebrationsFor c={c} board={celebrationBoard} userId={user.id} />
        <h1 className="display text-5xl">Økter</h1>
        <WorkoutsSwitch all={false} mineLabel={mineLabel} />
        <section className="card p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-line/70"><Icon name="pulse" /></span>
            <p className="text-sm">
              <strong>Øktene kommer fra Strava.</strong> Tid, distanse og puls hentes fra klokka – men du må <strong>sjekke inn</strong> hver økt{c.proof_required ? " med et bilde" : ""}{c.check_in_hours ? ` innen ${c.check_in_hours} timer` : " før uka er over"}, ellers teller den ikke.
              {user.strava_synced_at && <span className="text-muted"> Hentet {ago(new Date(user.strava_synced_at))}.</span>}
            </p>
          </div>
          <div className="mt-3"><SyncButton /></div>
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">Denne uka</h2>
            <Pill tone={statusLabel(c, result).tone}>{statusLabel(c, result).text}</Pill>
          </div>
          <div className="mt-3 mb-1"><WeekProgress c={c} r={result} /></div>
          {recent.length ? (
            <ul className="divide-y divide-line">
              {recent.map((w) => (
                <WorkoutRow key={w.id} w={w} c={c} me={user.id} task={task ?? undefined} canEdit isAdmin={user.is_admin} />
              ))}
            </ul>
          ) : (
            <p className="py-3 text-sm text-muted">Ingen økter ennå denne uka. Har du trent nylig, trykk «Hent nye økter nå».</p>
          )}
        </section>

        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">Trente du uten klokke?</summary>
          <p className="mt-2 mb-4 text-sm text-muted">Registrer økta her med et bilde som dokumentasjon. Dukker den opp på Strava senere, slås de sammen automatisk.</p>
          {form}
        </details>
        <WatchGuide />
        <div className="flex justify-center pb-2"><PoweredByStrava /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <h1 className="display text-5xl">Logg økt</h1>
      <WorkoutsSwitch all={false} mineLabel={mineLabel} />
      {stravaConfigured() && (
        <section className="card p-4">
          <p className="display text-2xl">Slipp å taste inn</p>
          <p className="mt-1 mb-3 text-sm text-muted">Koble til Strava, så kommer øktene fra Garmin, Apple Watch og andre klokker inn av seg selv – med tid, distanse og puls. Du sjekker dem bare inn med et bilde.</p>
          <ConnectWithStrava />
        </section>
      )}
      {stravaConfigured() && <WatchGuide />}
      <div className="card p-4">
        {stravaConfigured() && <h2 className="mb-3 font-bold">…eller registrer manuelt</h2>}
        {form}
      </div>
    </div>
  );
}
