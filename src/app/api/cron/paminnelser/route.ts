import { activeChallenge, applyVerdicts, checkInDeadline, loadBoard, evaluateWeek, firstCountedWeek, WORKOUT_COLUMNS, type WeeklyTask, type Workout } from "@/lib/challenge";
import { query } from "@/lib/db";
import { movedNotice } from "@/lib/moved";
import { everyone, once, push } from "@/lib/push";
import { sportLabel } from "@/lib/sports";
import { addDays, osloDate, weekdayOf, weekStart } from "@/lib/time";

// Scheduled reminders (vercel.json runs this a few times a day, never at night):
// - a workout's check-in deadline is coming up within 4 hours
// - the evening of the week's last day: your week isn't in the bag yet
// Each reminder is sent once (push_sent). Vercel signs the call with CRON_SECRET; without it set, nothing runs.

const osloHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "numeric", hourCycle: "h23" }).format(new Date()));

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Nei", { status: 401 });
  }
  // The Strava diagnostics log is only for troubleshooting: keep 30 days (data minimisation).
  await query("delete from strava_events where created_at < now() - interval '30 days'");
  // One-time heads-up about the new address (see lib/moved.ts), sent to every phone, whatever its settings.
  if (movedNotice() && (await once("moved:treningsutfordring"))) {
    await push(await everyone(), "test", {
      title: "📣 Ny adresse: treningsutfordring.vercel.app",
      body: "Appen heter nå Treningsutfordring. Logg inn med passord, og legg appen på hjemskjermen på nytt.",
      url: "/login",
      tag: "moved",
    });
  }
  // Each group runs its own challenge; reminders go out per group.
  let sent = 0;
  const groups = await query<{ id: number }>("select id from groups where disabled_at is null");
  for (const g of groups) sent += await remindGroup(g.id);
  return Response.json({ sent });
}

async function remindGroup(groupId: number): Promise<number> {
  const c = await activeChallenge(groupId);
  if (!c) return 0;
  const today = osloDate();
  if (today < c.starts_on || today > c.ends_on) return 0;

  const week = weekStart(today, c);
  const members = await query<{ user_id: number; joined_at: Date }>("select user_id, joined_at from challenge_members where challenge_id = $1", [c.id]);
  const ids = members.map((m) => m.user_id);
  const workouts = await query<Workout>(
    `select ${WORKOUT_COLUMNS} from workouts
      where user_id = any($1::int[]) and started_at >= ($2::date)::timestamp at time zone 'Europe/Oslo'`,
    [ids, addDays(week, -1)],
  );
  await applyVerdicts(groupId, workouts);
  const task = (await query<WeeklyTask>("select id, week_start, title, description, auto_sports from weekly_tasks where challenge_id = $1 and week_start = $2", [c.id, week]))[0];
  let sent = 0;

  // 1) Check-in deadlines within the next 4 hours.
  const now = Date.now();
  for (const w of workouts) {
    if (w.checked_in_at || w.rejected || w.duration_min < c.session_minutes) continue;
    const left = checkInDeadline(c, w).getTime() - now;
    if (left <= 0 || left > 4 * 3600000) continue;
    if (!(await once(`checkin:${w.id}`))) continue;
    const hours = Math.max(1, Math.round(left / 3600000));
    await push([w.user_id], "checkin", { title: `⏰ ${hours} t igjen til innsjekk`, body: `${sportLabel(w.sport)}-økta di teller ikke før du sjekker inn${c.proof_required ? " med bilde" : ""}.`, url: "/logg", tag: `checkin-${w.id}` });
    sent++;
  }

  // 2) The week's last day from 17:00: whoever hasn't got the week in the bag yet.
  if (weekdayOf(today) === c.week_ends_on && osloHour() >= 17) {
    const board = await loadBoard(c); // for each person's jokers
    for (const m of members) {
      if (firstCountedWeek(c, m.joined_at) > week) continue;
      const mine = workouts.filter((w) => w.user_id === m.user_id && weekStart(osloDate(new Date(w.started_at)), c) === week);
      const r = evaluateWeek(c, week, mine, task, today);
      if (r.passed || !(await once(`sunday:${c.id}:${week}:${m.user_id}`))) continue;
      const missing = Math.max(0, c.min_sessions - r.qualifying);
      const held = board.members.find((x) => x.id === m.user_id)?.jokers.held ?? 0;
      const jokerNote = r.taskMet && missing <= held ? ` Jokeren${missing > 1 ? "e" : ""} din${missing > 1 ? "e" : ""} kan redde uka – men en økt til sparer ${missing > 1 ? "dem" : "den"}!` : ` Ellers blir det ${c.penalty_kr} kr i bøtta.`;
      await push([m.user_id], "reminders", {
        title: "Uka glipper snart! ⏳",
        body: r.volumeMet ? `Du mangler ukeskravet «${task?.title}». Fristen er i kveld kl. 24.` : `Du mangler ${missing} økt${missing === 1 ? "" : "er"} – fristen er i kveld kl. 24.${jokerNote}`,
        url: "/",
        tag: "sunday",
      });
      sent++;
    }
  }
  return sent;
}
