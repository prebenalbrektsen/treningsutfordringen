import Link from "next/link";
import { Logo } from "@/components/Logo";
import { one } from "@/lib/db";

export const metadata = { title: "Personvern og vilkår – Treningsutfordring" };

// Public (no login), linked from login, Meg and the Strava consent. Strava's API policy §7.3
// requires a GDPR privacy policy, §6.5 a statement about Strava's usage data and §9.2 disclaimers.
export default async function PrivacyPage() {
  const contact = (await one<{ value: string }>("select value from settings where key = 'privacy_contact'"))?.value?.trim();
  const h2 = "mt-8 mb-2 text-lg font-bold";
  return (
    <main className="mx-auto max-w-2xl px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-16 leading-relaxed">
      <Link href="/"><Logo /></Link>
      <h1 className="display mt-6 text-4xl">Personvern og vilkår</h1>
      <p className="mt-2 text-sm text-muted">Sist oppdatert 3. november 2026</p>

      <p className="mt-4">
        Treningsutfordring er en gratis app for private, lukkede grupper som har en treningsutfordring sammen. Den drives privat,
        uten reklame og uten salg av data. Her står hva vi lagrer, hvorfor, hvem som ser det, og hvordan du får det slettet.
      </p>

      <h2 className={h2}>Hvem er ansvarlig</h2>
      <p>
        {contact
          ? <>Behandlingsansvarlig og kontakt for personvern: {contact}.</>
          : <>Appen drives privat. Spørsmål om personvern: send en melding til den som styrer gruppa di i appen.</>}
      </p>

      <h2 className={h2}>Hva vi lagrer</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Konto:</strong> navn, e-post, passord (kryptert) eller passkey/Face ID-nøkkel, profilbilde, farge og innstillinger.</li>
        <li><strong>Økter du logger selv:</strong> sport, tid, varighet, eventuell distanse, kommentar og bildet du sjekker inn med. Bilder lagres som små kopier uten metadata (også uten GPS-posisjon).</li>
        <li><strong>Fra Strava, hvis du kobler til:</strong> Strava-ID, tilgangsnøkler, og øktene dine (sport, starttid, varighet, distanse, høydemeter, snittpuls og navnet på økta). Ikke kart, GPS-spor eller andre data.</li>
        <li><strong>Det sosiale:</strong> kudos, kommentarer, meldinger i Prat og bøter/betalinger i utfordringen.</li>
        <li><strong>Varsler:</strong> en adresse fra nettleseren din for push-varsler, hvis du slår dem på.</li>
        <li><strong>Teknisk:</strong> innloggingsøkter og en feilsøkingslogg for Strava-synk (slettes etter 30 dager). Ingen sporing, ingen analyseverktøy, ingen informasjonskapsler utover innloggingen.</li>
      </ul>

      <h2 className={h2}>Hvorfor, og på hvilket grunnlag</h2>
      <p>
        Alt brukes bare til å drive utfordringen: telle øktene dine mot ukas krav, vise gruppa det du deler, og sende varslene du har valgt.
        Kontoen og øktene du logger behandles fordi du er med i utfordringen (avtale). Strava-tilkoblingen, delingen av Strava-detaljer og
        varsler bygger på samtykket ditt, som du kan trekke når som helst.
      </p>

      <h2 className={h2}>Hvem ser hva</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Bare medlemmene i din egen gruppe. Ingenting er offentlig.</li>
        <li>Økter fra Strava ser bare du, til du sjekker dem inn. Da ser gruppa sport, dag, varighet og bildet ditt – og distanse, høydemeter, puls og navnet på økta bare hvis du har krysset av for det.</li>
        <li>Vi selger aldri data, bruker dem ikke til reklame og bruker dem ikke til å trene eller mate kunstig intelligens.</li>
      </ul>

      <h2 className={h2}>Leverandører vi bruker</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Vercel</strong> (drift av appen) og <strong>Neon</strong> (database, lagret i Frankfurt, EU).</li>
        <li><strong>Strava</strong>, hvis du kobler til. Strava kan samle inn og bruke data om hvordan denne appen bruker Strava sitt API (bruksdata), etter Strava sin egen personvernerklæring: <a className="underline" href="https://www.strava.com/legal/privacy">strava.com/legal/privacy</a>.</li>
        <li><strong>Apple, Google eller Mozilla</strong> leverer push-varslene til telefonen din, hvis du slår dem på.</li>
      </ul>

      <h2 className={h2}>Hvor lenge</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Konto og økter: så lenge du er med, eller til du ber om sletting.</li>
        <li>Strava-data: kobler du fra (i appen eller på strava.com), slettes de med en gang. Økter du alt har sjekket inn beholder bare sport, dag, varighet og bildet ditt, slik at ukene i utfordringen stemmer – du kan også be om å slette disse.</li>
        <li>Feilsøkingsloggen for Strava: 30 dager.</li>
      </ul>

      <h2 className={h2}>Dine rettigheter</h2>
      <p>
        Du kan be om innsyn, retting, sletting og en kopi av dataene dine, og du kan trekke samtykker når som helst. Strava-dataene sletter du selv under
        Meg → Strava → «Hva deles?». For resten: {contact ? <>kontakt {contact}</> : "si fra til den som styrer gruppa di"}. Du får bekreftelse når det er gjort.
        Mener du vi behandler opplysninger feil, kan du klage til <a className="underline" href="https://www.datatilsynet.no">Datatilsynet</a>.
      </p>

      <h2 className={h2}>Vilkår</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Appen er gratis og leveres som den er, uten garantier. Bøtene er en avtale mellom deltakerne – appen bare holder oversikt.</li>
        <li>Strava og andre tredjepartsleverandører gir ingen garantier for appen og er ikke ansvarlige for indirekte tap eller følgeskader ved bruk av den.</li>
        <li>Treningsutfordring er ikke laget, sponset eller godkjent av Strava.</li>
      </ul>

      <h2 className={h2} lang="en">In English</h2>
      <p lang="en" className="text-sm">
        Treningsutfordring is a free, private, invite-only app for groups running a training challenge. We store your account, the workouts you log or
        import from Strava, photos, and social activity, only to run the challenge. Strava workouts are visible only to you until you check them in;
        then your group sees sport, date, duration and photo, plus distance, elevation, heart rate and title only if you opt in. We never sell data,
        show ads or use data for AI. Disconnecting Strava (in the app or on strava.com) deletes your Strava data immediately. Strava may collect usage
        data about this app&apos;s use of its API under Strava&apos;s privacy policy. Strava and other third-party providers make no warranties and are
        not liable for indirect or consequential damages. Contact: {contact ?? "your group's admin in the app"}.
      </p>
    </main>
  );
}
