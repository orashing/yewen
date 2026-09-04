# Live Acceptance Test — v0.9

Run this on a staging Supabase project first.

## Supabase / approval integrity
1. Apply migrations 001–009 in order.
2. Create one content item with resolved facts, publish-ready editorial review, and automation-ready native plan.
3. Approve it. Confirm `approved_at`, `approval_hash`, `approved_version` are set.
4. Queue a publish job. Confirm exactly one live job exists.
5. Edit one character in the body. Confirm content returns to `REVIEW` and the live job becomes `CANCELLED`.
6. Re-approve, enqueue, then start two worker processes with `--once`. Confirm only one claims the job.

## Manual AI bridge safety
1. Import a JSON package whose fact item says `status=verified`.
2. Confirm UI shows it as `needs_review`.
3. Confirm approval is blocked.
4. Open/evaluate the evidence and explicitly confirm; then approval may proceed.
5. Import a `contradicted` fact. Confirm there is no direct manual-verify button; edit/re-check is required.

## API failure / budget
1. Production env with invalid OpenAI key: operation must fail visibly; no mock content may be saved as a real result.
2. Set a tiny monthly cap and attempt a Terra draft: expect a budget hard stop.
3. Confirm `/v1/ai/usage` shows the event ledger and current spend.

## Xiaohongshu research account
1. Use only the dedicated research profile.
2. Run one keyword, one visible results page, no auto-scroll.
3. Confirm output links came from visible `/explore/` results.
4. Trigger/encounter verification only by normal use if it occurs; collector must stop.

## Xiaohongshu publisher account
1. Use only the dedicated publisher profile.
2. Run without `--auto-publish`; confirm it stops at final click.
3. Calibrate selectors if UI differs.
4. Enable `--auto-publish` only after repeated dry runs.
5. Confirm job is PUBLISHED only after an explicit success/pending UI state; otherwise NEED_HUMAN.
