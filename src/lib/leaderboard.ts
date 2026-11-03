import type { Board, Challenge, Workout } from "./challenge";
import { query } from "./db";
import { addDays, mondayOf, osloDate } from "./time";

type Member = Board["members"][number];
export type Period = "uke" | "alt";

/** Everything a leaderboard or a profile needs about one person, for one period. */
export type PersonStats = {
  m: Member;
  weeksPassed: number;
  minutes: number;
  sessions: number;
  runKm: number;
  kudosReceived: number;
  kudosGiven: number;
  streak: number; // weeks in a row in the bag, up to now
  bestStreak: number;
  longest: Workout | null;
  ws: Workout[]; // the counted workouts in the period, for the per-sport boards
};

const counts = (w: Workout) => !!w.checked_in_at && !w.rejected;
const RUN = ["Run", "TrailRun", "VirtualRun"];

function streaks(m: Member): { streak: number; best: number } {
  // Finished weeks, plus this week once it's already in the bag.
  const weeks = m.results.filter((r) => r.state === "done" || (r.state === "running" && r.passed));
  let best = 0, run = 0;
  for (const r of weeks) { run = r.passed ? run + 1 : 0; best = Math.max(best, run); }
  return { streak: run, best };
}

export async function personStats(c: Challenge, board: Board, period: Period): Promise<PersonStats[]> {
  const week = board.currentWeek;
  const inPeriod = (w: Workout) => period === "alt" || mondayOf(osloDate(new Date(w.started_at))) === week;
  const given = await query<{ user_id: number; n: number }>(
    `select k.user_id, count(*)::int as n from kudos k join workouts w on w.id = k.workout_id
      where k.group_id = $3 and w.started_at >= ($1::date)::timestamp at time zone 'Europe/Oslo'
        and w.started_at < ($2::date + 1)::timestamp at time zone 'Europe/Oslo'
      group by k.user_id`,
    [period === "alt" ? board.weeks[0] : week, period === "alt" ? c.ends_on : addDays(week, 6), c.group_id],
  );
  const givenBy = new Map(given.map((g) => [g.user_id, g.n]));
  return board.members.map((m) => {
    const ws = m.workouts.filter((w) => counts(w) && inPeriod(w));
    const { streak, best } = streaks(m);
    const weekResults = period === "alt" ? m.results : m.results.filter((r) => r.week === week);
    return {
      m,
      weeksPassed: weekResults.filter((r) => r.state !== "future" && r.state !== "before" && r.passed).length,
      minutes: ws.reduce((s, w) => s + w.duration_min, 0),
      sessions: ws.length,
      runKm: ws.filter((w) => RUN.includes(w.sport)).reduce((s, w) => s + (w.distance_m ?? 0), 0) / 1000,
      kudosReceived: ws.reduce((s, w) => s + w.kudos_by.length, 0),
      kudosGiven: givenBy.get(m.id) ?? 0,
      streak,
      bestStreak: best,
      longest: ws.reduce<Workout | null>((a, w) => (!a || w.duration_min > a.duration_min ? w : a), null),
      ws,
    };
  });
}

export const BOARDS = [
  { id: "uker", label: "Uker i boks", value: (p: PersonStats) => p.weeksPassed, fmt: (v: number) => `${v} ${v === 1 ? "uke" : "uker"}`, tie: (p: PersonStats) => p.minutes },
  { id: "minutter", label: "Minutter", value: (p: PersonStats) => p.minutes, fmt: (v: number) => `${v} min`, tie: (p: PersonStats) => p.sessions },
  { id: "okter", label: "Økter", value: (p: PersonStats) => p.sessions, fmt: (v: number) => `${v} økter`, tie: (p: PersonStats) => p.minutes },
  { id: "km", label: "Km løpt", value: (p: PersonStats) => Math.round(p.runKm * 10) / 10, fmt: (v: number) => `${v.toLocaleString("nb-NO")} km`, tie: (p: PersonStats) => p.minutes },
  { id: "kudos", label: "Kudos fått", value: (p: PersonStats) => p.kudosReceived, fmt: (v: number) => `${v} 🔥`, tie: (p: PersonStats) => p.kudosGiven },
  { id: "heia", label: "Heiaropet (kudos gitt)", value: (p: PersonStats) => p.kudosGiven, fmt: (v: number) => `${v} gitt`, tie: (p: PersonStats) => p.kudosReceived },
  { id: "streak", label: "Uker på rad", value: (p: PersonStats) => p.streak, fmt: (v: number) => `${v} på rad`, tie: (p: PersonStats) => p.bestStreak },
] as const;

