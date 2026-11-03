"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { announceWeek } from "@/lib/announce";
import { processAvatar, processProof } from "@/lib/images";
import { admins, CATEGORIES, everyoneBut, push } from "@/lib/push";
import { checkPassword, hashPassword, newToken, requireAdmin, requireUser } from "@/lib/auth";
import { activeChallenge, checkInDeadline, loadBoard, mayJoin, type Challenge } from "@/lib/challenge";
import { one, query } from "@/lib/db";
import { disconnectStrava, subscribeWebhook, syncStrava } from "@/lib/strava";
import { sportLabel, WATER_SPORTS } from "@/lib/sports";
import { addDays, formatDay, fromOsloLocal, isoWeekNumber, mondayOf, osloDate } from "@/lib/time";

export type ActionState = { error?: string; ok?: string; link?: string } | undefined;

function int(form: FormData, key: string): number | null {
  const v = String(form.get(key) ?? "").trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---- Workouts ----

export async function logWorkout(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const sport = String(form.get("sport") ?? "");
  const startedRaw = String(form.get("started_at") ?? "");
  const duration = int(form, "duration_min");
  const distanceKm = int(form, "distance_km");
  const title = String(form.get("title") ?? "").trim() || null;
  const proof = String(form.get("proof") ?? ""); // data:image/jpeg;base64,... resized in the browser

  if (!sport || !startedRaw || !duration || duration < 1 || duration > 24 * 60) return { error: "Fyll inn type, tidspunkt og varighet." };
  const startedAt = fromOsloLocal(startedRaw);
  if (startedAt.getTime() > Date.now() + 5 * 60000) return { error: "Økta kan ikke være i fremtiden." };
  const c = await activeChallenge();
  // Logging by hand is checking in, so the same deadline applies. The admin can always add.
  if (c && !user.is_admin && checkInDeadline(c, { started_at: startedAt, duration_min: duration, imported_at: new Date() }) < new Date()) {
    return { error: c.check_in_hours
      ? `Økter må sjekkes inn innen ${c.check_in_hours} timer (og før uka er over). Spør admin hvis noe har glemt å bli registrert.`
      : "Den uka er avsluttet. Spør admin hvis noe har glemt å bli registrert." };
  }

  let photo = null;
  if (proof) {
    const p = await processProof(proof);
    if ("error" in p) return { error: p.error };
    photo = p;
  }
  if (!photo && (c?.proof_required ?? true)) {
    return { error: "Legg ved et bilde som dokumentasjon – skjermbilde fra klokka/appen eller et bilde av økta." };
  }

  await query(
    `insert into workouts (user_id, started_at, duration_min, sport, title, distance_m, proof_image, proof_thumb, proof_mime, meets_task, source, checked_in_at, imported_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual', now(), now())`,
    [user.id, startedAt, Math.round(duration), sport, title, distanceKm ? Math.round(distanceKm * 1000) : null,
      photo?.image ?? null, photo?.thumb ?? null, photo?.mime ?? null, form.get("meets_task") === "on"],
  );
  await announceWeek(user.id);
  revalidatePath("/", "layout");
  redirect("/?logget=1");
}

async function ownWorkout(id: number) {
  const user = await requireUser();
  const w = await one<{ user_id: number; source: string; started_at: Date; duration_min: number; imported_at: Date; checked_in_at: Date | null; has_proof: boolean }>(
    "select user_id, source, started_at, duration_min, imported_at, checked_in_at, proof_image is not null as has_proof from workouts where id = $1",
    [id],
  );
  if (!w || (w.user_id !== user.id && !user.is_admin)) throw new Error("Ikke din økt");
  return { user, w };
}

export async function deleteWorkout(id: number): Promise<void> {
  const { w } = await ownWorkout(id);
  // Strava workouts would just come back on the next sync; the admin rejects those instead.
  if (w.source !== "manual") return;
  await query("delete from workouts where id = $1", [id]);
  revalidatePath("/", "layout");
}

export async function toggleMeetsTask(id: number): Promise<void> {
  await ownWorkout(id);
  const w = await one<{ user_id: number }>("update workouts set meets_task = not meets_task where id = $1 returning user_id", [id]);
  await announceWeek(w!.user_id);
  revalidatePath("/", "layout");
}

/** The Kontrollør's verdicts go in the chat, so everyone sees the rules are enforced. */
async function refereeSays(workoutId: number, verb: string): Promise<void> {
  const w = await one<{ name: string; sport: string; day: string }>(
    "select u.name, w.sport, to_char(w.started_at at time zone 'Europe/Oslo', 'DD.MM') as day from workouts w join users u on u.id = w.user_id where w.id = $1",
    [workoutId],
  );
  if (w) await query("insert into messages (user_id, body) values (null, $1)", [`${verb} ${sportLabel(w.sport).toLowerCase()}-økta til ${w.name} fra ${w.day}.`]);
  const owner = await one<{ user_id: number }>("select user_id from workouts where id = $1", [workoutId]);
  if (w && owner) after(() => push([owner.user_id], "checkin", { title: "Kontrolløren har sett på økta di", body: `${verb.replace(/^\S+ /, "")} ${sportLabel(w.sport).toLowerCase()}-økta fra ${w.day}.`, url: `/okt/${workoutId}` }));
}

export async function toggleRejected(id: number): Promise<void> {
  await requireAdmin();
  const w = await one<{ rejected: boolean }>("update workouts set rejected = not rejected where id = $1 returning rejected", [id]);
  await refereeSays(id, w?.rejected ? "🚨 Kontrolløren underkjente" : "✅ Kontrolløren godkjente likevel");
  revalidatePath("/", "layout");
}

// ---- Fines ----

/** The participant says "I've paid" for every week they owe. The admin confirms afterwards. */
export async function claimPaid(weeks: string[]): Promise<void> {
  const user = await requireUser();
  const c = await activeChallenge();
  if (!c || !weeks.length) return;
  await query(
    `insert into fines (challenge_id, user_id, week_start, status)
     select $1, $2, unnest($3::date[]), 'claimed'
     on conflict (challenge_id, user_id, week_start) do nothing`,
    [c.id, user.id, weeks],
  );
  after(async () => push(await admins(), "admin", { title: "💸 Meldt betalt", body: `${user.name} sier ${weeks.length * c.penalty_kr} kr er betalt – sjekk Vipps`, url: "/admin?fane=boter" }));
  revalidatePath("/", "layout");
}

export async function setFine(userId: number, week: string, status: "owed" | "claimed" | "paid" | "waived"): Promise<void> {
  await requireAdmin();
  const c = await activeChallenge();
  if (!c) return;
  if (status === "owed") {
    await query("delete from fines where challenge_id = $1 and user_id = $2 and week_start = $3", [c.id, userId, week]);
  } else {
    await query(
      `insert into fines (challenge_id, user_id, week_start, status) values ($1, $2, $3, $4)
       on conflict (challenge_id, user_id, week_start) do update set status = excluded.status, updated_at = now()`,
      [c.id, userId, week, status],
    );
  }
  revalidatePath("/", "layout");
}

/** Admin: settle every unpaid week for one person at once. */
export async function settleAll(userId: number, status: "paid" | "waived"): Promise<void> {
  await requireAdmin();
  const c = await activeChallenge();
  if (!c) return;
  const board = await loadBoard(c);
  const weeks = board.members.find((m) => m.id === userId)?.results.filter((r) => r.fine === "owed" || r.fine === "claimed").map((r) => r.week) ?? [];
  if (!weeks.length) return;
  await query(
    `insert into fines (challenge_id, user_id, week_start, status) select $1, $2, unnest($3::date[]), $4
     on conflict (challenge_id, user_id, week_start) do update set status = excluded.status, updated_at = now()`,
    [c.id, userId, weeks, status],
  );
  revalidatePath("/", "layout");
}

export async function confirmAllClaimed(): Promise<void> {
  await requireAdmin();
  await query("update fines set status = 'paid', updated_at = now() where status = 'claimed'");
  revalidatePath("/", "layout");
}

// ---- Strava ----

export async function syncNow(): Promise<ActionState> {
  const user = await requireUser();
  const c = await activeChallenge();
  try {
    const added = await syncStrava(user.id, new Date(`${c ? addDays(c.starts_on, -7) : osloDate()}T00:00:00Z`));
    revalidatePath("/", "layout");
    return { ok: added ? `${added} nye økter hentet fra Strava.` : "Alt er oppdatert." };
  } catch (e) {
    console.error(e);
    return { error: "Fikk ikke kontakt med Strava. Prøv igjen, eller koble til på nytt." };
  }
}

export async function stravaDisconnect(): Promise<void> {
  const user = await requireUser();
  const r = await disconnectStrava(user.id);
  revalidatePath("/", "layout");
  redirect(`/meg?strava=slettet&n=${r.deleted}&b=${r.stripped}`);
}

/** Deletes everything that came from Strava, also checked-in workouts (on request, policy §2.5). */
export async function stravaDeleteEverything(): Promise<void> {
  const user = await requireUser();
  const r = await disconnectStrava(user.id, true);
  revalidatePath("/", "layout");
  redirect(`/meg?strava=slettet&n=${r.deleted}&b=0`);
}

// ---- Admin ----

export async function saveChallenge(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = int(form, "id");
  const values = [
    String(form.get("name") ?? "").trim(),
    String(form.get("starts_on") ?? ""),
    String(form.get("ends_on") ?? ""),
    int(form, "penalty_kr"),
    int(form, "min_sessions"),
    int(form, "session_minutes"),
    int(form, "long_session_minutes"),
    String(form.get("vipps_info") ?? "").trim() || null,
    int(form, "check_in_hours"),
    int(form, "max_per_day"),
    form.get("proof_required") === "on",
    String(form.get("description") ?? "").trim() || null,
    Math.max(1, int(form, "long_session_counts") ?? 2),
    form.get("join_mode") === "selected" ? "selected" : "open",
    int(form, "joker_every"),
    Math.max(0, int(form, "joker_max") ?? 2),
  ];
  if (!values[0] || !values[1] || !values[2] || values[3] == null || !values[4] || !values[5]) return { error: "Fyll inn alle feltene." };
  if (values[2]! < values[1]!) return { error: "Sluttdato må være etter startdato." };
  if (id) {
    await query(
      `update challenges set name = $2, starts_on = $3, ends_on = $4, penalty_kr = $5, min_sessions = $6,
         session_minutes = $7, long_session_minutes = $8, vipps_info = $9, check_in_hours = $10, max_per_day = $11,
         proof_required = $12, description = $13, long_session_counts = $14, join_mode = $15, joker_every = $16, joker_max = $17 where id = $1`,
      [id, ...values],
    );
  } else {
    const c = await one<Challenge>(
      `insert into challenges (name, starts_on, ends_on, penalty_kr, min_sessions, session_minutes, long_session_minutes, vipps_info,
         check_in_hours, max_per_day, proof_required, description, long_session_counts, join_mode, joker_every, joker_max)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning *`,
      values,
    );
    // Nobody is signed up automatically: everyone gets a «Bli med» card and opts in.
    await query("insert into messages (user_id, body, event_key) values (null, $1, $2)", [
      c!.join_mode === "open"
        ? `📣 Ny utfordring: ${c!.name} starter ${formatDay(c!.starts_on)}. Se reglene og bli med på forsiden!`
        : `📣 Ny utfordring: ${c!.name} starter ${formatDay(c!.starts_on)}. Er du invitert, ser du «Bli med» på forsiden.`,
      `challenge:${c!.id}`,
    ]);
  }
  revalidatePath("/", "layout");
  return { ok: "Lagret." };
}

/** Opt in. Weeks that started before today don't count against you. */
export async function joinChallenge(challengeId: number): Promise<void> {
  const user = await requireUser();
  const c = await one<Challenge>("select * from challenges where id = $1 and ends_on >= $2::date", [challengeId, osloDate()]);
  if (!c || !(await mayJoin(c, user.id))) return;
  const added = await query("insert into challenge_members (challenge_id, user_id) values ($1, $2) on conflict do nothing returning 1", [c.id, user.id]);
  if (added.length) {
    await query("insert into messages (user_id, body, event_key) values (null, $1, $2) on conflict (event_key) do nothing", [
      `🙌 ${user.name} er med i ${c.name}!`, `join:${c.id}:${user.id}`,
    ]);
  }
  revalidatePath("/", "layout");
}

/** Changing your mind is fine until the challenge starts; after that only the admin can take you out. */
export async function leaveChallenge(challengeId: number): Promise<void> {
  const user = await requireUser();
  await query(
    `delete from challenge_members m using challenges c
      where c.id = m.challenge_id and m.challenge_id = $1 and m.user_id = $2 and c.starts_on > $3::date`,
    [challengeId, user.id, osloDate()],
  );
  await query("delete from messages where event_key = $1", [`join:${challengeId}:${user.id}`]);
  revalidatePath("/", "layout");
}

export async function addParticipant(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Skriv inn et navn." };
  const colors = ["#e4572e", "#2e86ab", "#7a9e3e", "#a23b72", "#f18f01", "#3b1f2b", "#0f7173", "#c73e1d", "#6a4c93", "#1982c4"];
  const count = await one<{ n: string }>("select count(*) as n from users");
  const token = newToken(16);
  await query("insert into users (name, invite_token, color) values ($1, $2, $3)", [name, token, colors[Number(count!.n) % colors.length]]);
  revalidatePath("/", "layout");
  return { ok: name, link: `${process.env.APP_URL ?? ""}/invitasjon/${token}` };
}

export async function newInvite(userId: number): Promise<void> {
  await requireAdmin();
  await query("update users set invite_token = $2 where id = $1", [userId, newToken(16)]);
  revalidatePath("/admin");
}

export async function toggleMember(userId: number): Promise<void> {
  await requireAdmin();
  const c = await activeChallenge();
  if (!c) return;
  const removed = await query("delete from challenge_members where challenge_id = $1 and user_id = $2 returning 1", [c.id, userId]);
  if (!removed.length) await query("insert into challenge_members (challenge_id, user_id) values ($1, $2)", [c.id, userId]);
  revalidatePath("/", "layout");
}

/** Someone who joined mid-week counts from next week; this lets the current week count too. */
export async function countThisWeek(userId: number): Promise<void> {
  await requireAdmin();
  const c = await activeChallenge();
  if (!c) return;
  const monday = fromOsloLocal(`${mondayOf(osloDate())}T00:00`);
  await query("update challenge_members set joined_at = $3 where challenge_id = $1 and user_id = $2 and joined_at > $3", [c.id, userId, monday]);
  revalidatePath("/", "layout");
}

export async function saveTask(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const c = await activeChallenge();
  const week = mondayOf(String(form.get("week") ?? ""));
  const title = String(form.get("title") ?? "").trim();
  if (!c || !title) return { error: "Velg uke og skriv kravet." };
  const auto = form.get("water") === "on" ? WATER_SPORTS : [];
  await query(
    `insert into weekly_tasks (challenge_id, week_start, title, description, auto_sports) values ($1, $2, $3, $4, $5)
     on conflict (challenge_id, week_start) do update set title = excluded.title, description = excluded.description, auto_sports = excluded.auto_sports`,
    [c.id, week, title, String(form.get("description") ?? "").trim() || null, auto],
  );
  revalidatePath("/", "layout");
  return { ok: "Ukeskravet er lagt ut." };
}

export async function deleteTask(id: number): Promise<void> {
  await requireAdmin();
  await query("delete from weekly_tasks where id = $1", [id]);
  revalidatePath("/", "layout");
}

// ---- Social ----

export async function toggleKudos(workoutId: number): Promise<void> {
  const user = await requireUser();
  const removed = await query("delete from kudos where workout_id = $1 and user_id = $2 returning 1", [workoutId, user.id]);
  if (!removed.length) {
    await query("insert into kudos (workout_id, user_id) values ($1, $2) on conflict do nothing", [workoutId, user.id]);
    const w = await one<{ user_id: number; sport: string }>("select user_id, sport from workouts where id = $1", [workoutId]);
    if (w && w.user_id !== user.id) {
      after(() => push([w.user_id], "kudos", { title: `🔥 ${user.name} ga deg kudos`, body: `for ${sportLabel(w.sport).toLowerCase()}-økta di`, url: `/okt/${workoutId}`, tag: `kudos-${workoutId}` }));
    }
  }
  revalidatePath("/", "layout");
}

export async function addComment(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const body = String(form.get("body") ?? "").trim().slice(0, 1000);
  const workoutId = int(form, "workout_id");
  if (!body || !workoutId) return { error: "Skriv noe først." };
  await query("insert into comments (workout_id, user_id, body) values ($1, $2, $3)", [workoutId, user.id, body]);
  const owner = await one<{ user_id: number }>("select user_id from workouts where id = $1", [workoutId]);
  if (owner && owner.user_id !== user.id) {
    after(() => push([owner.user_id], "comments", { title: `💬 ${user.name} kommenterte økta di`, body: body.slice(0, 140), url: `/okt/${workoutId}` }));
  }
  revalidatePath("/", "layout");
  return { ok: "" };
}

export async function deleteComment(id: number): Promise<void> {
  const user = await requireUser();
  await query("delete from comments where id = $1 and (user_id = $2 or $3)", [id, user.id, user.is_admin]);
  revalidatePath("/", "layout");
}

export async function sendMessage(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const body = String(form.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return undefined;
  await query("insert into messages (user_id, body) values ($1, $2)", [user.id, body]);
  after(async () => push(await everyoneBut(user.id), "chat", { title: "Garderoben", body: `${user.name.split(" ")[0]}: ${body.slice(0, 140)}`, url: "/prat", tag: "chat" }));
  await query("update users set chat_seen_at = now() where id = $1", [user.id]);
  revalidatePath("/prat");
  return { ok: "" };
}

export async function deleteMessage(id: number): Promise<void> {
  const user = await requireUser();
  await query("delete from messages where id = $1 and (user_id = $2 or $3)", [id, user.id, user.is_admin]);
  revalidatePath("/prat");
}

/**
 * Check in a workout: the participant confirms it counts, with a photo when the challenge
 * requires one. Calling it again on a checked-in workout just replaces the photo.
 */
export async function checkIn(workoutId: number, dataUrl: string | null): Promise<ActionState> {
  const { user, w } = await ownWorkout(workoutId);
  const c = await activeChallenge();
  let photo = null;
  if (dataUrl) {
    const p = await processProof(dataUrl);
    if ("error" in p) return { error: p.error };
    photo = p;
  }
  if (!w.checked_in_at) {
    if (c && !user.is_admin && checkInDeadline(c, w) < new Date()) return { error: "Fristen for å sjekke inn denne økta har gått ut." };
    if ((c?.proof_required ?? true) && !photo && !w.has_proof) return { error: "Legg ved et bilde for å sjekke inn." };
  }
  await query(
    `update workouts set checked_in_at = coalesce(checked_in_at, now()),
       proof_image = coalesce($2, proof_image), proof_thumb = coalesce($3, proof_thumb), proof_mime = coalesce($4, proof_mime) where id = $1`,
    [workoutId, photo?.image ?? null, photo?.thumb ?? null, photo?.mime ?? null],
  );
  await announceWeek(w.user_id);
  revalidatePath("/", "layout");
  return { ok: w.checked_in_at ? "Bildet er byttet." : "Sjekket inn! 💪" };
}

/** Admin: let a workout count even though it was never checked in (e.g. Strava synced too late). */
export async function approveWorkout(workoutId: number): Promise<void> {
  await requireAdmin();
  const w = await one<{ user_id: number }>("update workouts set checked_in_at = coalesce(checked_in_at, now()), rejected = false where id = $1 returning user_id", [workoutId]);
  await refereeSays(workoutId, "✅ Kontrolløren godkjente");
  if (w) await announceWeek(w.user_id);
  revalidatePath("/", "layout");
}

export async function setAvatar(dataUrl: string): Promise<ActionState> {
  const user = await requireUser();
  const avatar = await processAvatar(dataUrl);
  if ("error" in avatar) return { error: avatar.error };
  await query("update users set avatar = $2, avatar_updated_at = now() where id = $1", [user.id, avatar]);
  revalidatePath("/", "layout");
  return { ok: "" };
}

// ---- Own settings ----

export async function renameMe(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (!name) return { error: "Skriv inn et navn." };
  await query("update users set name = $2 where id = $1", [user.id, name]);
  revalidatePath("/", "layout");
  return { ok: "Lagret." };
}

export async function changePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 8) return { error: "Det nye passordet må ha minst 8 tegn." };
  const row = await one<{ password_hash: string | null }>("select password_hash from users where id = $1", [user.id]);
  if (!row?.password_hash || !(await checkPassword(current, row.password_hash))) return { error: "Nåværende passord stemmer ikke." };
  await query("update users set password_hash = $2 where id = $1", [user.id, await hashPassword(next)]);
  // Other phones stay logged in with their own session; this one too.
  return { ok: "Passordet er byttet." };
}

