import { activeChallenge, applyVerdicts, evaluateWeek, loadBoard, WORKOUT_COLUMNS, type WeeklyTask, type Workout } from "./challenge";
import { one, query } from "./db";
import { everyoneBut, push } from "./push";
import { addDays, isoWeekNumber, mondayOf, osloDate } from "./time";

/** The app's own news in a group's chat («Ida har uka i boks», the Monday summary), pushed like a chat message. */
export async function postToGroup(groupId: number, eventKey: string | null, body: string): Promise<void> {
  const added = await query(
    "insert into messages (group_id, user_id, body, event_key) values ($1, null, $2, $3) on conflict (group_id, event_key) do nothing returning 1",
    [groupId, body, eventKey],
  );
  if (added.length) await push(await everyoneBut(groupId, null), "chat", { title: "Treningsutfordring", body, url: "/prat", tag: `sys-${groupId}-${eventKey ?? Date.now()}` });
}

/** The groups a person is an approved member of (not disabled). */
export async function groupsOf(userId: number): Promise<number[]> {
  const rows = await query<{ group_id: number }>(
    "select m.group_id from group_members m join groups g on g.id = m.group_id where m.user_id = $1 and m.approved and g.disabled_at is null",
    [userId],
  );
  return rows.map((r) => r.group_id);
}

/** Posts "X fullførte uka" in every group where this person's current week is now in the bag. */
export async function announceWeek(userId: number): Promise<void> {
  for (const groupId of await groupsOf(userId)) await announceWeekIn(groupId, userId);
}

async function announceWeekIn(groupId: number, userId: number): Promise<void> {
  const c = await activeChallenge(groupId);
  if (!c) return;
  const week = mondayOf(osloDate());
  if (week < mondayOf(c.starts_on) || week > c.ends_on) return;
  const member = await one<{ name: string }>(
    "select u.name from challenge_members m join users u on u.id = m.user_id where m.challenge_id = $1 and m.user_id = $2",
    [c.id, userId],
  );
  if (!member) return;
  const [workouts, task] = await Promise.all([
    query<Workout>(
      `select ${WORKOUT_COLUMNS} from workouts where user_id = $1
         and started_at >= ($2::date)::timestamp at time zone 'Europe/Oslo'
         and started_at < ($2::date + 7)::timestamp at time zone 'Europe/Oslo'`,
      [userId, week],
    ),
    one<WeeklyTask>("select id, week_start, title, description, auto_sports from weekly_tasks where challenge_id = $1 and week_start = $2", [c.id, week]),
  ]);
  await applyVerdicts(groupId, workouts);
  if (!evaluateWeek(c, week, workouts, task ?? undefined).passed) return;
  const placed = await one<{ n: number }>("select count(*)::int as n from messages where group_id = $1 and event_key like $2", [groupId, `week:${c.id}:${week}:%`]);
  const medal = ["🥇", "🥈", "🥉"][placed!.n] ?? "✅";
  await postToGroup(groupId, `week:${c.id}:${week}:${userId}`, `${medal} ${member.name} har uke ${isoWeekNumber(week)} i boks!`);
}

/** Once a week is over: a short summary in each group of who made it and what went in the bucket. */
// Remembered per server instance, so the summary check doesn't touch the database on every page view.
let summaryDoneFor = "";

export async function announceWeekSummary(): Promise<void> {
  const lastWeek = addDays(mondayOf(osloDate()), -7);
  if (summaryDoneFor === lastWeek) return;
  const groups = await query<{ id: number }>("select id from groups where disabled_at is null");
  for (const g of groups) await weekSummaryIn(g.id, lastWeek);
  summaryDoneFor = lastWeek;
}

async function weekSummaryIn(groupId: number, lastWeek: string): Promise<void> {
  const c = await activeChallenge(groupId);
  if (!c) return;
  if (lastWeek < mondayOf(c.starts_on) || lastWeek > c.ends_on) return;
  if (await one("select 1 from messages where group_id = $1 and event_key = $2", [groupId, `summary:${c.id}:${lastWeek}`])) return;
  const board = await loadBoard(c);
  const i = board.weeks.indexOf(lastWeek);
  if (i < 0) return;
  // People who had not joined yet that week are left out entirely.
  const counted = board.members.filter((m) => m.results[i].state !== "before");
  if (!counted.length) return;
  const failed = counted.filter((m) => !m.results[i].passed);
  const made = counted.length - failed.length;
  const body = failed.length
    ? `🏁 Uke ${isoWeekNumber(lastWeek)} er over: ${made} av ${counted.length} klarte det. ${failed.map((m) => m.name).join(", ")} spytter ${c.penalty_kr} kr i bøtta. 💸`
    : `🏁 Uke ${isoWeekNumber(lastWeek)} er over: ALLE klarte det! Bøtta sulter. 🔥`;
  await postToGroup(groupId, `summary:${c.id}:${lastWeek}`, body);
}
