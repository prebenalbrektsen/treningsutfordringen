"use client";

import { useState, useTransition } from "react";
import { checkIn } from "@/app/(app)/actions";
import { resizeImage } from "@/lib/resize";

const Camera = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

/**
 * The check-in button on a workout. Not checked in yet: the main action ("Sjekk inn med bilde"
 * opens the camera / photo library). Already checked in: a quiet "Bytt bilde".
 */
export function CheckIn({ workoutId, checkedIn, hasPhoto, proofRequired }: { workoutId: number; checkedIn: boolean; hasPhoto: boolean; proofRequired: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = (data: string | null) =>
    start(async () => {
      const r = await checkIn(workoutId, data);
      setMsg(r?.error ? { text: r.error, ok: false } : r?.ok ? { text: r.ok, ok: true } : null);
    });
  const picker = (label: string, className: string) => (
    <label className={`${className} cursor-pointer`}>
      <Camera />
      {pending ? "Laster opp …" : label}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) run(await resizeImage(f));
        }}
      />
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {checkedIn
        ? picker(hasPhoto ? "Bytt bilde" : "Legg til bilde", "btn btn-ghost btn-sm")
        : proofRequired || !hasPhoto
          ? picker("Sjekk inn og del med bilde", "btn btn-heat btn-sm")
          : null}
      {!checkedIn && !proofRequired && (
        <button className="btn btn-heat btn-sm" disabled={pending} onClick={() => run(null)}>Sjekk inn og del</button>
      )}
      {msg && <span className={`text-sm font-semibold ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</span>}
    </div>
  );
}
