# Content OS v0.9 — Production-hardening Beta

A mobile-first, single-creator operating system for Beijing gaokao / university-major decision content.

**Research account → trend signals → Editorial Director → Brief → draft → independent editorial rewrite → fact/compliance gate → Xiaohongshu native text-to-image package → human approval → publisher account → attribution**

## Current product verdict

V0.9 is no longer a pure demo. It is an **internally usable Beta for content production**. The Xiaohongshu research/publish adapters remain **live-environment Beta** until calibrated on the user's own two accounts.

See `docs/PRODUCTION_READINESS.md` for the scorecard and remaining acceptance criteria.

## The “I only review” path

With API mode enabled, Home → **Autopilot** creates one review package in a single request chain:
1. choose one primary topic;
2. Content Brief;
3. public-facing draft;
4. independent editor rewrite / anti-AI review;
5. fact check on the final revised body;
6. native Xiaohongshu text-to-image input + style recommendation;
7. optional repurposed outputs.

The creator then handles the final judgment/fact confirmations and presses approval. Approval is content-bound: later edits invalidate it automatically.

Zero-API mode remains available through the ChatGPT/Codex JSON bridge. Imported “verified” facts are deliberately downgraded to manual review because Content OS did not observe the external search run.

## Safety / reliability changes in v0.9

- `APP_ENV=production` fails closed: no silent mock AI result and no demo auth.
- Monthly AI hard-budget preflight + usage/cost ledger.
- Final rewritten body is fact-checked, not only the first draft.
- Contradicted facts cannot be one-click overridden.
- Transactional content/fact-check saves and version history.
- Approval hash + automatic invalidation after an approved payload changes.
- Atomic publisher queue leasing / heartbeat / abandoned-lease recovery.
- Publisher requires `publisher` role; research and publishing Chromium profiles stay separate.
- Final publish click is not treated as success without a visible success/pending state.
- CRM is alias-first and rejects obvious identity/admission-secret storage.
- API client has explicit timeouts and readable errors; React has a crash boundary.

## Stack
- Web: React + Vite + Supabase JS + PWA
- API: Python 3.10+ + FastAPI + Pydantic + HTTPX
- DB/Auth: Supabase + RLS + transactional RPCs
- Optional AI: OpenAI Responses API
- Zero API: ChatGPT/Codex manual JSON bridge
- Research adapter: Mac + Playwright, dedicated small-account profile
- Publisher adapter: Mac + Playwright, dedicated main-account profile

## Supabase migrations
Apply in order through `009_v09_production_hardening.sql`.

**Apply migration 009 on staging first.** See `docs/LIVE_ACCEPTANCE_TEST.md`.

## Local API
```bash
cd api
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Production-important env:
```text
APP_ENV=production
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...          # optional; omit for manual-only mode
OPENAI_MONTHLY_BUDGET_USD=5
OPENAI_USAGE_DB=/persistent/content-os/usage.sqlite3
ALLOW_MOCK_FALLBACK=false
ALLOW_DEMO_AUTH=false
```

If the backend runs on ephemeral cloud storage, mount `OPENAI_USAGE_DB` on a persistent volume or the local cost ledger cannot enforce a month-spanning cap across redeploys.

## Frontend
```bash
cd web
cp .env.example .env
npm install
npm run build
```

The current build environment could not reach npm registry, so a real `npm run build` remains a go-live check. JS/JSX static parsing passed.

## Verification status for this repository
- 26/26 Python backend tests passed.
- Backend smoke test passed.
- Python compileall passed for API/publisher/research.
- Zero-API bridge safety test passed.
- Full Vite production build passed.
- Dependency compatibility check passed on Python 3.12.
- Live Supabase migration: not executed here.
- Live Xiaohongshu account calibration: not executed here.

Run:
```bash
./scripts/preflight.sh
```
then follow `docs/LIVE_ACCEPTANCE_TEST.md`.
