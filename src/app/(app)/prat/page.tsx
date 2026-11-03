import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Avatar } from "@/components/Avatar";
import { ChatBox, ScrollToEnd } from "@/components/ChatBox";
import { RoleTag } from "@/components/RoleTag";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ActionMenu } from "@/components/ActionMenu";
import { dayHeading, osloDate } from "@/lib/time";
import { deleteMessage } from "../actions";

const timeFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export default async function ChatPage() {
  const user = await requireUser();
  const messages = (
    await query<{ id: number; user_id: number | null; name: string | null; color: string | null; avatar_v: number | null; is_admin: boolean | null; body: string; created_at: Date }>(
      `select m.id, m.user_id, u.name, u.color, extract(epoch from u.avatar_updated_at)::int as avatar_v, gm.role = 'admin' as is_admin, m.body, m.created_at
         from messages m left join users u on u.id = m.user_id
         left join group_members gm on gm.group_id = m.group_id and gm.user_id = m.user_id
        where m.group_id = $1
        order by m.created_at desc limit 150`,
      [user.group_id],
    )
  ).reverse();
  await query("update users set chat_seen_at = now() where id = $1", [user.id]);

  return (
    <div className="pt-1 pb-28">
      <h1 className="display text-3xl">Garderoben</h1>
      <ul className="mt-3 space-y-2">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || osloDate(new Date(prev.created_at)) !== osloDate(new Date(m.created_at));
          const separator = newDay && (
            <li key={`d${m.id}`} className="pt-3 pb-1 text-center text-xs font-bold tracking-wider text-muted uppercase">{dayHeading(new Date(m.created_at))}</li>
          );
          if (!m.user_id) {
            // The app's own announcements: quiet, so the family's own messages stay the main thing.
            return [separator, <li key={m.id} className="mx-auto w-fit max-w-[90%] rounded-full bg-line/70 px-3 py-1.5 text-center text-xs font-semibold text-ink">{m.body}</li>];
          }
          const mine = m.user_id === user.id;
          const sameAsPrev = !newDay && prev?.user_id === m.user_id;
          return [separator, (
            <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start pl-9"}`}>
              {!mine && !sameAsPrev && <Link href={`/person/${m.user_id}`} className="mb-0.5 ml-1 flex items-center gap-1.5 text-xs font-bold" style={{ color: m.color! }}>{m.name}{m.is_admin && <RoleTag title={user.admin_title} />}</Link>}
              <div className={`relative max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? "bg-heat text-white" : "card"}`}>
                {!mine && !sameAsPrev && <Link href={`/person/${m.user_id}`} className="absolute top-0 -left-9" aria-label={`Profilen til ${m.name}`}><Avatar p={{ id: m.user_id, name: m.name!, color: m.color!, avatar_v: m.avatar_v }} size={28} /></Link>}
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
                <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${mine ? "text-white/80" : "text-muted"}`}>
                  {timeFmt.format(new Date(m.created_at))}
                  {(mine || user.is_admin) && (
                    <ActionMenu small label="Valg for meldingen" items={[{ label: "Slett melding", action: deleteMessage.bind(null, m.id), danger: true }]} />
                  )}
                </div>
              </div>
            </li>
          )];
        })}
        {!messages.length && <li className="py-8 text-center text-muted">Ingen meldinger ennå. Skryt, mas og trash talk hører hjemme her – appen melder også fra når noen har uka i boks.</li>}
      </ul>
      <ScrollToEnd count={messages.length} />
      <ChatBox />
      <LiveRefresh what="prat" />
    </div>
  );
}
