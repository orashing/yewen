create extension if not exists pgcrypto;

-- Content OS v0.9: production hardening for approval integrity and publish queue leasing.

alter table contents add column if not exists approved_at timestamptz;
alter table contents add column if not exists approval_hash text;
alter table contents add column if not exists approved_version integer;

alter table publish_jobs add column if not exists attempts integer not null default 0;
alter table publish_jobs add column if not exists worker_id text;
alter table publish_jobs add column if not exists lease_expires_at timestamptz;
alter table publish_jobs add column if not exists heartbeat_at timestamptz;
alter table publish_jobs add column if not exists next_attempt_at timestamptz;
alter table publish_jobs add column if not exists account_id uuid references xhs_accounts(id) on delete set null;
alter table publish_jobs add column if not exists result jsonb not null default '{}'::jsonb;

-- Only one live publishing attempt per content/platform/user.
create unique index if not exists uq_publish_jobs_active_content
on publish_jobs(user_id, content_id, platform)
where status in ('QUEUED','CLAIMED','PUBLISHING');

create index if not exists idx_publish_jobs_claim
on publish_jobs(user_id, status, scheduled_at, next_attempt_at, created_at);

create or replace function public.content_approval_hash(p contents)
returns text
language sql
stable
as $$
  select encode(digest(
    coalesce(p.title,'') || E'\n' || coalesce(p.body,'') || E'\n' ||
    coalesce(p.fact_check,'{}'::jsonb)::text || E'\n' ||
    coalesce(p.editorial_review,'{}'::jsonb)::text || E'\n' ||
    coalesce(p.native_text_plan,'{}'::jsonb)::text,
    'sha256'
  ), 'hex');
$$;

create or replace function public.approve_content_v09(p_content_id uuid, p_notes text default '')
returns contents
language plpgsql
security invoker
as $$
declare
  c contents;
  bad_facts integer;
  high_flags integer;
begin
  select * into c from contents where id=p_content_id and user_id=auth.uid() for update;
  if not found then raise exception 'content not found'; end if;

  if coalesce((c.editorial_review->>'publish_ready')::boolean, false) is not true then
    raise exception 'editorial review is not publish-ready';
  end if;

  select count(*) into bad_facts
  from jsonb_array_elements(coalesce(c.fact_check->'items','[]'::jsonb)) x
  where coalesce(x->>'status','needs_review') not in ('verified','manual_verified');
  if bad_facts > 0 then raise exception '% unresolved fact items', bad_facts; end if;

  select count(*) into high_flags
  from jsonb_array_elements(coalesce(c.fact_check->'compliance_flags','[]'::jsonb)) x
  where coalesce(x->>'severity','')='high';
  if high_flags > 0 then raise exception '% high-risk compliance flags', high_flags; end if;

  if coalesce((c.native_text_plan->>'automation_ready')::boolean, false) is not true then
    raise exception 'native text package is not automation-ready';
  end if;

  update contents
  set status='APPROVED', approved_at=now(), approved_version=version,
      approval_hash=public.content_approval_hash(contents)
  where id=p_content_id
  returning * into c;

  insert into reviews(user_id,content_id,action,notes)
  values(auth.uid(),p_content_id,'approved',coalesce(p_notes,''));
  return c;
end;
$$;

-- If any approved payload changes, approval is invalidated and queued work is cancelled.
create or replace function public.invalidate_content_approval_v09()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('APPROVED','SCHEDULED','PUBLISHING') and (
    old.title is distinct from new.title or
    old.body is distinct from new.body or
    old.fact_check is distinct from new.fact_check or
    old.editorial_review is distinct from new.editorial_review or
    old.native_text_plan is distinct from new.native_text_plan
  ) then
    new.status := 'REVIEW';
    new.approved_at := null;
    new.approval_hash := null;
    new.approved_version := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contents_invalidate_approval_v09 on contents;
create trigger trg_contents_invalidate_approval_v09
before update on contents
for each row execute function public.invalidate_content_approval_v09();

create or replace function public.cancel_publish_jobs_on_content_change_v09()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('APPROVED','SCHEDULED','PUBLISHING') and new.status='REVIEW' then
    update publish_jobs
    set status='CANCELLED', finished_at=now(), error_code='CONTENT_CHANGED', error_detail='Approval invalidated by content change'
    where content_id=new.id and user_id=new.user_id and status in ('QUEUED','CLAIMED','PUBLISHING');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contents_cancel_publish_v09 on contents;
create trigger trg_contents_cancel_publish_v09
after update on contents
for each row execute function public.cancel_publish_jobs_on_content_change_v09();

