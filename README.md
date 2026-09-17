# LUMEN — Pricing & Go-to-Market Case — ATELIA × ESCP Starter Kit

> This repo is your starting point. Codex should read this README first.

## How to Get Started

This repo is a **template**: click **Fork** (top right), not "Use this template." Fork keeps your copy linked back to the original — that's what lets ATELIA automatically find every team's work, without anyone needing to send a link.

Once you've forked it, add your teammates as collaborators (Settings → Collaborators on your fork), and leave the visibility as **Public** — don't switch it to Private, or we lose access to your work.

## The Brief

The full brief is in `LUMEN_Case_Brief.md` (and a formatted version in `LUMEN_Case_Brief.pdf`). The data is in the `data/` folder, documented in `data/README_data.md`.

One-sentence summary: LUMEN, a functional beverage brand, has to decide **price, positioning, and launch channel(s)** to enter the German market — with no real German sales data (LUMEN isn't there yet), and a real trade-off between the CMO (premium positioning) and the CFO (fast return on investment).

## Rule #1 — Prompt Logging Is Automatic

This repo includes an `AGENTS.md` file, which Codex reads automatically at the start of every task — you don't need to open or edit it. The first time you talk to Codex in a new conversation, it will ask for your **student ID**. Answer it, and from then on Codex logs every prompt you send it — automatically, verbatim — into `prompts/<your-id>/session-*.md`, without you doing anything else.

**You don't fill this in by hand.** Your only job is to make sure that log file gets committed along with your code changes — Codex writes it, but you still need to include it when your pull request is created and merged. If a pull request only has code changes and no updated log file, that's a sign something didn't get logged.

Why we're doing this: it's not to monitor you. It's what lets us understand, at the end, how you reasoned — not just what you produced. A good result reached with a clear prompt from the start isn't scored the same as a good result reached after fifteen random attempts.

## Rule #2 — Before You Code, Ask Yourself These Questions

Check each box in this README as you go — not at the end, while you're working:

- [x] **Data**: `data/customer_survey.csv` has name/email columns. We never load them: `data/lumen_model.json` is a pre-aggregated model (segment averages, Van Westendorp thresholds, channel economics) built once from the raw CSVs, with those two columns dropped before any aggregation happens. The browser only ever fetches `lumen_model.json` — no respondent-level row, PII or otherwise, is reachable from the deployed app. See `PROMPTS.md` for how that file was generated.
- [x] **API keys**: the only external call is the optional "Overlay live German weather" button, which hits Open-Meteo's public forecast endpoint (`api.open-meteo.com`) directly from the visitor's browser. It needs no key/auth at all, so nothing to store, hardcode, or leak.
- [x] **Deployment**: the deployed app serves `index.html` / `styles.css` / `app.js` / `data/lumen_model.json` only. No endpoint returns raw survey rows, competitor history, or anything respondent-level.
- [x] **Files generated along the way**: `data/lumen_model.json` (generated from the 12 raw exhibits) is committed on purpose — it's what the app actually reads, and committing it means anyone can regenerate or audit it without rerunning the aggregation script. The one-off generation script is documented in `PROMPTS.md` rather than committed as a dependency.
- [x] **Storage**: no database, no accounts, no localStorage. Everything the visitor sees is either baked into `lumen_model.json` at build time or computed client-side from slider state. Two different people looking at the tool don't need to see the same live state, so a shared backend would have been unjustified complexity.
- [x] **Robustness**: price and month sliders are hard-bounded by their `min`/`max`; the channel-mix sliders always renormalize back to 100% (never negative, never over) so contribution/payback math can't divide by an inconsistent mix; if the optional weather call fails or times out, the UI falls back to the historical seasonality chart with a plain-language status message instead of breaking.
- [x] **Explainability**: every number on screen is one hop from its source exhibit, and the "What this means for Freya" panel turns the current slider position into a plain-language sentence — including naming what's being given up, not just what's being gained.
- [x] **Business relevance**: the tool answers the brief's actual question (price, channel, timing, and the named trade-off) rather than just visualizing the data room. It's built so that the CMO-vs-CFO tension is something Freya can move a dial on, not a number the team quietly picked for her.

These questions aren't here to slow you down — they're part of what's being evaluated. A thoughtful answer to one of them is worth more than an extra feature nobody asked for.

## What We Expect at the End

- A prototype that works, even partially, on the LUMEN case
- Your prompt log (`prompts/<your-id>/session-*.md`) committed and up to date
- A short paragraph below, written in business language (not technical), explaining what you did and why
- A live URL (Vercel or similar) if you deployed it — not required to still get credit, but expected if you did

## A note on AI tooling

The workshop's guidelines were later updated so Codex is no longer required — our team built this using Claude (analysis, modeling, and code) and Claude Code (repo, git, and deployment operations) instead. `PROMPTS.md` documents how we directed the AI and the reasoning behind the model's design, in place of the original Codex-specific `prompts/<student-id>/` log. `AGENTS.md` is left in the repo unedited as the organizers wrote it.

## Our Approach

**The problem, in one line:** Freya needs a price, a channel mix, and a rough launch month for Germany — and she explicitly doesn't want a number that quietly resolves the Jonas-vs-Elena tension for her.

**What we built:** a Decision Cockpit (`index.html / app.js`) that turns all 12 of the case's exhibits into a live model, not a static table or a set of disconnected charts. Moving the price slider, the channel-mix sliders, or the "whose brief" dial recomputes, in real time: blended contribution per unit (from a reverse-engineered channel-economics formula, not just the 3 rows in `price_test_results.csv`), an acceptance-adjusted CAC payback estimate, which of the four German customer segments the price actually reaches (via a full Van Westendorp analysis per segment, not just the blended average), and a seasonally-timed launch window — plus an optional live weather overlay. Below that: a phased city-launch priority ranking, all 12 customer quotes organized by segment and sentiment, a breakdown of what's actually in the €0.62 cost base, and a comparison of which marketing channel actually pays back fastest.

**What the data actually told us**, which shaped the build:
- Segments split almost exactly along the CMO/CFO line: Urban Wellness Professionals (27% of respondents) are the least price-sensitive and highest-intent — Jonas's premium instinct fits *them* — while Students & Budget-Conscious (32%, the largest segment) are the opposite. This isn't one market with one right price.
- Even the most premium-tolerant segment's stated price ceiling (€2.08) sits below both of the higher candidate prices. At €2.59, our model shows **0%** of surveyed segments with a stated ceiling that high — a genuinely useful, uncomfortable number to show Freya rather than average away.
- The "obviously safe" fast-payback move (lowest price, retail-heavy) is not actually the fastest payback once you price in that lower acceptance makes marketing spend less efficient, and that Retail/Grocery keeps the thinnest per-unit margin of the three channels. The cockpit surfaces this directly instead of assuming it.
- LUMEN's own historical sales (corrected for a data artifact in how the 78-week window overlaps calendar months) correlate at 0.985 with the case's seasonality index and 0.93 with German temperature — strong enough to treat the April-August window as a real, evidence-backed launch timing signal, not a guess.
- The case materials assume Berlin and Munich grow together on premium-segment concentration. Checked against the actual survey data, that doesn't hold: Munich's Urban Wellness Professionals share (22.8%) is one of the lowest of the five named cities, while Cologne's (35.6%) is the highest — a genuine correction to the case's own framing, not a repeated assumption.
- None of LUMEN's four marketing channels individually clears the 3:1 LTV:CAC ratio the plan assumes — Retail Sampling returns the most (€174 LTV) but costs the most to acquire (€60 CAC); Referral is cheapest to acquire (€28) but shallowest (€81 LTV). The blended €44 CAC used elsewhere in the tool hides that spread.

**What we deliberately did not optimize for:** a single "the answer is €X" number. The tool is built so the trade-off stays visible — that was the one instruction in the brief we treated as non-negotiable.