// Per-sport boards: one per kind of training, measured the way that makes sense for it.
// They only show up once someone has logged that kind of workout.
type Unit = "km" | "m" | "t";
const SPORT_BOARDS: { id: string; label: string; sports: string[]; unit: Unit }[] = [
  { id: "styrke", label: "Styrke / gym", sports: ["WeightTraining", "Crossfit", "HighIntensityIntervalTraining", "Workout"], unit: "t" },
  { id: "loping", label: "Løping", sports: ["Run", "TrailRun", "VirtualRun"], unit: "km" },
  { id: "sykkel", label: "Sykkel", sports: ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"], unit: "km" },
  { id: "svomming", label: "Svømming", sports: ["Swim"], unit: "m" },
  { id: "gaing", label: "Gåtur og fjelltur", sports: ["Walk", "Hike"], unit: "km" },
  { id: "ski", label: "Ski", sports: ["NordicSki", "BackcountrySki", "RollerSki"], unit: "km" },
  { id: "alpint", label: "Alpint", sports: ["AlpineSki", "Snowboard"], unit: "t" },
  { id: "padling", label: "Padling og roing", sports: ["Kayaking", "Rowing", "StandUpPaddling", "Canoeing"], unit: "km" },
  { id: "yoga", label: "Yoga og pilates", sports: ["Yoga", "Pilates"], unit: "t" },
  { id: "ballsport", label: "Ballsport", sports: ["Soccer", "Padel", "Tennis", "Badminton", "Squash", "Pickleball"], unit: "t" },
];

function sportBoard(b: (typeof SPORT_BOARDS)[number]) {
  const value = (p: PersonStats) => {
    const ws = p.ws.filter((w) => b.sports.includes(w.sport));
    if (b.unit === "t") return Math.round((ws.reduce((s, w) => s + w.duration_min, 0) / 60) * 10) / 10;
    const metres = ws.reduce((s, w) => s + (w.distance_m ?? 0), 0);
    return b.unit === "m" ? Math.round(metres) : Math.round(metres / 100) / 10;
  };
  const fmt = (v: number) => (b.unit === "t" ? `${v.toLocaleString("nb-NO")} t` : b.unit === "m" ? `${v.toLocaleString("nb-NO")} m` : `${v.toLocaleString("nb-NO")} km`);
  return { id: `sport-${b.id}`, label: b.label, value, fmt, tie: (p: PersonStats) => p.ws.filter((w) => b.sports.includes(w.sport)).length };
}

const ELEVATION = {
  id: "sport-hoyde", label: "Høydemeter",
  value: (p: PersonStats) => p.ws.reduce((s, w) => s + (w.elevation_m ?? 0), 0),
  fmt: (v: number) => `${v.toLocaleString("nb-NO")} m`,
  tie: (p: PersonStats) => p.minutes,
};

/** The per-sport boards that have data in this period. */
export function sportBoards(stats: PersonStats[]) {
  return [...SPORT_BOARDS.map(sportBoard), ELEVATION].filter((b) => stats.some((p) => b.value(p) > 0));
}

type BoardId = string;

export function rank(stats: PersonStats[], boardId: BoardId) {
  const all = [...BOARDS, ...SPORT_BOARDS.map(sportBoard), ELEVATION];
  const b = all.find((x) => x.id === boardId) ?? BOARDS[0];
  return [...stats]
    .sort((a, z) => b.value(z) - b.value(a) || b.tie(z) - b.tie(a))
    .map((p) => ({ p, value: b.value(p), text: b.fmt(b.value(p)) }));
}

/** Who reached the week first: the earliest «har uka i boks» announcement. */
export async function firstToFinish(c: Challenge, week: string): Promise<number | null> {
  const row = await query<{ event_key: string }>(
    "select event_key from messages where group_id = $2 and event_key like $1 order by created_at limit 1",
    [`week:${c.id}:${week}:%`, c.group_id],
  );
  return row[0] ? Number(row[0].event_key.split(":").at(-1)) : null;
}

/** How many weeks each person was the first to finish. */
export async function firstFinishCounts(c: Challenge): Promise<Map<number, number>> {
  const rows = await query<{ event_key: string }>(
    `select distinct on (split_part(event_key, ':', 3)) event_key from messages
      where group_id = $2 and event_key like $1 order by split_part(event_key, ':', 3), created_at`,
    [`week:${c.id}:%`, c.group_id],
  );
  const counts = new Map<number, number>();
  for (const r of rows) {
    const id = Number(r.event_key.split(":").at(-1));
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
