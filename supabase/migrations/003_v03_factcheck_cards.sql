-- Content OS v0.3: fact-check snapshots, card plans, and rendered card asset storage.

alter table contents add column if not exists fact_check jsonb not null default '{}'::jsonb;
alter table contents add column if not exists card_plan jsonb not null default '{}'::jsonb;
alter table contents add column if not exists compliance_flags jsonb not null default '[]'::jsonb;

-- A private bucket for generated PNG cards. The frontend uploads only into its own user-id prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-assets', 'content-assets', false, 10485760, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Re-runnable storage policies. Object path is: <auth.uid()>/<content_id>/card-XX.png
DROP POLICY IF EXISTS content_assets_select ON storage.objects;
DROP POLICY IF EXISTS content_assets_insert ON storage.objects;
DROP POLICY IF EXISTS content_assets_update ON storage.objects;
DROP POLICY IF EXISTS content_assets_delete ON storage.objects;

create policy content_assets_select on storage.objects
for select to authenticated
using (bucket_id = 'content-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy content_assets_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'content-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy content_assets_update on storage.objects
for update to authenticated
using (bucket_id = 'content-assets' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'content-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy content_assets_delete on storage.objects
for delete to authenticated
using (bucket_id = 'content-assets' and (storage.foldername(name))[1] = auth.uid()::text);