export async function deletePasskey(id: number): Promise<void> {
  const user = await requireUser();
  await query("delete from passkeys where id = $1 and user_id = $2", [id, user.id]);
  revalidatePath("/meg");
}

/** Admin, for challenges where only picked people may join: allow or disallow one person. */
export async function toggleInvite(challengeId: number, userId: number): Promise<void> {
  await requireAdmin();
  const removed = await query("delete from challenge_invites where challenge_id = $1 and user_id = $2 returning 1", [challengeId, userId]);
  if (!removed.length) await query("insert into challenge_invites (challenge_id, user_id) values ($1, $2)", [challengeId, userId]);
  revalidatePath("/", "layout");
}

/** Admin: ask Strava to notify the app about new workouts (one subscription for the whole app). */
export async function activateStravaWebhook(): Promise<ActionState> {
  await requireAdmin();
  const r = await subscribeWebhook();
  if (r.ok) await query("insert into settings (key, value) values ('strava_webhook', '1') on conflict (key) do nothing");
  revalidatePath("/admin");
  return r.ok ? { ok: r.message } : { error: r.message };
}

// ---- Shared family invite link ----

export async function createGroupLink(): Promise<void> {
  await requireAdmin();
  await query("insert into settings (key, value) values ('group_invite', $1) on conflict (key) do update set value = excluded.value", [newToken(12)]);
  revalidatePath("/admin");
}

