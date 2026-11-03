import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BackLink } from "@/components/BackLink";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { sportLabel } from "@/lib/sports";
import { ago } from "@/lib/time";

type Item = {
  kind: "kudos" | "comment";
  at: Date;
  workout_id: number;
  sport: string;
  title: string | null;
  body: string | null;
  from_id: number;
  name: string;
  color: string;
  avatar_v: number | null;
};

/** Kudos and comments the others gave on your workouts – the feedback loop that keeps it fun. */
export default async function ToYouPage() {
  const user = await requireUser();
  const seen = (await one<{ at: Date }>("select activity_seen_at as at from users where id = $1", [user.id]))!.at;
  const items = await query<Item>(
    `select * from (
       select 'kudos' as kind, k.created_at as at, w.id as workout_id, w.sport, w.title, null as body,
              u.id as from_id, u.name, u.color, extract(epoch from u.avatar_updated_at)::int as avatar_v
         from kudos k join workouts w on w.id = k.workout_id join users u on u.id = k.user_id
        where w.user_id = $1 and k.user_id <> $1 and k.group_id = $2
       union all
       select 'comment', m.created_at, w.id, w.sport, w.title, m.body,
              u.id, u.name, u.color, extract(epoch from u.avatar_updated_at)::int
         from comments m join workouts w on w.id = m.workout_id join users u on u.id = m.user_id
        where w.user_id = $1 and m.user_id <> $1 and m.group_id = $2
     ) x order by at desc limit 60`,
    [user.id, user.group_id],
  );
  await query("update users set activity_seen_at = now() where id = $1", [user.id]);

  return (
    <div className="space-y-3 pt-2">
      <BackLink />
      <h1 className="display text-4xl">Til deg</h1>
      <section className="card px-4">
        <ul className="divide-y divide-line">
          {items.map((it, i) => {
            const fresh = new Date(it.at) > new Date(seen);
            const what = (it.title || sportLabel(it.sport)).toLowerCase();
            return (
              <li key={i}>
                <Link href={`/okt/${it.workout_id}`} className="flex gap-3 py-3">
                  <Avatar p={{ id: it.from_id, name: it.name, color: it.color, avatar_v: it.avatar_v }} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <strong>{it.name.split(" ")[0]}</strong> {it.kind === "kudos" ? <>ga 🔥 til {what}-økta di</> : <>kommenterte {what}-økta di</>}
                    </p>
                    {it.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">«{it.body}»</p>}
                    <p className="mt-0.5 text-xs text-muted">{ago(new Date(it.at))}</p>
                  </div>
                  {fresh && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-heat" aria-label="Ny" />}
                </Link>
              </li>
            );
          })}
          {!items.length && <li className="py-6 text-center text-sm text-muted">Ingen kudos eller kommentarer ennå. Sjekk inn en økt, så kommer heiaropene.</li>}
        </ul>
      </section>
    </div>
  );
}
