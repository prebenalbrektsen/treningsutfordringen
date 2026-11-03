import { Logo } from "@/components/Logo";
import { StravaShareFields } from "@/components/StravaShareFields";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { ConfirmAction } from "@/components/ConfirmAction";
import { stravaDeleteEverything } from "@/app/(app)/actions";
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
        <section className="card mt-4 space-y-3 p-5 text-sm">
          <h2 className="font-bold">Koble fra og slette</h2>
          <p className="text-muted">Kobler du fra, slettes alt vi har hentet fra Strava med en gang. Økter du alt har sjekket inn beholder bare sport, dag, varighet og bildet ditt, så ukene dine fortsatt stemmer.</p>
          <ConfirmAction action={declineSharing} className="btn btn-ghost btn-sm" label="Koble fra Strava og slett dataene" title="Koble fra Strava?" confirm="Ja, koble fra og slett">
            <p>Alt vi har hentet fra Strava slettes med en gang, og nye økter kommer ikke inn lenger.</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li><strong>Økter du ikke har sjekket inn</strong> forsvinner helt.</li>
                  <li><strong>Innsjekkede økter</strong> blir stående med bare sport, dag, varighet og bildet ditt, så ukene dine fortsatt stemmer. Distanse, puls, høydemeter og navn fjernes.</li>
                </ul>
                <p className="text-muted">Du kan koble til igjen senere – da hentes øktene på nytt fra Strava.</p>
          </ConfirmAction>
          <p className="text-muted">Vil du at også de innsjekkede øktene skal bort? Da kan uker som var i boks bli stående uten nok økter.</p>
          <ConfirmAction action={stravaDeleteEverything} className="text-sm font-semibold text-bad underline" label="Slett alt fra Strava, også innsjekkede økter" title="Slette alt fra Strava?" confirm="Ja, slett alt">
            <p>Strava kobles fra, og <strong>alle</strong> øktene som kom fra Strava slettes – også de du har sjekket inn, med bilder, kudos og kommentarer.</p>
            <p className="font-semibold text-bad">Uker som var i boks kan da mangle økter, og det kan gi bot for uker som er ferdige. Dette kan ikke angres.</p>
          </ConfirmAction>
        </section>
      )}
      <p className="mt-4 text-center text-sm"><Link href="/personvern" className="font-semibold text-muted underline">Personvern og vilkår</Link></p>
    </main>
  );
}
