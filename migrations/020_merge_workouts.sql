-- Merging workouts: e.g. 60 min strength + 30 min run, done back to back, counted as one 90 min
-- workout (so it can be a long session). The participant merges them before checking in.
-- The second workout points at the first; both rows stay as they are (Strava keeps updating
-- each one), and the minutes are added up when the week is worked out.
alter table workouts add column merged_into int references workouts(id) on delete set null;
create index workouts_merged_into on workouts (merged_into) where merged_into is not null;

-- Per challenge: 'off' (default), 'back_to_back' (same day, max 30 min break) or 'same_day'.
alter table challenges add column merge_mode text not null default 'off'
  check (merge_mode in ('off', 'back_to_back', 'same_day'));
