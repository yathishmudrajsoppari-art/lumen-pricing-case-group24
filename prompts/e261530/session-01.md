# Session log — Group 24 (student ID e261530)

The workshop's guidelines were updated to remove the Codex requirement partway through,
so this repo doesn't have the Codex-specific automatic prompt log this path was originally
designed for. This file exists so the `prompts/<your-id>/session-*.md` path required by the
brief still resolves to something real, rather than being missing entirely.

**The full log of how we directed the AI, in business terms, is in `/PROMPTS.md` at the repo
root.** It covers, across three build passes:

1. The initial business analysis of all 12 LUMEN exhibits and the reasoning behind the
   Decision Cockpit's design (the trade-off dial, the segment-level Van Westendorp analysis,
   the reverse-engineered channel-economics formula).
2. A second pass that added the city launch priority panel and the full voice-of-customer
   quotes, and that caught two data traps (a KPI mislabeled as a cost line in
   `cost_breakdown.csv`; a case-embedded assumption about Munich's segment concentration that
   didn't hold up against the actual survey data).
3. A third pass that surfaced a previously-computed-but-unused exhibit (competitor promo
   history) and caught a stats mistake in that same fix (an average discount diluted across
   non-promo months), plus a fourth pass adding the cost-structure breakdown and marketing
   channel efficiency table.

See `/PROMPTS.md` for the full detail, including what was deliberately not built and why.
