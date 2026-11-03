import webpush from "web-push";
import { one, query } from "./db";

// Web push to phones and browsers. The VAPID key pair is made by the server the first time it is
// needed and kept in the settings table – no secret to copy around.

export const CATEGORIES = {
  kudos: "Kudos på øktene dine",
  comments: "Kommentarer på øktene dine",
  chat: "Nye meldinger i Prat",
  checkin: "Økter som venter på innsjekk",
  reminders: "Påminnelse når uka holder på å glippe",
  admin: "Til deg som styrer gruppa: nye deltakere og meldte betalinger",
} as const;
type Category = keyof typeof CATEGORIES;

type Payload = { title: string; body: string; url?: string; tag?: string };

let keys: { publicKey: string; privateKey: string } | null = null;

export async function vapidKeys() {
  if (keys) return keys;
  const row = await one<{ value: string }>("select value from settings where key = 'vapid'");
  if (row) return (keys = JSON.parse(row.value));
  const fresh = webpush.generateVAPIDKeys();
  await query("insert into settings (key, value) values ('vapid', $1) on conflict (key) do nothing", [JSON.stringify(fresh)]);
  const saved = await one<{ value: string }>("select value from settings where key = 'vapid'");
  return (keys = JSON.parse(saved!.value));
}

/** Sends to every device of these people that has the category switched on. Never throws. */
export async function push(userIds: number[], category: Category | "test", payload: Payload): Promise<void> {
  if (!userIds.length) return;
  try {
    const subs = await query<{ id: number; endpoint: string; p256dh: string; auth: string }>(
      `select s.id, s.endpoint, s.p256dh, s.auth from push_subscriptions s join users u on u.id = s.user_id
        where s.user_id = any($1::int[]) and ($2 = 'test' or coalesce((u.notify ->> $2)::boolean, true))`,
      [userIds, category],
    );
    if (!subs.length) return;
    const { publicKey, privateKey } = await vapidKeys();
    // The push services want an https: contact for the sender; locally APP_URL is plain http.
    const subject = process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "https://treningsutfordring.vercel.app";
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const body = JSON.stringify({ url: "/", ...payload });
    await Promise.all(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12 }).catch(async (e) => {
          // The phone unsubscribed or the app was removed: forget that device.
          if (e?.statusCode === 404 || e?.statusCode === 410) await query("delete from push_subscriptions where id = $1", [s.id]);
          else console.error("[push]", e?.statusCode ?? e?.message ?? e, e?.body ?? "");
        }),
      ),
    );
  } catch (e) {
    console.error("[push]", e);
  }
}

/** Everyone approved in a group, except one person (the sender). */
export async function everyoneBut(groupId: number, userId: number | null): Promise<number[]> {
  const rows = await query<{ id: number }>(
    "select user_id as id from group_members where group_id = $1 and approved and user_id is distinct from $2",
    [groupId, userId],
  );
  return rows.map((r) => r.id);
}

/** The group's admins (Kontrollør or whatever the group calls it). */
export async function admins(groupId: number): Promise<number[]> {
  return (await query<{ id: number }>("select user_id as id from group_members where group_id = $1 and role = 'admin'", [groupId])).map((r) => r.id);
}

/** Every phone in the app, whatever group – only for app-wide notices from the system admin. */
export async function everyone(): Promise<number[]> {
  return (await query<{ id: number }>("select distinct user_id as id from group_members where approved")).map((r) => r.id);
}

/** For scheduled reminders: true the first time a key is seen, false after that. */
export async function once(key: string): Promise<boolean> {
  return (await query("insert into push_sent (key) values ($1) on conflict do nothing returning 1", [key])).length > 0;
}
