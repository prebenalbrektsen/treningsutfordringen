import Link from "next/link";
import { ConfirmAction } from "@/components/ConfirmAction";
import { CelebrationsFor } from "@/components/CelebrationsFor";
import { PushSettings } from "@/components/PushSettings";
import { CATEGORIES } from "@/lib/push";
import { Badges, badgesFor, Records, WeeklyChart } from "@/components/Profile";
import { firstFinishCounts, personStats } from "@/lib/leaderboard";
import { ConnectWithStrava, PoweredByStrava } from "@/components/StravaBrand";
import { logout } from "@/app/auth-actions";
import { stravaDisconnect } from "../actions";
import { AvatarUpload } from "@/components/AvatarUpload";
import { StatTiles } from "@/components/StatTiles";
import { one, query } from "@/lib/db";
import { SyncButton } from "@/components/SyncButton";
import { Pill, statusLabel, WeekProgress } from "@/components/WeekProgress";
import { WorkoutRow } from "@/components/WorkoutRow";
import { requireUser } from "@/lib/auth";
import { activeChallenge, loadBoard, ruleParts } from "@/lib/challenge";
import { computeStats } from "@/lib/stats";
import { stravaConfigured } from "@/lib/strava";
import { ago, formatWeekRange, isoWeekNumber, osloDate, weekStart } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/ActionForm";
import { WatchGuide } from "@/components/WatchGuide";
import { changePassword, deletePasskey, renameMe } from "../actions";
import { AddPasskey } from "@/components/Passkeys";

const STRAVA_MSG: Record<string, [string, string]> = {
  ok: ["Strava er koblet til og øktene dine er hentet. 🎉", "text-ok bg-ok-soft"],
  feil: ["Noe gikk galt med Strava-tilkoblingen. Prøv igjen.", "text-bad bg-bad-soft"],
  tilgang: ["Du må gi tilgang til å lese aktiviteter for at det skal virke.", "text-bad bg-bad-soft"],
  mangler: ["Strava er ikke satt opp i appen ennå – si fra til admin.", "text-warn bg-warn-soft"],
  deling: ["Lagret. Gruppa ser bare det du har valgt.", "text-ok bg-ok-soft"],
  frakoblet: ["Strava er koblet fra. Du kan fortsatt logge økter selv.", "text-ok bg-ok-soft"],
};