export async function disableGroupLink(): Promise<void> {
  await requireAdmin();
  await query("delete from settings where key = 'group_invite'");
  revalidatePath("/admin");
}

export async function approveUser(userId: number): Promise<void> {
  await requireAdmin();
  const u = await one<{ name: string }>("update users set approved = true where id = $1 and not approved returning name", [userId]);
  if (u) {
    await query("insert into messages (user_id, body) values (null, $1)", [`👋 ${u.name} er med i Treningsutfordring!`]);
    after(() => push([userId], "test", { title: "Du er godkjent! 🎉", body: "Velkommen i Treningsutfordring – trykk for å komme i gang.", url: "/velkommen" }));
  }
  revalidatePath("/", "layout");
}

/** Someone the admin doesn't know asked to join: remove the account again. */
export async function rejectUser(userId: number): Promise<void> {
  await requireAdmin();
  await query("delete from users where id = $1 and not approved", [userId]);
  revalidatePath("/", "layout");
}

// ---- Push notifications ----

export async function setNotify(category: string, on: boolean): Promise<void> {
  const user = await requireUser();
  if (!(category in CATEGORIES)) return;
  await query("update users set notify = notify || jsonb_build_object($2::text, $3::boolean) where id = $1", [user.id, category, on]);
}

export async function sendTestPush(): Promise<void> {
  const user = await requireUser();
  const subs = await one<{ n: number }>("select count(*)::int as n from push_subscriptions where user_id = $1", [user.id]);
  if (!subs?.n) return;
  await push([user.id], "test", { title: "Treningsutfordring 💪", body: "Varsler virker! Nå får du beskjed om kudos, innsjekk og påminnelser.", url: "/meg", tag: "test" });
}

