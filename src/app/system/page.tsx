import Link from "next/link";
import { CopyLink } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { requireSysadmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDay, osloDate, relativeTime } from "@/lib/time";
import { savePrivacyContact } from "../(app)/actions";
import { createGroupInvite, revokeGroupInvite, toggleGroupDisabled } from "./actions";

/** For the owner of the app: every group, invitations to start new ones, and app-wide settings. */
export default async function SystemPage() {
  await requireSysadmin();
  const today = osloDate();
  const groups = await query<{ id: number; name: string; admin_title: string; disabled: boolean; created_at: Date; members: number; pending: number; admins: string | null; challenge: string | null; ends_on: string | null }>(
    `select g.id, g.name, g.admin_title, g.disabled_at is not null as disabled, g.created_at,
            (select count(*)::int from group_members m where m.group_id = g.id and m.approved) as members,
            (select count(*)::int from group_members m where m.group_id = g.id and not m.approved) as pending,
            (select string_agg(u.name, ', ') from group_members m join users u on u.id = m.user_id where m.group_id = g.id and m.role = 'admin') as admins,
            c.name as challenge, c.ends_on::text
       from groups g
       left join lateral (select name, ends_on from challenges where group_id = g.id order by (starts_on <= $1::date) desc, starts_on desc limit 1) c on true
      order by g.disabled_at nulls first, g.created_at`,
    [today],
  );
  const invites = await query<{ token: string; note: string | null; created_at: Date; used_at: Date | null; group_name: string | null }>(
    `select i.token, i.note, i.created_at, i.used_at, g.name as group_name from group_invites i left join groups g on g.id = i.group_id
      order by i.used_at nulls first, i.created_at desc limit 30`,
  );
  const contact = (await query<{ value: string }>("select value from settings where key = 'privacy_contact'"))[0]?.value ?? "";
  const appUrl = process.env.APP_URL ?? "";
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-16">
      <div className="flex items-center justify-between"><Link href="/"><Logo /></Link><Link href="/" className="text-sm font-semibold text-muted underline">Til appen</Link></div>
      <div>
        <h1 className="display text-4xl">System</h1>
        <p className="text-muted">Bare for deg som eier appen. Grupper, invitasjoner til nye grupper og innstillinger for hele appen.</p>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Inviter noen til å starte en gruppe</h2>
        <p className="text-sm text-muted">Lenken kan brukes én gang. Den som åpner den, lager konto, gir gruppa navn, velger hva de skal hete og setter opp første utfordring.</p>
        <form action={createGroupInvite} className="flex gap-2">
          <input name="note" className="field flex-1" placeholder="Hvem er den til? (bare for deg)" maxLength={80} />
          <button className="btn btn-heat btn-sm">Lag lenke</button>
        </form>
        <ul className="divide-y divide-line">
          {invites.map((i) => (
            <li key={i.token} className="space-y-1.5 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{i.note ?? "Uten notat"}</span>
                <span className="text-xs text-muted">{i.used_at ? `Brukt ${relativeTime(new Date(i.used_at), false)} → ${i.group_name ?? "gruppa"}` : `Laget ${relativeTime(new Date(i.created_at), false)}`}</span>
              </div>
              {!i.used_at && (
                <div className="flex flex-wrap items-center gap-2">
                  <CopyLink url={`${appUrl}/ny-gruppe/${i.token}`} />
                  <form action={revokeGroupInvite.bind(null, i.token)}><button className="text-xs font-semibold text-bad underline">Trekk tilbake</button></form>
                </div>
              )}
            </li>
          ))}
          {!invites.length && <li className="py-2 text-sm text-muted">Ingen invitasjoner ennå.</li>}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-bold">Grupper ({groups.filter((g) => !g.disabled).length})</h2>
        <ul className="divide-y divide-line">
          {groups.map((g) => (
            <li key={g.id} className={`flex items-start justify-between gap-3 py-3 text-sm ${g.disabled ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <p className="font-bold">{g.name}{g.disabled && " · slått av"}</p>
                <p className="text-muted">{g.admin_title}: {g.admins ?? "–"} · {g.members} med{g.pending ? ` · ${g.pending} venter` : ""}</p>
                <p className="text-muted">{g.challenge ? `${g.challenge}${g.ends_on && g.ends_on < today ? " (ferdig)" : g.ends_on ? ` · til ${formatDay(g.ends_on)}` : ""}` : "Ingen utfordring"} · startet {formatDay(new Date(g.created_at).toISOString().slice(0, 10))}</p>
              </div>
              <form action={toggleGroupDisabled.bind(null, g.id)}>
                <button className="btn btn-ghost btn-sm shrink-0">{g.disabled ? "Slå på" : "Slå av"}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-bold">Kontakt for personvern</h2>
        <p className="text-sm text-muted">Vises i <Link href="/personvern" className="underline">personvernerklæringen</Link> som ansvarlig og kontakt for hele appen. Tomt = «si fra til den som styrer gruppa di».</p>
        <form action={savePrivacyContact} className="flex gap-2">
          <input name="contact" defaultValue={contact} placeholder="Navn, e-post" className="field flex-1" />
          <button className="btn btn-sm">Lagre</button>
        </form>
      </section>
    </main>
  );
}
