"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { WeekRecap } from "@/lib/recap";
import { fmtKm } from "@/lib/stats";
import { formatMinutes } from "@/lib/time";

// Celebrations: a card spins in with confetti when you earn a joker or a badge. Each one is shown
// once (remembered in this browser); several queue up one after another.

const COLORS = ["#ff4d1c", "#ffb59c", "#f4f1ea", "#43b871", "#14130f"];

function burst() {
  confetti({ particleCount: 110, spread: 85, startVelocity: 38, origin: { y: 0.42 }, colors: COLORS, disableForReducedMotion: true, zIndex: 70 });
  setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.35 }, colors: COLORS, disableForReducedMotion: true, zIndex: 70 }), 250);
}

const face: React.CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
const back: React.CSSProperties = { ...face, transform: "rotateY(180deg)" };

/** The joker as a two-sided playing card: the face, and a dark back with the bucket. */
function JokerCard({ small }: { small?: boolean }) {
  const size = small ? "h-40 w-28 rounded-xl" : "h-80 w-56 rounded-[22px]";
  return (
    <div className={`relative ${size}`} style={{ transformStyle: "preserve-3d" }}>
      <div style={face} className={`absolute inset-0 ${size} border-4 border-white bg-gradient-to-br from-[#ff7a4d] via-[#ff4d1c] to-[#c2410c] p-3 text-white shadow-2xl`}>
        <span className={`absolute ${small ? "top-1.5 left-2 text-sm" : "top-2.5 left-3.5 text-2xl"} display leading-none`}>J</span>
        <span className={`absolute ${small ? "right-2 bottom-1.5 text-sm" : "right-3.5 bottom-2.5 text-2xl"} display rotate-180 leading-none`}>J</span>
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-white/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-512.png" alt="" className={`${small ? "h-12 w-12 rounded-lg" : "h-24 w-24 rounded-2xl"} shadow-lg ring-4 ring-white/80`} />
          <span className={`display ${small ? "text-xl" : "text-4xl"} tracking-wide`}>Joker</span>
        </div>
      </div>
      <div style={back} className={`absolute inset-0 ${size} border-4 border-white bg-[#14130f] p-3 shadow-2xl`}>
        <div className="grid h-full place-items-center rounded-[14px] border-2 border-[#ff4d1c]/60 bg-[repeating-linear-gradient(45deg,#1f1d18_0_10px,#14130f_10px_20px)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-512.png" alt="" className={`${small ? "h-10 w-10 rounded-lg" : "h-20 w-20 rounded-2xl"} opacity-90`} />
        </div>
      </div>
    </div>
  );
}

/** A two-sided gold medal: the badge's emoji in front, the bucket on the back. */
function BadgeMedal({ emoji }: { emoji: string }) {
  const disc = "absolute inset-0 grid place-items-center rounded-full border-[6px] border-white bg-gradient-to-br from-[#ffd36b] via-[#ffb03b] to-[#ff7a1f] shadow-2xl";
  return (
    <div className="relative h-52 w-52" style={{ transformStyle: "preserve-3d" }}>
      <div style={face} className={disc}>
        <div className="grid h-40 w-40 place-items-center rounded-full bg-white/25 text-7xl ring-2 ring-white/60">{emoji}</div>
      </div>
      <div style={back} className={disc}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-512.png" alt="" className="h-24 w-24 rounded-3xl ring-4 ring-white/70" />
      </div>
    </div>
  );
}

function JokerRules({ held, max, every }: { held: number; max: number; every: number }) {
  return (
    <ul className="space-y-1.5 text-left text-sm">
      <li>✅ {every === 1 ? "Hver økt" : `Hver ${every}. økt`} utover ukas krav blir spart som en joker.</li>
      <li>🃏 En joker fyller én økt du mangler i en uke som ikke gikk helt.</li>
      <li>👆 Du bruker den selv fra bøtefeltet når uka er over – da er uka i boks.</li>
      <li>🎒 Du kan ha maks {max} på lur. Ekstra økter utover det spares ikke.</li>
      <li>📝 Ukeskravet (f.eks. «økt i vann») kan ikke dekkes av en joker.</li>
      <li className="pt-1 font-bold">Du har nå {held} av {max}.</li>
    </ul>
  );
}