/**
 * Admin: remove someone who was invited but never set up their account (no password yet) –
 * e.g. to let them join through the shared link instead. Real accounts can't be removed here.
 */
export async function removeInvite(userId: number): Promise<void> {
  await requireAdmin();
  await query("delete from users where id = $1 and password_hash is null and not is_admin", [userId]);
  revalidatePath("/", "layout");
}

// ---- Jokers ----

/**
 * Fill a finished, failed week with jokers (spare workouts). Only when the jokers cover every
 * missing workout and the weekly task was done – otherwise they'd be spent for nothing.
 */
export async function applyJokers(week: string): Promise<void> {
  const user = await requireUser();
  const c = await activeChallenge();
  if (!c?.joker_every) return;
  const board = await loadBoard(c);
  const me = board.members.find((m) => m.id === user.id);
  const r = me?.results.find((x) => x.week === week);
  if (!me || !r || r.state !== "done" || r.passed || !r.taskMet || r.fine !== "owed") return;
  const missing = c.min_sessions - r.qualifying;
  if (missing < 1 || missing > me.jokers.held) return;
  await query("insert into joker_uses (challenge_id, user_id, week_start, count) values ($1, $2, $3, $4) on conflict do nothing", [c.id, user.id, week, missing]);
  await query("insert into messages (user_id, body) values (null, $1)", [
    `🃏 ${user.name} brukte ${missing === 1 ? "en joker" : `${missing} jokere`} – uke ${isoWeekNumber(week)} er i boks!`,
  ]);
  revalidatePath("/", "layout");
}

