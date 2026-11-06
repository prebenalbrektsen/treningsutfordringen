-- Which weekday a challenge's week ends on (0 = Sunday … 6 = Saturday, like JS getDay()).
-- Sunday keeps today's Monday–Sunday weeks; e.g. 4 = Thursday gives Friday–Thursday weeks.
alter table challenges add column week_ends_on smallint not null default 0 check (week_ends_on between 0 and 6);
