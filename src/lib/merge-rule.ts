// Safe for client components (no database imports).

/** Whether participants may merge workouts into one: never, back to back (same day, short break) or any on the same day. */
export type MergeMode = "off" | "back_to_back" | "same_day";
export const MERGE_BREAK_MIN = 30;
