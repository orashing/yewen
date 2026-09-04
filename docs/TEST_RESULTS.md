# Test Results — v0.9

Executed before the GitHub repository upload using Python 3.12.13 and the
dependency versions locked in `web/package-lock.json`:

- Backend unittest suite: **26/26 passed**.
- `api/tests/smoke_test.py`: passed.
- Python `compileall`: API + Publisher + Research passed.
- Zero-API bridge safety (`web/tests/bridge-safety.mjs`): passed; imported external `verified` is downgraded to `needs_review`.
- Full Vite production build: passed (72 modules transformed).
- Python dependency compatibility check: passed.
- Publisher and research Python modules compile.

Not executable in this environment:

- Live Supabase migration 009 / RLS-RPC integration test: no user Supabase project is attached.
- Live Xiaohongshu selectors: no authenticated user browser profile/Mac is available.
- Live OpenAI API structured-output run: no user API key is used in this build environment.

These are tracked as explicit live acceptance criteria, not silently treated as passed. See `LIVE_ACCEPTANCE_TEST.md`.
