# Next build prompt — Content OS v0.7

Continue from v0.6. Do not rebuild the existing editorial or trend-intelligence pipeline.

Primary goal: add post-performance metrics and lead attribution.

Requirements:
1. Add post metric snapshots at 24h / 72h / 7d: views, likes, saves, comments, follows where manually or safely available.
2. Link each CRM lead to `source_content_id` and expose content → qualified lead → won revenue funnel.
3. Add dashboard ranking content by qualified leads and revenue, not only engagement.
4. Feed content performance back into topic scoring.
5. Preserve zero-API mode.
6. Do not add XHS private API reverse engineering. Research Collector and Publisher remain optional local executors.
