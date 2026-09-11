# PROMPTS.md — How we directed the AI on this case

The workshop's guidelines were updated mid-week to remove the Codex requirement, so this
file replaces the original `prompts/<student-id>/session-*.md` auto-log described in
`AGENTS.md`. It documents the reasoning and direction we gave the AI, in business terms,
rather than a verbatim chat transcript.

## Tools used
- **Claude (claude.ai)** — read all 12 data exhibits plus `README_data.md`, `LUMEN_Case_Brief.md`
  and the ATELIA workshop decks; did the quantitative analysis (Van Westendorp, channel-economics
  reverse-engineering, seasonality correlation, segment breakdown); designed and wrote the
  Decision Cockpit (`index.html`, `styles.css`, `app.js`) and the model-generation script.
- **Claude Code** — applied the generated files to this repository, ran git operations
  (branch, commit, push, pull request), and handled the Vercel deployment.

## What we asked for, and why

1. **"Analyze the LUMEN case as precisely as possible before building anything."**
   We deliberately asked for the business analysis first, not a prototype first. The brief
   asks for a recommendation "backed by something I can actually poke at," so we treated the
   quantitative work as the deliverable's foundation, not a decoration on top of a UI.

2. **`scripts/generate_model.py` is committed alongside its output** (`data/lumen_model.json`)
   so the aggregation is auditable and reproducible, not a black box — anyone can rerun it
   against the raw CSVs and get the same numbers.

3. **Data-quality check requested explicitly**, because `README_data.md` warns the dataset
   isn't perfectly clean on purpose. This surfaced 4 exact duplicate rows in
   `historical_sales_weekly.csv` and a subtler issue: the 78-week sales window covers
   January-June twice (2025 and 2026) but July-December only once, which silently distorts a
   naive monthly sum. Both are corrected in `data/lumen_model.json`.

4. **"Reconstruct the channel-economics formula, don't just read the lookup table."**
   `channel_economics.csv` and `price_test_results.csv` only give a handful of price points.
   We asked the AI to reverse-engineer the underlying per-channel formula (net price as a
   function of retail price) so the app could simulate *any* price, not just the three tested
   ones. That formula is in `app.js` under `contributionAt()` and documented in
   `data/lumen_model.json`'s `channel_formulas` field.

5. **"Don't quietly pick a side between Jonas and Elena — make the trade-off itself the
   product."** This is the single instruction that shaped the UI most: the "whose brief are
   you optimizing for" dial and the "What this means for Freya" panel exist because the case
   explicitly penalizes handing over one clean number.

6. **Caught and corrected a modeling mistake mid-build:** an early version of the payback
   calculation assumed CAC was constant regardless of price, which made "raise the price
   forever" look like the mathematically optimal answer — clearly wrong, and not something a
   real CFO would believe. We asked for the model to be corrected so that acceptance
   (from `price_test_results.csv`) scales the effective cost of acquisition, which produces a
   realistic interior optimum instead of a monotonic one. This is why the cockpit can now
   say, correctly, that going *lower* than a certain price actually slows payback down.

7. **Explicit instruction on the PII columns**: `customer_survey.csv` has name/email columns.
   We asked for those to be dropped before any aggregation, not filtered out in the frontend —
   so the raw values never travel further than the one-time model-generation script.

## What we chose not to build (and why)
- No backend/database: nothing in this tool requires two people to see the same live state
  at the same time, so a shared backend would have added risk (another thing to secure and
  pay for) without adding value.
- No login/accounts: not needed for a decision-support tool used by a handful of people.
- The live weather overlay is optional and additive by design — the core recommendation
  never depends on the external API being reachable, since German weather stretch goal was
  a "nice to have," not the mechanism the recommendation relies on.
