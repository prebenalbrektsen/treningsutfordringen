import { one, query } from "./db";
import { effectivePrefs, redact, type ShareState } from "./sharing";
import { addDays, fromOsloLocal, osloDate, WEEKDAY_NAMES, weekStart, weeksBetween } from "./time";

export type Challenge = {
  id: number;
  group_id: number;
  name: string;
  starts_on: string;
  ends_on: string;
  penalty_kr: number;
  min_sessions: number;
  session_minutes: number;
  long_session_minutes: number | null;
  long_session_counts: number;
  vipps_info: string | null;
  check_in_hours: number | null;
  max_per_day: number | null;
  proof_required: boolean;
  description: string | null;
  join_mode: "open" | "selected";
  joker_every: number | null;
  joker_max: number;
  week_ends_on: number; // 0 = Sunday … 6 = Saturday
  merge_mode: MergeMode;
};

/** Whether participants may merge workouts into one: never, back to back (same day, short break) or any on the same day. */
export type MergeMode = "off" | "back_to_back" | "same_day";
export const MERGE_BREAK_MIN = 30;

export type Jokers = { enabled: boolean; held: number; earnedTotal: number; used: number; progress: number; every: number; max: number };

/**
 * Jokers are spare workouts. Every `joker_every` counted workouts beyond a week's requirement bank
 * one joker; you can hold at most `joker_max` at a time (more is simply not banked). You apply them
 * yourself to a finished week to fill missing workouts. Worked out in time order, so the cap holds.
 */
function jokersFor(c: Challenge, results: WeekResult[], uses: { count: number; created_at: Date }[], now = new Date()): Jokers {
  const every = c.joker_every ?? 0;
  if (!every) return { enabled: false, held: 0, earnedTotal: 0, used: 0, progress: 0, every: 0, max: c.joker_max };
  const events: { t: number; extra?: number; use?: number }[] = [];
  for (const r of results) {
    if (r.state !== "done" && r.state !== "running") continue;
    const extra = Math.max(0, r.qualifying - c.min_sessions);
    // A finished week banks at its end; this week's extra counts already now.
    const t = r.state === "done" ? fromOsloLocal(`${addDays(r.week, 7)}T00:00`).getTime() : now.getTime();
    if (extra) events.push({ t, extra });
  }
  for (const u of uses) events.push({ t: new Date(u.created_at).getTime(), use: u.count });
  events.sort((a, b) => a.t - b.t);
  let held = 0, bank = 0, earnedTotal = 0, used = 0;
  for (const e of events) {
    if (e.use) { held = Math.max(0, held - e.use); used += e.use; continue; }
    bank += e.extra!;
    while (bank >= every) {
      bank -= every;
      if (held < c.joker_max) { held++; earnedTotal++; }
    }
    if (held >= c.joker_max) bank = 0; // full: extra workouts aren't saved
  }
  return { enabled: true, held, earnedTotal, used, progress: bank, every, max: c.joker_max };
}

/** Whether this person may sign up: everyone when the challenge is open, else only those the admin picked. */
export async function mayJoin(c: Challenge, userId: number): Promise<boolean> {
  if (c.join_mode === "open") return true;
  return !!(await one("select 1 from challenge_invites where challenge_id = $1 and user_id = $2", [c.id, userId]));
}

export type Workout = {
  id: number;
  user_id: number;
  started_at: Date;
  duration_min: number;
  sport: string;
  title: string | null;
  distance_m: number | null;
  elevation_m: number | null;
  avg_hr: number | null;
  source: string;
  strava_id: string | null;
  has_proof: boolean;
  meets_task: boolean;
  rejected: boolean;
  kudos_by: number[];
  comment_count: number;
  checked_in_at: Date | null;
  imported_at: Date;
  merged_into: number | null;
  status?: WorkoutStatus;
  /** Set on a workout others are merged into: every part, first one first. */
  parts?: { id: number; sport: string; minutes: number }[];
  /** The workout's own minutes/distance before merged parts were added (duration_min/distance_m then hold the total). */
  own_minutes?: number;
  own_distance_m?: number | null;
};

/**
 * counts: one of the week's workouts · pending: waiting for check-in · expired: not checked in in time
 * short: under the minimum length · sameday: a longer workout already counts that day · rejected: by admin
 */
export type WorkoutStatus = "counts" | "pending" | "expired" | "short" | "sameday" | "rejected" | "merged";


