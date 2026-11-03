import { createHash } from "node:crypto";
import { announceWeek } from "./announce";
import { activeChallenge } from "./challenge";
import { push } from "./push";
import { sportLabel } from "./sports";
import { one, query } from "./db";

// Strava is the hub: Garmin, Apple Watch (via the Strava app), Polar, Suunto and Wahoo all sync
// to it automatically, so one integration covers every watch the family uses.
const API = "https://www.strava.com/api/v3";

export function stravaConfigured(): boolean {
  return !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${process.env.APP_URL}/api/strava/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number } };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...body }),
  });
  if (!res.ok) throw new Error(`Strava token ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function connectStrava(userId: number, code: string): Promise<void> {
  const t = await tokenRequest({ code, grant_type: "authorization_code" });
  // A Strava account can only belong to one participant; move it if someone reconnects it.
  await query("update users set strava_athlete_id = null where strava_athlete_id = $1 and id <> $2", [t.athlete!.id, userId]);
  await query(
    `update users set strava_athlete_id = $2, strava_access_token = $3, strava_refresh_token = $4, strava_expires_at = $5
      where id = $1`,
    [userId, t.athlete!.id, t.access_token, t.refresh_token, t.expires_at],
  );
}

async function accessToken(userId: number): Promise<string | null> {
  const u = await one<{ strava_access_token: string | null; strava_refresh_token: string | null; strava_expires_at: string | null }>(
    "select strava_access_token, strava_refresh_token, strava_expires_at from users where id = $1",
    [userId],
  );
  if (!u?.strava_refresh_token) return null;
  if (Number(u.strava_expires_at) > Date.now() / 1000 + 120) return u.strava_access_token;
  const t = await tokenRequest({ refresh_token: u.strava_refresh_token, grant_type: "refresh_token" });
  await query("update users set strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = $4 where id = $1", [
    userId, t.access_token, t.refresh_token, t.expires_at,
  ]);
  return t.access_token;
}

export async function disconnectStrava(userId: number): Promise<void> {
  const token = await accessToken(userId).catch(() => null);
  // oauth/revoke replaces oauth/deauthorize (the only one accepted from 1 June 2027).
  if (token) {
    const basic = Buffer.from(`${process.env.STRAVA_CLIENT_ID}:${process.env.STRAVA_CLIENT_SECRET}`).toString("base64");
    await fetch("https://www.strava.com/oauth/revoke", {
      method: "POST",
      headers: { authorization: `Basic ${basic}` },
      body: new URLSearchParams({ token, token_type_hint: "access_token" }),
    }).catch(() => {});
  }
  await query(
    `update users set strava_athlete_id = null, strava_access_token = null, strava_refresh_token = null, strava_expires_at = null
      where id = $1`,
    [userId],
  );
}

type Activity = {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
};

/** Saves one Strava activity as a workout (new or updated). Returns true when it was new. */
async function importActivity(userId: number, a: Activity): Promise<boolean> {
  // Moving time, so a watch left running in the changing room doesn't count; gym sessions
  // often have no "moving" so fall back to elapsed.
  const minutes = Math.round((a.moving_time || a.elapsed_time) / 60);
  if (minutes < 1) return false;
  const rows = await query<{ id: number; inserted: boolean }>(
    `insert into workouts (user_id, started_at, duration_min, sport, title, distance_m, elevation_m, avg_hr, source, strava_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'strava', $9)
     on conflict (strava_id) do update set
       duration_min = excluded.duration_min, sport = excluded.sport, title = excluded.title,
       distance_m = excluded.distance_m, elevation_m = excluded.elevation_m, avg_hr = excluded.avg_hr
     returning id, (xmax = 0) as inserted`,
    [userId, a.start_date, minutes, a.sport_type, a.name, Math.round(a.distance) || null,
      Math.round(a.total_elevation_gain) || null, a.average_heartrate ? Math.round(a.average_heartrate) : null, a.id],
  );
  if (!rows[0]?.inserted) return false;
  await mergeManualDuplicate(userId, rows[0].id, a.start_date);
  // Fresh workouts only (not the backlog fetched when someone first connects).
  if (Date.now() - new Date(a.start_date).getTime() < 24 * 3600000) {
    // Say what the challenge's rules actually make of it, so a 28-minute run isn't promised to count.
    const c = await activeChallenge();
    const body = c && minutes < c.session_minutes
      ? `${minutes} min – kortere enn ${c.session_minutes} min, så den teller ikke i utfordringen.`
      : `${minutes} min – sjekk inn${c && !c.proof_required ? "" : " med bilde"}, så teller den.`;
    await push([userId], "checkin", {
      title: `Ny økt fra Strava: ${sportLabel(a.sport_type)}`,
      body,
      url: "/logg",
      tag: `checkin-${rows[0].id}`,
    });
  }
  return true;
}

/** Imports the user's Strava activities since `since`. Returns how many were new. */
export async function syncStrava(userId: number, since: Date): Promise<number> {
  const token = await accessToken(userId);
  if (!token) return 0;
  let added = 0;
  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({ after: String(Math.floor(since.getTime() / 1000)), per_page: "100", page: String(page) });
    const res = await fetch(`${API}/athlete/activities?${params}`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Strava activities ${res.status}: ${await res.text()}`);
    const activities = (await res.json()) as Activity[];
    for (const a of activities) if (await importActivity(userId, a)) added++;
    if (activities.length < 100) break;
  }
  await query("update users set strava_synced_at = now() where id = $1", [userId]);
  if (added) await announceWeek(userId);
  return added;
}

