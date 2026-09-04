create extension if not exists pgcrypto;

create type content_status as enum (
  'IDEA','SELECTED','BRIEF_READY','DRAFT_READY','FACT_CHECK','REVIEW','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED','ANALYZED'
);

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  raw_input text,
  target_audience text,
  content_type text,
  purpose text,
  score jsonb default '{}'::jsonb,
  status content_status not null default 'IDEA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contents (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) on delete cascade,
  title text,
  title_options jsonb default '[]'::jsonb,
  brief jsonb default '{}'::jsonb,
  body text,
  tags jsonb default '[]'::jsonb,
  status content_status not null default 'IDEA',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references contents(id) on delete cascade,
  claim text not null,
  url text,
  source_name text,
  verification_status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references contents(id) on delete cascade,
  kind text not null,
  storage_path text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references contents(id) on delete cascade,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists publish_jobs (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references contents(id) on delete cascade,
  platform text not null default 'xiaohongshu',
  scheduled_at timestamptz,
  status text not null default 'QUEUED',
  error_code text,
  error_detail text,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references contents(id) on delete cascade,
  platform text not null,
  external_post_id text,
  external_url text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  views integer,
  likes integer,
  saves integer,
  comments integer,
  followers_gained integer,
  qualified_leads integer,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_contents_topic_id on contents(topic_id);
create index if not exists idx_contents_status on contents(status);
create index if not exists idx_publish_jobs_status on publish_jobs(status);
create index if not exists idx_metrics_post_id on metrics(post_id);
