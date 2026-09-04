# Supabase setup for Content OS v0.6

1. Create a Supabase project.
2. In SQL Editor, run migrations in order:
   - `001_init.sql`
   - `002_v02_auth_persistence.sql`
   - `003_v03_factcheck_cards.sql`
   - `004_v04_radar_calendar.sql`
3. In Authentication → Providers, enable Email.
4. Create/invite your operator account. Magic Link is the simplest first login.
5. For a private deployment, disable public/new-user sign-ups after your account exists.
6. Copy Project URL and anon/public key to `web/.env`.
7. Put the same Project URL and anon key into `api/.env` if you want FastAPI to reject unauthenticated AI requests.
8. Never put a Supabase service-role key in the frontend.
9. Deploy the frontend over HTTPS for iPhone PWA installation and auth redirects.
10. Add the deployed web origin to FastAPI `CORS_ORIGINS`.
11. Configure the deployed web origin as an allowed redirect URL in Supabase Auth.

## Migration 003

Adds fact-check/card-plan persistence plus the private `content-assets` Storage bucket.

Generated cards are uploaded as:

```text
<user-id>/<content-id>/card-01.png
<user-id>/<content-id>/card-02.png
...
```

## Migration 004

Adds:

- `topics.radar_meta` — radar signal type, why-now rationale, confidence and sources.
- `calendar_items` — the saved 30-day editorial calendar.
- per-user RLS for calendar rows.

All operator data remains scoped with `user_id = auth.uid()`.


## v0.5 migration
Run `supabase/migrations/005_v05_knowledge_crm_bridge.sql` after migration 004.


## v0.6 migration

Run `006_v06_trend_intelligence.sql` after v0.5. It adds `radar_sources`, `watch_queries`, and `trend_signals` with owner-only RLS.