export type WeeklyTask = { id: number; week_start: string; title: string; description: string | null; auto_sports: string[] };
export type FineStatus = "owed" | "claimed" | "paid" | "waived" | "joker";
export type Member = { id: number; name: string; color: string; strava_athlete_id: string | null; is_admin: boolean; joined_at: Date; avatar_v: number | null };

export type WeekResult = {
  week: string;
  state: "future" | "running" | "done" | "before"; // before = the person had not joined yet
  workouts: Workout[];
  qualifying: number;
  hasLong: boolean;
  volumeMet: boolean;
  taskMet: boolean;
  passed: boolean;
  minutes: number;
  pending: number;
  fine: FineStatus | null; // only set for finished, failed weeks
  jokersUsed: number; // spare workouts applied to this week
};

export const WORKOUT_COLUMNS = `id, user_id, started_at, duration_min, sport, title, distance_m, elevation_m, avg_hr,
  source, strava_id::text, proof_image is not null as has_proof, meets_task, rejected, checked_in_at, imported_at, merged_into,
  array(select k.user_id from kudos k where k.workout_id = workouts.id) as kudos_by,
  (select count(*) from comments m where m.workout_id = workouts.id)::int as comment_count`;

export async function activeChallenge(groupId: number): Promise<Challenge | null> {
  // The group's newest challenge that has started, else the next one coming up.
  return one<Challenge>(
    `select * from challenges where group_id = $2
      order by (starts_on <= $1::date) desc, case when starts_on <= $1::date then starts_on end desc nulls last, starts_on asc
      limit 1`,
    [osloDate(), groupId],
  );
}

/**
 * The challenge a person's own Strava workouts are judged by (for notices): the newest running or
 * coming challenge they've joined, in any of their groups.
 */
export async function challengeOf(userId: number): Promise<Challenge | null> {
  return one<Challenge>(
    `select c.* from challenges c join challenge_members m on m.challenge_id = c.id and m.user_id = $1
       join groups g on g.id = c.group_id and g.disabled_at is null
      where c.ends_on >= $2::date order by c.starts_on desc limit 1`,
    [userId, osloDate()],
  );
}

/** How far back to fetch someone's Strava workouts: a week before their earliest running challenge. */
export async function syncStartFor(userId: number): Promise<Date> {
  const row = await one<{ start: string | null }>(
    `select min(c.starts_on)::text as start from challenges c join challenge_members m on m.challenge_id = c.id and m.user_id = $1
      where c.ends_on >= $2::date - 7`,
    [userId, osloDate()],
  );
  return new Date(`${row?.start ? addDays(row.start, -7) : addDays(osloDate(), -7)}T00:00:00Z`);
}

/**
 * The group's own verdicts on these workouts: rejected by the group's admin, or let through
 * without a check-in. Another group's verdict doesn't count here. Changes the workouts in place.
 */
export async function applyVerdicts<W extends Pick<Workout, "id" | "rejected" | "checked_in_at">>(groupId: number, workouts: W[]): Promise<W[]> {
  if (!workouts.length) return workouts;
  const rows = await query<{ workout_id: number; rejected: boolean; approved_at: Date | null }>(
    "select workout_id, rejected, approved_at from workout_verdicts where group_id = $1 and workout_id = any($2::int[])",
    [groupId, workouts.map((w) => w.id)],
  );
  const byId = new Map(rows.map((r) => [r.workout_id, r]));
  for (const w of workouts) {
    const v = byId.get(w.id);
    w.rejected = !!v?.rejected;
    if (v?.approved_at && !w.checked_in_at) w.checked_in_at = v.approved_at;
  }
  return workouts;
}

