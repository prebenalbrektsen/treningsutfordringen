import type { Board, Challenge } from "@/lib/challenge";
import { firstFinishCounts, personStats } from "@/lib/leaderboard";
import { weekRecap } from "@/lib/recap";
import { challengeFinale } from "@/lib/finale";
import { Celebrations } from "./Celebrate";
import { badgesFor } from "./Profile";

/** Works out this person's jokers and earned badges, and lets the client celebrate anything new. */
export async function CelebrationsFor({ c, board, userId }: { c: Challenge; board: Board; userId: number }) {
  const me = board.members.find((m) => m.id === userId);
  if (!me) return null;
  const stats = (await personStats(c, board, "alt")).find((p) => p.m.id === userId)!;
  const [firsts, recap, finale] = await Promise.all([firstFinishCounts(c), weekRecap(board, userId), challengeFinale(board, userId)]);
  const badges = badgesFor(stats, c, firsts.get(userId) ?? 0)
    .filter((b) => b.earned)
    .map(({ id, title, emoji, how }) => ({ id, title, emoji, how }));
  return <Celebrations userId={userId} challengeId={c.id} jokers={me.jokers} badges={badges} recap={recap} finale={finale} />;
}
