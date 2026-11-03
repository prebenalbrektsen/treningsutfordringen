import { PushSettings } from "@/components/PushSettings";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ConnectWithStrava, PoweredByStrava } from "@/components/StravaBrand";
import Link from "next/link";
import { AvatarUpload } from "@/components/AvatarUpload";
import { CopyLink } from "@/components/ActionForm";
import { JoinCard } from "@/components/JoinCard";
import { WatchGuide } from "@/components/WatchGuide";
import { AddPasskey } from "@/components/Passkeys";
import { requireUser } from "@/lib/auth";
import { activeChallenge, mayJoin } from "@/lib/challenge";
import { one } from "@/lib/db";
import { CATEGORIES } from "@/lib/push";
import { stravaConfigured } from "@/lib/strava";

/**
 * The guide every new person goes through, in any group: picture, challenge, notifications,
 * Strava, home screen, Face ID. A new group's admin (?eier=1) first gets the link to share.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ eier?: string }> }) {
  const user = await requireUser();
  const owner = !!(await searchParams).eier && user.is_admin;
  const c = await activeChallenge(user.group_id);
  const [membership, me, group] = await Promise.all([
    c
      ? one<{ joined: boolean; count: number }>(
          `select exists(select 1 from challenge_members where challenge_id = $1 and user_id = $2) as joined,
                  (select count(*)::int from challenge_members where challenge_id = $1) as count`,
          [c.id, user.id],
        )
      : null,
    one<{ avatar_v: number | null; notify: Record<string, boolean> }>(
      "select extract(epoch from avatar_updated_at)::int as avatar_v, notify from users where id = $1",
      [user.id],
    ),
    one<{ join_token: string | null }>("select join_token from groups where id = $1", [user.group_id]),
  ]);
  const categories = Object.fromEntries(Object.entries(CATEGORIES).filter(([k]) => k !== "admin" || user.is_admin));
  const strava = stravaConfigured();
  let n = 0;
  const Step = ({ title, done, children }: { title: string; done?: boolean; children: React.ReactNode }) => (
    <section className="card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold ${done ? "bg-ok text-white" : "bg-ink text-paper"}`}>{done ? "✓" : ++n}</span>
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
  return (
    <div className="space-y-5 pt-2">
      <h1 className="display text-5xl">{owner ? `${user.group_name} er klar!` : `Velkommen, ${user.name.split(" ")[0]}!`}</h1>
      <p className="text-muted">{owner ? "Del lenken med gjengen, og sett opp din egen bruker mens de melder seg på." : `Noen raske steg, så er du klar i ${user.group_name}.`}</p>

      {owner && group?.join_token && (
        <Step title="Del lenken med gjengen">
          <p className="text-sm text-muted">Legg den i gruppechatten. De lager konto selv, og du slipper dem inn under Admin → Deltakere.</p>
          <CopyLink url={`${process.env.APP_URL ?? ""}/bli-med/${group.join_token}`} big />
        </Step>
      )}

      <Step title="Profilbilde" done={!!me?.avatar_v}>
        <div className="flex items-center gap-4">
          <AvatarUpload p={{ id: user.id, name: user.name, color: user.color, avatar_v: me?.avatar_v ?? null }} />
          <p className="text-sm text-muted">Trykk på sirkelen og velg et bilde, så de andre ser hvem som heier og trener.</p>
        </div>
      </Step>

      {!owner && (
        <Step title="Bli med i utfordringen" done={!!membership?.joined}>
          {c && membership && (membership.joined || (await mayJoin(c, user.id)))
            ? <JoinCard c={c} joined={membership.joined} count={membership.count} />
            : <p className="text-sm text-muted">{c ? `${user.admin_title} velger hvem som er med – du får beskjed i Prat når du kan bli med.` : "Ingen utfordring er startet ennå – du får beskjed i Prat."}</p>}
        </Step>
      )}

      <Step title="Varsler">
        <p className="text-sm text-muted">Få beskjed når noen heier på deg, når en økt venter på innsjekk – og søndag kveld hvis uka holder på å glippe. Velg selv hva du vil ha.</p>
        <PushSettings categories={categories} prefs={me?.notify ?? {}} />
      </Step>

      {strava && (
        <Step title="Koble til Strava (valgfritt)" done={!!user.strava_athlete_id}>
          {user.strava_athlete_id ? (
            <p className="text-sm"><strong className="text-ok">✓ Koblet til.</strong> <Link href="/strava-deling" className="underline">Se hva gruppa ser</Link></p>
          ) : (
            <>
              <p className="text-sm text-muted">Da kommer øktene fra klokka inn av seg selv – du sjekker dem bare inn med et bilde. Før du kobler til, velger du hva gruppa får se. Uten Strava logger du øktene selv.</p>
              <ConnectWithStrava />
              <PoweredByStrava className="block" />
            </>
          )}
          <WatchGuide />
        </Step>
      )}

      <Step title="Legg appen på hjemskjermen">
        <InstallPrompt />
        <p className="text-xs text-muted">Ser du ingen veiledning over, er appen allerede lagt til – eller du er på en PC.</p>
      </Step>

      <Step title="Logg inn med Face ID">
        <p className="text-sm text-muted">Slipp passordet neste gang – logg inn med ansiktet eller fingeren.</p>
        <AddPasskey />
      </Step>

      <Link href={owner ? "/admin?fane=deltakere" : "/"} className="btn btn-heat w-full">{owner ? "Ferdig – til Admin" : "Ferdig – til forsiden"}</Link>
    </div>
  );
}
