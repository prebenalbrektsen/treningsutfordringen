"use client";

import { useActionState } from "react";
import { createGroup, type GroupFormState } from "@/app/ny-gruppe/actions";
import { WeekEndSelect } from "@/components/WeekEndSelect";

const TITLES = ["Kontrolløren", "Generalen", "Treneren", "Sjefen", "Bøtevokteren", "Dommeren"];

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
function plusWeeks(date: string, weeks: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}

/** Name the group, pick what the admin is called, and set up the first challenge. */
export function GroupWizard({ token }: { token?: string }) {
  const [state, action, pending] = useActionState<GroupFormState, FormData>(createGroup, undefined);
  const start = nextMonday();
  const step = "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-heat text-sm font-bold text-white";
  return (
    <form action={action} className="space-y-4">
      {token && <input type="hidden" name="token" value={token} />}
      <section className="card space-y-3 p-5">
        <div className="flex items-center gap-3"><span className={step}>1</span><h2 className="font-bold">Gruppa</h2></div>
        <label className="block"><span className="label">Navn på gruppa</span>
          <input name="group_name" className="field" placeholder="F.eks. Familien Hansen eller Breakfast-gjengen" required maxLength={50} />
        </label>
        <label className="block"><span className="label">Hva skal du hete som styrer det hele?</span>
          <input name="admin_title" className="field" list="titles" defaultValue="Kontrolløren" maxLength={30} />
          <datalist id="titles">{TITLES.map((t) => <option key={t} value={t} />)}</datalist>
          <span className="mt-1 block text-xs text-muted">Skriv det i bestemt form – det står i meldinger som «Generalen underkjente løpeturen».</span>
        </label>
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex items-center gap-3"><span className={step}>2</span><h2 className="font-bold">Første utfordring</h2></div>
        <label className="block"><span className="label">Navn på utfordringen</span>
          <input name="challenge_name" className="field" placeholder="F.eks. Vårbøtta 2027" required maxLength={50} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Starter</span><input type="date" name="starts_on" className="field" defaultValue={start} required /></label>
          <label className="block"><span className="label">Slutter</span><input type="date" name="ends_on" className="field" defaultValue={plusWeeks(start, 8)} required /></label>
        </div>
        <WeekEndSelect />
        <p className="-mt-1 text-xs text-muted">Fristen for ukas økter er kl. 24 denne dagen. Starter dere midt i en uke, flyttes starten til første hele uke.</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="block"><span className="label">Økter/uke</span><input name="min_sessions" inputMode="numeric" className="field" defaultValue="3" /></label>
          <label className="block"><span className="label">Min. per økt</span><input name="session_minutes" inputMode="numeric" className="field" defaultValue="35" /></label>
          <label className="block"><span className="label">Bot (kr)</span><input name="penalty_kr" inputMode="numeric" className="field" defaultValue="50" /></label>
        </div>
        <label className="block"><span className="label">Én langøkt holder i stedet (minutter)</span><input name="long_session_minutes" inputMode="numeric" className="field" defaultValue="60" /></label>
        <label className="block"><span className="label">Vipps-lenke til bøtekassa (valgfritt)</span><input name="vipps_info" className="field" placeholder="https://qr.vipps.no/…" /></label>
        <p className="text-xs text-muted">Resten (jokere, bilde-krav, innsjekkingsfrist, ukeskrav) finner du under Admin etterpå.</p>
      </section>

      {state?.error && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad">{state.error}</p>}
      <button className="btn btn-heat w-full text-lg" disabled={pending}>{pending ? "Lager gruppa …" : "Lag gruppa 💪"}</button>
    </form>
  );
}
