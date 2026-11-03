import { query } from "@/lib/db";
import { switchGroup } from "@/app/ny-gruppe/actions";

/** For people in more than one group: which group you're looking at, and a way to switch. */
export async function GroupSwitcher({ userId, current }: { userId: number; current: number }) {
  const groups = await query<{ id: number; name: string; approved: boolean }>(
    `select g.id, g.name, m.approved from group_members m join groups g on g.id = m.group_id and g.disabled_at is null
      where m.user_id = $1 order by m.joined_at`,
    [userId],
  );
  if (groups.length < 2) return null;
  const now = groups.find((g) => g.id === current);
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full bg-line/60 px-3 py-1.5 text-sm font-semibold">
        <span className="max-w-40 truncate">{now?.name ?? "Velg gruppe"}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <ul className="card absolute top-full left-0 z-30 mt-2 w-60 p-1.5 shadow-xl">
        {groups.map((g) => (
          <li key={g.id}>
            <form action={switchGroup.bind(null, g.id)}>
              <button disabled={g.id === current} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${g.id === current ? "bg-heat-soft font-bold" : "hover:bg-line/60"}`}>
                {g.name}{!g.approved && <span className="block text-xs text-muted">Venter på godkjenning</span>}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
