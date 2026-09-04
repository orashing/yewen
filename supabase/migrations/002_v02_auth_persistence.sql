-- Content OS v0.2: single-operator auth, RLS, opinion library, draft history.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table topics add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table contents add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table sources add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table assets add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table reviews add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table publish_jobs add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table posts add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table metrics add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table contents add column if not exists factual_claims jsonb not null default '[]'::jsonb;

create table if not exists opinion_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  viewpoint text not null,
  reasoning text not null default '',
  exceptions text not null default '',
  tone_note text not null default '',
  tags jsonb not null default '[]'::jsonb,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  content_id uuid not null references contents(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  reason text not null default 'save',
  created_at timestamptz not null default now(),
  unique(content_id, version)
);

create index if not exists idx_topics_user_id on topics(user_id);
create index if not exists idx_contents_user_id on contents(user_id);
create index if not exists idx_opinion_library_user_id on opinion_library(user_id);
create index if not exists idx_content_versions_content_id on content_versions(content_id);
create index if not exists idx_content_versions_user_id on content_versions(user_id);

-- Keep timestamps current.
drop trigger if exists trg_topics_updated_at on topics;
create trigger trg_topics_updated_at before update on topics
for each row execute function public.set_updated_at();

drop trigger if exists trg_contents_updated_at on contents;
create trigger trg_contents_updated_at before update on contents
for each row execute function public.set_updated_at();

drop trigger if exists trg_opinions_updated_at on opinion_library;
create trigger trg_opinions_updated_at before update on opinion_library
for each row execute function public.set_updated_at();

-- RLS: every operator can only see their own records.
alter table topics enable row level security;
alter table contents enable row level security;
alter table sources enable row level security;
alter table assets enable row level security;
alter table reviews enable row level security;
alter table publish_jobs enable row level security;
alter table posts enable row level security;
alter table metrics enable row level security;
alter table opinion_library enable row level security;
alter table content_versions enable row level security;

-- Re-runnable policy creation.
do $$
declare
  t text;
begin
  foreach t in array array['topics','contents','sources','assets','reviews','publish_jobs','posts','metrics','opinion_library','content_versions']
  loop
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
