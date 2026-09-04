# Changelog

## V0.9 — Production Hardening
- Added production fail-closed settings: no silent mock AI success and no demo auth in production.
- Added OpenAI retry policy, hard monthly budget preflight, SQLite usage ledger, `/ready`, and `/v1/ai/usage`.
- Added one-call `/v1/pipeline/produce` and `/v1/pipeline/autopilot` so API mode prepares a final review package rather than forcing several manual generation steps.
- Fact checker now re-extracts and checks claims from the **final editorial rewrite**.
- Manual ChatGPT/Codex imports can no longer bypass the fact gate: imported `verified` becomes `needs_review`.
- Contradicted facts cannot be manually one-click verified; edit/re-check first.
- Added transactional Supabase RPCs for content save/versioning and fact-check/source save.
- Added approval hash/version/time, automatic approval invalidation after payload edits, and queued-job cancellation.
- Added atomic publisher job leasing, heartbeat, abandoned-lease recovery, explicit finish states, and publisher-role enforcement.
- Added Mac publisher worker; a publish click only becomes PUBLISHED after explicit visible confirmation/pending state.
- Added low-frequency dedicated research-account collector using a separate browser profile; no auto-interaction/private API/verification bypass.
- Added front-end API timeouts/readable errors and an app crash boundary.
- Added CRM high-risk identifier/secret rejection and stronger privacy copy.
- Added production readiness scorecard, live acceptance checklist, and preflight script.
- Version 0.9.0; 26 backend tests + smoke + bridge safety + syntax/compile checks passed.

## V0.8
- Editorial Director, education-consulting style, native Xiaohongshu text-to-image path, publisher scaffold.

## V0.7
- Dual-account research/publisher roles, lean API routing, content→lead→revenue attribution.

## V0.6
- Multi-source trend radar and Xiaohongshu-oriented research signals.

## V0.5
- Zero-API AI bridge, knowledge/case library, repurposing, lightweight CRM.
