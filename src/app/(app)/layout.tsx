import { StayFresh } from "@/components/StayFresh";
import { APP_VERSION } from "@/lib/version";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { requireUser } from "@/lib/auth";
import { announceWeekSummary } from "@/lib/announce";
import { syncStale } from "@/lib/autosync";
import { badgesFor } from "@/lib/badges";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Connected before consent existed: ask once (Strava's terms), else they're disconnected.
  if (user.strava_athlete_id && !user.strava_consent_at) redirect("/strava-deling");
  // Keep everyone's Strava workouts fresh without anybody pressing a button.
  after(async () => {
    await syncStale();
    await announceWeekSummary();
  });
  const { badges, avatarV } = await badgesFor(user);
  const avatar = avatarV ? `/api/avatar/${user.id}?v=${avatarV}` : null;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-[calc(104px+env(safe-area-inset-bottom))] sm:pb-10">
      <header className="flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-6 sm:pt-6 sm:pb-8">
        <Link href="/"><Logo /></Link>
        <div className="hidden sm:block"><NavLinks isAdmin={user.is_admin} badges={badges} onStrava={!!user.strava_athlete_id} avatar={avatar} /></div>
      </header>
      <main className="px-4">{children}</main>
      <StayFresh version={APP_VERSION} />
      <div className="tab-bar bottom-blur sm:hidden" aria-hidden="true"><span /><span /><span /></div>
      <nav className="tab-bar fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md sm:hidden">
        <NavLinks isAdmin={user.is_admin} badges={badges} onStrava={!!user.strava_athlete_id} avatar={avatar} mobile />
      </nav>
    </div>
  );
}
