import { InstallPrompt } from "@/components/InstallPrompt";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { logout } from "../auth-actions";
import { query } from "@/lib/db";
import { switchGroup } from "../ny-gruppe/actions";

/** Waiting room for people who joined through the shared link, until the admin approves them. */
export default async function WaitingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.approved) redirect("/velkommen");
  // Already in other groups: those are still open while this one waits.
  const others = await query<{ id: number; name: string }>(
    `select g.id, g.name from group_members m join groups g on g.id = m.group_id and g.disabled_at is null
      where m.user_id = $1 and m.approved and g.id is distinct from $2`,
    [user.id, user.group_id],
  );
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 pt-[12vh] pb-10">
      <Logo size="lg" />
      <div className="card mt-8 space-y-3 p-5">
        <h1 className="text-lg font-bold">Takk, {user.name.split(" ")[0]}!</h1>
        <p className="text-muted">{user.admin_title} i {user.group_name ?? "gruppa"} må godkjenne deg før du kommer inn. Denne siden går videre av seg selv når det er gjort – eller kom tilbake senere og logg inn som vanlig.</p>
        {others.map((g) => (
          <form key={g.id} action={switchGroup.bind(null, g.id)}><button className="btn btn-ghost btn-sm">Tilbake til {g.name}</button></form>
        ))}
        <form action={logout}><button className="text-sm font-semibold text-muted underline">Logg ut</button></form>
      </div>
      <div className="mt-4"><InstallPrompt /></div>
      <LiveRefresh what="godkjent" />
    </main>
  );
}