/** Admin: fetch one person's Strava workouts now (troubleshooting «it never came in»). */
export async function adminSyncStrava(userId: number): Promise<void> {
  await requireAdmin();
  const c = await activeChallenge();
  await syncStrava(userId, new Date(`${c ? addDays(c.starts_on, -7) : osloDate()}T00:00:00Z`)).catch((e) => console.error("[admin sync]", e));
  revalidatePath("/admin");
}

/** Admin: a push to everyone who hasn't done the one-time setup (notifications + Strava sharing). */
export async function remindStravaChoice(): Promise<void> {
  await requireAdmin();
  const undecided = await query<{ id: number }>(
    "select id from users where approved and (setup_done_at is null or (strava_athlete_id is not null and strava_consent_at is null))",
  );
  await push(undecided.map((u) => u.id), "test", {
    title: "Et lite oppsett i Treningsutfordring",
    body: "Velg varsler og hva gruppa ser fra Strava. Det tar ti sekunder – til da er alt som før.",
    url: "/oppsett",
    tag: "oppsett",
  });
  revalidatePath("/admin");
}

/** Admin: who is responsible for privacy, shown on /personvern (e.g. «Ola Nordmann, ola@example.no»). */
export async function savePrivacyContact(form: FormData): Promise<void> {
  await requireAdmin();
  const value = String(form.get("contact") ?? "").trim().slice(0, 200);
  if (value) await query("insert into settings (key, value) values ('privacy_contact', $1) on conflict (key) do update set value = excluded.value", [value]);
  else await query("delete from settings where key = 'privacy_contact'");
  revalidatePath("/personvern");
  revalidatePath("/admin");
}
