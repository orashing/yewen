# XHS Research Collector — Dual-account design (future Mac executor)

## Account split
Content OS V0.7 defines two explicit Xiaohongshu roles:

### Research account (small account)
Only for demand research:
- hot list / hot topic observation when visible;
- targeted keyword search from `watch_queries`;
- public title/topic/visible interaction observations;
- adjacent creator/topic monitoring;
- writing structured `trend_signals` back to Content OS.

It must NOT:
- publish content;
- like, save, comment, follow or DM automatically;
- reverse private APIs/signatures;
- bypass CAPTCHA/login/device controls;
- use proxy/fingerprint rotation to evade platform controls;
- collect non-public personal data.

### Publisher account (main account)
Only for final publishing in the future Publisher executor:
- receives content that passed human approval;
- uploads approved assets/title/body;
- stops on any login/CAPTCHA/risk-control prompt.

It must never be used by the Research Collector.

## Isolation rules
1. Separate Chromium persistent profiles: `xhs-research` and `xhs-publisher`.
2. Separate local profile directories and cookies.
3. Content OS cloud stores only account alias/role/profile key/status — no cookies/passwords.
4. Research and publisher are separate processes.
5. A collector task must assert `role=research`; a publisher task must assert `role=publisher`.
6. Any risk state other than `normal` pauses that executor.

## Why two accounts
This is operational isolation, not a risk-control bypass. Research browsing and publishing have different failure modes. Separating them reduces accidental cross-use and makes it possible to pause research without disabling the creator's main publishing workflow.

## Recommended research cadence
Default product preference:
- 8 watch queries per round;
- at least 120 minutes between automatic rounds;
- no concurrency by default;
- deduplicate locally before uploading signals;
- stop immediately on login or CAPTCHA challenge.

These are conservative defaults, not a claim of platform-approved automation limits.

## Data contract
Collector writes to `trend_signals` and logs a `research_runs` row:
- account_id (research role only)
- query count
- signal count
- start/finish time
- result status / human-needed state

Each signal keeps:
- title / query / summary
- `platform=xiaohongshu`
- surface: `hot_list|hot_topic|search|competitor`
- observed_at
- public metrics if visibly available
- confidence
- public source/page identifier when available

## Current status
The Mac collector is NOT implemented in V0.7. Until then, use:
- zero-API ChatGPT/Codex trend bridge, or
- OpenAI API web-grounded trend sweep.

The latter does not use the Xiaohongshu research account and does not claim in-app access.
