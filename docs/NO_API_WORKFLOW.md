# Zero-API workflow

V0.5 is designed so the product can be used seriously without paying per-token API fees.

## What is automated locally/cloud-side

- storing topics, opinions, cases, calendar and leads;
- selecting context for today's task;
- formatting the one-message prompt;
- validating/parsing the returned JSON;
- persisting the returned draft, verification objects, cards and channel variants;
- human approval gating.

## What ChatGPT/Codex does manually once per day

The operator sends one generated prompt. The model returns one JSON payload containing the day's full content package.

The Content OS prompt explicitly asks the model to use live web research for time-sensitive claims where the chosen product configuration supports it. If it cannot verify a claim, it must return `needs_review` instead of inventing evidence.

## Why this is a good MVP

API automation mainly removes copy/paste. It does not improve editorial judgment by itself. For one account and roughly one post per day, the two-copy operation is a small cost relative to avoiding ongoing API billing.

Once content-market fit is validated and the account produces meaningful leads, API mode can be enabled without changing the content data model.