/** The challenge's rules as short phrases, for chips and the rules recap. */
export function ruleParts(c: Challenge): string[] {
  const parts = [`${c.min_sessions} × ${c.session_minutes} min`];
  if (c.long_session_minutes) {
    parts.push(c.long_session_counts >= c.min_sessions
      ? `eller 1 × ${c.long_session_minutes} min`
      : `${c.long_session_minutes}+ min teller som ${c.long_session_counts}`);
  }
  if (c.week_ends_on !== 0) parts.push(`uka går ${WEEKDAY_NAMES[(c.week_ends_on + 1) % 7]}–${WEEKDAY_NAMES[c.week_ends_on]}`);
  if (c.max_per_day) parts.push(c.max_per_day === 1 ? "maks 1 økt per dag" : `maks ${c.max_per_day} økter per dag`);
  parts.push(c.check_in_hours ? `sjekk inn innen ${c.check_in_hours} t` : "sjekk inn før uka er over");
  if (c.merge_mode === "back_to_back") parts.push(`økter rett etter hverandre kan slås sammen (maks ${MERGE_BREAK_MIN} min pause)`);
  if (c.merge_mode === "same_day") parts.push("økter samme dag kan slås sammen");
  if (c.proof_required) parts.push("bilde påkrevd");
  if (c.joker_every) parts.push(`${c.joker_every === 1 ? "ekstra økt" : `${c.joker_every} ekstra økter`} = 🃏 joker (maks ${c.joker_max} på lur)`);
  parts.push(`bot ${c.penalty_kr} kr`);
  return parts;
}

/** The first week that counts for someone: everything if they joined before the start, else the first full week after joining. */
export function firstCountedWeek(c: Challenge, joinedAt: Date): string {
  const joined = osloDate(new Date(joinedAt));
  if (joined <= c.starts_on) return weekStart(c.starts_on, c);
  const first = weekStart(joined, c);
  return first === joined ? first : addDays(first, 7);
}

/**
 * Check in within the challenge's window after finishing (or after Strava delivered it, if it
 * synced late), and always before the week closes at midnight on its last day.
 */
export function checkInDeadline(c: Challenge, w: Pick<Workout, "started_at" | "duration_min" | "imported_at">): Date {
  const weekEnd = fromOsloLocal(`${addDays(weekStart(osloDate(new Date(w.started_at)), c), 7)}T00:00`).getTime();
  if (!c.check_in_hours) return new Date(weekEnd);
  const finished = new Date(w.started_at).getTime() + w.duration_min * 60000;
  const base = Math.max(finished, new Date(w.imported_at).getTime());
  return new Date(Math.min(base + c.check_in_hours * 3600000, weekEnd));
}

type Part = Pick<Workout, "started_at" | "duration_min">;

/** May these workouts (any order) count as one under the challenge's rule? Uses each one's own minutes. */
export function mergeAllowed(c: Pick<Challenge, "merge_mode">, parts: Part[]): boolean {
  if (c.merge_mode === "off" || parts.length < 2) return false;
  const sorted = [...parts].sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at));
  if (new Set(sorted.map((p) => osloDate(new Date(p.started_at)))).size > 1) return false;
  if (c.merge_mode === "same_day") return true;
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = +new Date(sorted[i - 1].started_at) + sorted[i - 1].duration_min * 60000;
    if (+new Date(sorted[i].started_at) - prevEnd > MERGE_BREAK_MIN * 60000) return false;
  }
  return true;
}

/**
 * Adds merged workouts into the one they were merged into (minutes and distance), so it counts as
 * one workout. Safe to run again on the same objects. Returns the ids of the merged-away parts.
 * With merging off in this challenge, or a pair that breaks its rule, they count separately.
 */
function applyMerges(c: Challenge, workouts: Workout[]): Set<number> {
  for (const w of workouts) {
    w.own_minutes ??= w.duration_min;
    if (w.own_distance_m === undefined) w.own_distance_m = w.distance_m;
    w.duration_min = w.own_minutes;
    w.distance_m = w.own_distance_m;
    w.parts = undefined;
  }
  const hidden = new Set<number>();
  if (c.merge_mode === "off") return hidden;
  const byId = new Map(workouts.map((w) => [w.id, w]));
  const children = new Map<number, Workout[]>();
  for (const w of workouts) {
    if (!w.merged_into) continue;
    const parent = byId.get(w.merged_into);
    // The first part isn't in this list (e.g. only unchecked workouts were loaded): still not a workout of its own.
    if (!parent) { hidden.add(w.id); continue; }
    children.set(parent.id, [...(children.get(parent.id) ?? []), w]);
  }
  for (const [parentId, kids] of children) {
    const parent = byId.get(parentId)!;
    const own = (w: Workout) => ({ started_at: w.started_at, duration_min: w.own_minutes! });
    if (!mergeAllowed(c, [parent, ...kids].map(own))) continue;
    const parts = [parent, ...kids].sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at));
    parent.duration_min = parts.reduce((n, p) => n + p.own_minutes!, 0);
    const km = parts.reduce((n, p) => n + (p.own_distance_m ?? 0), 0);
    parent.distance_m = km || null;
    parent.parts = parts.map((p) => ({ id: p.id, sport: p.sport, minutes: p.own_minutes! }));
    for (const k of kids) hidden.add(k.id);
  }
  return hidden;
}

