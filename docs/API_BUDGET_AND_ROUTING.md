# API Budget & Model Routing — V0.8

The API remains optional. Zero-API ChatGPT/Codex Bridge is a first-class mode.

## Lean routing

| Task | Tier | Web |
|---|---|---|
| trend_sweep | Luna | max 2 |
| topic_radar | Luna | max 2 |
| topic_suggest | Luna | no |
| calendar | Luna | no |
| editorial_director | Luna | no |
| brief | Terra | no |
| draft | Terra | no |
| editorial_review | Luna | no |
| fact_check | Luna | max 2 |
| xhs_native_text | Luna | no |
| card_plan | Luna | no |
| repurpose | Luna | no |

Sol is opt-in via `OPENAI_PREMIUM_TASKS` only.

The intent is simple: pay Terra for the two public-facing generation decisions, use Luna for bounded ranking/review/transformation work, and cap web-tool calls.

The UI soft budget is advisory; set the real API project billing limit/alerts on the provider side.
