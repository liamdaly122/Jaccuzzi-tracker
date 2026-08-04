-- =============================================================================
--  Hot Tub Tracker — database schema
-- =============================================================================
--  HOW TO USE THIS FILE (you only do this ONCE):
--    1. Open your Supabase project in the browser.
--    2. On the left sidebar click "SQL Editor".
--    3. Click "+ New query".
--    4. Copy EVERYTHING in this file and paste it into the box.
--    5. Click the green "Run" button (bottom right).
--    6. You should see "Success. No rows returned". That's it — you're done.
--
--  It is safe to run this more than once: every table uses "if not exists" and
--  the seed data uses "on conflict do nothing", so re-running will not wipe or
--  duplicate your data.
--
--  Security note: This app only ever talks to the database from the server
--  using the secret "service_role" key, and the browser never gets a database
--  key. Even so, Row Level Security IS enabled on every table (see the bottom
--  of this file) — Supabase exposes the public schema over the internet via
--  PostgREST, and the "anon" key is publishable by design, so without RLS
--  anyone holding it could read or change everything. service_role bypasses
--  RLS, so this locks out everyone else while leaving the app untouched.
--  Do not paste your service_role key anywhere public.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- spa_settings: a single row (id = 1) holding your tub's configuration.
-- -----------------------------------------------------------------------------
create table if not exists spa_settings (
  id smallint primary key default 1,
  sanitizer_type text not null default 'chlorine'
    check (sanitizer_type in ('chlorine', 'bromine')),
  volume_litres numeric(8, 1) not null default 1050,
  target_ranges jsonb not null default '{
    "phIdealMin": 7.4, "phIdealMax": 7.6,
    "phAcceptableMin": 7.2, "phAcceptableMax": 7.8,
    "taMin": 80, "taMax": 120,
    "fcMin": 3, "fcMax": 5,
    "brMin": 3, "brMax": 5,
    "chMin": 100, "chMax": 250
  }'::jsonb,
  dosing_constants jsonb not null default '{
    "taIncreaserGPer1000LPer10Ppm": 24,
    "phIncreaserDoseSmallG": 11, "phIncreaserDoseMediumG": 22, "phIncreaserDoseLargeG": 33,
    "phDecreaserDoseSmallG": 11, "phDecreaserDoseMediumG": 22, "phDecreaserDoseLargeG": 33,
    "dichlorAvailableChlorineFraction": 0.56,
    "bromineTopUpGPer1000L": 5,
    "bromineInitialChargeGPer1000L": 25,
    "sodiumBromideGPer1000L": 6,
    "mpsShockGPer1000L": 17
  }'::jsonb,
  avg_daily_bathers numeric(5, 2) not null default 1.5,
  updated_at timestamptz not null default now(),
  constraint spa_settings_single_row check (id = 1)
);

insert into spa_settings (id) values (1)
on conflict (id) do nothing;

-- Added in a later update. Safe to run again on an existing database — this
-- adds the "average daily bathers" column only if it isn't there yet.
alter table spa_settings
  add column if not exists avg_daily_bathers numeric(5, 2) not null default 1.5;

-- Weather feature: your rough location (for frost/heat warnings). All nullable.
alter table spa_settings add column if not exists latitude numeric(8, 4);
alter table spa_settings add column if not exists longitude numeric(8, 4);
alter table spa_settings add column if not exists location_name text;

-- Sanitiser measurement unit: 'ppm' (test strips) or 'orp' (a probe, in mV).
alter table spa_settings
  add column if not exists sanitizer_unit text not null default 'ppm';

-- ORP / disinfection potential in millivolts, for probe users.
alter table test_readings add column if not exists orp_mv numeric(6, 1);

