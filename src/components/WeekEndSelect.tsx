import { WEEKDAY_NAMES } from "@/lib/time";

// Monday … Sunday in the list, Sunday (the normal Monday–Sunday week) preselected.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Which weekday a challenge's week ends on: the deadline for the week's workouts and fines. */
export function WeekEndSelect({ value = 0, disabled = false }: { value?: number; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="label">Siste dag i uka</span>
      <select name="week_ends_on" className="field" defaultValue={value} disabled={disabled}>
        {ORDER.map((d) => (
          <option key={d} value={d}>
            {cap(WEEKDAY_NAMES[d])} (uka går {WEEKDAY_NAMES[(d + 1) % 7]}–{WEEKDAY_NAMES[d]})
          </option>
        ))}
      </select>
      {disabled && <input type="hidden" name="week_ends_on" value={value} />}
    </label>
  );
}
