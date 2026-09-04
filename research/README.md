# XHS Research Collector (V0.9 beta)

Dedicated **research/small-account** browser collector. It reads one visible search-result page per query, never auto-interacts, never bypasses verification, and uses its own persistent Chromium profile.

```bash
pip install -r requirements.txt
playwright install chromium
python xhs_research_collector.py "北京650分" "金融专业" "北邮计算机"
```

To write results directly into the logged-in user's `trend_signals` table, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CONTENT_OS_EMAIL`, `CONTENT_OS_PASSWORD` and add `--sync-supabase`.

**Status:** executable scaffold, not live-site calibrated in this build environment. If the site UI changes or asks for verification, the collector stops. Do not add CAPTCHA bypass, fingerprint spoofing, auto-like/comment/follow/message, or private API reverse-engineering.