export default async function MePage({ searchParams }: { searchParams: Promise<{ strava?: string; n?: string; b?: string }> }) {
  const user = await requireUser();
  const { strava, n, b } = await searchParams;
  const prefs = (await one<{ notify: Record<string, boolean> }>("select notify from users where id = $1", [user.id]))!.notify;
  const categories = Object.fromEntries(Object.entries(CATEGORIES).filter(([k]) => k !== "admin" || user.is_admin));
  const passkeys = await query<{ id: number; name: string; last_used_at: Date | null; created_at: Date }>(
    "select id, name, last_used_at, created_at from passkeys where user_id = $1 order by created_at", [user.id]);
  const avatarV = (await one<{ v: number | null }>("select extract(epoch from avatar_updated_at)::int as v from users where id = $1", [user.id]))!.v;
  const c = await activeChallenge(user.group_id);
  const board = c ? await loadBoard(c, user.id) : null;
  const me = board?.members.find((m) => m.id === user.id);
  const stats = computeStats(me?.workouts ?? []);
  const myStats = c && board && me ? (await personStats(c, board, "alt")).find((x) => x.m.id === me.id) ?? null : null;
  const firsts = c ? await firstFinishCounts(c) : new Map<number, number>();
  const passed = me?.results.filter((r) => r.state === "done" && r.passed).length ?? 0;
  const done = me?.results.filter((r) => r.state === "done").length ?? 0;

  return (
    <div className="space-y-5 pt-2">
      {c && board && <CelebrationsFor c={c} board={board} userId={user.id} />}
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <AvatarUpload p={{ id: user.id, name: user.name, color: user.color, avatar_v: avatarV }} />
          <h1 className="display line-clamp-2 text-4xl break-words sm:text-5xl">{user.name}</h1>
        </div>
      </div>
      {strava === "slettet" && (
        <p className="rounded-xl bg-ok-soft px-4 py-3 font-semibold text-ok">
          Strava er koblet fra og dataene dine derfra er slettet: {n ?? 0} økter fjernet{Number(b) > 0 ? `, ${b} innsjekkede beholder bare sport, dag og varighet` : ""}.
        </p>
      )}
      {strava && STRAVA_MSG[strava] && <p className={`rounded-xl px-4 py-3 font-semibold ${STRAVA_MSG[strava][1]}`}>{STRAVA_MSG[strava][0]}</p>}

      <section className="card p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-line/70"><Icon name="pulse" /></span>
          <div className="flex-1">
            <h2 className="font-bold">Strava</h2>
            <p className="text-sm text-muted">
              {user.strava_athlete_id
                ? `Koblet til${user.strava_synced_at ? ` · hentet ${ago(new Date(user.strava_synced_at))}` : ""}`
                : "Garmin, Apple Watch, Polar, Suunto og Wahoo kan synke til Strava – da kommer øktene hit av seg selv."}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.strava_athlete_id ? (
            <>
              <SyncButton />
              <Link href="/strava-deling" className="btn btn-ghost btn-sm">Hva deles?</Link>
              <ConfirmAction action={stravaDisconnect} className="btn btn-ghost btn-sm" label="Koble fra" title="Koble fra Strava?" confirm="Ja, koble fra og slett">
                <p>Alt vi har hentet fra Strava slettes med en gang, og nye økter kommer ikke inn lenger.</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li><strong>Økter du ikke har sjekket inn</strong> forsvinner helt.</li>
                  <li><strong>Innsjekkede økter</strong> blir stående med bare sport, dag, varighet og bildet ditt, så ukene dine fortsatt stemmer. Distanse, puls, høydemeter og navn fjernes.</li>
                </ul>
                <p className="text-muted">Du kan koble til igjen senere – da hentes øktene på nytt fra Strava.</p>
              </ConfirmAction>
              <PoweredByStrava className="mt-1 block w-full" />
            </>
          ) : stravaConfigured() ? (
            <ConnectWithStrava />
          ) : (
            <p className="text-sm text-warn">Strava er ikke satt opp i appen ennå.</p>
          )}
        </div>
      </section>

      {c && me && (
        <>
          <section>
            {myStats && (
              <div className="mb-5 space-y-4">
                <Records p={myStats} />
                <WeeklyChart c={c} m={me} />
                <Badges badges={badgesFor(myStats, c, firsts.get(me.id) ?? 0)} />
              </div>
            )}
            <h2 className="mb-2 font-bold">Totalt i {c.name}</h2>
            <p className="mb-3 text-sm text-muted">{passed} av {done} ferdige uker i boks · lengste økt {stats.longest} min · betalt {me.paidKr} kr</p>
            <StatTiles s={stats} />
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-bold">Ukene dine</h2>
            <ul className="divide-y divide-line">
              {me.results.filter((r) => r.state !== "future").reverse().map((r) => {
                const s = statusLabel(c, r);
                return (
                  <li key={r.week} className="flex items-center gap-3 py-2.5">
                    <div className="w-24 shrink-0">
                      <p className="font-semibold">Uke {isoWeekNumber(r.week)}</p>
                      <p className="text-xs text-muted">{formatWeekRange(r.week)}</p>
                    </div>
                    <div className="flex-1"><WeekProgress c={c} r={r} small /></div>
                    <Pill tone={s.tone}>{s.text}</Pill>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="font-bold">Øktene dine</h2>
            {me.workouts.length ? (
              <ul className="divide-y divide-line">
                {me.workouts.map((w) => {
                  const week = weekStart(osloDate(new Date(w.started_at)), c);
                  return <WorkoutRow key={w.id} w={w} me={user.id} task={board!.tasks.get(week)} c={c} canEdit={week === board!.currentWeek || user.is_admin} isAdmin={user.is_admin} />;
                })}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted">Ingen økter ennå.</p>
            )}
          </section>
        </>
      )}
      {!user.strava_athlete_id && stravaConfigured() && <WatchGuide />}

      {c && (
        <section className="card p-4">
          <h2 className="mb-2 font-bold">Reglene i {c.name}</h2>
          <ul className="flex flex-wrap gap-1.5">
            {ruleParts(c).map((r) => <li key={r} className="rounded-full bg-line/70 px-2.5 py-1 text-xs font-semibold">{r}</li>)}
          </ul>
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Varsler</h2>
        <p className="text-sm text-muted">Få beskjed på telefonen om kudos, innsjekk og når uka holder på å glippe. Velg selv hva du vil ha.</p>
        <PushSettings categories={categories} prefs={prefs} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Logg inn med Face ID</h2>
        <p className="text-sm text-muted">Slå det på én gang per telefon eller PC – så logger du inn med ansiktet eller fingeren i stedet for passord.</p>
        {passkeys.length > 0 && (
          <ul className="divide-y divide-line">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span><strong>{p.name}</strong><span className="text-muted"> · {p.last_used_at ? `brukt ${ago(new Date(p.last_used_at))}` : `lagt til ${ago(new Date(p.created_at))}`}</span></span>
                <form action={deletePasskey.bind(null, p.id)}><button className="text-xs text-muted underline">Fjern</button></form>
              </li>
            ))}
          </ul>
        )}
        <AddPasskey label={passkeys.length ? "Legg til denne enheten også" : "Slå på Face ID / Touch ID på denne enheten"} />
      </section>

      <section className="card space-y-5 p-4">
        <h2 className="font-bold">Innstillinger</h2>
        <ActionForm action={renameMe} submit="Lagre navn" className="space-y-3">
          <label className="block"><span className="label">Navn (vises for de andre)</span><input name="name" className="field" defaultValue={user.name} maxLength={40} required /></label>
        </ActionForm>
        <ActionForm action={changePassword} submit="Bytt passord" className="space-y-3">
          <label className="block"><span className="label">Nåværende passord</span><input name="current" type="password" autoComplete="current-password" className="field" required /></label>
          <label className="block"><span className="label">Nytt passord (minst 8 tegn)</span><input name="next" type="password" autoComplete="new-password" minLength={8} className="field" required /></label>
        </ActionForm>
      </section>

      {user.is_sysadmin && <p className="text-center text-sm"><Link href="/system" className="font-semibold underline">System – alle grupper</Link></p>}
      <p className="text-center text-sm"><Link href="/personvern" className="font-semibold text-muted underline">Personvern og vilkår</Link></p>
      <form action={logout} className="pb-4 text-center"><button className="text-sm font-semibold text-muted underline">Logg ut</button></form>
    </div>
  );
}
