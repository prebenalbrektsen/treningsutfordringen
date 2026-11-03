import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { syncStartFor } from "@/lib/challenge";
import { one } from "@/lib/db";
import { connectStrava, syncStrava } from "@/lib/strava";
import { addDays, osloDate } from "@/lib/time";

/** A plain page for when Strava sent the person back to another browser than the app. */
function donePage(ok: boolean, message: string) {
  const html = `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Treningsutfordring</title><body style="font-family:-apple-system,system-ui,sans-serif;background:#f4f1ea;color:#14130f;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">
<div style="max-width:340px"><div style="font-size:56px">${ok ? "✅" : "⚠️"}</div>
<h1 style="font-size:24px;margin:12px 0">${ok ? "Strava er koblet til!" : "Det gikk ikke"}</h1>
<p style="font-size:17px;line-height:1.45;color:#5f5a50">${message}</p>
<a href="/" style="display:inline-block;margin-top:18px;background:#ff4d1c;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">Åpne Treningsutfordring</a></div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const scope = url.searchParams.get("scope") ?? "";
  // Who is connecting comes from the state token, not the cookie (see the connect route).
  const ticket = await one<{ user_id: number }>("delete from oauth_states where token = $1 and expires_at > now() returning user_id", [state]);
  const me = await currentUser();
  const sameBrowser = !!me && !!ticket && me.id === ticket.user_id;
  const fail = (reason: string, msg: string) => (sameBrowser ? redirect(`/meg?strava=${reason}`) : donePage(false, msg));

  if (!ticket || !code) return fail("feil", "Lenken var utløpt eller ufullstendig. Gå tilbake til appen og trykk «Connect with Strava» en gang til.");
  // People can untick "private activities" on Strava's screen; we need at least read access.
  if (!scope.includes("activity:read")) return fail("tilgang", "Du må gi tilgang til å lese aktivitetene dine. Prøv igjen og la boksene stå på.");

  try {
    await connectStrava(ticket.user_id, code);
    await syncStrava(ticket.user_id, await syncStartFor(ticket.user_id));
  } catch (e) {
    console.error("[strava callback]", e);
    return fail("feil", "Noe gikk galt hos Strava. Prøv igjen om litt.");
  }
  if (sameBrowser) redirect("/meg?strava=ok");
  return donePage(true, "Øktene dine er hentet. Gå tilbake til Treningsutfordring-appen på hjemskjermen – der ligger de under Økter.");
}
