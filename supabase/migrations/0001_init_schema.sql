-- ============================================================================
-- StayIn · Supabase schema (Phase B foundation)
-- ----------------------------------------------------------------------------
-- Custom-auth model: the client does NOT use Supabase Auth (no auth.uid()).
-- Data is tenant-scoped by `workspace_id` and protected from the public anon
-- key via ROW LEVEL SECURITY + SECURITY DEFINER RPC wrappers in the `app`
-- schema. The React Native client calls these `.rpc(...)` functions passing a
-- custom session token; each wrapper validates the token and workspace before
-- touching rows.
--
-- Run this whole file in the Supabase SQL Editor (idempotent).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 0. Auth plumbing (custom session)
--    A long-lived opaque session token, issued by our own backend, is sent as
--    the `X-StayIn-Token` request header. PostgREST surfaces it via
--    current_setting('request.headers', true). We use SECURITY DEFINER
--    functions so the anon role can call them while staying locked out of the
--    underlying tables.
-- ---------------------------------------------------------------------------

create schema if not exists app;
grant usage on schema app to anon, authenticated;

-- Extracts the custom session token header, or NULL.
create or replace function app.session_token()
returns text
language sql
stable
as $$
  select nullif(coalesce(
    current_setting('request.headers', true)::json ->> 'x-stayin-token',
    ''
  ), '');
$$;

