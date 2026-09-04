-- Content OS v0.7: dual XHS account roles, research runs, attribution and AI budget preferences.

create table if not exists xhs_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  alias text not null,
  role text not null check (role in ('research','publisher')),
  profile_key text not null default '',
  enabled boolean not null default true,
  status text not null default 'not_connected',
  risk_state text not null default 'normal',
  last_seen_at timestamptz,
  notes text not null default '',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, role)
);

create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  account_id uuid references xhs_accounts(id) on delete set null,
  status text not null default 'queued',
  run_type text not null default 'keyword_sweep',
  query_count integer not null default 0,
  signal_count integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Manual/automatic post performance can be entered before Publisher exists.
alter table metrics add column if not exists profile_visits integer;
alter table metrics add column if not exists dms integer;
alter table metrics add column if not exists leads integer;
alter table metrics add column if not exists consultations integer;
alter table metrics add column if not exists revenue numeric not null default 0;

alter table leads add column if not exists source_post_id uuid references posts(id) on delete set null;

create index if not exists idx_xhs_accounts_user_role on xhs_accounts(user_id, role);
create index if not exists idx_research_runs_user_created on research_runs(user_id, created_at desc);
create index if not exists idx_metrics_user_captured on metrics(user_id, captured_at desc);
create index if not exists idx_leads_source_post on leads(source_post_id);

drop trigger if exists trg_xhs_accounts_updated_at on xhs_accounts;
create trigger trg_xhs_accounts_updated_at before update on xhs_accounts for each row execute function public.set_updated_at();

alter table xhs_accounts enable row level security;
alter table research_runs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['xhs_accounts','research_runs'] loop
    execute format('drop policy if exists own_rows_select on %I', t);
    execute format('drop policy if exists own_rows_insert on %I', t);
    execute format('drop policy if exists own_rows_update on %I', t);
    execute format('drop policy if exists own_rows_delete on %I', t);
    execute format('create policy own_rows_select on %I for select using (user_id = auth.uid())', t);
    execute format('create policy own_rows_insert on %I for insert with check (user_id = auth.uid())', t);
    execute format('create policy own_rows_update on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy own_rows_delete on %I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

-- V0.7 convention stored inside user_preferences.config, no extra table required:
-- {
--   "api_budget": {"mode":"lean","monthly_limit_usd":5,"web_runs_per_request":2},
--   "xhs_research": {"queries_per_run":8,"min_interval_minutes":120}
-- }