-- -----------------------------------------------------------------------------
-- probe_readings: automatic history from an iopool probe (pH / ORP / temp).
--
-- Separate from test_readings on purpose: the probe cannot measure total
-- alkalinity, and test_readings.total_alkalinity_ppm is NOT NULL, so probe data
-- would either be rejected or force us to invent a number. It gets its own home.
--
-- The unique index on measured_at is the dedupe strategy: capture is
-- "on conflict do nothing", so polling an unchanged measurement is a no-op.
-- That also bounds growth to the probe's own cadence (~96 rows/day maximum),
-- and the daily cron prunes anything older than 180 days.
-- -----------------------------------------------------------------------------
create table if not exists probe_readings (
  id bigint generated always as identity primary key,
  measured_at timestamptz not null,
  ph numeric(4, 2),
  orp_mv numeric(6, 1),
  temperature_c numeric(4, 1),
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists probe_readings_measured_at_key
  on probe_readings (measured_at);
create index if not exists probe_readings_recent_idx
  on probe_readings (measured_at desc);

-- -----------------------------------------------------------------------------
-- test_readings: each time you test your water with a strip.
-- -----------------------------------------------------------------------------
create table if not exists test_readings (
  id bigint generated always as identity primary key,
  recorded_at timestamptz not null default now(),
  ph numeric(4, 2) not null,
  free_chlorine_ppm numeric(5, 2),
  bromine_ppm numeric(5, 2),
  total_alkalinity_ppm numeric(6, 2) not null,
  calcium_hardness_ppm numeric(6, 2),
  is_fresh_fill boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists test_readings_recorded_at_idx
  on test_readings (recorded_at desc);

-- -----------------------------------------------------------------------------
-- dosing_log: what chemical you actually added (may differ from suggestion).
-- -----------------------------------------------------------------------------
create table if not exists dosing_log (
  id bigint generated always as identity primary key,
  reading_id bigint references test_readings (id) on delete set null,
  chemical text not null check (chemical in (
    'ta_increaser', 'ta_decreaser', 'ph_increaser', 'ph_decreaser',
    'dichlor', 'bromine_granules', 'sodium_bromide', 'mps_shock', 'other'
  )),
  amount_grams numeric(7, 2) not null check (amount_grams >= 0),
  note text,
  logged_at timestamptz not null default now()
);
create index if not exists dosing_log_logged_at_idx
  on dosing_log (logged_at desc);

-- -----------------------------------------------------------------------------
-- maintenance_tasks: recurring jobs. task_key is stable; frequency_days is the
-- single source of truth for cadence (editable per task).
-- -----------------------------------------------------------------------------
create table if not exists maintenance_tasks (
  id bigint generated always as identity primary key,
  task_key text not null unique,
  name text not null,
  task_type text not null check (task_type in (
    'testing', 'sanitizing', 'filter', 'water', 'cleaning'
  )),
  frequency_days integer not null check (frequency_days > 0),
  last_completed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into maintenance_tasks (task_key, name, task_type, frequency_days) values
  ('test_water',          'Test the water',                     'testing',    3),
  ('shock',               'Shock treatment',                    'sanitizing', 7),
  ('rinse_filter',        'Rinse the filter cartridge',         'filter',     7),
  ('deep_clean_filter',   'Deep-clean filter (chemical soak)',  'filter',     14),
  ('replace_filter',      'Replace the filter cartridge',       'filter',     90),
  ('drain_refill',        'Drain & refill the tub',             'water',      90),
  ('cover_cabinet_check', 'Check / clean cover & cabinet',      'cleaning',   30)
on conflict (task_key) do nothing;

-- -----------------------------------------------------------------------------
-- task_completions: append-only history of when each task was done.
-- -----------------------------------------------------------------------------
create table if not exists task_completions (
  id bigint generated always as identity primary key,
  task_id bigint not null references maintenance_tasks (id) on delete cascade,
  completed_at timestamptz not null default now(),
  note text
);
create index if not exists task_completions_task_id_idx
  on task_completions (task_id, completed_at desc);

-- -----------------------------------------------------------------------------
-- usage_log: each time the tub is used (a "soak"), with how many people. Feeds
-- the smart water-change tracker with your ACTUAL usage.
-- -----------------------------------------------------------------------------
create table if not exists usage_log (
  id bigint generated always as identity primary key,
  used_at timestamptz not null default now(),
  bathers integer not null check (bathers > 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists usage_log_used_at_idx on usage_log (used_at desc);

-- -----------------------------------------------------------------------------
-- notification_log: one row per day the scheduler runs. The unique constraint
-- both prevents duplicate same-day push notifications AND guarantees at least
-- one database write per day (which stops Supabase's free tier from pausing
-- the project after 7 idle days).
-- -----------------------------------------------------------------------------
create table if not exists notification_log (
  id bigint generated always as identity primary key,
  notify_date date not null,
  kind text not null default 'daily-summary',
  summary text,
  created_at timestamptz not null default now(),
  unique (notify_date, kind)
);

-- -----------------------------------------------------------------------------
-- complete_task(): atomically record a completion AND bump last_completed_at,
-- so the "next due" date recalculates the instant you tick a task off.
-- -----------------------------------------------------------------------------
create or replace function complete_task(p_task_id bigint, p_note text default null)
returns void
language plpgsql
as $$
begin
  insert into task_completions (task_id, note) values (p_task_id, p_note);
  update maintenance_tasks set last_completed_at = now() where id = p_task_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- try_log_notification(): the daily dedupe guard. Returns true ONLY the first
-- time it is called for a given (date, kind) — i.e. "yes, send the push now".
-- A second call the same day inserts nothing and returns false (no-op).
-- -----------------------------------------------------------------------------
create or replace function try_log_notification(
  p_date date,
  p_kind text,
  p_summary text
)
returns boolean
language plpgsql
as $$
begin
  insert into notification_log (notify_date, kind, summary)
  values (p_date, p_kind, p_summary)
  on conflict (notify_date, kind) do nothing;
  return found;
end;
$$;

-- =============================================================================
--  Row Level Security — lock the public API
--
--  Supabase serves the "public" schema over the internet through PostgREST. The
--  "anon" key is designed to be publishable, and Supabase's own guidance is
--  that it's only safe to expose BECAUSE RLS is assumed to be on. With RLS off,
--  anyone holding that key could read — and write — every row here.
--
--  This app talks to the database exclusively with the "service_role" key,
--  which BYPASSES RLS. So enabling RLS with no policies at all costs the app
--  nothing and shuts the public door completely: server keeps full access,
--  everyone else gets nothing.
--
--  Safe to re-run: enabling RLS on a table that already has it is a no-op.
-- =============================================================================
alter table spa_settings       enable row level security;
alter table test_readings      enable row level security;
alter table dosing_log         enable row level security;
alter table maintenance_tasks  enable row level security;
alter table task_completions   enable row level security;
alter table notification_log   enable row level security;
alter table usage_log          enable row level security;
alter table probe_readings     enable row level security;

-- Deliberately no policies: no policy means no access for anon/authenticated,
-- which is exactly what we want. service_role is unaffected.

-- Belt and braces: these helpers run as their caller, so RLS above already
-- covers them, but there's no reason for the public roles to hold execute.
revoke execute on function complete_task(bigint, text) from anon, authenticated;
revoke execute on function try_log_notification(date, text, text) from anon, authenticated;