create or replace function public.enqueue_publish_job_v09(
  p_content_id uuid,
  p_payload jsonb,
  p_scheduled_at timestamptz default null,
  p_publish_mode text default 'native_text',
  p_account_role text default 'publisher'
)
returns publish_jobs
language plpgsql
security invoker
as $$
declare
  c contents;
  j publish_jobs;
  publisher_account_id uuid;
begin
  if p_account_role <> 'publisher' then raise exception 'only publisher role can enqueue publish jobs'; end if;
  select id into publisher_account_id from xhs_accounts
  where user_id=auth.uid() and role='publisher' and enabled=true limit 1;
  select * into c from contents where id=p_content_id and user_id=auth.uid() for update;
  if not found then raise exception 'content not found'; end if;
  if c.status <> 'APPROVED' then raise exception 'content must be APPROVED'; end if;
  if c.approval_hash is null or c.approval_hash <> public.content_approval_hash(c) then
    raise exception 'approval hash mismatch';
  end if;

  update publish_jobs
  set status='CANCELLED', finished_at=now(), error_code='SUPERSEDED'
  where user_id=auth.uid() and content_id=p_content_id and platform='xiaohongshu'
    and status in ('QUEUED','CLAIMED','PUBLISHING');

  insert into publish_jobs(user_id,content_id,platform,scheduled_at,status,publish_mode,account_role,account_id,payload,next_attempt_at)
  values(auth.uid(),p_content_id,'xiaohongshu',p_scheduled_at,'QUEUED',p_publish_mode,'publisher',publisher_account_id,coalesce(p_payload,'{}'::jsonb),p_scheduled_at)
  returning * into j;
  return j;
end;
$$;

-- Mac worker uses the normal authenticated user JWT. SKIP LOCKED makes claiming atomic.
create or replace function public.claim_publish_job_v09(p_worker_id text, p_lease_minutes integer default 10)
returns publish_jobs
language plpgsql
security invoker
as $$
declare j publish_jobs;
begin
  select * into j from publish_jobs
  where user_id=auth.uid()
    and status='QUEUED'
    and account_role='publisher'
    and (scheduled_at is null or scheduled_at <= now())
    and (next_attempt_at is null or next_attempt_at <= now())
  order by coalesce(scheduled_at,created_at), created_at
  for update skip locked limit 1;
  if not found then return null; end if;

  update publish_jobs set status='CLAIMED', worker_id=p_worker_id, claimed_at=now(), heartbeat_at=now(),
    lease_expires_at=now()+make_interval(mins=>greatest(1,least(60,p_lease_minutes))), attempts=attempts+1
  where id=j.id returning * into j;
  return j;
end;
$$;

create or replace function public.heartbeat_publish_job_v09(p_job_id uuid, p_worker_id text, p_lease_minutes integer default 10)
returns boolean
language plpgsql
security invoker
as $$
declare n integer;
begin
  update publish_jobs set heartbeat_at=now(), lease_expires_at=now()+make_interval(mins=>greatest(1,least(60,p_lease_minutes)))
  where id=p_job_id and user_id=auth.uid() and worker_id=p_worker_id and status in ('CLAIMED','PUBLISHING');
  get diagnostics n = row_count;
  return n=1;
end;
$$;

-- Recover abandoned worker leases without touching items explicitly awaiting a human.
create or replace function public.requeue_expired_publish_jobs_v09()
returns integer
language plpgsql
security invoker
as $$
declare n integer;
begin
  update publish_jobs set status='QUEUED', worker_id=null, claimed_at=null, lease_expires_at=null,
    error_code='LEASE_EXPIRED', next_attempt_at=now()+interval '5 minutes'
  where user_id=auth.uid() and status in ('CLAIMED','PUBLISHING') and lease_expires_at < now() and attempts < 4;
  get diagnostics n = row_count;
  return n;
end;
$$;

create unique index if not exists uq_posts_content_platform
on posts(user_id, content_id, platform)
where content_id is not null;

create or replace function public.finish_publish_job_v09(
  p_job_id uuid, p_worker_id text, p_status text, p_result jsonb default '{}'::jsonb,
  p_error_code text default null, p_error_detail text default null
)
returns publish_jobs
language plpgsql
security invoker
as $$
declare j publish_jobs;
begin
  if p_status not in ('PUBLISHED','FAILED','NEED_HUMAN','CANCELLED') then raise exception 'invalid finish status'; end if;
  update publish_jobs set status=p_status, result=coalesce(p_result,'{}'::jsonb), error_code=p_error_code,
    error_detail=p_error_detail, finished_at=now(), lease_expires_at=null, heartbeat_at=now()
  where id=p_job_id and user_id=auth.uid() and worker_id=p_worker_id
  returning * into j;
  if not found then raise exception 'job lease not owned by worker'; end if;

  if p_status='PUBLISHED' then
    update contents set status='PUBLISHED' where id=j.content_id and user_id=auth.uid();
    insert into posts(user_id,content_id,platform,external_post_id,external_url,published_at)
    values(auth.uid(),j.content_id,j.platform,coalesce(p_result->>'external_post_id',''),coalesce(p_result->>'external_url',''),now())
    on conflict (user_id,content_id,platform) where content_id is not null
    do update set external_post_id=excluded.external_post_id,external_url=excluded.external_url,published_at=excluded.published_at;
  end if;
  return j;
