# Content OS v0.8 PRD

## Goal

One creator should be able to operate a Beijing gaokao / university-major decision IP by doing almost only one thing: **final human approval**.

The system should make, before the approval gate:
- the daily topic choice;
- the content angle;
- the formal draft;
- an independent anti-AI/editorial review;
- factual verification;
- the Xiaohongshu-native text-to-image package;
- optional fallback cards and repurposed outputs.

## Editorial policy

Do not force-learn the creator's old workplace-writing style. The default style is a separate education-consulting profile: calm, concrete, conditional, judgment-oriented and trustworthy.

Future style calibration should come from new gaokao content performance and creator feedback.

## Daily experience

1. Home shows **one primary topic + one backup**.
2. Adopt primary.
3. API mode: Brief → draft → editorial review happens automatically; zero-API mode does the same through one ChatGPT/Codex bridge message.
4. Fact-check gate resolves changing/objective claims.
5. `native_text_plan` is prepared for Xiaohongshu's own text-to-image UI.
6. Creator reads the final content and taps **审核通过**.
7. A `native_text` publish job is queued automatically.
8. With a future Mac Publisher connected, the main account can execute the native text-to-image UI and publish without another creator action.

## Topic ranking objective

Primary optimization target: **qualified Beijing-parent leads**, not raw views.

Candidate score can use:
- current search / trend demand;
- audience fit;
- conversion potential;
- timeliness;
- historical value learned from previous post metrics and attributed leads/revenue;
- repetition penalties.

## Xiaohongshu account architecture

- `research`: small account, read/research only.
- `publisher`: main account, publish only.
- separate persistent browser profiles.
- no shared Cookie/session in cloud storage.

## Publishing modes

Default: `native_text`
- use Xiaohongshu native text-to-image / text-card UI.
- `native_text_plan` includes text, title and style preferences.

Fallback: `custom_cards`
- existing 1080×1440 renderer remains available.

## Hard safety rules

- no CAPTCHA bypass;
- no private API reverse engineering;
- no auto-like/comment/follow/DM;
- fail closed on UI mismatch or security verification;
- only publish after Content OS human approval.
