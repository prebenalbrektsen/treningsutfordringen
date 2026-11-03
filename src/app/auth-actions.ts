"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { admins, push } from "@/lib/push";
import { checkPassword, currentUser, endSession, hashPassword, startSession } from "@/lib/auth";
import { one, query } from "@/lib/db";

export type FormState = { error?: string } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await one<{ id: number; password_hash: string | null }>("select id, password_hash from users where lower(email) = $1", [email]);
  if (!user?.password_hash || !(await checkPassword(password, user.password_hash))) {
    return { error: "Feil e-post eller passord." };
  }
  await startSession(user.id);
  redirect("/");
}

/** First run only: the very first account becomes the system admin. */
export async function setupAdmin(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!name || !email || password.length < 8) return { error: "Fyll inn navn, e-post og et passord på minst 8 tegn." };
  // The very first account owns the app (system admin) and goes on to start the first group.
  const created = await one<{ id: number }>(
    `insert into users (name, email, password_hash, is_admin, is_sysadmin)
     select $1, $2, $3, true, true where not exists (select 1 from users) returning id`,
    [name, email, await hashPassword(password)],
  );
  if (!created) return { error: "Appen er allerede satt opp. Logg inn i stedet." };
  await startSession(created.id);
  redirect("/ny-gruppe");
}

export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || password.length < 8) return { error: "Fyll inn e-post og et passord på minst 8 tegn." };
  const taken = await one("select 1 from users where lower(email) = $1 and invite_token is distinct from $2", [email, token]);
  if (taken) return { error: "Den e-posten er allerede i bruk." };
  const user = await one<{ id: number }>(
    "update users set email = $2, password_hash = $3, invite_token = null where invite_token = $1 returning id",
    [token, email, await hashPassword(password)],
  );
  if (!user) return { error: "Invitasjonen er brukt eller ugyldig. Be admin om en ny lenke." };
  await startSession(user.id);
  redirect("/velkommen");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function hasUsers(): Promise<boolean> {
  return (await query("select 1 from users limit 1")).length > 0;
}

/** A group's shared link: anyone with it can ask to join; the group's admin approves them first. */
export async function joinViaGroupLink(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const group = token ? await one<{ id: number; name: string }>("select id, name from groups where join_token = $1 and disabled_at is null", [token]) : null;
  if (!group) return { error: "Lenken er ikke lenger i bruk. Be om en ny." };
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!name || !email || password.length < 8) return { error: "Fyll inn navn, e-post og et passord på minst 8 tegn." };
  if (await one("select 1 from users where lower(email) = $1", [email])) return { error: "Du har allerede en konto. Logg inn, og åpne lenken på nytt – da kan du bli med med samme konto." };
  const colors = ["#e4572e", "#2e86ab", "#7a9e3e", "#a23b72", "#f18f01", "#3b1f2b", "#0f7173", "#c73e1d", "#6a4c93", "#1982c4"];
  const count = await one<{ n: number }>("select count(*)::int as n from users");
  const user = await one<{ id: number }>(
    "insert into users (name, email, password_hash, color, current_group_id) values ($1, $2, $3, $4, $5) returning id",
    [name, email, await hashPassword(password), colors[count!.n % colors.length], group.id],
  );
  await query("insert into group_members (group_id, user_id, approved) values ($1, $2, false)", [group.id, user!.id]);
  await startSession(user!.id);
  after(async () => push(await admins(group.id), "admin", { title: "👋 Ny deltaker venter", body: `${name} vil bli med i ${group.name}`, url: "/admin?fane=deltakere" }));
  redirect("/venter");
}

/** Already has an account (e.g. in another group): ask to join this group too. */
export async function joinGroupAsMe(token: string): Promise<void> {
  const me = await currentUser();
  if (!me) redirect("/login");
  const group = await one<{ id: number; name: string }>("select id, name from groups where join_token = $1 and disabled_at is null", [token]);
  if (!group) redirect("/");
  const added = await query("insert into group_members (group_id, user_id, approved) values ($1, $2, false) on conflict do nothing returning 1", [group.id, me.id]);
  await query("update users set current_group_id = $2 where id = $1", [me.id, group.id]);
  if (added.length) after(async () => push(await admins(group.id), "admin", { title: "👋 Ny deltaker venter", body: `${me.name} vil bli med i ${group.name}`, url: "/admin?fane=deltakere" }));
  redirect("/venter");
}