type Item =
  | { kind: "recap"; recap: WeekRecap }
  | { kind: "joker"; count: number }
  | { kind: "badge"; id: string; title: string; emoji: string; how: string };

function Ring({ done, needed, passed }: { done: number; needed: number; passed: boolean }) {
  const size = 96, stroke = 9, radius = (size - stroke) / 2, circ = 2 * Math.PI * radius;
  const shown = Math.min(done, needed);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${shown} av ${needed} økter`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - shown / needed) }}
          transition={{ duration: 1.1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="display text-3xl leading-none">{shown}<span className="text-lg opacity-70">/{needed}</span></span>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className="display mt-0.5 text-2xl leading-tight">{value}</p>
      {note && <p className="text-xs font-semibold text-muted">{note}</p>}
    </div>
  );
}

function delta(now: number, before: number, unit: (n: number) => string): string | undefined {
  if (now === before) return "som forrige uke";
  return `${now > before ? "+" : "−"}${unit(Math.abs(now - before))} fra forrige`;
}

/** «Din uke»: last week's result, numbers, place in the family and a push for the new week. */
function RecapCard({ recap: r, onNext }: { recap: WeekRecap; onNext: () => void }) {
  const chips = [
    r.people > 1 && `🏆 Nr. ${r.rank} av ${r.people} på treningstid`,
    r.first && "🥇 Først i mål",
    r.streak >= 2 && `🔥 ${r.streak} uker på rad`,
    r.topSport && `⭐ Mest: ${r.topSport}`,
    r.task && `📝 Ukeskrav ${r.task.met ? "✓" : "✗"}`,
  ].filter(Boolean) as string[];
  return (
    <motion.div className="card w-full overflow-hidden p-0" initial={{ y: 40, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 16 }}>
      <div className={`flex items-center gap-4 p-5 text-white ${r.passed ? "bg-gradient-to-br from-[#ff7a4d] via-[#ff4d1c] to-[#c2410c]" : "bg-gradient-to-br from-[#3a3630] to-[#14130f]"}`}>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wider uppercase opacity-80">Din uke {r.weekNo} · {r.range}</p>
          <p className="display mt-1 text-4xl leading-none">{r.passed ? "I boks!" : "Ikke i boks"}</p>
          <p className="mt-1.5 text-sm font-semibold opacity-90">
            {r.passed
              ? r.jokersUsed ? `Med ${r.jokersUsed === 1 ? "1 joker" : `${r.jokersUsed} jokere`} 🃏` : "Ingen bot denne uka 🎉"
              : r.fined ? `${r.penaltyKr} kr i bøtta 💸` : "Ingen bot – den er strøket"}
          </p>
        </div>
        <Ring done={r.credits + r.jokersUsed} needed={r.needed} passed={r.passed} />
      </div>
      <div className="space-y-4 p-5">
        <p className="font-semibold">{r.message}</p>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Økter" value={String(r.sessions)} note={r.prev ? delta(r.sessions, r.prev.sessions, String) : undefined} />
          <Tile label="Tid" value={formatMinutes(r.minutes)} note={r.prev ? delta(r.minutes, r.prev.minutes, formatMinutes) : undefined} />
          {r.km > 0 ? <Tile label="Distanse" value={`${fmtKm(r.km)} km`} note={r.elevation > 0 ? `${Math.round(r.elevation)} høydemeter` : undefined} /> : null}
          <Tile label="Lengste økt" value={r.longest ? formatMinutes(r.longest) : "–"} />
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((t) => <span key={t} className="rounded-full bg-heat-soft px-2.5 py-1 text-xs font-bold">{t}</span>)}
          </div>
        )}
        {r.family.total > 1 && (
          <div className="rounded-xl border border-line p-3 text-sm">
            <p className="font-bold">Hele gjengen</p>
            <p className="text-muted">
              {r.family.made === r.family.total ? "Alle" : `${r.family.made} av ${r.family.total}`} klarte uka · {r.family.sessions} økter · {formatMinutes(r.family.minutes)}
              {r.family.km >= 1 ? ` · ${fmtKm(r.family.km)} km` : ""}
            </p>
          </div>
        )}
        {r.weeksLeft > 0 && (
          <p className="text-center text-sm text-muted">{r.weeksLeft === 1 ? "Siste uke nå – avslutt med stil!" : `${r.weeksLeft} uker igjen av utfordringen.`}</p>
        )}
        <button type="button" autoFocus onClick={onNext} className="btn btn-heat w-full">{r.passed ? "Videre! 💪" : "Ny uke – kjør på! 💪"}</button>
      </div>
    </motion.div>
  );
}

function Dialog({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-5 py-6" onClick={(e) => e.stopPropagation()}>{children}</div>
    </motion.div>
  );
}

/** Spins a card in: from edge-on and small to facing you, with a springy settle. */
function Spin({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ perspective: 1000 }}>
      <motion.div
        initial={{ rotateY: -720, scale: 0.3, opacity: 0, y: 60 }}
        animate={{ rotateY: 0, scale: 1, opacity: 1, y: 0 }}
        transition={{
          rotateY: { duration: 1.5, ease: [0.16, 1, 0.3, 1] },
          scale: { type: "spring", stiffness: 110, damping: 11 },
          y: { type: "spring", stiffness: 110, damping: 13 },
          opacity: { duration: 0.25 },
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.6 }} style={{ transformStyle: "preserve-3d" }}>
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * Shows new jokers and badges since last time, one at a time. The first visit only remembers the
 * current state (so nobody gets a pile of old badges at once).
 */
export function Celebrations({ userId, challengeId, jokers, badges, recap }: {
  userId: number;
  challengeId: number;
  recap?: WeekRecap | null;
  jokers: { earnedTotal: number; held: number; max: number; every: number; enabled: boolean };
  badges: { id: string; title: string; emoji: string; how: string }[];
}) {
  const [queue, setQueue] = useState<Item[]>([]);
  useEffect(() => {
    // Last week's recap: once per week, also on someone's very first visit.
    const recapItems: Item[] = [];
    if (recap) {
      const recapKey = `sb-recap-${userId}-${challengeId}-${recap.week}`;
      let shown = false;
      try { shown = !!localStorage.getItem(recapKey); localStorage.setItem(recapKey, "1"); } catch { shown = true; }
      if (!shown) recapItems.push({ kind: "recap", recap });
    }
    const key = `sb-celebrated-${userId}-${challengeId}`;
    let seen: { jokers: number; badges: string[] } | null = null;
    try { seen = JSON.parse(localStorage.getItem(key) ?? "null"); } catch {}
    const now = { jokers: jokers.earnedTotal, badges: badges.map((b) => b.id) };
    try { localStorage.setItem(key, JSON.stringify(now)); } catch {}
    if (!seen) { if (recapItems.length) setQueue(recapItems); return; }
    const items: Item[] = [...recapItems];
    if (jokers.enabled && jokers.earnedTotal > seen.jokers) items.push({ kind: "joker", count: jokers.earnedTotal - seen.jokers });
    for (const b of badges) if (!seen.badges.includes(b.id)) items.push({ kind: "badge", ...b });
    if (items.length) setQueue(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, challengeId, jokers.earnedTotal, badges.map((b) => b.id).join(","), recap?.week]);

  return <CelebrationQueue queue={queue} setQueue={setQueue} jokers={jokers} />;
}

function CelebrationQueue({ queue, setQueue, jokers }: {
  queue: Item[];
  setQueue: React.Dispatch<React.SetStateAction<Item[]>>;
  jokers: { held: number; max: number; every: number };
}) {
  const current = queue[0];
  useEffect(() => { if (current && (current.kind !== "recap" || current.recap.passed)) burst(); }, [current]);
  const next = () => setQueue((q) => q.slice(1));

  return (
    <AnimatePresence>
      {current && (
        <Dialog key={current.kind === "recap" ? `recap-${current.recap.week}` : current.kind === "joker" ? "joker" : current.id} onClose={next}
          label={current.kind === "recap" ? `Din uke ${current.recap.weekNo}` : current.kind === "joker" ? "Du sparte en joker" : `Nytt merke: ${current.title}`}>
          {current.kind === "recap" ? (
            <RecapCard recap={current.recap} onNext={next} />
          ) : current.kind === "joker" ? (
            <>
              <Spin><JokerCard /></Spin>
              <div className="card w-full p-5 text-center">
                <p className="display text-3xl">Du sparte {current.count === 1 ? "1 joker" : `${current.count} jokere`}!</p>
                <p className="mt-1 mb-4 text-sm text-muted">Du gjorde mer enn ukas krav. Sterkt! 💪</p>
                <JokerRules held={jokers.held} max={jokers.max} every={jokers.every} />
                <button type="button" autoFocus onClick={next} className="btn btn-heat mt-5 w-full">Nice!</button>
              </div>
            </>
          ) : (
            <>
              <Spin><BadgeMedal emoji={current.emoji} /></Spin>
              <div className="card w-full p-5 text-center">
                <p className="text-xs font-bold tracking-wider text-heat uppercase">Nytt merke</p>
                <p className="display mt-1 text-4xl">{current.title}</p>
                <p className="mt-2 text-muted">{current.how}</p>
                <button type="button" autoFocus onClick={next} className="btn btn-heat mt-5 w-full">Sterkt! 💪</button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </AnimatePresence>
  );
}

const SAMPLE_RECAP: WeekRecap = {
  week: "2026-10-26", weekNo: 44, range: "26. okt.–1. nov.", passed: true, fined: false, penaltyKr: 50, credits: 4, needed: 3,
  jokersUsed: 0, task: { title: "Én økt utendørs", met: true }, sessions: 4, minutes: 205, km: 18.4, elevation: 240, longest: 72,
  topSport: "Løping", prev: { sessions: 3, minutes: 150 }, rank: 2, people: 6, first: false, streak: 3,
  family: { made: 5, total: 6, sessions: 21, minutes: 1260, km: 64 }, weeksLeft: 7,
  message: "🔥 3 uker på rad! Du er rett og slett umulig å stoppe.",
};
const SAMPLE_MISSED: WeekRecap = {
  ...SAMPLE_RECAP, passed: false, fined: true, credits: 2, sessions: 2, minutes: 80, km: 6.1, elevation: 40, longest: 45,
  prev: { sessions: 3, minutes: 150 }, rank: 5, streak: 0, first: false,
  message: "Bare én økt unna! Ny uke, blanke ark – denne tar du.",
};

/** Admin: show the celebrations on demand, to see (or show off) how they look. */
export function CelebrationPreview({ jokers }: { jokers: { held: number; max: number; every: number } }) {
  const [queue, setQueue] = useState<Item[]>([]);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQueue([{ kind: "recap", recap: SAMPLE_RECAP }])}>📊 Ukesoppsummering</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQueue([{ kind: "recap", recap: SAMPLE_MISSED }])}>📉 Uke uten mål</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQueue([{ kind: "joker", count: 1 }])}>🃏 Ny joker</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQueue([{ kind: "badge", id: "preview", title: "Morgenfugl", emoji: "🌅", how: "5 økter startet før kl. 7" }])}>🏅 Nytt merke</button>
      <CelebrationQueue queue={queue} setQueue={setQueue} jokers={jokers} />
    </div>
  );
}

/** Tap the joker counter anywhere to see the card and the rules. */
export function JokerInfo({ held, max, every, children }: { held: number; max: number; every: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-left">{children}</button>
      <AnimatePresence>
        {open && (
          <Dialog onClose={() => setOpen(false)} label="Slik funker jokere">
            <Spin><JokerCard /></Spin>
            <div className="card w-full p-5">
              <p className="display mb-3 text-center text-3xl">Slik funker jokere</p>
              <JokerRules held={held} max={max} every={every} />
              <button type="button" autoFocus onClick={() => setOpen(false)} className="btn mt-5 w-full">Skjønner!</button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
}
