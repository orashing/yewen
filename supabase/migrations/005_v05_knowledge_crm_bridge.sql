-- Content OS v0.5: knowledge/case library, repurposed outputs, lightweight CRM, manual AI bridge preferences.

create table if not exists knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  kind text not null default 'case',
  title text not null,
  summary text not null default '',
  content text not null default '',
  tags text[] not null default '{}',
  is_sensitive boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_knowledge_user_updated on knowledge_items(user_id, updated_at desc);

create table if not exists repurposed_outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  content_id uuid references contents(id) on delete cascade,
  channel text not null,
  title text not null default '',
  body text not null,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, content_id, channel)
);
create index if not exists idx_repurpose_content on repurposed_outputs(content_id);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  source_content_id uuid references contents(id) on delete set null,
  name_alias text not null default '',
  stage text not null default 'new',
  city text not null default '北京',
  district text not null default '',
  grade text not null default '',
  score_range text not null default '',
  need text not null default '',
  contact_channel text not null default '',
  contact_note text not null default '',
  source_channel text not null default 'xiaohongshu',
  source_note text not null default '',
  estimated_value numeric not null default 0,
  actual_value numeric not null default 0,
  next_action text not null default '',
  next_followup_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_user_stage on leads(user_id, stage);
create index if not exists idx_leads_followup on leads(user_id, next_followup_date);

create table if not exists ai_bridge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  run_date date not null default current_date,
  prompt text not null default '',
  response_json jsonb not null default '{}'::jsonb,
  status text not null default 'prompt_ready',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bridge_user_date on ai_bridge_runs(user_id, run_date desc);

create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  ai_mode text not null default 'manual',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at triggers
drop trigger if exists trg_knowledge_items_updated_at on knowledge_items;
create trigger trg_knowledge_items_updated_at before update on knowledge_items for each row execute function public.set_updated_at();
drop trigger if exists trg_repurposed_outputs_updated_at on repurposed_outputs;
create trigger trg_repurposed_outputs_updated_at before update on repurposed_outputs for each row execute function public.set_updated_at();
drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at before update on leads for each row execute function public.set_updated_at();
drop trigger if exists trg_ai_bridge_runs_updated_at on ai_bridge_runs;
create trigger trg_ai_bridge_runs_updated_at before update on ai_bridge_runs for each row execute function public.set_updated_at();

-- RLS and owner-only policies
alter table knowledge_items enable row level security;
alter table repurposed_outputs enable row level security;
alter table leads enable row level security;
alter table ai_bridge_runs enable row level security;
alter table user_preferences enable row level security;

do $$
declare t text;
begin
  foreach t in array array['knowledge_items','repurposed_outputs','leads','ai_bridge_runs','user_preferences'] loop
    execute format('drop policy if exists own_rows_select on %I', t);
    execute format('drop policy if exists own_rows_insert on %I', t);
    execute format('drop policy if exists own_rows_update on %I', t);
    execute format('drop policy if exists own_rows_delete on %I', t);
    if t = 'user_preferences' then
      execute format('create policy own_rows_select on %I for select using (user_id = auth.uid())', t);
      execute format('create policy own_rows_insert on %I for insert with check (user_id = auth.uid())', t);
      execute format('create policy own_rows_update on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
      execute format('create policy own_rows_delete on %I for delete using (user_id = auth.uid())', t);
    else
      execute format('create policy own_rows_select on %I for select using (user_id = auth.uid())', t);
      execute format('create policy own_rows_insert on %I for insert with check (user_id = auth.uid())', t);
      execute format('create policy own_rows_update on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
      execute format('create policy own_rows_delete on %I for delete using (user_id = auth.uid())', t);
    end if;
  end loop;
end $$;
