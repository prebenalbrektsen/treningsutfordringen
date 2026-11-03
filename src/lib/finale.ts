import { badgesFor } from "@/components/Profile";
import type { Board } from "./challenge";
import { firstFinishCounts, personStats } from "./leaderboard";
import { computeStats } from "./stats";
import { formatDay, formatMinutes, isoWeekNumber, osloDate } from "./time";

/** One award in the group's «kåring» at the end. */
export type Award = { emoji: string; title: string; names: string[]; value: string; mine: boolean };

/** Everything the end-of-challenge card shows. Plain data, so it can go to the client. */
export type Finale = {
  challengeId: number;
  name: string;
  range: string;
  weeks: number; // weeks that counted for this person
  passed: number;
  sessions: number;
  minutes: number;
  km: number;
  elevation: number;
  bestWeek: { weekNo: number; minutes: number } | null;
  bestStreak: number;
  badges: { emoji: string; title: string }[];
  jokersUsed: number;
  finesKr: number;
  rank: number; // by hours trained
  people: number;
  awards: Award[];
  group: { sessions: number; minutes: number; km: number; potKr: number; perfect: string[] };
  message: string;
};

function message(f: Omit<Finale, "message">): string {
  if (f.weeks && f.passed === f.weeks) return "🏆 Hver eneste uke i boks. Det er rett og slett legendarisk – takk for at du dro lasset!";
  if (f.passed >= f.weeks * 0.75) return "💪 For en høst! Nesten alle uker i boks – det er sånn vaner bygges.";
  if (f.passed >= f.weeks / 2) return "👏 Flere uker i boks enn ikke. Formen er bedre nå enn da du startet – ta den med videre!";
  return "🙌 Du var med hele veien, og hver økt teller. Neste utfordring er din!";
}

/** Who wins: everyone sharing the top value (ties are shared), or nobody when the best is 0. */
function award(emoji: string, title: string, rows: { name: string; id: number; v: number }[], fmt: (v: number) => string, me: number): Award | null {
  const best = Math.max(0, ...rows.map((r) => r.v));
  if (best <= 0) return null;
  const top = rows.filter((r) => r.v === best);
  return { emoji, title, names: top.map((r) => r.name.split(" ")[0]), value: fmt(best), mine: top.some((r) => r.id === me) };
}

/** The finished challenge seen by `userId`, or null while it is still running (or they weren't in it). */
export async function challengeFinale(board: Board, userId: number, force = false): Promise<Finale | null> {
  const c = board.challenge;
  if (!force && osloDate() <= c.ends_on) return null;
  const me = board.members.find((m) => m.id === userId);
  if (!me) return null;
  const counted = me.results.filter((r) => r.state !== "before" && r.state !== "future");
  if (!counted.length) return null;

  const [stats, firsts] = await Promise.all([personStats(c, board, "alt"), firstFinishCounts(c)]);
  const mine = stats.find((s) => s.m.id === userId)!;
  const s = computeStats(me.workouts);
  const best = counted.reduce<(typeof counted)[number] | null>((a, r) => (!a || r.minutes > a.minutes ? r : a), null);
  const rows = (v: (p: (typeof stats)[number]) => number) => stats.map((p) => ({ name: p.m.name, id: p.m.id, v: v(p) }));
  const hours = (min: number) => formatMinutes(min);

  const awards = [
    award("⏱️", "Flest timer", rows((p) => p.minutes), hours, userId),
    award("💪", "Flest økter", rows((p) => p.sessions), (v) => `${v} økter`, userId),
    award("🔥", "Lengste rekke", rows((p) => p.bestStreak), (v) => `${v} uker på rad`, userId),
    award("🏃", "Lengst løpt", rows((p) => Math.round(p.runKm * 10) / 10), (v) => `${v.toLocaleString("nb-NO")} km`, userId),
    award("🥇", "Oftest først i mål", rows((p) => firsts.get(p.m.id) ?? 0), (v) => `${v} ${v === 1 ? "gang" : "ganger"}`, userId),
    award("📣", "Heiagjengens leder", rows((p) => p.kudosGiven), (v) => `${v} kudos gitt`, userId),
  ].filter((a): a is Award => !!a);

  const all = board.members.map((m) => computeStats(m.workouts));
  const finished = board.members.filter((m) => m.results.some((r) => r.state === "done"));
  const perfect = finished
    .filter((m) => m.results.every((r) => r.state === "before" || r.state === "future" || r.passed))
    .map((m) => m.name.split(" ")[0]);

  const f: Omit<Finale, "message"> = {
    challengeId: c.id,
    name: c.name,
    range: `${formatDay(c.starts_on)}–${formatDay(c.ends_on)}`,
    weeks: counted.length,
    passed: counted.filter((r) => r.passed).length,
    sessions: s.sessions,
    minutes: s.minutes,
    km: s.runKm + s.rideKm + s.swimKm + s.walkKm,
    elevation: s.elevation,
    bestWeek: best && best.minutes > 0 ? { weekNo: isoWeekNumber(best.week), minutes: best.minutes } : null,
    bestStreak: mine.bestStreak,
    badges: badgesFor(mine, c, firsts.get(userId) ?? 0).filter((b) => b.earned).map(({ emoji, title }) => ({ emoji, title })),
    jokersUsed: me.jokers.used,
    finesKr: me.paidKr + me.owedKr + me.claimedKr,
    rank: 1 + stats.filter((p) => p.minutes > mine.minutes).length,
    people: stats.length,
    awards,
    group: {
      sessions: all.reduce((n, x) => n + x.sessions, 0),
      minutes: all.reduce((n, x) => n + x.minutes, 0),
      km: all.reduce((n, x) => n + x.runKm + x.rideKm + x.swimKm + x.walkKm, 0),
      potKr: board.members.reduce((n, m) => n + m.paidKr + m.owedKr + m.claimedKr, 0),
      perfect,
    },
  };
  return { ...f, message: message(f) };
}
