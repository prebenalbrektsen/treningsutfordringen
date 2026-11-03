"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { SHARE_OPTIONS } from "@/lib/sharing";

/** Finishes the one-time setup. With Strava connected, the sharing consent is part of it. */
export async function finishSetup(form: FormData): Promise<void> {
  const user = await requireUser();
  // «koble» = not connected yet, and wants to connect Strava now (after saying what's shared).
  const connect = !user.strava_athlete_id && !!form.get("koble");
  if (user.strava_athlete_id || connect) {
    if (form.get("consent") !== "on") redirect(`/oppsett?mangler=1${connect ? "&koble=1" : ""}`);
    const ticks = SHARE_OPTIONS.map((o) => form.get(o.key) === "on");
    await query(
      `update users set strava_consent_at = coalesce(strava_consent_at, now()),
              share_distance = $2, share_elevation = $3, share_hr = $4, share_title = $5 where id = $1`,
      [user.id, ...ticks],
    );
  }
  await query("update users set setup_done_at = now() where id = $1", [user.id]);
  revalidatePath("/", "layout");
  redirect(connect ? "/api/strava/connect" : "/");
}