/**
 * Sets each workout's status. Only `max_per_day` workouts per day count toward the week (the
 * longest checked-in ones), so three workouts squeezed into the last day don't complete a week.
 * Pass one person's workouts.
 */
export function annotate(c: Challenge, workouts: Workout[], now = new Date()): Workout[] {
  const merged = applyMerges(c, workouts);
  const countedPerDay = new Map<string, Set<Workout>>();
  const candidates = workouts
    .filter((w) => !merged.has(w.id) && !w.rejected && w.duration_min >= c.session_minutes && w.checked_in_at)
    .sort((a, b) => b.duration_min - a.duration_min || a.id - b.id);
  for (const w of candidates) {
    const day = osloDate(new Date(w.started_at));
    const set = countedPerDay.get(day) ?? new Set<Workout>();
    if (!c.max_per_day || set.size < c.max_per_day) set.add(w);
    countedPerDay.set(day, set);
  }
  for (const w of workouts) {
    if (merged.has(w.id)) w.status = "merged";
    else if (w.rejected) w.status = "rejected";
    else if (w.duration_min < c.session_minutes) w.status = "short";
    else if (!w.checked_in_at) w.status = checkInDeadline(c, w) > now ? "pending" : "expired";
    else w.status = countedPerDay.get(osloDate(new Date(w.started_at)))?.has(w) ? "counts" : "sameday";
  }
  return workouts;
}

/** How many of the week's workouts this one is worth: 1, or more for a long workout. */
export function workoutCredit(c: Challenge, w: Pick<Workout, "duration_min">): number {
  return c.long_session_minutes && w.duration_min >= c.long_session_minutes ? Math.max(1, c.long_session_counts) : 1;
}

export function meetsTask(w: Workout, task: WeeklyTask | undefined): boolean {
  return !!task && (w.meets_task || task.auto_sports.includes(w.sport) || !!w.parts?.some((p) => task.auto_sports.includes(p.sport)));
}

/** `workouts` = one person's workouts in that week. */
export function evaluateWeek(c: Challenge, week: string, workouts: Workout[], task: WeeklyTask | undefined, today = osloDate()) {
  annotate(c, workouts);
  const counted = workouts.filter((w) => w.status === "counts");
  const checkedIn = workouts.filter((w) => w.checked_in_at && !w.rejected);
  // A long workout is worth `long_session_counts` of the week's workouts.
  const credits = counted.reduce((n, w) => n + workoutCredit(c, w), 0);
  const hasLong = counted.some((w) => workoutCredit(c, w) > 1);
  const volumeMet = credits >= c.min_sessions;
  // The task workout has to be a real one: checked in and long enough to count on its own.
  const taskMet = !task || checkedIn.some((w) => w.duration_min >= c.session_minutes && meetsTask(w, task));
  const state: WeekResult["state"] = week > today ? "future" : addDays(week, 6) < today ? "done" : "running";
  return {
    week,
    state,
    workouts,
    qualifying: credits,
    hasLong,
    volumeMet,
    taskMet,
    passed: volumeMet && taskMet,
    minutes: checkedIn.reduce((sum, w) => sum + w.duration_min, 0),
    pending: workouts.filter((w) => w.status === "pending").length,
    jokersUsed: 0,
  };
}

export type Board = {
  challenge: Challenge;
  weeks: string[];
  currentWeek: string;
  tasks: Map<string, WeeklyTask>;
  members: (Member & {
    results: WeekResult[];
    owedKr: number;
    claimedKr: number;
    paidKr: number;
    jokers: Jokers;
    workouts: Workout[];
  })[];
};

/**
 * `viewerId`: who will see it. Other people's Strava workouts lose the details they haven't chosen
 * to share (left out = nobody's details, for background jobs that only need the results).
 */
