/** Marks the admin as the challenge's referee: the one who checks workouts and approves fines. */
export function RoleTag({ compact, title = "Kontrolløren" }: { compact?: boolean; title?: string }) {
  if (compact) {
    return (
      <span className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-heat" title={`${title} – sjekker øktene og godkjenner bøter`}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label={title}>
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-2 py-0.5 align-middle text-[11px] font-bold tracking-wide text-paper uppercase" title={`${title} – sjekker øktene og godkjenner bøter`}>
      <svg viewBox="0 0 24 24" className="h-3 w-3 text-heat" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      {title}
    </span>
  );
}
