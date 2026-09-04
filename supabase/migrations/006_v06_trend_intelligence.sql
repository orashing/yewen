-- Content OS v0.6: source intelligence, watch queries, trend signals.

create table if not exists radar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  platform text not null default 'web',
  surface text not null default 'search',
  enabled boolean not null default true,
  weight numeric not null default 1.0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists watch_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  query text not null,
  query_type text not null default 'keyword',
  audience text not null default '',
  weight numeric not null default 1.0,
  enabled boolean not null default true,
  notes text not null default '',
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, query, query_type)
);

create table if not exists trend_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  query text not null default '',
  summary text not null default '',
  platform text not null default 'web',
  surface text not null default 'search',
  freshness numeric not null default 5,
  search_intent numeric not null default 5,
  engagement_signal numeric not null default 5,
  audience_fit numeric not null default 5,
  conversion_fit numeric not null default 5,
  confidence numeric not null default 0.5,
  observed_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  source jsonb,
  raw jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_watch_queries_user on watch_queries(user_id, enabled);
create index if not exists idx_trend_signals_user_observed on trend_signals(user_id, observed_at desc);
create index if not exists idx_trend_signals_platform on trend_signals(user_id, platform, surface);

alter table radar_sources enable row level security;
alter table watch_queries enable row level security;
alter table trend_signals enable row level security;

create policy own_rows_select on radar_sources for select using (user_id = auth.uid());
create policy own_rows_insert on radar_sources for insert with check (user_id = auth.uid());
create policy own_rows_update on radar_sources for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows_delete on radar_sources for delete using (user_id = auth.uid());

create policy own_rows_select on watch_queries for select using (user_id = auth.uid());
create policy own_rows_insert on watch_queries for insert with check (user_id = auth.uid());
create policy own_rows_update on watch_queries for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows_delete on watch_queries for delete using (user_id = auth.uid());

create policy own_rows_select on trend_signals for select using (user_id = auth.uid());
create policy own_rows_insert on trend_signals for insert with check (user_id = auth.uid());
create policy own_rows_update on trend_signals for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows_delete on trend_signals for delete using (user_id = auth.uid());

-- Default source registry is user-owned, not shared. Seed via app if empty.
