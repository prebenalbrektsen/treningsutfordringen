import Link from "next/link";

export const ADMIN_TABS = [
  { id: "boter", label: "Bøter" },
  { id: "ukeskrav", label: "Ukeskrav" },
  { id: "deltakere", label: "Deltakere" },
  { id: "regler", label: "Regler" },
] as const;

/** The admin tabs, plus «System» (all groups) for the owner of the app. Used on /admin and /system. */
export function AdminNav({ active, sysadmin, counts = {} }: { active: string; sysadmin: boolean; counts?: Record<string, number> }) {
  const cls = (on: boolean) => `relative shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${on ? "bg-ink text-paper" : "bg-line/60 text-muted"}`;
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4" aria-label="Admin">
      {ADMIN_TABS.map((t) => (
        <Link key={t.id} href={`/admin?fane=${t.id}`} className={cls(active === t.id)} aria-current={active === t.id ? "page" : undefined}>
          {t.label}
          {!!counts[t.id] && <span className="ml-1.5 rounded-full bg-heat px-1.5 text-xs text-white">{counts[t.id]}</span>}
        </Link>
      ))}
      {sysadmin && <Link href="/system" className={cls(active === "system")} aria-current={active === "system" ? "page" : undefined}>⚙️ System</Link>}
    </nav>
  );
}
