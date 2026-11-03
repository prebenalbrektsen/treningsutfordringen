import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/auth";
import { SHARE_OPTIONS } from "@/lib/sharing";
import { declineSharing, saveSharing } from "./actions";

// Outside the (app) layout on purpose: that layout sends connected people without consent here.

/**
 * Consent before Strava data is shared with the group (Strava's API terms require it). The base
 * consent covers what the challenge needs; every extra detail is a tick, off by default.
 */
export default async function StravaSharingPage({ searchParams }: { searchParams: Promise<{ koble?: string; mangler?: string }> }) {
  const user = await requireUser();
  const { koble, mangler } = await searchParams;
  const connecting = !!koble;
  const existing = !!user.strava_athlete_id && !user.strava_consent_at;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-10">
      <Logo />
      <form action={saveSharing} className="card mt-6 space-y-5 p-5">
        {connecting && <input type="hidden" name="koble" value="1" />}
        <div>
          <h1 className="display text-3xl">Hva deles fra Strava?</h1>
          <p className="mt-2 text-muted">
            {existing
              ? "Strava krever nå at du sier ja til hva gruppa får se. Det tar ti sekunder."
              : "Før du kobler til: dette er det gruppa får se av øktene dine."}
          </p>
        </div>

        <ul className="space-y-1.5 text-sm">
          <li>🔒 Øktene fra Strava er <strong>bare synlige for deg</strong> til du sjekker dem inn.</li>
          <li>✅ Når du sjekker inn, ser gruppa <strong>sport, dag, varighet og bildet ditt</strong>.</li>
          <li>🕶️ Også økter du har satt som private på Strava hentes – men bare du kan se dem før innsjekk.</li>
        </ul>

        <label className={`flex items-start gap-3 rounded-xl p-3 ${mangler ? "bg-bad-soft" : "bg-heat-soft"}`}>
          <input type="checkbox" name="consent" defaultChecked={!!user.strava_consent_at} className="mt-1 h-5 w-5 shrink-0 accent-[#ff4d1c]" />
          <span className="font-semibold">Ja, innsjekkede økter kan deles med gruppa {mangler && <span className="block text-sm text-bad">Du må krysse av her for å bruke Strava.</span>}</span>
        </label>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-bold">Vil du vise mer? <span className="font-normal text-muted">(valgfritt)</span></legend>
          {SHARE_OPTIONS.map((o) => (
            <label key={o.key} className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" name={o.key} defaultChecked={user[o.key]} className="mt-1 h-5 w-5 shrink-0 accent-[#ff4d1c]" />
              <span>
                <span className="block font-semibold">{o.label}</span>
                <span className="block text-sm text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-muted">Du ser alltid alt om dine egne økter. Endre når som helst under Meg.</p>
        </fieldset>

        <button className="btn btn-heat w-full">{connecting ? "Lagre og koble til Strava" : "Lagre"}</button>
      </form>
      {user.strava_athlete_id && (
        <form action={declineSharing} className="mt-4 text-center">
          <button className="text-sm font-semibold text-muted underline">Nei takk – koble fra Strava</button>
        </form>
      )}
    </main>
  );
}
