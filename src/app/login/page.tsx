import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { PasskeyLogin } from "@/components/Passkeys";
import { Logo } from "@/components/Logo";
import { movedNotice } from "@/lib/moved";
import { currentUser } from "@/lib/auth";
import { hasUsers, login, setupAdmin } from "../auth-actions";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const firstRun = !(await hasUsers());
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 pt-[12vh] pb-10">
      <Logo size="lg" />
      <p className="mt-3 mb-8 text-muted">Svett, logg det – eller betal.</p>
      {movedNotice() && !firstRun && (
        <section className="mb-4 rounded-2xl bg-heat-soft p-4 text-sm text-ink">
          <p className="font-bold">📣 Ny adresse og nytt navn</p>
          <p className="mt-1">Svettebøtta heter nå Treningsutfordring. Alt er som før, men du må:</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5">
            <li>Logge inn med <strong>passord</strong> – Face ID virker ikke her ennå</li>
            <li>Slette den gamle appen og legge denne på hjemskjermen</li>
            <li>Slå på varsler og Face ID igjen under <strong>Meg</strong></li>
          </ol>
          <p className="mt-2 text-muted">Glemt passordet? Be admin om en ny innloggingslenke.</p>
        </section>
      )}
      <div className="card p-5">
        {firstRun ? (
          <>
            <h1 className="mb-1 text-lg font-bold">Sett opp appen</h1>
            <p className="mb-4 text-sm text-muted">Den første kontoen blir admin. Deltakerne inviterer du etterpå.</p>
            <AuthForm
              action={setupAdmin}
              submit="Opprett admin"
              fields={[
                { name: "name", label: "Navn", autoComplete: "name" },
                { name: "email", label: "E-post", type: "email", autoComplete: "email" },
                { name: "password", label: "Passord (minst 8 tegn)", type: "password", autoComplete: "new-password" },
              ]}
            />
          </>
        ) : (
          <>
          <PasskeyLogin />
          <p className="my-4 flex items-center gap-3 text-xs font-semibold text-muted uppercase"><span className="h-px flex-1 bg-line" />eller med passord<span className="h-px flex-1 bg-line" /></p>
          <AuthForm
            action={login}
            submit="Logg inn"
            fields={[
              { name: "email", label: "E-post", type: "email", autoComplete: "email" },
              { name: "password", label: "Passord", type: "password", autoComplete: "current-password" },
            ]}
          />
          </>
        )}
        {!firstRun && <p className="mt-4 text-center text-sm text-muted">Glemt passordet? Be den som styrer gruppa om en ny innloggingslenke.</p>}
        <p className="mt-6 text-center text-xs"><a href="/personvern" className="text-muted underline">Personvern og vilkår</a></p>
      </div>
    </main>
  );
}
