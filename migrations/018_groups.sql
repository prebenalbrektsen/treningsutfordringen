-- Several private groups in one app. Each group has its own members, admin(s) with a title of the
-- group's choosing, challenges, chat and join link. A person can be in several groups; their
-- workouts belong to them and count in every group's challenge they're in.

create table groups (
  id serial primary key,
  name text not null,
  admin_title text not null default 'Kontrolløren',  -- definite form: «Kontrolløren», «Generalen», «Treneren»
  join_token text unique,          -- the group's shared «bli med»-link (was settings.group_invite)
  disabled_at timestamptz,         -- turned off by the system admin
  created_at timestamptz not null default now()
);

create table group_members (
  group_id int not null references groups(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  approved boolean not null default true,   -- joined via the shared link: waits for the admin
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on group_members (user_id);

-- One-time links from the system admin that let someone start a new group.
create table group_invites (
  token text primary key,
  note text,                                -- who it's for, for the system admin's own overview
  created_at timestamptz not null default now(),
  used_at timestamptz,
  group_id int references groups(id) on delete set null
);

-- The system admin (owner of the app) sits above all groups.
alter table users add column is_sysadmin boolean not null default false;
alter table users add column current_group_id int references groups(id) on delete set null;

-- Everything so far becomes group #1, named after its newest challenge.
insert into groups (id, name, join_token)
values (1, coalesce((select name from challenges order by starts_on desc limit 1), 'Treningsutfordring'),
        (select value from settings where key = 'group_invite'));
select setval('groups_id_seq', 1);
insert into group_members (group_id, user_id, role, approved)
  select 1, id, case when is_admin then 'admin' else 'member' end, approved from users;
update users set current_group_id = 1;
-- Only the account that set up the app (the first admin) owns it; other admins stay group admins.
update users set is_sysadmin = true where id = (select min(id) from users where is_admin);
delete from settings where key = 'group_invite';

alter table challenges add column group_id int references groups(id) on delete cascade;
update challenges set group_id = 1;
alter table challenges alter column group_id set not null;
create index challenges_group on challenges (group_id, starts_on);

alter table messages add column group_id int references groups(id) on delete cascade;
update messages set group_id = 1;
alter table messages alter column group_id set not null;
-- event_key stays unique, but per group from now on.
alter table messages drop constraint messages_event_key_key;
create unique index messages_group_event on messages (group_id, event_key);

-- Comments and kudos happen inside a group: the same workout can be shown in two groups, and
-- one group shouldn't read the other's comments.
alter table comments add column group_id int references groups(id) on delete cascade;
update comments set group_id = 1;
alter table comments alter column group_id set not null;
alter table kudos add column group_id int references groups(id) on delete cascade;
update kudos set group_id = 1;
alter table kudos alter column group_id set not null;
alter table kudos drop constraint kudos_pkey;
alter table kudos add primary key (workout_id, user_id, group_id);

-- users.is_admin and users.approved now live per group in group_members.

-- The admin's verdict on a workout is the group's own: rejected in one group can count in another.
-- approved_at = the admin let it count without a check-in (e.g. Strava synced too late).
create table workout_verdicts (
  workout_id int not null references workouts(id) on delete cascade,
  group_id int not null references groups(id) on delete cascade,
  rejected boolean not null default false,
  approved_at timestamptz,
  primary key (workout_id, group_id)
);
insert into workout_verdicts (workout_id, group_id, rejected) select id, 1, true from workouts where rejected;
update workouts set rejected = false where rejected;
