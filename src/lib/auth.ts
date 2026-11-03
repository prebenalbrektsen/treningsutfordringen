import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { one, query } from "./db";

const COOKIE = "sb_session";
const DAYS = 120;

export type User = {
  id: number;
  name: string;
  email: string | null;
  /** Admin of the group being viewed (the group's own title for it, e.g. «Kontrollør», is admin_title). */
  is_admin: boolean;
  /** Owner of the whole app: creates group invitations, sees every group. */
  is_sysadmin: boolean;
  /** The group being viewed (null = not in any group yet). */
  group_id: number | null;
  group_name: string | null;
  admin_title: string;
  color: string;
  strava_athlete_id: string | null;
  approved: boolean;
  strava_synced_at: Date | null;
  strava_consent_at: Date | null;
  setup_done_at: Date | null;
  share_distance: boolean;
  share_elevation: boolean;
  share_hr: boolean;
  share_title: boolean;
};

export function newToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function startSession(userId: number): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + DAYS * 86400000);
  await query("insert into sessions (token, user_id, expires_at) values ($1, $2, $3)", [token, userId, expires]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await query("delete from sessions where token = $1", [token]);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  // Admin and approved are per group: they come from the membership of the group being viewed
  // (the chosen one, else the first the person joined). A disabled group isn't shown.
  return one<User>(
    `select u.id, u.name, u.email, u.color, u.strava_athlete_id, u.strava_synced_at, u.is_sysadmin,
            u.strava_consent_at, u.setup_done_at, u.share_distance, u.share_elevation, u.share_hr, u.share_title,
            g.id as group_id, g.name as group_name, coalesce(g.admin_title, 'Kontrolløren') as admin_title,
            coalesce(gm.role = 'admin', false) as is_admin, coalesce(gm.approved, false) as approved
       from sessions s join users u on u.id = s.user_id
       left join lateral (
         select m.* from group_members m join groups gg on gg.id = m.group_id and gg.disabled_at is null
          where m.user_id = u.id order by (m.group_id = u.current_group_id) desc, m.joined_at limit 1
       ) gm on true
       left join groups g on g.id = gm.group_id
      where s.token = $1 and s.expires_at > now()`,
    [token],
  );
}

export async function requireUser(): Promise<User & { group_id: number }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Not in any group (e.g. just signed up through a group invitation): start one, or wait.
  if (!user.group_id) redirect("/ny-gruppe");
  // Joined through a group's shared link and not approved yet: only the waiting room.
  if (!user.approved) redirect("/venter");
  return user as User & { group_id: number };
}

/** The app owner: group invitations and an overview of every group. */
export async function requireSysadmin(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.is_sysadmin) redirect("/");
  return user;
}

export async function requireAdmin(): Promise<User & { group_id: number }> {
  const user = await requireUser();
  if (!user.is_admin) redirect("/");
  return user;
}
