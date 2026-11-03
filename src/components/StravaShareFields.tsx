import type { User } from "@/lib/auth";
import { SHARE_OPTIONS } from "@/lib/sharing";

/** The Strava consent box and the optional details, used on the setup page and «Hva deles?». */
export function StravaShareFields({ user, missing }: { user: User; missing?: boolean }) {
  const undecided = !!user.strava_athlete_id && !user.strava_consent_at;
  return (
    <>
      <ul className="space-y-1.5 text-sm">
        <li>🔒 Øktene fra Strava er <strong>bare synlige for deg</strong> til du sjekker dem inn.</li>
        <li>✅ Når du sjekker inn, ser gruppa <strong>sport, dag, varighet og bildet ditt</strong>.</li>
        <li>🕶️ Også økter du har satt som private på Strava hentes – men bare du kan se dem før innsjekk.</li>
      </ul>
      {undecided && <p className="text-sm text-muted">Vi har krysset av for det som vises i dag (unntatt puls) – fjern det du ikke vil dele.</p>}

      <label className={`flex items-start gap-3 rounded-xl p-3 ${missing ? "bg-bad-soft" : "bg-heat-soft"}`}>
        <input type="checkbox" name="consent" defaultChecked={!!user.strava_consent_at} className="mt-1 h-5 w-5 shrink-0 accent-[#ff4d1c]" />
        <span className="font-semibold">Ja, innsjekkede økter kan deles med gruppa {missing && <span className="block text-sm text-bad">Du må krysse av her for å bruke Strava.</span>}</span>
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-bold">Vil du vise mer? <span className="font-normal text-muted">(valgfritt)</span></legend>
        {SHARE_OPTIONS.map((o) => (
          <label key={o.key} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" name={o.key} defaultChecked={undecided ? o.key !== "share_hr" : user[o.key]} className="mt-1 h-5 w-5 shrink-0 accent-[#ff4d1c]" />
            <span>
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-sm text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted">Du ser alltid alt om dine egne økter. Endre når som helst under Meg.</p>
      </fieldset>
    </>
  );
}
