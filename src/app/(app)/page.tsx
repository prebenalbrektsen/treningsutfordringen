import { PoweredByStrava } from "@/components/StravaBrand";
import { CelebrationsFor } from "@/components/CelebrationsFor";
import { applyJokers } from "./actions";
import { FinaleReplay, JokerInfo } from "@/components/Celebrate";
import { challengeFinale } from "@/lib/finale";
import { Count } from "@/components/Count";
import { InstallPrompt } from "@/components/InstallPrompt";
import Link from "next/link";
import { statusLabel } from "@/components/WeekProgress";
import { ClaimPaid } from "@/components/ClaimPaid";
import { WorkoutRow } from "@/components/WorkoutRow";
import { requireUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { JoinCard } from "@/components/JoinCard";
import { RoleTag } from "@/components/RoleTag";
import { activeChallenge, loadBoard, mayJoin, ruleParts, type Challenge } from "@/lib/challenge";
import { DayDots, DayLetters, Highlight, ProgressRing } from "@/components/WeekDashboard";
import { firstToFinish, personStats, rank } from "@/lib/leaderboard";
import { query } from "@/lib/db";
import { sportLabel } from "@/lib/sports";
import { addDays, formatDay, formatMinutes, formatWeekRange, fromOsloLocal, isoWeekNumber, mondayOf, osloDate } from "@/lib/time";

function timeLeft(week: string): string {
  const ms = fromOsloLocal(`${addDays(week, 7)}T00:00`).getTime() - Date.now();
  const hours = Math.floor(ms / 3600000);
  if (hours >= 48) return `${Math.floor(hours / 24)} dager igjen`;
  if (hours >= 1) return `${hours} timer igjen`;
  return `${Math.max(1, Math.floor(ms / 60000))} min igjen!`;
}

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ logget?: string }> }) {
  const user = await requireUser();
  const { logget } = await searchParams;
  const c = await activeChallenge();
  if (!c) {
    return (
      <div className="card mt-6 p-6">
        <h1 className="display text-3xl">Ingen utfordring ennå</h1>
        <p className="mt-2 text-muted">{user.is_admin ? "Opprett den første utfordringen i admin." : "Admin har ikke startet en utfordring ennå."}</p>
        {user.is_admin && <Link className="btn btn-heat mt-4" href="/admin">Til admin</Link>}
      </div>
    );
  }
  const board = await loadBoard(c, user.id);
  // Challenges coming up that this person has not signed up for (or has, and may back out of).
  // Only the ones this person may join: open ones, or ones the admin picked them for.
  const upcoming = await query<Challenge & { joined: boolean; count: number }>(
    `select c.*, exists(select 1 from challenge_members m where m.challenge_id = c.id and m.user_id = $2) as joined,
            (select count(*)::int from challenge_members m where m.challenge_id = c.id) as count
       from challenges c where c.starts_on > $1::date and c.id <> $3
        and (c.join_mode = 'open' or exists(select 1 from challenge_invites i where i.challenge_id = c.id and i.user_id = $2)
             or exists(select 1 from challenge_members m where m.challenge_id = c.id and m.user_id = $2))
      order by c.starts_on`,
    [osloDate(), user.id, c.id],
  );
  const today = osloDate();
  const week = board.weeks.includes(board.currentWeek) ? board.currentWeek : today < board.weeks[0] ? board.weeks[0] : board.weeks.at(-1)!;
  const weekIndex = board.weeks.indexOf(week);
  const task = board.tasks.get(week);
  const me = board.members.find((m) => m.id === user.id);
  const myWeek = me?.results[weekIndex];
  const allowed = !me && (await mayJoin(c, user.id));
  const pendingUsers = user.is_admin ? (await query<{ n: number }>("select count(*)::int as n from users where not approved"))[0].n : 0;
  // The admin can paste the bøtekasse's Vipps link; then paying is one tap that opens the Vipps app.
  const vippsLink = /^https:\/\/\S+$/.test(c.vipps_info?.trim() ?? "") ? c.vipps_info!.trim() : null;
  const owedWeeks = me?.results.filter((r) => r.fine === "owed").map((r) => r.week) ?? [];
  // Owed weeks that the person's jokers could fully cover (and where the weekly task was done).
  const jokerWeeks = (me?.results ?? [])
    .filter((r) => r.fine === "owed" && r.taskMet)
    .map((r) => ({ week: r.week, missing: c.min_sessions - r.qualifying }))
    .filter((x) => x.missing > 0 && x.missing <= (me?.jokers.held ?? 0));
  const started = today >= c.starts_on;
  const over = today > c.ends_on;
  const finale = over ? await challengeFinale(board, user.id) : null;

  const potPaid = board.members.reduce((s, m) => s + m.paidKr, 0);
  const potOpen = board.members.reduce((s, m) => s + m.owedKr + m.claimedKr, 0);
  const myPending = me?.results.reduce((n, r) => n + r.pending, 0) ?? 0;
  // Only checked-in workouts are part of the challenge, so only they go in the shared feed.
  const feed = board.members
    .flatMap((m) => m.workouts.filter((w) => w.checked_in_at).map((w) => ({ w, m })))
    .sort((a, b) => +new Date(b.w.started_at) - +new Date(a.w.started_at))
    .slice(0, 5);

  // The week's leaderboard and highlights.
  const weekStats = await personStats(c, board, "uke");
  const topMinutes = rank(weekStats, "minutter").filter((x) => x.value > 0).slice(0, 3);
  const longest = weekStats.filter((p) => p.longest).sort((a, b) => b.longest!.duration_min - a.longest!.duration_min)[0];
  const mostKudos = rank(weekStats, "kudos").find((x) => x.value > 0);
  const firstId = await firstToFinish(c, week);
  const first = board.members.find((m) => m.id === firstId);

  // «Til deg»: kudos and comments others gave on your workouts since you last looked.
  const toYou = (await query<{ kudos: number; comments: number }>(
    `select (select count(*)::int from kudos k join workouts w on w.id = k.workout_id
              where w.user_id = $1 and k.user_id <> $1 and k.created_at > u.activity_seen_at) as kudos,
            (select count(*)::int from comments m join workouts w on w.id = m.workout_id
              where w.user_id = $1 and m.user_id <> $1 and m.created_at > u.activity_seen_at) as comments
       from users u where u.id = $1`,
    [user.id],
  ))[0];

  const ranked = board.members
    .map((m) => ({ m, r: m.results[weekIndex] }))
    .sort((a, b) => Number(b.r.passed) - Number(a.r.passed) || b.r.qualifying - a.r.qualifying || b.r.minutes - a.r.minutes);
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div className="stagger space-y-4 pt-2">
      <CelebrationsFor c={c} board={board} userId={user.id} />
      {logget && <p className="rounded-xl bg-ok-soft px-4 py-3 font-semibold text-ok">Økta er registrert. Sterkt! 💪</p>}

      {pendingUsers > 0 && (
        <Link href="/admin?fane=deltakere" className="block rounded-2xl border-2 border-heat bg-card p-4">
          <p className="font-bold">{pendingUsers === 1 ? "1 person venter" : `${pendingUsers} personer venter`} på godkjenning</p>
          <p className="text-sm text-muted">Kom inn via fellesinvitasjonen – godkjenn under Admin →</p>
        </Link>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-3 text-sm font-semibold text-muted">
          <span className="truncate">{c.name}</span>
          <span className="shrink-0">{weekIndex + 1}/{board.weeks.length} uker</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-ink" style={{ width: `${((weekIndex + 1) / board.weeks.length) * 100}%` }} /></div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <h1 className="display text-5xl">Uke {isoWeekNumber(week)}</h1>
          <p className="pb-1 text-right text-sm text-muted">
            {formatWeekRange(week)}<br />
            {over ? "Ferdig 🎉" : !started ? `Starter ${formatDay(c.starts_on)}` : <strong className="text-ink">{timeLeft(week)}</strong>}
          </p>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Reglene</summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ruleParts(c).map((r) => <li key={r} className="rounded-full bg-line/70 px-2.5 py-1 text-xs font-semibold">{r}</li>)}
          </ul>
        </details>
        {finale && <div className="mt-4"><FinaleReplay finale={finale} /></div>}
      </section>

      {me && myWeek && myWeek.state !== "before" && (
        <section className="card p-4">
          <div className="flex items-center gap-4">
            <ProgressRing c={c} r={myWeek} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold tracking-wider text-muted uppercase">Din uke</p>
              <p className="display mt-0.5 text-2xl">
                {myWeek.passed ? "I boks!" : myWeek.volumeMet ? "Mangler ukeskravet" : `${Math.max(0, c.min_sessions - myWeek.qualifying)} økt${c.min_sessions - myWeek.qualifying === 1 ? "" : "er"} igjen`}
              </p>
              <div className="mt-2"><DayDots c={c} r={myWeek} week={week} /></div>
            </div>
          </div>
          {myWeek.hasLong && <p className="mt-2 text-xs text-muted">Langøkt teller ×{c.long_session_counts}.</p>}
          {me.jokers.enabled && (
            <JokerInfo held={me.jokers.held} max={me.jokers.max} every={me.jokers.every}>
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted underline decoration-dotted underline-offset-2">
                🃏 {me.jokers.held} av maks {me.jokers.max} jokere på lur
              </span>
            </JokerInfo>
          )}
          {task && <p className="mt-1 text-xs text-muted">Ukeskrav «{task.title}»: {myWeek.taskMet ? "✓ oppfylt" : "ikke ennå"}</p>}
          {myPending > 0 ? (
            <Link href="/logg" className="btn btn-heat mt-3 w-full">Sjekk inn {myPending === 1 ? "økta" : `${myPending} økter`} {c.check_in_hours ? `(innen ${c.check_in_hours} t)` : ""}</Link>
          ) : myWeek.state !== "done" && !myWeek.passed ? (
            <Link href="/logg" className="btn btn-heat mt-3 w-full">{user.strava_athlete_id ? "Se øktene dine" : "Logg en økt"}</Link>
          ) : null}
        </section>
      )}
      {me && myWeek?.state === "before" && <p className="card p-4 text-sm text-muted">Du er med fra neste uke. Øktene du gjør nå kommer med i statistikken.</p>}

      {toYou && toYou.kudos + toYou.comments > 0 && (
        <Link href="/til-deg" className="flex items-center justify-between gap-3 rounded-2xl bg-heat-soft p-4">
          <span className="font-bold">
            Til deg: {toYou.kudos > 0 && `${toYou.kudos} 🔥`}{toYou.kudos > 0 && toYou.comments > 0 && " og "}{toYou.comments > 0 && `${toYou.comments} ${toYou.comments === 1 ? "kommentar" : "kommentarer"}`}
          </span>
          <span className="text-sm font-semibold text-muted">Se →</span>
        </Link>
      )}

      {owedWeeks.length > 0 && (
        <section className="rounded-2xl bg-bad p-4 text-white">
          <p className="display text-3xl">Du skylder {owedWeeks.length * c.penalty_kr} kr</p>
          <p className="mt-1 text-sm opacity-90">
            For {owedWeeks.map((w) => `uke ${isoWeekNumber(w)}`).join(", ")}.
            {vippsLink ? " Betal i Vipps, og trykk så «Jeg har betalt»." : c.vipps_info ? ` Vipps til ${c.vipps_info}.` : " Vipps til bøtekassa."}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {jokerWeeks.length > 0 && (
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-sm font-semibold">Du har {me!.jokers.held} {me!.jokers.held === 1 ? "joker" : "jokere"} 🃏 – de kan fylle økter du manglet:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {jokerWeeks.map(({ week: w, missing }) => (
                    <form key={w} action={applyJokers.bind(null, w)}>
                      <button className="btn btn-sm bg-paper text-ink">Bruk {missing === 1 ? "1 joker" : `${missing} jokere`} – uke {isoWeekNumber(w)} i boks</button>
                    </form>
                  ))}
                </div>
              </div>
            )}
            {vippsLink && (
              <a href={vippsLink} target="_blank" rel="noopener noreferrer" className="btn w-full bg-[#ff5b24] text-white">
                Betal {owedWeeks.length * c.penalty_kr} kr med Vipps
              </a>
            )}
            <ClaimPaid weeks={owedWeeks} />
          </div>
        </section>
      )}
      {me && me.claimedKr > 0 && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">{me.claimedKr} kr meldt betalt – venter på at kontrolløren bekrefter.</p>
      )}

      {!me && (allowed
        ? <JoinCard c={c} joined={false} count={board.members.length} />
        : <p className="card p-4 text-sm text-muted">Du er ikke med i {c.name}. Vil du være med, si fra til kontrolløren.</p>)}

      {task && (
        <section className="rounded-2xl bg-ink px-4 py-3 text-paper">
          <p className="text-xs font-bold tracking-wider text-heat uppercase">Ukas ekstrakrav</p>
          <p className="display mt-0.5 text-xl">{task.title}</p>
          <p className="mt-1 text-sm">
            {task.description ? `${task.description} ` : ""}
            {task.auto_sports.length > 0 && `${task.auto_sports.map(sportLabel).join(", ")} teller automatisk.`}
          </p>
        </section>
      )}

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-bold">Uka på et blikk</h2>
          <DayLetters week={week} />
        </div>
        <ul className="divide-y divide-line">
          {ranked.map(({ m, r }) => {
            const st = statusLabel(c, r);
            return (
              <li key={m.id} className="flex items-center gap-2.5 py-2">
                <Avatar p={m} size={28} />
                <Link href={`/person/${m.id}`} className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><span className="truncate">{m.name.split(" ")[0]}</span>{m.is_admin && <RoleTag compact />}</span>
                  <span className={`text-xs font-semibold ${st.tone === "ok" ? "text-ok" : st.tone === "bad" ? "text-bad" : st.tone === "warn" ? "text-warn" : "text-muted"}`}>{st.text}</span>
                </Link>
                <DayDots c={c} r={r} week={week} size="sm" />
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted">Fylt prikk = økt som teller · «2» = langøkt · ring = venter på innsjekk</p>
      </section>

      {(topMinutes.length > 0 || first || longest) && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold">Ukas tavle</h2>
            <Link href="/statistikk" className="text-sm font-semibold text-muted">Alle tavler →</Link>
          </div>
          {topMinutes.length > 0 && (
            <ol className="card divide-y divide-line px-4">
              {topMinutes.map(({ p, text }, i) => (
                <li key={p.m.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-lg">{medal[i]}</span>
                  <Avatar p={p.m} size={28} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.m.name.split(" ")[0]}</span>
                  <span className="font-semibold">{text}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(105px,1fr))] gap-2">
            {first && <Highlight label="Først i boks" who={first.name.split(" ")[0]} value="🏁 uka er i boks" href={`/person/${first.id}`} />}
            {longest?.longest && <Highlight label="Lengste økt" who={longest.m.name.split(" ")[0]} value={`${formatMinutes(longest.longest.duration_min)} ${sportLabel(longest.longest.sport).toLowerCase()}`} href={`/okt/${longest.longest.id}`} />}
            {mostKudos && <Highlight label="Mest heia på" who={mostKudos.p.m.name.split(" ")[0]} value={mostKudos.text} href={`/person/${mostKudos.p.m.id}`} />}
          </div>
        </section>
      )}

      <InstallPrompt variant="banner" />

      {upcoming.map((u) => <JoinCard key={u.id} c={u} joined={u.joined} count={u.count} />)}

      <section className="card p-4">
        <h2 className="font-bold">Siste økter</h2>
        {feed.length ? (
          <>
            <ul className="divide-y divide-line">
              {feed.map(({ w, m }) => (
                <WorkoutRow key={w.id} w={w} who={m} me={user.id} c={c} task={board.tasks.get(mondayOf(osloDate(new Date(w.started_at))))} />
              ))}
            </ul>
            <Link href="/logg?vis=alle" className="btn btn-ghost mt-2 w-full">Se alle økter</Link>
          </>
        ) : (
          <p className="py-4 text-sm text-muted">Ingen økter ennå. Hvem blir først?</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">Betalt inn</p>
          <p className="display mt-1 text-3xl"><Count value={potPaid} suffix=" kr" /></p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">Ikke betalt ennå</p>
          <p className={`display mt-1 text-3xl ${potOpen ? "text-bad" : ""}`}><Count value={potOpen} suffix=" kr" /></p>
        </div>
      </section>
      <PoweredByStrava className="block pt-2 pb-4" />
    </div>
  );
}
