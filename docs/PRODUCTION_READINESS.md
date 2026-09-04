# Content OS v0.9 — Production Readiness Review

This review treats Content OS as a one-creator internal production system, not as a demo.

## Verdict

- **v0.8:** feature-rich internal Alpha / advanced prototype.
- **v0.9:** internally usable Beta for content production and review.
- **Not yet “fully production verified”** until the Supabase migration is applied to a real project and both Xiaohongshu browser adapters are calibrated on the user's own accounts.

The content-production path is materially more mature than the Xiaohongshu browser-automation path.

## Scorecard

| Dimension | v0.8 | v0.9 | Notes |
|---|---:|---:|---|
| Product loop | 8.5 | 9.0 | Topic → draft → review → fact gate → native XHS package → attribution is coherent. |
| “Human only reviews” API path | 6.5 | 8.5 | `/v1/pipeline/autopilot` now produces one review package in one call. |
| AI writing/editorial quality architecture | 7.5 | 8.3 | Separate education editorial profile + independent review; still needs real output eval/calibration. |
| Fact/compliance safety | 5.5 | 8.5 | Final revised body is re-checked; external AI `verified` claims are downgraded; contradicted claims cannot be one-click overridden. |
| Failure semantics | 5.0 | 8.8 | Production fails closed; no silent mock success; client has timeout/readable errors. |
| Cost control | 6.0 | 8.8 | Hard monthly preflight budget + durable-on-disk usage ledger + per-task routing. Persistent disk is required in cloud. |
| Data integrity / approval integrity | 5.5 | 8.7 | Transactional saves, approval hash, invalidation trigger, atomic queue claiming/leasing. |
| Security / privacy | 7.0 | 8.2 | Supabase RLS, production auth fail-closed, local-only XHS sessions, alias-first CRM with high-risk identifier rejection. |
| XHS research automation | 4.5 | 6.5 | Real low-frequency collector exists, but selectors are not live-account calibrated. |
| XHS publish automation | 4.5 | 6.5 | Queue worker + explicit publish confirmation exists; still requires live-account UI calibration. |
| Observability | 5.5 | 8.0 | Readiness endpoint, AI usage ledger, worker error screenshots/statuses. Full centralized logging is intentionally omitted for a one-user tool. |
| Tests | 6.0 | 7.8 | 26 backend tests + smoke + JS bridge safety + syntax/compile checks. No live Supabase/XHS E2E in this environment. |
| Maintainability | 6.0 | 6.8 | Modules around API/publisher/research are separated, but `web/src/main.jsx` is still a large single-user UI monolith. |

**Overall:** v0.8 ≈ 6.3/10; v0.9 ≈ 8.1/10 for a single-user internal tool.

## Production-hardening changes in v0.9

### 1. Never fabricate a successful AI result in production
`APP_ENV=production` disables mock fallback and demo auth by default. Upstream AI failure returns an explicit 502; budget exhaustion returns a hard stop.

### 2. One-call production package
The API can now run:

`editorial choice → brief → draft → independent editorial rewrite → fact check on final body → native XHS text package → repurpose`

and return one human-review package.

### 3. Fact-check gate is materially stricter
- Fact checker re-extracts factual claims from the final revised body.
- “Verified” requires captured real search evidence in API mode.
- JSON imported from external ChatGPT/Codex can never directly mark a fact as verified.
- Contradicted claims cannot be manually flipped to verified from the UI; edit/re-check first.
- Human confirmation uses an explicit confirmation prompt.

### 4. Approval is content-bound
Supabase migration 009 adds an approval hash over title/body/fact-check/editorial/native-XHS package. If any approved payload changes:
- approval is invalidated;
- content returns to REVIEW;
- queued/in-flight publishing work is cancelled.

### 5. Publish jobs are leased atomically
Mac workers claim jobs with `FOR UPDATE SKIP LOCKED`, get a lease/heartbeat, and abandoned leases can be recovered. Only the `publisher` account role is claimable. Clicking Publish is not considered success; an explicit creator-UI success/pending state must be observed.

### 6. Cost guard is real rather than decorative
Each OpenAI call performs a conservative preflight against the monthly hard cap and writes estimated actual usage/cost to SQLite. **If deployed in the cloud, mount `OPENAI_USAGE_DB` on persistent storage** or the budget ledger will reset on ephemeral redeploys.

### 7. Privacy defaults are tighter
CRM is for source attribution, not identity storage. UI tells the creator to use aliases; obvious PRC ID numbers and labeled candidate/admission-password secrets are rejected.

## What is still Beta / requires the user's environment

### A. Xiaohongshu browser selectors
No code review can prove current A/B UI selectors against the user's account. Before enabling `--auto-publish`, run the publisher without final click and calibrate visible labels/selectors.

### B. Research-account collector
The collector intentionally reads only visible search-result pages at low frequency and fails closed on verification. It does not reverse private APIs. Real recall/selector quality must be measured on the user's research account.

### C. Supabase migration 009
The SQL has been statically reviewed but cannot be applied to a live Supabase/Postgres instance in this environment. Apply migrations on a staging project first and run the approval/queue scenarios in `docs/LIVE_ACCEPTANCE_TEST.md`.

### D. Front-end full Vite build
This build environment timed out reaching the npm registry. JS/JSX syntax was parsed with TypeScript, but run `npm install && npm run build` on a normal network before deployment.

### E. Real AI quality evaluation
Architecture is ready; writing quality is not something unit tests can prove. Before depending on autopilot, score ~20 real education drafts on: factual accuracy, human voice, useful judgment, family-trust tone, conversion quality, and edit minutes.

## Go-live standard

Call the **content-production side production-usable** after all of these pass:
1. Supabase migrations 001–009 apply cleanly on staging.
2. `scripts/preflight.sh` passes on the deployment machine.
3. One API-mode autopilot package is generated with real API credentials and no mock mode.
4. Approval refuses unresolved and contradicted facts.
5. Editing an approved draft invalidates approval and cancels its queued job.
6. Two workers cannot claim the same publish job.

Call the **XHS automation side production-usable** only after:
1. Research profile and publisher profile are visibly separate.
2. Research collector completes several low-frequency runs without unexpected interaction.
3. Publisher completes at least 10 dry runs stopping before final publish.
4. Publisher completes at least 5 low-frequency real posts with explicit confirmation and no duplicate post.
5. CAPTCHA/security verification always stops the worker and never triggers bypass logic.