-- Validates a session token against the stayin_sessions table and returns the
-- owning userId + workspaceId that the token is bound to, or NULL if invalid.
create or replace function app.session_context(p_token text default null)
returns table (
  user_id       bigint,
  workspace_id  uuid,
  role          text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := coalesce(p_token, app.session_token());
begin
  if v_token is null or v_token = '' then
    return;
  end if;

  return query
    select s.user_id::bigint,
           m.workspace_id,
           m.role
    from public.stayin_sessions s
    join public.stayin_workspace_members m
      on m.user_id = s.user_id
    where s.token = v_token
      and s.expires_at > now()
      and s.revoked_at is null
    limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Identity & workspace (mirrors the existing relational model)
-- ---------------------------------------------------------------------------
create table if not exists public.stayin_users (
  id              bigint generated always as identity primary key,
  open_id         text not null unique,
  name            text,
  email           text,
  phone           text,
  phone_e164      text,
  login_method    text,
  role            text not null default 'user' check (role in ('user','admin')),
  avatar_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.stayin_sessions (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references public.stayin_users(id) on delete cascade,
  jti           text not null unique,
  token         text not null unique,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sessions_token on public.stayin_sessions(token);
create index if not exists idx_sessions_user on public.stayin_sessions(user_id);

create table if not exists public.stayin_workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    bigint references public.stayin_users(id) on delete set null,
  logo_url    text,
  currency    text default 'د.أ',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.stayin_workspace_members (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.stayin_workspaces(id) on delete cascade,
  user_id       bigint not null references public.stayin_users(id) on delete cascade,
  display_name  text not null default '',
  phone         text not null default '',
  role          text not null check (role in ('owner','admin','staff','guest')),
  permissions   jsonb,
  status        text not null default 'active' check (status in ('active','disabled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists idx_members_user on public.stayin_workspace_members(user_id);
create index if not exists idx_members_ws on public.stayin_workspace_members(workspace_id);

-- ---------------------------------------------------------------------------
-- 2. Business tables (tenant-scoped)
--    Every entity carries workspace_id for RLS/tenancy.
-- ---------------------------------------------------------------------------
create table if not exists public.chalets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.stayin_workspaces(id) on delete cascade,
  name          text not null,
  property_type text,
  reference_code text,
  color         text not null default '#FF6B47',
  image_uri     text,
  location      text,
  latitude      double precision,
  longitude     double precision,
  is_published  boolean not null default false,
  is_verified   boolean not null default false,
  has_heated_pool boolean not null default false,
  near_water    boolean not null default false,
  contact_phone text,
  notes         text,
  shifts        jsonb not null default '[]',
  created_at    timestamptz not null default now()
);
create index if not exists idx_chalets_ws on public.chalets(workspace_id);

create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.stayin_workspaces(id) on delete cascade,
  name          text not null,
  phone         text not null,
  e164          text not null,
  national_id   text,
  total_bookings_count integer not null default 0,
  total_spent   double precision not null default 0,
  is_blacklisted boolean not null default false,
  blacklist_reason text,
  notes         text,
  last_booking_date date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, e164)
);
create index if not exists idx_customers_ws on public.customers(workspace_id);

create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.stayin_workspaces(id) on delete cascade,
  booking_reference text,
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text not null,
  phone         text not null,
  chalet_id     uuid references public.chalets(id) on delete set null,
  chalet_name   text,
  start_date    date not null,
  end_date      date not null,
  booking_type  text not null check (booking_type in ('morning','evening','24h','custom','multi-day')),
  shift_id      text,
  shift_name    text,
  start_time    text not null,
  end_time      text not null,
  price         double precision not null default 0,
  discount_amount double precision not null default 0,
  deposit_amount double precision not null default 0,
  status        text not null default 'confirmed'
                check (status in ('confirmed','awaiting-deposit','cancelled','completed','waitlisted')),
  notes         text not null default '',
  payments      jsonb not null default '[]',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  no_show_at    timestamptz,
  meta          jsonb not null default '{}',
  created_by_user_id bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_bookings_ws on public.bookings(workspace_id);
create index if not exists idx_bookings_chalet on public.bookings(chalet_id);
create index if not exists idx_bookings_start on public.bookings(workspace_id, start_date);

create table if not exists public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.stayin_workspaces(id) on delete cascade,
  customer_name text not null,
  phone        text not null,
  chalet_id    uuid references public.chalets(id) on delete set null,
  requested_date date not null,
  end_date     date,
  booking_type text not null default 'evening',
  status       text not null default 'active' check (status in ('active','cancelled','promoted')),
  notes        text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists idx_waitlist_ws on public.waitlist(workspace_id);

create table if not exists public.assets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.stayin_workspaces(id) on delete cascade,
  chalet_id    uuid references public.chalets(id) on delete cascade,
  name         text not null,
  category     text not null default '',
  condition    text not null default 'good'
               check (condition in ('excellent','good','needs_service')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_assets_ws on public.assets(workspace_id);

create table if not exists public.maintenance_tasks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.stayin_workspaces(id) on delete cascade,
  chalet_id    uuid references public.chalets(id) on delete cascade,
  asset_id     uuid references public.assets(id) on delete set null,
  title        text not null,
  frequency    text not null default 'custom'
               check (frequency in ('daily','weekly','monthly','custom')),
  next_due_date date not null,
  status       text not null default 'pending'
               check (status in ('pending','in_progress','completed')),
  cost         double precision,
  note         text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_maintenance_ws on public.maintenance_tasks(workspace_id);

create table if not exists public.utility_readings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.stayin_workspaces(id) on delete cascade,
  booking_id   uuid references public.bookings(id) on delete set null,
  chalet_id    uuid references public.chalets(id) on delete cascade,
  type         text not null check (type in ('electricity','water','gas_fuel')),
  check_in_reading  double precision not null,
  check_out_reading double precision,
  unit_rate    double precision not null default 0,
  consumed_units double precision,
  total_cost   double precision,
  is_excessive boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_utility_ws on public.utility_readings(workspace_id);

create table if not exists public.settings (
  workspace_id uuid primary key references public.stayin_workspaces(id) on delete cascade,
  payload      jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

-- Optional aggregates kept as JSON blobs for easy round-tripping with the
-- existing client store (analogous to the legacy single-blob workspace model).
create table if not exists public.workspace_state (
  workspace_id uuid primary key references public.stayin_workspaces(id) on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  version      integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
--    Default-deny for anon. Business data is read/written ONLY through the
--    SECURITY DEFINER wrappers below, which validate the custom session.
-- ---------------------------------------------------------------------------
alter table public.stayin_users             enable row level security;
alter table public.stayin_sessions          enable row level security;
alter table public.stayin_workspaces        enable row level security;
alter table public.stayin_workspace_members enable row level security;
alter table public.chalets                  enable row level security;
alter table public.customers                enable row level security;
alter table public.bookings                 enable row level security;
alter table public.waitlist                 enable row level security;
alter table public.assets                   enable row level security;
alter table public.maintenance_tasks        enable row level security;
alter table public.utility_readings         enable row level security;
alter table public.settings                 enable row level security;
alter table public.workspace_state          enable row level security;

-- The anon and authenticated roles can never touch rows directly; all access
-- flows through app.* wrapper functions (which are SECURITY DEFINER).
drop policy if exists "anon denied" on public.chalets;
create policy "anon denied" on public.chalets
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.customers;
create policy "anon denied" on public.customers
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.bookings;
create policy "anon denied" on public.bookings
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.waitlist;
create policy "anon denied" on public.waitlist
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.assets;
create policy "anon denied" on public.assets
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.maintenance_tasks;
create policy "anon denied" on public.maintenance_tasks
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.utility_readings;
create policy "anon denied" on public.utility_readings
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.settings;
create policy "anon denied" on public.settings
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.workspace_state;
create policy "anon denied" on public.workspace_state
  for all to anon, authenticated using (false) with check (false);

-- Identity tables are internal; anon may not touch them directly either.
drop policy if exists "anon denied" on public.stayin_users;
create policy "anon denied" on public.stayin_users
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.stayin_sessions;
create policy "anon denied" on public.stayin_sessions
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.stayin_workspaces;
create policy "anon denied" on public.stayin_workspaces
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "anon denied" on public.stayin_workspace_members;
create policy "anon denied" on public.stayin_workspace_members
  for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER service wrappers (app.*)
--    The React Native client calls these with `.rpc('app.X', {...})` plus the
--    X-StayIn-Token header. Each wrapper resolves the caller's workspace from
--    the session and enforces tenant scoping.
-- ---------------------------------------------------------------------------

-- Reads the active workspace for the current session token.
create or replace function app.my_workspace()
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select c.workspace_id
  from app.session_context() c
  where c.role <> 'guest'
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4.1 Bookings
-- ---------------------------------------------------------------------------
create or replace function app.list_bookings()
returns setof public.bookings
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.*
  from public.bookings b
  join app.session_context() c on true
  where b.workspace_id = c.workspace_id
  order by b.created_at desc;
$$;

create or replace function app.get_booking(p_id uuid)
returns public.bookings
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.*
  from public.bookings b
  join app.session_context() c on true
  where b.id = p_id and b.workspace_id = c.workspace_id
  limit 1;
$$;

create or replace function app.upsert_booking(p_booking jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
  b public.bookings;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;

  insert into public.bookings (
    id, workspace_id, customer_name, phone, chalet_id, chalet_name,
    start_date, end_date, booking_type, start_time, end_time,
    price, discount_amount, deposit_amount, status, notes, payments,
    booking_reference, meta, created_by_user_id
  ) values (
    coalesce((p_booking->>'id')::uuid, gen_random_uuid()),
    c.workspace_id,
    p_booking->>'customer_name',
    p_booking->>'phone',
    (p_booking->>'chalet_id')::uuid,
    p_booking->>'chalet_name',
    (p_booking->>'start_date')::date,
    (p_booking->>'end_date')::date,
    p_booking->>'booking_type',
    p_booking->>'start_time',
    p_booking->>'end_time',
    coalesce((p_booking->>'price')::double precision, 0),
    coalesce((p_booking->>'discount_amount')::double precision, 0),
    coalesce((p_booking->>'deposit_amount')::double precision, 0),
    coalesce(p_booking->>'status', 'confirmed'),
    coalesce(p_booking->>'notes', ''),
    coalesce(p_booking->'payments', '[]'::jsonb),
    p_booking->>'booking_reference',
    coalesce(p_booking->'meta', '{}'::jsonb),
    c.user_id
  )
  on conflict (id) do update set
    customer_name  = excluded.customer_name,
    phone          = excluded.phone,
    chalet_id      = excluded.chalet_id,
    chalet_name    = excluded.chalet_name,
    start_date     = excluded.start_date,
    end_date       = excluded.end_date,
    booking_type   = excluded.booking_type,
    start_time     = excluded.start_time,
    end_time       = excluded.end_time,
    price          = excluded.price,
    discount_amount= excluded.discount_amount,
    deposit_amount = excluded.deposit_amount,
    status         = excluded.status,
    notes          = excluded.notes,
    payments       = excluded.payments,
    booking_reference = excluded.booking_reference,
    meta           = excluded.meta,
    updated_at     = now()
  returning * into b;

  return b;
end;
$$;

create or replace function app.delete_booking(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;
  delete from public.bookings
   where id = p_id and workspace_id = c.workspace_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.2 Chalets
-- ---------------------------------------------------------------------------
create or replace function app.list_chalets()
returns setof public.chalets
language sql
security definer
set search_path = public, pg_temp
as $$
  select ch.*
  from public.chalets ch
  join app.session_context() c on true
  where ch.workspace_id = c.workspace_id
  order by ch.created_at asc;
$$;

create or replace function app.upsert_chalet(p_chalet jsonb)
returns public.chalets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
  ch public.chalets;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;

  insert into public.chalets (
    id, workspace_id, name, property_type, reference_code, color,
    image_uri, location, latitude, longitude, is_published, is_verified,
    has_heated_pool, near_water, contact_phone, notes, shifts
  ) values (
    coalesce((p_chalet->>'id')::uuid, gen_random_uuid()),
    c.workspace_id,
    p_chalet->>'name', p_chalet->>'property_type', p_chalet->>'reference_code',
    coalesce(p_chalet->>'color', '#FF6B47'), p_chalet->>'image_uri',
    p_chalet->>'location', (p_chalet->>'latitude')::double precision,
    (p_chalet->>'longitude')::double precision,
    coalesce((p_chalet->>'is_published')::boolean, false),
    coalesce((p_chalet->>'is_verified')::boolean, false),
    coalesce((p_chalet->>'has_heated_pool')::boolean, false),
    coalesce((p_chalet->>'near_water')::boolean, false),
    p_chalet->>'contact_phone', p_chalet->>'notes',
    coalesce(p_chalet->'shifts', '[]'::jsonb)
  )
  on conflict (id) do update set
    name = excluded.name,
    property_type = excluded.property_type,
    color = excluded.color,
    image_uri = excluded.image_uri,
    shifts = excluded.shifts,
    updated_at = now()
  returning * into ch;

  return ch;
end;
$$;

create or replace function app.delete_chalet(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;
  delete from public.chalets where id = p_id and workspace_id = c.workspace_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.3 Customers
-- ---------------------------------------------------------------------------
create or replace function app.list_customers(p_search text default null)
returns setof public.customers
language sql
security definer
set search_path = public, pg_temp
as $$
  select cu.*
  from public.customers cu
  join app.session_context() c on true
  where cu.workspace_id = c.workspace_id
    and (p_search is null
         or cu.name ilike '%' || p_search || '%'
         or cu.phone ilike '%' || p_search || '%')
  order by cu.created_at desc;
$$;

create or replace function app.upsert_customer(p_customer jsonb)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record; cu public.customers;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;

  insert into public.customers (
    id, workspace_id, name, phone, e164, national_id,
    total_bookings_count, total_spent, is_blacklisted,
    blacklist_reason, notes
  ) values (
    coalesce((p_customer->>'id')::uuid, gen_random_uuid()),
    c.workspace_id, p_customer->>'name', p_customer->>'phone',
    p_customer->>'e164', p_customer->>'national_id',
    coalesce((p_customer->>'total_bookings_count')::integer, 0),
    coalesce((p_customer->>'total_spent')::double precision, 0),
    coalesce((p_customer->>'is_blacklisted')::boolean, false),
    p_customer->>'blacklist_reason', p_customer->>'notes'
  )
  on conflict (workspace_id, e164) do update set
    name = excluded.name,
    phone = excluded.phone,
    national_id = excluded.national_id,
    is_blacklisted = excluded.is_blacklisted,
    blacklist_reason = excluded.blacklist_reason,
    notes = excluded.notes,
    total_bookings_count = excluded.total_bookings_count,
    total_spent = excluded.total_spent,
    updated_at = now()
  returning * into cu;

  return cu;
end;
$$;

create or replace function app.delete_customer(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;
  delete from public.customers where id = p_id and workspace_id = c.workspace_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.4 Maintenance tasks
-- ---------------------------------------------------------------------------
create or replace function app.list_maintenance_tasks()
returns setof public.maintenance_tasks
language sql
security definer
set search_path = public, pg_temp
as $$
  select m.*
  from public.maintenance_tasks m
  join app.session_context() c on true
  where m.workspace_id = c.workspace_id
  order by m.next_due_date asc;
$$;

create or replace function app.upsert_maintenance_task(p_task jsonb)
returns public.maintenance_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record; m public.maintenance_tasks;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;

  insert into public.maintenance_tasks (
    id, workspace_id, chalet_id, asset_id, title, frequency,
    next_due_date, status, cost, note, completed_at
  ) values (
    coalesce((p_task->>'id')::uuid, gen_random_uuid()),
    c.workspace_id, (p_task->>'chalet_id')::uuid,
    (p_task->>'asset_id')::uuid, p_task->>'title',
    coalesce(p_task->>'frequency', 'custom'),
    (p_task->>'next_due_date')::date,
    coalesce(p_task->>'status', 'pending'),
    (p_task->>'cost')::double precision, p_task->>'note',
    (p_task->>'completed_at')::timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    frequency = excluded.frequency,
    next_due_date = excluded.next_due_date,
    status = excluded.status,
    cost = excluded.cost,
    note = excluded.note,
    completed_at = excluded.completed_at
  returning * into m;

  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.5 Utility readings
-- ---------------------------------------------------------------------------
create or replace function app.list_utility_readings()
returns setof public.utility_readings
language sql
security definer
set search_path = public, pg_temp
as $$
  select u.*
  from public.utility_readings u
  join app.session_context() c on true
  where u.workspace_id = c.workspace_id
  order by u.created_at desc;
$$;

create or replace function app.upsert_utility_reading(p_reading jsonb)
returns public.utility_readings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record; u public.utility_readings;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;

  insert into public.utility_readings (
    id, workspace_id, booking_id, chalet_id, type,
    check_in_reading, check_out_reading, unit_rate
  ) values (
    coalesce((p_reading->>'id')::uuid, gen_random_uuid()),
    c.workspace_id, (p_reading->>'booking_id')::uuid,
    (p_reading->>'chalet_id')::uuid, p_reading->>'type',
    coalesce((p_reading->>'check_in_reading')::double precision, 0),
    (p_reading->>'check_out_reading')::double precision,
    coalesce((p_reading->>'unit_rate')::double precision, 0)
  )
  on conflict (id) do update set
    check_out_reading = excluded.check_out_reading,
    unit_rate = excluded.unit_rate,
    updated_at = now()
  returning * into u;

  return u;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.6 Settings (single JSON payload per workspace)
-- ---------------------------------------------------------------------------
create or replace function app.get_settings()
returns public.settings
language sql
security definer
set search_path = public, pg_temp
as $$
  select s.*
  from public.settings s
  join app.session_context() c on true
  where s.workspace_id = c.workspace_id
  limit 1;
$$;

create or replace function app.upsert_settings(p_payload jsonb)
returns public.settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record; s public.settings;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;

  insert into public.settings (workspace_id, payload)
  values (c.workspace_id, p_payload)
  on conflict (workspace_id) do update set
    payload = excluded.payload, updated_at = now()
  returning * into s;

  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.7 Whole-workspace state (round-tripping the client's AppData blob)
-- ---------------------------------------------------------------------------
create or replace function app.get_workspace_state()
returns public.workspace_state
language sql
security definer
set search_path = public, pg_temp
as $$
  select w.*
  from public.workspace_state w
  join app.session_context() c on true
  where w.workspace_id = c.workspace_id
  limit 1;
$$;

create or replace function app.save_workspace_state(p_payload jsonb)
returns public.workspace_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c record; w public.workspace_state;
begin
  select * into c from app.session_context() limit 1;
  if c is null then raise exception 'invalid session'; end if;

  insert into public.workspace_state (workspace_id, payload, version)
  values (c.workspace_id, p_payload, 1)
  on conflict (workspace_id) do update set
    payload = excluded.payload,
    version  = public.workspace_state.version + 1,
    updated_at = now()
  returning * into w;

  return w;
end;
$$;

-- Realtime: expose booking inserts/updates/deletes to the client via the
-- postgres_changes listener. RLS (default-deny) applies, so the client must
-- subscribe as a real role with valid auth to receive changes.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end$$;

alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.chalets;
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.maintenance_tasks;
alter publication supabase_realtime add table public.utility_readings;
alter publication supabase_realtime add table public.settings;
alter publication supabase_realtime add table public.workspace_state;

-- ===========================================================================
-- End of migration.
-- ===========================================================================
