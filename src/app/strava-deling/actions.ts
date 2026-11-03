"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { SHARE_OPTIONS } from "@/lib/sharing";
import { disconnectStrava } from "@/lib/strava";

/** Saves the consent and the ticked details. «koble» = go on to Strava afterwards (first connect). */
export async function saveSharing(form: FormData): Promise<void> {
  const user = await requireUser();
  if (form.get("consent") !== "on") redirect("/strava-deling?mangler=1" + (form.get("koble") ? "&koble=1" : ""));
  const ticks = SHARE_OPTIONS.map((o) => form.get(o.key) === "on");
  await query(
    `update users set strava_consent_at = coalesce(strava_consent_at, now()),
            share_distance = $2, share_elevation = $3, share_hr = $4, share_title = $5, setup_done_at = coalesce(setup_done_at, now()) where id = $1`,
    [user.id, ...ticks],
  );
  revalidatePath("/", "layout");
  redirect(form.get("koble") ? "/api/strava/connect" : "/meg?strava=deling");
}

/** Says no: Strava is disconnected and the consent withdrawn. Workouts already checked in stay. */
export async function declineSharing(): Promise<void> {
  const user = await requireUser();
  await disconnectStrava(user.id);
  await query("update users set strava_consent_at = null, setup_done_at = coalesce(setup_done_at, now()) where id = $1", [user.id]);
  revalidatePath("/", "layout");
  redirect("/meg?strava=frakoblet");
}