/**
 * Someone logged a workout by hand and then the watch synced the same one: keep the Strava version
 * (real watch data), but carry over the photo, weekly-task tick, kudos and comments from the
 * manual one, so it is never counted twice. "Same workout" = started within 90 minutes.
 */
async function mergeManualDuplicate(userId: number, stravaWorkoutId: number, startDate: string): Promise<void> {
  const manual = await one<{ id: number }>(
    `select id from workouts
      where user_id = $1 and source = 'manual' and abs(extract(epoch from started_at - $2::timestamptz)) < 90 * 60
      order by abs(extract(epoch from started_at - $2::timestamptz)) limit 1`,
    [userId, startDate],
  );
  if (!manual) return;
  await query(
    `update workouts s set
       proof_image = coalesce(s.proof_image, m.proof_image), proof_mime = coalesce(s.proof_mime, m.proof_mime),
       meets_task = s.meets_task or m.meets_task, rejected = s.rejected or m.rejected,
       checked_in_at = coalesce(s.checked_in_at, m.checked_in_at)
     from workouts m where s.id = $1 and m.id = $2`,
    [stravaWorkoutId, manual.id],
  );
  await query("insert into kudos (workout_id, user_id, created_at) select $1, user_id, created_at from kudos where workout_id = $2 on conflict do nothing", [stravaWorkoutId, manual.id]);
  await query("update comments set workout_id = $1 where workout_id = $2", [stravaWorkoutId, manual.id]);
  await query("delete from workouts where id = $1", [manual.id]);
}

// ---- Webhook: Strava tells us about new/changed/deleted activities within seconds ----

const CALLBACK_PATH = "/api/strava/webhook";

/** Shared secret Strava echoes back when the subscription is created; derived, so no extra setting. */
export function webhookVerifyToken(): string {
  return createHash("sha256").update(`svettebotta-webhook:${process.env.STRAVA_CLIENT_SECRET ?? ""}`).digest("hex").slice(0, 32);
}

function appCredentials() {
  return { client_id: process.env.STRAVA_CLIENT_ID!, client_secret: process.env.STRAVA_CLIENT_SECRET! };
}

/** The app's webhook subscription, if one exists (Strava allows one per app). */
export async function webhookStatus(): Promise<{ id: number; callback_url: string } | null> {
  if (!stravaConfigured()) return null;
  const res = await fetch(`${API}/push_subscriptions?${new URLSearchParams(appCredentials())}`);
  if (!res.ok) return null;
  const list = (await res.json()) as { id: number; callback_url: string }[];
  return list[0] ?? null;
}

/** Where Strava should send its webhook calls: this app's current address. */
export function webhookUrl(): string {
  return `${process.env.APP_URL}${CALLBACK_PATH}`;
}

/**
 * Creates the subscription. Strava immediately calls our GET endpoint to check the token.
 * One pointing at an old address (the app moved) is removed first, since Strava allows only one.
 */