export async function loadBoard(c: Challenge, viewerId?: number): Promise<Board> {
  const today = osloDate();
  const weeks = weeksBetween(c.starts_on, c.ends_on, c);
  const [members, rawWorkouts, tasks, fines, jokerUses] = await Promise.all([
    query<Member & ShareState>(
      `select u.id, u.name, u.color, u.strava_athlete_id::text,
              exists (select 1 from group_members g where g.group_id = $2 and g.user_id = u.id and g.role = 'admin') as is_admin, m.joined_at,
              u.share_distance, u.share_elevation, u.share_hr, u.share_title, u.strava_consent_at,
              extract(epoch from u.avatar_updated_at)::int as avatar_v
         from challenge_members m join users u on u.id = m.user_id
        where m.challenge_id = $1 order by u.name`,
      [c.id, c.group_id],
    ),
    query<Workout>(
      `select ${WORKOUT_COLUMNS} from workouts
        where user_id in (select user_id from challenge_members where challenge_id = $1)
          and started_at >= ($2::date)::timestamp at time zone 'Europe/Oslo'
          and started_at < ($3::date + 1)::timestamp at time zone 'Europe/Oslo'
        order by started_at desc`,
      [c.id, weeks[0], c.ends_on],
    ),
    query<WeeklyTask>("select id, week_start, title, description, auto_sports from weekly_tasks where challenge_id = $1", [c.id]),
    query<{ user_id: number; week_start: string; status: FineStatus }>(
      "select user_id, week_start, status from fines where challenge_id = $1",
      [c.id],
    ),
    query<{ user_id: number; week_start: string; count: number; created_at: Date }>(
      "select user_id, week_start, count, created_at from joker_uses where challenge_id = $1",
      [c.id],
    ),
  ]);
  await applyVerdicts(c.group_id, rawWorkouts);
  // Kudos and comments happen inside a group: count only this group's.
  const ids = rawWorkouts.map((w) => w.id);
  const social = ids.length ? await query<{ id: number; kudos_by: number[]; comment_count: number }>(
    `select w.id, array(select k.user_id from kudos k where k.workout_id = w.id and k.group_id = $2) as kudos_by,
            (select count(*) from comments m where m.workout_id = w.id and m.group_id = $2)::int as comment_count
       from unnest($1::int[]) as w(id)`,
    [ids, c.group_id],
  ) : [];
  const socialOf = new Map(social.map((x) => [x.id, x]));
  for (const w of rawWorkouts) { const x = socialOf.get(w.id); w.kudos_by = x?.kudos_by ?? []; w.comment_count = x?.comment_count ?? 0; }
  const prefs = new Map(members.map((m) => [m.id, effectivePrefs(m)]));
  const workouts = rawWorkouts.map((w) => (w.user_id === viewerId ? w : redact(w, prefs.get(w.user_id)!)));
  const taskMap = new Map(tasks.map((t) => [t.week_start, t]));
  const fineMap = new Map(fines.map((f) => [`${f.user_id}:${f.week_start}`, f.status]));

  return {
    challenge: c,
    weeks,
    currentWeek: weekStart(today, c),
    tasks: taskMap,
    members: members.map(({ share_distance: _d, share_elevation: _e, share_hr: _h, share_title: _t, strava_consent_at: _c, ...m }) => {
      const mine = workouts.filter((w) => w.user_id === m.id);
      const first = firstCountedWeek(c, m.joined_at);
      const results: WeekResult[] = weeks.map((week) => {
        const inWeek = mine.filter((w) => weekStart(osloDate(w.started_at), c) === week);
        const r = evaluateWeek(c, week, inWeek, taskMap.get(week), today);
        if (week < first) return { ...r, state: "before" as const, passed: false, fine: null };
        // Jokers applied to this week fill missing workouts.
        const jokersUsed = jokerUses.find((u) => u.user_id === m.id && u.week_start === week)?.count ?? 0;
        if (jokersUsed) {
          r.jokersUsed = jokersUsed;
          r.volumeMet = r.qualifying + jokersUsed >= c.min_sessions;
          r.passed = r.volumeMet && r.taskMet;
        }
        const fine = r.state === "done" && !r.passed ? (fineMap.get(`${m.id}:${week}`) ?? "owed") : null;
        return { ...r, fine };
      });
      const sum = (status: FineStatus) => results.filter((r) => r.fine === status).length * c.penalty_kr;
      return { ...m, results, workouts: mine, owedKr: sum("owed"), claimedKr: sum("claimed"), paidKr: sum("paid"), jokers: jokersFor(c, results, jokerUses.filter((u) => u.user_id === m.id)) };
    }),
  };
}
