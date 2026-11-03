import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PushSettings } from "@/components/PushSettings";
import { StravaShareFields } from "@/components/StravaShareFields";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { CATEGORIES } from "@/lib/push";
import { stravaConfigured } from "@/lib/strava";
import { PoweredByStrava } from "@/components/StravaBrand";
import { declineSharing } from "../strava-deling/actions";
import { finishSetup } from "./actions";

// Outside the (app) layout on purpose: that layout sends people who haven't done this here.

/** One-time setup for everyone who joined before it existed: notifications, and Strava sharing if connected. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ mangler?: string; koble?: string }> }) {
  const user = await requireUser();
  if (user.setup_done_at && (!user.strava_athlete_id || user.strava_consent_at)) redirect("/");
  const { mangler, koble } = await searchParams;
  const prefs = (await one<{ notify: Record<string, boolean> }>("select notify from users where id = $1", [user.id]))!.notify;
  const categories = Object.fromEntries(Object.entries(CATEGORIES).filter(([k]) => k !== "admin" || user.is_admin));
  const step = "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-heat text-sm font-bold text-white";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-10">
      <Logo />
      <div>
        <h1 className="display text-4xl">Et lite oppsett</h1>
        <p className="mt-1 text-muted">To raske valg, {user.name.split(" ")[0]}, så er du i gang igjen. Du kan endre alt senere under Meg.</p>
      </div>

      <section className="card space-y-3 p-5">
        <div className="flex items-center gap-3"><span className={step}>1</span><h2 className="font-bold">Varsler</h2></div>
        <p className="text-sm text-muted">Få beskjed om kudos, kommentarer, Prat og når uka holder på å glippe. Velg selv hva du vil ha.</p>
        <PushSettings categories={categories} prefs={prefs} />
      </section>

      <form action={finishSetup} className="space-y-4">
        <section className="card space-y-4 p-5">
          <div className="flex items-center gap-3"><span className={step}>2</span><h2 className="font-bold">{user.strava_athlete_id ? "Hva deles fra Strava?" : "Strava (valgfritt)"}</h2></div>
          {user.strava_athlete_id ? (
            <StravaShareFields user={user} missing={!!mangler} />
          ) : stravaConfigured() ? (
            <>
              <p className="text-sm text-muted">Garmin, Apple Watch, Polar, Suunto og Wahoo kan synke til Strava – kobler du til, kommer øktene inn av seg selv. Du sjekker dem bare inn.</p>
              <details open={!!koble} className="group rounded-xl border border-line">
                <summary className="cursor-pointer list-none p-3 font-semibold">
                  <span className="text-[#FC5200]">Koble til Strava</span> <span className="text-sm font-normal text-muted">– velg hva som deles først</span>
                </summary>
                <div className="space-y-4 border-t border-line p-3">
                  <StravaShareFields user={user} missing={!!mangler} />
                  {/* Strava's own button, as their guidelines require; it saves the choices first. */}
                  <button name="koble" value="1" aria-label="Lagre og koble til Strava" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/strava/connect.svg" alt="Connect with Strava" width={237} height={48} />
                  </button>
                  <PoweredByStrava className="block" />
                </div>
              </details>
              <p className="text-xs text-muted">Vil du ikke nå? Trykk Ferdig – du kan koble til senere under Meg. Økter du logger selv vises som før.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Økter du logger selv vises som før.</p>
          )}
        </section>
        <button className="btn btn-heat w-full text-lg">Ferdig – til appen 💪</button>
      </form>
      {user.strava_athlete_id && (
        <form action={declineSharing} className="text-center">
          <button className="text-sm font-semibold text-muted underline">Nei takk – koble fra Strava</button>
        </form>
      )}
    </main>
  );
}
