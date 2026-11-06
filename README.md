# Treningsutfordring

*A weekly workout challenge for groups of friends: miss your workouts, pay into the bucket.*

Treningsutfordring er en app for ukentlig trening sammen med familie, venner eller jobben. Dere
blir enige om ukas krav (for eksempel tre økter på 30 minutter), og den som ikke klarer det, betaler bot til
bøtekassa. Appen henter økter fra Strava, holder styr på bøtene og har statistikk, kudos og
gruppechat.

Laget med Next.js og Postgres, for mobilen, på norsk.

## Slik fungerer det

- **Ukeskravet:** et antall økter av en viss lengde, eller én lang økt. Admin bestemmer.
- **Uka** går fra mandag kl. 00 til søndag kl. 24, norsk tid – eller admin velger en annen siste dag
  (for eksempel torsdag, så uka går fredag–torsdag). Klarer du ikke kravet, blir det bot.
- **Påminnelse:** siste kvelden i uka får de som ikke har uka i boks, beskjed (fra kl. 17).
- **Ukeskrav (valgfritt):** en ekstra oppgave for én uke, som «én økt i vann».
- **Innsjekk:** økter må sjekkes inn for å telle. Admin kan kreve et bilde som bevis.
- **Jokere:** ekstra økter blir jokere som kan redde en uke du ikke klarte.
- **Bøter:** du trykker «Jeg har betalt», og admin bekrefter eller frafaller boten.
- **Nye deltakere** som blir med midt i en uke, er med fra neste uke. Admin kan la uka telle likevel.
- **Grupper:** én app kan ha flere lukkede grupper, for eksempel familien og jobben. Hver gruppe
  har egne deltakere, admin, utfordringer, bøter og chat. Er du med i flere grupper, bytter du
  gruppe øverst i appen, og øktene dine teller i alle gruppene du er med i.
- **Strava-deling:** hver deltaker velger selv hva som deles fra Strava, og ingenting vises for
  andre før økta er sjekket inn.

## Kom i gang lokalt

Du trenger Node 24 og Postgres.

```sh
npm install
cp .env.example .env   # fyll inn DATABASE_URL (og resten om du vil)
npm run db:migrate
npm run dev            # http://127.0.0.1:3100
```

Den første kontoen som lages på /login, blir admin.

Vil du prøve med oppdiktede data? Kjør `npm run seed:demo` på en tom database og logg inn som
`preben@demo.no` med passord `demo1234`.

`npm run db:start` setter opp en lokal Postgres på Mac (Homebrew, `postgresql@18`).

## Strava (valgfritt)

Garmin, Apple Watch, Polar, Suunto og Wahoo synker alle til Strava, så Strava er den eneste
koblingen. Uten Strava logger deltakerne økter selv.

1. Lag en API-app på https://www.strava.com/settings/api. Sett *Authorization Callback Domain*
   til appens domene (`127.0.0.1` lokalt).
2. Legg `STRAVA_CLIENT_ID` og `STRAVA_CLIENT_SECRET` i `.env`.
3. En ny Strava-app tillater bare deg selv. Øk til 10 deltakere i API-innstillingene (krever
   Strava-abonnement); flere enn 10 krever godkjenning fra Strava.
4. Slå på sanntids-synk under Admin → Regler, så kommer øktene inn med en gang.

## Sett opp din egen

Én installasjon holder til mange grupper, så du trenger bare én.

1. Lag en gratis Postgres-database, for eksempel hos [Neon](https://neon.tech).
2. Importer repoet i [Vercel](https://vercel.com).
3. Legg inn miljøvariablene fra `.env.example`: `DATABASE_URL`, `APP_URL`, `CRON_SECRET` og
   eventuelt Strava-nøklene. `CRON_SECRET` må være satt, ellers sendes ingen påminnelser.
4. Deploy. Databasen settes opp automatisk, siden `npm run build` kjører migreringene først.
5. Åpne appen og lag kontoen din. Du blir systemadmin (eier av appen) og admin for den første
   gruppa. Sett opp utfordringen under Admin.

### Flere grupper

Som systemadmin lager du en engangslenke under **Admin → System**. Den som får lenken, lager sin
egen gruppe med navn, første utfordring og en egen tittel på admin (for eksempel «Generalen»), og
inviterer gjengen sin derfra. Gruppene ser ikke hverandres deltakere, økter eller chat.
Systemadmin kan se alle gruppene og slå dem av og på.

## Lisens

MIT, se [LICENSE](LICENSE). Strava-logoene i `public/strava` tilhører Strava og brukes etter
[Stravas retningslinjer](https://developers.strava.com/guidelines/).
