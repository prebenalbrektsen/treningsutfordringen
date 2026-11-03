import { Logo } from "@/components/Logo";
import { StravaShareFields } from "@/components/StravaShareFields";
import { requireUser } from "@/lib/auth";
import { declineSharing, saveSharing } from "./actions";

/**
 * Consent before Strava data is shared with the group (Strava's API terms require it): before
 * connecting, and from Meg → «Hva deles?». Everyone already in the app gets it via /oppsett.
 */
export default async function StravaSharingPage({ searchParams }: { searchParams: Promise<{ koble?: string; mangler?: string }> }) {
  const user = await requireUser();
  const { koble, mangler } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-10">
      <Logo />
      <form action={saveSharing} className="card mt-6 space-y-5 p-5">
        {koble && <input type="hidden" name="koble" value="1" />}
        <div>
          <h1 className="display text-3xl">Hva deles fra Strava?</h1>
          <p className="mt-2 text-muted">{koble ? "Før du kobler til: dette er det gruppa får se av øktene dine." : "Velg hva gruppa får se av Strava-øktene dine."}</p>
        </div>
        <StravaShareFields user={user} missing={!!mangler} />
        <button className="btn btn-heat w-full">{koble ? "Lagre og koble til Strava" : "Lagre"}</button>
      </form>
      {user.strava_athlete_id && (
        <form action={declineSharing} className="mt-4 text-center">
          <button className="text-sm font-semibold text-muted underline">Nei takk – koble fra Strava</button>
        </form>
      )}
    </main>
  );
}
