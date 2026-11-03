import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { GroupWizard } from "@/components/GroupWizard";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { openInvite, signUpForGroup } from "../actions";

/** A one-time invitation from the system admin to start a new group. */
export default async function GroupInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await openInvite(token);
  const me = await currentUser();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-10">
      <Logo />
      {!invite ? (
        <div className="card p-5"><p>Denne invitasjonen er brukt eller ikke gyldig lenger.</p></div>
      ) : !me ? (
        <>
          <div>
            <h1 className="display text-4xl">Du er invitert!</h1>
            <p className="mt-1 text-muted">Start din egen treningsutfordring: en lukket gruppe der dere holder hverandre i ørene – med bøtekasse. Først en konto, så gruppa.</p>
          </div>
          <div className="card p-5">
            <AuthForm
              action={signUpForGroup}
              submit="Lag konto og fortsett"
              hidden={{ token }}
              fields={[
                { name: "name", label: "Navnet ditt", autoComplete: "given-name" },
                { name: "email", label: "E-post", type: "email", autoComplete: "email" },
                { name: "password", label: "Passord (minst 8 tegn)", type: "password", autoComplete: "new-password" },
              ]}
            />
            <p className="mt-4 text-center text-sm text-muted">Har du allerede en konto? <Link href="/login" className="underline">Logg inn</Link> og åpne invitasjonen på nytt.</p>
          </div>
        </>
      ) : (
        <>
          <div>
            <h1 className="display text-4xl">Start gruppa di</h1>
            <p className="mt-1 text-muted">Hei {me.name.split(" ")[0]}! Gi gruppa et navn, bestem hva du skal hete, og sett opp den første utfordringen. Etterpå får du lenken du deler med gjengen.</p>
          </div>
          <GroupWizard token={token} />
        </>
      )}
    </main>
  );
}
