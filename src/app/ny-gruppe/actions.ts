"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser, hashPassword, newToken, startSession } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { addDays, weekStart } from "@/lib/time";

export type GroupFormState = { error?: string } | undefined;

const COLORS = ["#e4572e", "#2e86ab", "#7a9e3e", "#a23b72", "#f18f01", "#3b1f2b", "#0f7173", "#c73e1d", "#6a4c93", "#1982c4"];

/** An unused group invitation, or null. */
export async function openInvite(token: string): Promise<{ token: string; note: string | null } | null> {
  if (!token) return null;
  return one("select token, note from group_invites where token = $1 and used_at is null", [token]);
}

/** Step 1 for someone without an account: create one, then on to naming the group. */
export async function signUpForGroup(_: GroupFormState, form: FormData): Promise<GroupFormState> {
  const token = String(form.get("token") ?? "");
  if (!(await openInvite(token))) return { error: "Invitasjonen er brukt eller ugyldig." };
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!name || !email || password.length < 8) return { error: "Fyll inn navn, e-post og et passord på minst 8 tegn." };
  if (await one("select 1 from users where lower(email) = $1", [email])) return { error: "Du har allerede en konto. Logg inn, og åpne invitasjonen på nytt." };
  const count = await one<{ n: number }>("select count(*)::int as n from users");
  const user = await one<{ id: number }>(
    "insert into users (name, email, password_hash, color) values ($1, $2, $3, $4) returning id",
    [name, email, await hashPassword(password), COLORS[count!.n % COLORS.length]],
  );
  await startSession(user!.id);
  redirect(`/ny-gruppe/${token}`);
}

/**
 * Step 2: the group and its first challenge. Allowed with an unused invitation from the system
 * admin, or for the system admin themselves. The person becomes the group's admin.
 */
export async function createGroup(_: GroupFormState, form: FormData): Promise<GroupFormState> {
  const me = await currentUser();
  if (!me) redirect("/login");
  const token = String(form.get("token") ?? "");
  if (!me.is_sysadmin && !(await openInvite(token))) return { error: "Invitasjonen er brukt eller ugyldig." };

  const groupName = String(form.get("group_name") ?? "").trim().slice(0, 50);
  const title = String(form.get("admin_title") ?? "").trim().slice(0, 30) || "Kontrolløren";
  const challengeName = String(form.get("challenge_name") ?? "").trim().slice(0, 50);
  const weekEnd = Math.min(6, Math.max(0, Number(form.get("week_ends_on") ?? 0) || 0));
  const pickedStart = String(form.get("starts_on") ?? "");
  // Begin on the first day of a whole week (the day after the chosen last weekday).
  const first = pickedStart && weekStart(pickedStart, { week_ends_on: weekEnd });
  const startsOn = first && first !== pickedStart ? addDays(first, 7) : pickedStart;
  const endsOn = String(form.get("ends_on") ?? "");
  const num = (k: string, d: number) => { const n = Number(String(form.get(k) ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? Math.round(n) : d; };
  const vipps = String(form.get("vipps_info") ?? "").trim() || null;
  if (!groupName || !challengeName || !startsOn || !endsOn) return { error: "Gi gruppa og utfordringen et navn, og velg datoer." };
  if (endsOn < startsOn) return { error: "Sluttdatoen må være etter startdatoen." };

  // Claim the invitation first (once only), so two tabs can't make two groups from it.
  if (!me.is_sysadmin) {
    const claimed = await query("update group_invites set used_at = now() where token = $1 and used_at is null returning 1", [token]);
    if (!claimed.length) return { error: "Invitasjonen er allerede brukt." };
  }
  const group = await one<{ id: number }>(
    "insert into groups (name, admin_title, join_token) values ($1, $2, $3) returning id",
    [groupName, title, newToken(12)],
  );
  if (!me.is_sysadmin) await query("update group_invites set group_id = $2 where token = $1", [token, group!.id]);
  await query("insert into group_members (group_id, user_id, role) values ($1, $2, 'admin')", [group!.id, me.id]);
  const challenge = await one<{ id: number }>(
    `insert into challenges (group_id, name, starts_on, ends_on, min_sessions, session_minutes, long_session_minutes, penalty_kr, vipps_info, week_ends_on)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [group!.id, challengeName, startsOn, endsOn, num("min_sessions", 3), num("session_minutes", 35), num("long_session_minutes", 60), num("penalty_kr", 50), vipps, weekEnd],
  );
  await query("insert into challenge_members (challenge_id, user_id) values ($1, $2)", [challenge!.id, me.id]);
  await query("update users set current_group_id = $2 where id = $1", [me.id, group!.id]);
  revalidatePath("/", "layout");
  redirect("/velkommen?eier=1");
}

/** Show another of your groups. */
export async function switchGroup(groupId: number): Promise<void> {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (await one("select 1 from group_members where group_id = $1 and user_id = $2", [groupId, me.id])) {
    await query("update users set current_group_id = $2 where id = $1", [me.id, groupId]);
  }
  revalidatePath("/", "layout");
  redirect("/");
}
