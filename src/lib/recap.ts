import type { Board } from "./challenge";
import { firstToFinish } from "./leaderboard";
import { sportLabel } from "./sports";
import { computeStats } from "./stats";
import { addDays, formatWeekRange, isoWeekNumber } from "./time";

/** Everything the «Din uke» card shows about one person's finished week. Plain data, so it can go to the client. */
export type WeekRecap = {
  week: string;
  weekNo: number;
  range: string;
  passed: boolean;
  fined: boolean;
  penaltyKr: number;
  credits: number;
  needed: number;
  jokersUsed: number;
  task: { title: string; met: boolean } | null;
  sessions: number;
  minutes: number;
  km: number;
  elevation: number;
  longest: number;
  topSport: string | null;
  prev: { sessions: number; minutes: number } | null;
  rank: number; // by minutes trained that week
  people: number;
  first: boolean; // first in the family to have the week in the bag
  streak: number; // weeks in a row in the bag, ending with this one
  family: { made: number; total: number; sessions: number; minutes: number; km: number };
  weeksLeft: number;
  message: string;
};

function message(r: Omit<WeekRecap, "message">): string {
  if (r.passed) {
    if (r.streak >= 3) return `🔥 ${r.streak} uker på rad! Du er rett og slett umulig å stoppe.`;
    if (r.first) return "🥇 Først i mål i hele gjengen. Det er sånn det skal gjøres!";
    if (r.prev && r.minutes > r.prev.minutes) return "📈 Mer trening enn forrige uke. Det er sånn formen bygges!";
    if (r.jokersUsed) return "🃏 Jokeren reddet uka. Smart sparing!";
    if (r.credits > r.needed) return "💪 Mer enn kravet! Det er ekstra krefter i deg.";
    return "✅ Uka i boks. Godt jobba – akkurat sånn!";
  }
  if (r.credits === 0) return "En rolig uke skjer alle. Det viktigste er å komme i gang igjen – hva med en tur i dag?";
  if (r.needed - r.credits === 1) return "Bare én økt unna! Ny uke, blanke ark – denne tar du.";
  return "Ikke helt denne gangen, men du var i gang. Ny uke starter nå – sett av tid til første økt!";
}

/** The person's recap for last week, or null when there is no finished challenge week to show. */
export async function weekRecap(board: Board, userId: number): Promise<WeekRecap | null> {
  const c = board.challenge;
  const week = addDays(board.currentWeek, -7);
  const i = board.weeks.indexOf(week);
  const me = board.members.find((m) => m.id === userId);
  if (i < 0 || !me || me.results[i].state !== "done") return null;
  const r = me.results[i];
  const stats = computeStats(r.workouts);

  const counted = board.members.filter((m) => m.results[i].state === "done");
  const minutesOf = (m: (typeof counted)[number]) => m.results[i].minutes;
  const rank = 1 + counted.filter((m) => minutesOf(m) > r.minutes).length;
  const family = counted.reduce(
    (f, m) => {
      const s = computeStats(m.results[i].workouts);
      return { ...f, sessions: f.sessions + s.sessions, minutes: f.minutes + s.minutes, km: f.km + s.runKm + s.rideKm + s.swimKm + s.walkKm };
    },
    { made: counted.filter((m) => m.results[i].passed).length, total: counted.length, sessions: 0, minutes: 0, km: 0 },
  );

  let streak = 0;
  for (let j = i; j >= 0 && me.results[j].passed; j--) streak++;
  const before = i > 0 && me.results[i - 1].state === "done" ? computeStats(me.results[i - 1].workouts) : null;
  const task = board.tasks.get(week);

  const recap: Omit<WeekRecap, "message"> = {
    week,
    weekNo: isoWeekNumber(week),
    range: formatWeekRange(week),
    passed: r.passed,
    fined: !!r.fine && r.fine !== "waived",
    penaltyKr: c.penalty_kr,
    credits: r.qualifying,
    needed: c.min_sessions,
    jokersUsed: r.jokersUsed,
    task: task ? { title: task.title, met: r.taskMet } : null,
    sessions: stats.sessions,
    minutes: stats.minutes,
    km: stats.runKm + stats.rideKm + stats.swimKm + stats.walkKm,
    elevation: stats.elevation,
    longest: stats.longest,
    topSport: stats.bySport[0] ? sportLabel(stats.bySport[0].sport) : null,
    prev: before ? { sessions: before.sessions, minutes: before.minutes } : null,
    rank,
    people: counted.length,
    first: r.passed && (await firstToFinish(c, week)) === userId,
    streak,
    family,
    weeksLeft: board.weeks.length - 1 - i,
  };
  return { ...recap, message: message(recap) };
}
