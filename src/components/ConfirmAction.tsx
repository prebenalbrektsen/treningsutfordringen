"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn w-full bg-bad text-white disabled:opacity-60" disabled={pending}>{pending ? "Sletter …" : label}</button>;
}

/**
 * A button that asks first: opens a box explaining what happens, and only runs the server action
 * when the person confirms. For things that can't be undone, like deleting Strava workouts.
 */
export function ConfirmAction({ action, label, title, children, confirm, className }: {
  action: () => Promise<void>;
  label: string;
  title: string;
  children: React.ReactNode;
  confirm: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] grid place-items-center bg-ink/55 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-sm space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="display text-2xl">{title}</h2>
            <div className="space-y-2 text-sm">{children}</div>
            <form action={action} className="space-y-2">
              <Submit label={confirm} />
              <button type="button" autoFocus className="btn btn-ghost w-full" onClick={() => setOpen(false)}>Avbryt</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
