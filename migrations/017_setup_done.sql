-- One-time setup (notifications + what's shared from Strava) for people who joined before it
-- existed. New people get the welcome guide instead, so they count as done from the start.
alter table users add column setup_done_at timestamptz;
alter table users alter column setup_done_at set default now();
