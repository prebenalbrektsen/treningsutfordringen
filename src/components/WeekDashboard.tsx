import Link from "next/link";
import type { Challenge, WeekResult } from "@/lib/challenge";
import { workoutCredit } from "@/lib/challenge";
import { addDays, osloDate, weekdayOf } from "@/lib/time";

// Sunday first (index = weekdayOf); a week can start on any day.
const DAY_LETTERS = ["S", "M", "T", "O", "T", "F", "L"];
const SEVEN = [0, 1, 2, 3, 4, 5, 6];

/** The week's progress as a ring: workouts counted out of the requirement. */
export function ProgressRing({ c, r, size = 104 }: { c: Challenge; r: WeekResult; size?: number }) {
  const done = Math.min(r.qualifying, c.min_sessions);
  const stroke = 10, radius = (size - stroke) / 2, circ = 2 * Math.PI * radius;
  const color = r.passed ? "var(--color-ok)" : "var(--color-heat)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${done} av ${c.min_sessions} økter`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - done / c.min_sessions)} className="ring-fill" style={{ "--circ": circ } as React.CSSProperties} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <span className="display text-3xl leading-none">{done}<span className="text-lg text-muted">/{c.min_sessions}</span></span>
      </div>
    </div>
  );
}

/**
 * The week's seven days as dots: filled for a workout that counts (a «2» on a long one), an outline while
 * one waits for check-in. Shows at a glance who trained when.
 */
export function DayDots({ c, r, week, size = "md" }: { c: Challenge; r: WeekResult; week: string; size?: "sm" | "md" }) {
  const today = osloDate(); // future days are drawn fainter
  const px = size === "sm" ? "h-4 w-4 text-[9px]" : "h-6 w-6 text-[11px]";
  return (
    <div className="flex gap-1">
      {SEVEN.map((i) => {
        const day = addDays(week, i);
        const ws = r.workouts.filter((w) => osloDate(new Date(w.started_at)) === day);
        const counted = ws.find((w) => w.status === "counts");
        const pending = ws.some((w) => w.status === "pending");
        const credit = counted ? workoutCredit(c, counted) : 0;
        const fill = counted ? (r.passed ? "bg-ok text-white" : "bg-heat text-white") : pending ? "border-2 border-warn" : day > today ? "bg-line/40" : "bg-line";
        return (
          <span key={day} className={`grid ${px} place-items-center rounded-full font-bold ${fill} ${counted || pending ? "pop" : ""}`} style={{ animationDelay: `${250 + i * 45}ms` }}
            title={counted ? `${counted.duration_min} min` : pending ? "Venter på innsjekk" : undefined}>
            {credit > 1 ? credit : ""}
          </span>
        );
      })}
    </div>
  );
}

export function DayLetters({ week }: { week: string }) {
  const today = osloDate();
  return (
    <div className="flex gap-1">
      {SEVEN.map((i) => {
        const day = addDays(week, i);
        return <span key={i} className={`w-4 text-center text-[10px] ${day === today ? "rounded-sm bg-ink font-bold text-paper" : "font-semibold text-muted"}`}>{DAY_LETTERS[weekdayOf(day)]}</span>;
      })}
    </div>
  );
}

export function Highlight({ label, who, value, href }: { label: string; who: string; value: string; href?: string }) {
  const inner = (
    <>
      <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-0.5 truncate font-bold">{who}</p>
      <p className="truncate text-sm text-muted">{value}</p>
    </>
  );
  return href ? <Link href={href} className="card block min-w-0 p-3">{inner}</Link> : <div className="card min-w-0 p-3">{inner}</div>;
}
