-- Content OS v0.8: editorial director, AI-tell review and Xiaohongshu native text-to-image plan.

alter table contents add column if not exists editorial_review jsonb not null default '{}'::jsonb;
alter table contents add column if not exists native_text_plan jsonb not null default '{}'::jsonb;
alter table contents add column if not exists editorial_score numeric;

-- No old workplace writing-style samples are required. The education-consulting editorial profile
-- is stored under user_preferences.config.editorial_style and can evolve independently.
-- Example:
-- {
--   "editorial_style": {
--     "name": "升学决策·克制判断型",
--     "notes": "结论先行但有边界；具体、克制、像真实咨询；少营销腔和职场吐槽腔。"
--   },
--   "xhs_native_text": {
--     "enabled": true,
--     "preferred_style": "简约",
--     "fallback_styles": ["备忘","基础"]
--   }
-- }

alter table publish_jobs add column if not exists publish_mode text not null default 'native_text';
alter table publish_jobs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table publish_jobs add column if not exists account_role text not null default 'publisher';
create index if not exists idx_publish_jobs_user_status on publish_jobs(user_id, status, scheduled_at);
