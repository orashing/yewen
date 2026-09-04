-- Content OS v0.4: topic radar metadata + 30-day content calendar.

alter table topics add column if not exists radar_meta jsonb not null default '{}'::jsonb;

create table if not exists calendar_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  topic_id uuid references topics(id) on delete set null,
  planned_date date not null,
  slot integer not null default 1,
  title text not null,
  purpose text not null default 'decision',
  angle text not null default '',
  rationale text not null default '',
  source_topic_title text not null default '',
  status text not null default 'planned',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, planned_date, slot)
);

create index if not exists idx_calendar_items_user_date on calendar_items(user_id, planned_date);
create index if not exists idx_calendar_items_topic_id on calendar_items(topic_id);

drop trigger if exists trg_calendar_items_updated_at on calendar_items;
create trigger trg_calendar_items_updated_at before update on calendar_items
for each row execute function public.set_updated_at();

alter table calendar_items enable row level security;

drop policy if exists own_rows_select on calendar_items;
drop policy if exists own_rows_insert on calendar_items;
drop policy if exists own_rows_update on calendar_items;
drop policy if exists own_rows_delete on calendar_items;

create policy own_rows_select on calendar_items for select using (user_id = auth.uid());
create policy own_rows_insert on calendar_items for insert with check (user_id = auth.uid());
create policy own_rows_update on calendar_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows_delete on calendar_items for delete using (user_id = auth.uid());