export async function subscribeWebhook(): Promise<{ ok: boolean; message: string }> {
  const old = await webhookStatus();
  if (old && old.callback_url !== webhookUrl()) {
    const del = await fetch(`${API}/push_subscriptions/${old.id}?${new URLSearchParams(appCredentials())}`, { method: "DELETE" });
    if (!del.ok) return { ok: false, message: `Fikk ikke fjernet den gamle sanntids-synken (${del.status}).` };
  }
  const res = await fetch(`${API}/push_subscriptions`, {
    method: "POST",
    body: new URLSearchParams({ ...appCredentials(), callback_url: webhookUrl(), verify_token: webhookVerifyToken() }),
  });
  const body = await res.text();
  return res.ok ? { ok: true, message: "Sanntids-synk er på." } : { ok: false, message: `Strava sa nei (${res.status}): ${body.slice(0, 200)}` };
}

type WebhookEvent = { object_type: "activity" | "athlete"; aspect_type: "create" | "update" | "delete"; object_id: number; owner_id: number; updates?: Record<string, string> };

async function logEvent(e: WebhookEvent, userId: number | null, result: string): Promise<void> {
  await query(
    "insert into strava_events (owner_id, user_id, aspect, object_type, object_id, result) values ($1, $2, $3, $4, $5, $6)",
    [e.owner_id, userId, e.aspect_type, e.object_type, e.object_id, result],
  ).catch(() => {});
  await query("delete from strava_events where id not in (select id from strava_events order by created_at desc limit 200)").catch(() => {});
}

export async function handleWebhookEvent(e: WebhookEvent): Promise<void> {
  try {
    await handleWebhookEventInner(e);
  } catch (err) {
    await logEvent(e, null, `feil: ${(err as Error).message.slice(0, 200)}`);
    throw err;
  }
}

/** True when Strava itself no longer accepts this person's tokens. */
async function accessRevoked(userId: number): Promise<boolean> {
  try {
    const token = await accessToken(userId);
    if (!token) return true;
    const res = await fetch(`${API}/athlete`, { headers: { authorization: `Bearer ${token}` } });
    return res.status === 401;
  } catch (err) {
    return /^Strava token 4\d\d/.test((err as Error).message);
  }
}

// Strava doesn't sign webhook calls, and the URL and athlete ids are no secret, so anyone can
// send one. Nothing is deleted or disconnected until Strava itself confirms it.
async function handleWebhookEventInner(e: WebhookEvent): Promise<void> {
  const user = await one<{ id: number }>("select id from users where strava_athlete_id = $1", [e.owner_id]);
  // Strava still thinks this person is connected, but the app never got their tokens
  // (typically a connect that came back in another browser). They need to connect again.
  if (!user) return logEvent(e, null, "ukjent Strava-konto – personen må koble til Strava på nytt i appen");
  if (e.object_type === "athlete") {
    // The person revoked access on strava.com.
    if (e.updates?.authorized === "false") {
      if (!(await accessRevoked(user.id))) return logEvent(e, user.id, "frakobling som Strava ikke bekrefter – ignorert");
      await query("update users set strava_athlete_id = null, strava_access_token = null, strava_refresh_token = null, strava_expires_at = null where id = $1", [user.id]);
      return logEvent(e, user.id, "koblet fra på strava.com");
    }
    return logEvent(e, user.id, "profilendring – ignorert");
  }
  const token = await accessToken(user.id);
  if (!token) return logEvent(e, user.id, "mangler tilgang – personen må koble til Strava på nytt");
  const res = await fetch(`${API}/activities/${e.object_id}`, { headers: { authorization: `Bearer ${token}` } });
  if (e.aspect_type === "delete") {
    if (res.status !== 404) return logEvent(e, user.id, "sletting som Strava ikke bekrefter – ignorert");
    // Deleted on Strava: drop it, unless it was already checked in (then the photo is the proof).
    const gone = await query("delete from workouts where strava_id = $1 and user_id = $2 and checked_in_at is null returning 1", [e.object_id, user.id]);
    return logEvent(e, user.id, gone.length ? "slettet økta" : "slettet på Strava – beholdt (allerede sjekket inn)");
  }
  if (!res.ok) return logEvent(e, user.id, `Strava svarte ${res.status} på henting av økta`);
  const a = (await res.json()) as Activity;
  const added = await importActivity(user.id, a);
  if (added) await announceWeek(user.id);
  await query("update users set strava_synced_at = now() where id = $1", [user.id]);
  const minutes = Math.round((a.moving_time || a.elapsed_time) / 60);
  await logEvent(e, user.id, added ? `hentet: ${sportLabel(a.sport_type)} ${minutes} min` : minutes < 1 ? "for kort – ignorert" : `oppdatert: ${sportLabel(a.sport_type)} ${minutes} min`);
}
