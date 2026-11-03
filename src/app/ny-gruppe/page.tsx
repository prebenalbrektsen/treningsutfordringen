import { redirect } from "next/navigation";
import { GroupWizard } from "@/components/GroupWizard";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { logout } from "../auth-actions";

/** Not in any group: the system admin starts one here; everyone else needs an invitation. */
export default async function NewGroupPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-10">
      <Logo />
      {me.is_sysadmin ? (
        <>
          <div>
            <h1 className="display text-4xl">Start en gruppe</h1>
            <p className="mt-1 text-muted">Du eier appen. Lag en gruppe for deg selv her – andre får en invitasjon fra System-siden.</p>
          </div>
          <GroupWizard />
        </>
      ) : (
        <div className="card space-y-3 p-5">
          <h1 className="text-lg font-bold">Du er ikke med i noen gruppe ennå</h1>
          <p className="text-muted">Be den som styrer gruppa di om lenken deres, eller – vil du starte en egen – be om en invitasjon.</p>
          <form action={logout}><button className="text-sm font-semibold text-muted underline">Logg ut</button></form>
        </div>
      )}
    </main>
  );
}
