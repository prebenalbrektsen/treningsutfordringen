import { InstallPrompt } from "@/components/InstallPrompt";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { joinGroupAsMe, joinViaGroupLink } from "../../auth-actions";

/** A group's shared link: ask to join, then wait for the group's admin to let you in. */
export default async function GroupJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const group = await one<{ name: string; admin_title: string }>("select name, admin_title from groups where join_token = $1 and disabled_at is null", [token]);
  const me = await currentUser();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 pt-[12vh] pb-10">
      <Logo size="lg" />
      <div className="mt-6"><InstallPrompt /></div>
      <div className="card mt-4 p-5">
        {!group ? (
          <p>Denne lenken er ikke lenger i bruk. Be om en ny.</p>
        ) : me ? (
          <>
            <h1 className="mb-1 text-lg font-bold">Bli med i {group.name}</h1>
            <p className="mb-4 text-sm text-muted">Du er logget inn som {me.name}. {group.admin_title} slipper deg inn, og så finner du gruppa øverst i appen.</p>
            <form action={joinGroupAsMe.bind(null, token)}><button className="btn btn-heat w-full">Be om å bli med</button></form>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-bold">Bli med i {group.name}</h1>
            <p className="mb-4 text-sm text-muted">Lag en konto, så slipper {group.admin_title} deg inn. Har du allerede en konto? <a href="/login" className="underline">Logg inn</a> og åpne lenken på nytt.</p>
            <AuthForm
              action={joinViaGroupLink}
              submit="Be om å bli med"
              hidden={{ token }}
              fields={[
                { name: "name", label: "Navn (det de andre ser)", autoComplete: "given-name" },
                { name: "email", label: "E-post", type: "email", autoComplete: "email" },
                { name: "password", label: "Passord (minst 8 tegn)", type: "password", autoComplete: "new-password" },
              ]}
            />
          </>
        )}
      </div>
    </main>
  );
}
