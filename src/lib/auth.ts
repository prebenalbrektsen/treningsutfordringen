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
  is_admin: boolean;
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
  return one<User>(
    `select u.id, u.name, u.email, u.is_admin, u.color, u.strava_athlete_id, u.strava_synced_at, u.approved,
            u.strava_consent_at, u.setup_done_at, u.share_distance, u.share_elevation, u.share_hr, u.share_title
       from sessions s join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now()`,
    [token],
  );
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Joined through the shared family link and not approved yet: only the waiting room.
  if (!user.approved) redirect("/venter");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.is_admin) redirect("/");
  return user;
}
