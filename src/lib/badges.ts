import type { User } from "./auth";
import { activeChallenge, annotate, applyVerdicts, WORKOUT_COLUMNS, type Workout } from "./challenge";
import { one, query } from "./db";

type Badges = { "/": number; "/logg": number; "/prat": number; "/admin": number };

/** The numbers on the tab bar: new kudos/comments, workouts to check in, unread chat, admin to-dos. */
export async function badgesFor(user: User & { group_id: number }): Promise<{ badges: Badges; avatarV: number | null }> {
  const counts = (await one<{ avatar_v: number | null; unread: number; activity: number; admin: number }>(
    `select extract(epoch from u.avatar_updated_at)::int as avatar_v,
            (select count(*)::int from messages m where m.group_id = $2 and m.created_at > u.chat_seen_at and (m.user_id is null or m.user_id <> u.id)) as unread,
            (select count(*)::int from kudos k join workouts w on w.id = k.workout_id
              where w.user_id = u.id and k.user_id <> u.id and k.group_id = $2 and k.created_at > u.activity_seen_at)
          + (select count(*)::int from comments c join workouts w on w.id = c.workout_id
              where w.user_id = u.id and c.user_id <> u.id and c.group_id = $2 and c.created_at > u.activity_seen_at) as activity,
            case when $3 then (select count(*)::int from group_members where group_id = $2 and not approved)
              + (select count(*)::int from fines f join challenges c on c.id = f.challenge_id where c.group_id = $2 and f.status = 'claimed') else 0 end as admin
       from users u where u.id = $1`,
    [user.id, user.group_id, user.is_admin],
  ))!;
  const c = await activeChallenge(user.group_id);
  const waiting = c
    ? annotate(c, await applyVerdicts(user.group_id, await query<Workout>(
        `select ${WORKOUT_COLUMNS} from workouts where user_id = $1 and checked_in_at is null and not rejected and started_at > now() - interval '8 days'`,
        [user.id],
      ))).filter((w) => w.status === "pending").length
    : 0;
  return { badges: { "/": counts.activity, "/logg": waiting, "/prat": counts.unread, "/admin": counts.admin }, avatarV: counts.avatar_v };
}
