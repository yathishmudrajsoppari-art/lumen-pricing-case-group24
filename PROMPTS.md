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

## Second pass: re-audit before finishing

Before calling this done, we asked for a full re-check of every exhibit against the app,
specifically to (a) confirm no data trap had slipped through, (b) use every exhibit that had
a clear intended purpose, and (c) verify whether the case's own assumptions held up against
the actual survey data rather than being repeated at face value. This surfaced three things
worth recording:

1. **A second data trap caught explicitly**: `cost_breakdown.csv` contains a row labelled
   `[KPI, not a cost line]` holding the value `30.0` (a margin percentage, not a euro cost).
   The model was already built by hardcoding COGS from the `TOTAL` row (verified against the
   sum of the 5 real cost lines: 0.21+0.14+0.15+0.07+0.05 = 0.62), so this trap was never
   actually triggered — but we asked for it to be excluded explicitly and documented, rather
   than left as an accidental near-miss, since a naive `sum()` over that column would have
   silently added 30 euros to a 62-cent cost base.

2. **`market_context.csv`'s regional split was unused** in the first version, despite its own
   note saying it exists "to size a phased city-by-city launch." We asked for a city launch
   priority panel using it — and asked for the case's own embedded assumption ("Berlin/Munich
   assumed slightly faster given urban wellness segment concentration") to be checked against
   `customer_survey.csv`'s actual city-level segment mix rather than repeated. It doesn't fully
   hold: Munich's real Urban Wellness Professionals share (22.8%) is one of the lowest of the
   five named cities, while Cologne's (35.6%) is the highest. We report this honestly rather
   than smoothing it into the case's framing.

3. **External research, requested explicitly to check credibility, not to override the
   data**: we asked whether the case's ~€9.1bn/~7% CAGR German functional-beverage market
   figure was arbitrary or grounded. It checks out — independent 2026 market research
   (Market Research Future and others) converges in the same €/$9-9.2bn range. We also asked
   about Germany's Pfand deposit system, since LUMEN is a single-use can: German law requires
   a mandatory, refundable €0.25 deposit on top of shelf price for exactly this container
   type. We deliberately did not fold this into the pricing model itself (the case's own
   price and survey data don't indicate whether respondents priced it in, and guessing would
   have been worse than not modeling it) — it's flagged as a qualitative caveat in the
   footer instead, specifically because the Commuters segment's own quote about kiosk,
   grab-and-go purchases is exactly the moment a checkout-price bump would matter most.

4. **A third catch, this time in our own generated output**: `competitor_price_history.csv`
   (Exhibit 3) was aggregated into the model but never actually rendered anywhere in the
   UI — computed and silently dropped, which defeats the purpose of using an exhibit at all.
   Added a promo-activity line under the positioning map. In fixing it, a second, subtler bug
   surfaced: the average discount was being computed across all 12 months per competitor,
   including the ~10 months with no promo running, which understates a real 10-20% promo as a
   meaningless 1-3%. Recomputed to average only the months a promo actually ran, which also
   connects directly to the Students & Budget-Conscious segment's own quote about buying on
   promo.

5. **Verified the country wasn't an open decision we'd missed**: asked directly whether a
   country choice was still outstanding. Re-read `LUMEN_Case_Brief.md` and `README.md` from
   scratch rather than trusting an earlier summary -- Germany is fixed by the brief itself
   ("LUMEN — Germany Market Entry Brief"), not a variable to choose. A country choice would
   only have applied had the team picked the other available case ("Water Under Pressure",
   pan-European and open-ended by design) -- moot, since the team had already committed to
   LUMEN.

