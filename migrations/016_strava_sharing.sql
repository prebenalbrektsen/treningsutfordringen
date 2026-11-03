-- Strava's API terms: one person's Strava data may only be shown to others with their explicit
-- consent. strava_consent_at = they agreed that checked-in workouts are shared with the group
-- (sport, day and duration). Each extra detail is shown to others only when they tick it.
alter table users
  add column strava_consent_at timestamptz,
  add column share_distance boolean not null default false,
  add column share_elevation boolean not null default false,
  add column share_hr boolean not null default false,
  add column share_title boolean not null default false;