end;
$$;

-- Atomic content save + version snapshot. Frontend sends JSON so schema evolution stays manageable.
create or replace function public.save_content_v09(
  p_content_id uuid,
  p_topic_id uuid,
  p_snapshot jsonb,
  p_status content_status,
  p_reason text default 'save'
)
returns contents
language plpgsql
security invoker
as $$
declare c contents; next_version integer;
begin
  if p_content_id is null then
    insert into contents(
      user_id,topic_id,title,title_options,brief,body,tags,factual_claims,fact_check,compliance_flags,card_plan,
      editorial_review,native_text_plan,editorial_score,status,version
    ) values(
      auth.uid(),p_topic_id,coalesce(p_snapshot->>'title',''),coalesce(p_snapshot->'title_options','[]'::jsonb),
      coalesce(p_snapshot->'brief','{}'::jsonb),coalesce(p_snapshot->>'body',''),coalesce(p_snapshot->'tags','[]'::jsonb),
      coalesce(p_snapshot->'factual_claims','[]'::jsonb),coalesce(p_snapshot->'fact_check','{}'::jsonb),
      coalesce(p_snapshot->'compliance_flags','[]'::jsonb),coalesce(p_snapshot->'card_plan','{}'::jsonb),
      coalesce(p_snapshot->'editorial_review','{}'::jsonb),coalesce(p_snapshot->'native_text_plan','{}'::jsonb),
      coalesce((p_snapshot->>'editorial_score')::numeric,0),p_status,1
    ) returning * into c;
  else
    select * into c from contents where id=p_content_id and user_id=auth.uid() for update;
    if not found then raise exception 'content not found'; end if;
    next_version := c.version + 1;
    update contents set
      topic_id=p_topic_id,
      title=coalesce(p_snapshot->>'title',''),
      title_options=coalesce(p_snapshot->'title_options','[]'::jsonb),
      brief=coalesce(p_snapshot->'brief','{}'::jsonb),
      body=coalesce(p_snapshot->>'body',''),
      tags=coalesce(p_snapshot->'tags','[]'::jsonb),
      factual_claims=coalesce(p_snapshot->'factual_claims','[]'::jsonb),
      fact_check=coalesce(p_snapshot->'fact_check','{}'::jsonb),
      compliance_flags=coalesce(p_snapshot->'compliance_flags','[]'::jsonb),
      card_plan=coalesce(p_snapshot->'card_plan','{}'::jsonb),
      editorial_review=coalesce(p_snapshot->'editorial_review','{}'::jsonb),
      native_text_plan=coalesce(p_snapshot->'native_text_plan','{}'::jsonb),
      editorial_score=coalesce((p_snapshot->>'editorial_score')::numeric,0),
      status=p_status,version=next_version
    where id=p_content_id returning * into c;
  end if;

  insert into content_versions(user_id,content_id,version,snapshot,reason)
  values(auth.uid(),c.id,c.version,to_jsonb(c),coalesce(p_reason,'save'));
  return c;
end;
$$;

create or replace function public.save_fact_check_v09(
  p_content_id uuid,
  p_fact_check jsonb,
  p_compliance_flags jsonb default '[]'::jsonb
)
returns contents
language plpgsql
security invoker
as $$
declare c contents; item jsonb; src jsonb;
begin
  select * into c from contents where id=p_content_id and user_id=auth.uid() for update;
  if not found then raise exception 'content not found'; end if;
  update contents set fact_check=coalesce(p_fact_check,'{}'::jsonb),compliance_flags=coalesce(p_compliance_flags,'[]'::jsonb),status='FACT_CHECK'
  where id=p_content_id returning * into c;
  delete from sources where content_id=p_content_id and user_id=auth.uid();
  for item in select * from jsonb_array_elements(coalesce(p_fact_check->'items','[]'::jsonb)) loop
    for src in select * from jsonb_array_elements(coalesce(item->'sources','[]'::jsonb)) loop
      if nullif(src->>'url','') is not null then
        insert into sources(user_id,content_id,claim,url,source_name,verification_status,notes)
        values(auth.uid(),p_content_id,coalesce(item->>'claim',''),src->>'url',coalesce(src->>'title',src->>'publisher',''),coalesce(item->>'status','needs_review'),coalesce(item->>'verdict',''));
      end if;
    end loop;
  end loop;
  return c;
end;
$$;
