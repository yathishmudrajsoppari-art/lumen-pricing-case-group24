// LUMEN → Germany — Decision Cockpit
// All economics are derived live from data/lumen_model.json (aggregated exhibits, no PII, no raw survey rows).

const SEGMENT_ORDER = [
  "Urban Wellness Professionals",
  "Fitness & Gym-Goers",
  "On-the-go Commuters",
  "Students & Budget-Conscious",
];

const CHANNELS = ["DTC Online", "Retail/Grocery", "Gym & Office"];
const CHANNEL_SHORT = { "DTC Online": "DTC", "Retail/Grocery": "Retail", "Gym & Office": "Gym/Office" };

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const PRESETS = {
  cfo:   { price: 1.79, mix: { "DTC Online": 20, "Retail/Grocery": 60, "Gym & Office": 20 } },
  cmo:   { price: 2.59, mix: { "DTC Online": 55, "Retail/Grocery": 15, "Gym & Office": 30 } },
};

let MODEL = null;

const state = {
  price: 1.99,
  mix: { "DTC Online": 40, "Retail/Grocery": 35, "Gym & Office": 25 },
  month: 5,
  dial: 50,
  liveWeather: null,
};

function lerp(a, b, t) { return a + (b - a) * t; }

function interpolatePreset(t) {
  // t in [0,1], 0 = CFO preset, 1 = CMO preset
  const price = lerp(PRESETS.cfo.price, PRESETS.cmo.price, t);
  const mix = {};
  CHANNELS.forEach((c) => {
    mix[c] = lerp(PRESETS.cfo.mix[c], PRESETS.cmo.mix[c], t);
  });
  return { price, mix };
}

function normalizeMixAround(changedChannel, newValue) {
  newValue = Math.max(0, Math.min(100, newValue));
  const others = CHANNELS.filter((c) => c !== changedChannel);
  const remaining = 100 - newValue;
  const othersSum = others.reduce((s, c) => s + state.mix[c], 0);
  const next = { ...state.mix, [changedChannel]: newValue };
  if (othersSum <= 0) {
    others.forEach((c) => (next[c] = remaining / others.length));
  } else {
    others.forEach((c) => (next[c] = (state.mix[c] / othersSum) * remaining));
  }
  state.mix = next;
}

// ---------- Derived economics ----------

function contributionAt(price, channel) {
  const f = MODEL.channel_formulas[channel];
  const net = f.slope * price + f.intercept;
  return net - MODEL.cogs_per_unit_eur;
}

function blendedContribution(price, mix) {
  return CHANNELS.reduce((sum, c) => sum + (mix[c] / 100) * contributionAt(price, c), 0);
}

function blendedAvgFrequency() {
  const segs = MODEL.segments;
  let total = 0;
  Object.values(segs).forEach((s) => { total += (s.share_pct / 100) * s.avg_freq; });
  return total;
}

function segmentFitPct(price) {
  const segs = MODEL.segments;
  let captured = 0;
  Object.values(segs).forEach((s) => {
    if (s.van_westendorp && s.van_westendorp.pme != null && price <= s.van_westendorp.pme) {
      captured += s.share_pct;
    }
  });
  return captured;
}

// price_test_results.csv gives acceptance at 3 tested prices, identical across channels.
// A higher price that fewer people accept doesn't just cut volume -- it means more of
// LUMEN's marketing reach is spent on people who won't convert, so the *effective* cost
// to land one paying customer rises as acceptance falls. This is what turns "just raise
// the price" into a real trade-off instead of a one-way lever.
function acceptancePct(price) {
  const pts = [[1.79, 61.7], [2.19, 51.7], [2.59, 26.7]];
  let p0, p1;
  if (price <= pts[0][0]) { p0 = pts[0]; p1 = pts[1]; }
  else if (price <= pts[1][0]) { p0 = pts[0]; p1 = pts[1]; }
  else if (price <= pts[2][0]) { p0 = pts[1]; p1 = pts[2]; }
  else { p0 = pts[1]; p1 = pts[2]; }
  const slope = (p1[1] - p0[1]) / (p1[0] - p0[0]);
  const v = p0[1] + slope * (price - p0[0]);
  return Math.max(3, Math.min(95, v));
}

function paybackMonths(price, mix) {
  const contribution = blendedContribution(price, mix);
  if (contribution <= 0) return Infinity;
  const acceptance = acceptancePct(price) / 100;
  const effectiveCac = MODEL.blended_cac / acceptance;
  const paybackUnits = effectiveCac / contribution;
  const freq = blendedAvgFrequency();
  return paybackUnits / freq;
}

function fastestPaybackPriceForMix(mix) {
  let best = null;
  for (let p = 0.99; p <= 3.29; p += 0.02) {
    const pb = paybackMonths(p, mix);
    if (best === null || pb < best.payback) best = { price: p, payback: pb };
  }
  return best;
}

// ---------- Rendering ----------

function fmtEUR(v) { return "€" + v.toFixed(2); }
function fmtPct(v) { return v.toFixed(0) + "%"; }

function renderControlsReadouts() {
  document.getElementById("price-readout").textContent = fmtEUR(state.price);
  document.getElementById("month-readout").textContent = MONTH_NAMES[state.month - 1];
  const dialLabel = state.dial <= 15 ? "Elena — fast payback"
    : state.dial >= 85 ? "Jonas — premium"
    : state.dial === 50 ? "Balanced" : "Custom blend";
  document.getElementById("dial-readout").textContent = dialLabel;
  document.getElementById("mix-readout").textContent =
    CHANNELS.map((c) => `${CHANNEL_SHORT[c]} ${Math.round(state.mix[c])}%`).join(" · ");
}

function renderMixSliders() {
  const container = document.getElementById("mix-sliders");
  container.innerHTML = "";
  CHANNELS.forEach((c) => {
    const row = document.createElement("div");
    row.className = "mix-row";
    row.innerHTML = `
      <div class="mix-row-label"><span>${CHANNEL_SHORT[c]}</span><span>${Math.round(state.mix[c])}%</span></div>
      <input type="range" min="0" max="100" step="1" value="${state.mix[c]}" data-channel="${c}" />
    `;
    container.appendChild(row);
    row.querySelector("input").addEventListener("input", (e) => {
      normalizeMixAround(c, parseFloat(e.target.value));
      state.dial = null;
      renderAll();
    });
  });
}

function renderPriceMarks() {
  const marks = document.getElementById("price-marks");
  marks.innerHTML = "";
  ["€0.99","€1.79 PulsUp","€2.19","€2.59","€3.29"].forEach((label) => {
    const s = document.createElement("span");
    s.textContent = label;
    marks.appendChild(s);
  });
}

function renderPositioningMap() {
  const svg = document.getElementById("positioning-map");
  const W = 720, H = 340, PAD = 46;
  const minP = 0.8, maxP = 3.3;
  const x = (p) => PAD + ((p - minP) / (maxP - minP)) * (W - 2 * PAD);
  const y = (spend) => H - PAD - (spend / 100) * (H - 2 * PAD);

  let svgContent = "";

  // axis
  svgContent += `<line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="var(--line-strong)" stroke-width="1"/>`;
  svgContent += `<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="var(--line-strong)" stroke-width="1"/>`;
  svgContent += `<text x="${W - PAD}" y="${H - PAD + 24}" text-anchor="end" font-size="11" fill="var(--ink-soft)">price (€) →</text>`;
  svgContent += `<text x="${PAD}" y="16" font-size="11" fill="var(--ink-soft)">↑ brand investment</text>`;

  // price ticks
  [1, 1.5, 2, 2.5, 3].forEach((p) => {
    svgContent += `<line x1="${x(p)}" y1="${H-PAD}" x2="${x(p)}" y2="${H-PAD+5}" stroke="var(--line-strong)"/>`;
    svgContent += `<text x="${x(p)}" y="${H-PAD+18}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">€${p.toFixed(2)}</text>`;
  });

  // segment Van Westendorp bands
  const bandColors = { "Urban Wellness Professionals": "var(--botanical)", "Fitness & Gym-Goers": "var(--gold)", "On-the-go Commuters": "var(--line-strong)", "Students & Budget-Conscious": "var(--clay)" };
  let bandY = PAD - 6;
  SEGMENT_ORDER.forEach((name, i) => {
    const s = MODEL.segments[name];
    if (!s.van_westendorp) return;
    const x1 = x(s.van_westendorp.pmc), x2 = x(s.van_westendorp.pme);
    svgContent += `<rect x="${x1}" y="${H-PAD+1}" width="${Math.max(2, x2 - x1)}" height="4" fill="${bandColors[name]}" opacity="0.55" />`;
  });

  // competitors
  MODEL.competitors.forEach((c) => {
    const cx = x(c.avg_price), cy = y(c.marketing_spend_index);
    svgContent += `<circle cx="${cx}" cy="${cy}" r="7" fill="var(--paper)" stroke="var(--ink-soft)" stroke-width="1.4" />`;
    svgContent += `<text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="11" fill="var(--ink-soft)">${c.competitor}</text>`;
  });

  // LUMEN — y position driven by dial (proxy for intended brand-investment ambition)
  const lumenSpend = 15 + (state.dial != null ? state.dial : 50) * 0.7;
  const lx = x(state.price), ly = y(lumenSpend);
  svgContent += `<circle cx="${lx}" cy="${ly}" r="9" fill="var(--botanical)" stroke="var(--paper-raised)" stroke-width="2" />`;
  svgContent += `<text x="${lx}" y="${ly - 16}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--botanical)">LUMEN</text>`;

  svg.innerHTML = svgContent;

  const legend = document.getElementById("map-legend");
  legend.innerHTML = SEGMENT_ORDER.map((name) => `
    <span class="legend-item"><span class="legend-swatch" style="background:${bandColors[name]}"></span>${name} ceiling: €${MODEL.segments[name].van_westendorp.pme.toFixed(2)}</span>
  `).join("");

  const promoLines = MODEL.competitors.map((c) => {
    const h = c.price_history;
    if (!h || !h.total_months) return null;
    return `${c.competitor} discounted ${h.promo_months}/${h.total_months} months (avg ${h.avg_discount_pct_when_run.toFixed(0)}% off, when they did)`;
  }).filter(Boolean);
  document.getElementById("promo-note").textContent =
    `Last 12 months of competitor pricing: ${promoLines.join(" · ")}. The Students & Budget-Conscious segment explicitly says promo timing decides their purchase — mass-market PulsUp discounts most often, premium players almost never do.`;
}

function renderStatStrip() {
  const strip = document.getElementById("stat-strip");
  const contribution = blendedContribution(state.price, state.mix);
  const marginPct = (contribution / (state.price)) * 100;
  const payback = paybackMonths(state.price, state.mix);
  const fit = segmentFitPct(state.price);

  const marginClass = marginPct >= 45 ? "good" : marginPct <= 25 ? "warn" : "";
  const paybackClass = payback <= 12 ? "good" : payback >= 20 ? "warn" : "";
  const fitClass = fit >= 60 ? "good" : fit <= 30 ? "warn" : "";

  strip.innerHTML = `
    <div class="stat-cell">
      <p class="stat-label">Blended contribution / unit</p>
      <p class="stat-value ${marginClass}">${fmtEUR(contribution)}</p>
      <p class="stat-note">${marginPct.toFixed(0)}% of retail price, at this channel mix</p>
    </div>
    <div class="stat-cell">
      <p class="stat-label">Estimated CAC payback</p>
      <p class="stat-value ${paybackClass}">${isFinite(payback) ? payback.toFixed(1) + " mo" : "never"}</p>
      <p class="stat-note">€${MODEL.blended_cac} CAC, scaled by acceptance at this price (${acceptancePct(state.price).toFixed(0)}%), ÷ contribution, at ${blendedAvgFrequency().toFixed(1)}x/month purchase rate</p>
    </div>
    <div class="stat-cell">
      <p class="stat-label">Population reached</p>
      <p class="stat-value ${fitClass}">${fmtPct(fit)}</p>
      <p class="stat-note">share of surveyed segments whose stated ceiling is at or above this price</p>
    </div>
  `;
}

function renderSegments() {
  const grid = document.getElementById("segment-grid");
  grid.innerHTML = SEGMENT_ORDER.map((name) => {
    const s = MODEL.segments[name];
    const captured = s.van_westendorp && state.price <= s.van_westendorp.pme;
    const topChannel = Object.entries(s.channel_pref).sort((a, b) => b[1] - a[1])[0];
    return `
      <div class="segment-card ${captured ? "captured" : "missed"}">
        <h3>${name}</h3>
        <p class="segment-fit">${captured ? "In range" : "Priced out"}</p>
        <p>${s.share_pct}% of German respondents · ceiling €${s.van_westendorp ? s.van_westendorp.pme.toFixed(2) : "—"}</p>
        <p>Avg. spend €${s.avg_spend}/mo · prefers ${CHANNEL_SHORT[topChannel[0]]} (${Math.round(topChannel[1]*100)}%)</p>
      </div>
    `;
  }).join("");
}

function renderSeasonality() {
  const svg = document.getElementById("seasonality-chart");
  const W = 720, H = 260, PAD = 40;
  const data = MODEL.seasonality;
  const maxIdx = Math.max(...data.map((d) => Math.max(d.seasonality_index_100_avg, d.actual_demand_index)));
  const barW = (W - 2 * PAD) / data.length;
  const y = (v) => H - PAD - (v / maxIdx) * (H - 2 * PAD - 20);

  let content = `<line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="var(--line-strong)"/>`;

  data.forEach((d, i) => {
    const cx = PAD + i * barW + barW / 2;
    const bw = barW * 0.5;
    const isSelected = d.month === state.month;
    content += `<rect x="${cx - bw/2}" y="${y(d.actual_demand_index)}" width="${bw}" height="${H-PAD-y(d.actual_demand_index)}" fill="${isSelected ? 'var(--botanical)' : 'var(--botanical-soft)'}" />`;
    content += `<text x="${cx}" y="${H-PAD+16}" text-anchor="middle" font-size="10" fill="${isSelected ? 'var(--botanical)' : 'var(--ink-soft)'}" font-weight="${isSelected ? '700':'400'}">${MONTH_NAMES[d.month-1]}</text>`;
  });

  // temperature line
  const maxTemp = Math.max(...data.map(d => d.avg_temp_germany_celsius));
  const tY = (t) => H - PAD - (t / maxTemp) * (H - 2*PAD - 20) * 0.6;
  let linePoints = data.map((d, i) => `${PAD + i*barW + barW/2},${tY(d.avg_temp_germany_celsius)}`).join(" ");
  content += `<polyline points="${linePoints}" fill="none" stroke="var(--clay)" stroke-width="2" stroke-dasharray="4 3"/>`;

  svg.innerHTML = content;

  document.getElementById("seas-corr").textContent = MODEL.seasonality_correlation;
  document.getElementById("temp-corr").textContent = MODEL.temperature_correlation;
}

function renderCityChart() {
  const svg = document.getElementById("city-chart");
  const W = 720, H = 260, PAD_L = 130, PAD = 24;
  const data = MODEL.city_launch_priority;
  const maxScore = Math.max(...data.map(d => d.priority_score));
  const rowH = (H - 2 * PAD) / data.length;
  const barMaxW = W - PAD_L - PAD - 190;

  let content = "";
  data.forEach((d, i) => {
    const y = PAD + i * rowH + rowH * 0.2;
    const bw = (d.priority_score / maxScore) * barMaxW;
    const isNamed = d.city !== "Other Germany";
    content += `<text x="${PAD_L - 10}" y="${y + rowH*0.3}" text-anchor="end" font-size="12" fill="var(--ink)" font-weight="${isNamed ? 600 : 400}">${d.city}</text>`;
    content += `<rect x="${PAD_L}" y="${y}" width="${bw}" height="${rowH*0.55}" fill="${isNamed ? 'var(--botanical)' : 'var(--line-strong)'}" opacity="${isNamed ? 1 : 0.6}"/>`;
    content += `<text x="${PAD_L + bw + 8}" y="${y + rowH*0.3}" font-size="11" fill="var(--ink-soft)">${(d.urban_wellness_share_of_city*100).toFixed(0)}% Urban Wellness · ${(d.regional_cagr*100).toFixed(0)}% CAGR</text>`;
  });
  svg.innerHTML = content;

  const munich = data.find(d => d.city === "Munich");
  const cologne = data.find(d => d.city === "Cologne");
  document.getElementById("city-callout").textContent =
    `Berlin ranks first on the combined score. But note: Munich's own Urban Wellness concentration (${(munich.urban_wellness_share_of_city*100).toFixed(0)}%) is lower than Cologne's (${(cologne.urban_wellness_share_of_city*100).toFixed(0)}%) despite the case materials assuming Berlin and Munich grow together — Munich's ranking here comes from its market size and growth rate, not from having more of the target segment.`;
}

function renderVoiceOfCustomer() {
  const grid = document.getElementById("voice-grid");
  const bySegment = {};
  MODEL.customer_quotes.forEach((q) => {
    if (!bySegment[q.segment]) bySegment[q.segment] = [];
    bySegment[q.segment].push(q);
  });
  const order = { positive: 0, mixed: 1, negative: 2 };
  grid.innerHTML = SEGMENT_ORDER.map((seg) => {
    const qs = (bySegment[seg] || []).slice().sort((a,b) => order[a.sentiment]-order[b.sentiment]);
    return `
      <div class="voice-card">
        <h3>${seg}</h3>
        ${qs.map(q => `
          <div class="voice-line">
            <span class="voice-tag ${q.sentiment}">${q.sentiment}</span>
            <p>"${q.quote}"</p>
          </div>
        `).join("")}
      </div>
    `;
  }).join("");
}

function renderCostBreakdown() {
  const container = document.getElementById("cost-bars");
  const maxCost = Math.max(...MODEL.cost_breakdown.map(c => c.cost_per_unit_eur));
  container.innerHTML = MODEL.cost_breakdown.map((c) => `
    <div class="cost-row">
      <span class="cost-label">${c.cost_component}</span>
      <span class="cost-bar-track"><span class="cost-bar-fill" style="width:${(c.cost_per_unit_eur/maxCost*100).toFixed(0)}%"></span></span>
      <span class="cost-value">€${c.cost_per_unit_eur.toFixed(2)}</span>
    </div>
  `).join("") + `<p class="hint" style="margin-top:6px">Total: €${MODEL.cogs_per_unit_eur.toFixed(2)} per unit — this is what "contribution per unit" above is already netted against.</p>`;
}

function renderMarketingChannels() {
  const grid = document.getElementById("marketing-grid");
  const best = Math.max(...MODEL.marketing_channels.map(c => c.ltv_cac_ratio));
  grid.innerHTML = MODEL.marketing_channels.map((c) => `
    <div class="marketing-card ${c.ltv_cac_ratio === best ? 'best' : ''}">
      <h3>${c.channel}</h3>
      <p class="ratio">${c.ltv_cac_ratio.toFixed(2)}:1 LTV:CAC</p>
      <p>€${c.blended_cac} CAC · €${c.avg_ltv.toFixed(0)} LTV</p>
      <p>${c.total_conversions.toLocaleString()} customers · ${c.conv_rate_of_reach_pct}% of reach converts</p>
    </div>
  `).join("");
}

function renderHomeMixReference() {
  const h = MODEL.channel_mix_home_markets_pct;
  document.getElementById("home-mix-reference").textContent =
    `For reference, NL/DK/SE actually sell ${h["DTC Online"]}% DTC · ${h["Retail/Grocery"]}% Retail · ${h["Gym & Office"]}% Gym/Office today.`;
}

function renderPromoLiftNote() {
  document.getElementById("promo-lift-note").textContent =
    `Home markets sell ${MODEL.promo_lift_pct}% more units, on average, in weeks with an active promo. Combined with the Students segment's own "I'll grab it on promo" behavior and PulsUp's frequent discounting, a short introductory promo in the Retail channel at launch is worth considering as a trial-driver — without repositioning the everyday price.`;
}

function reconciliation() {
  const container = document.getElementById("reconciliation");
  const uw = MODEL.segments["Urban Wellness Professionals"];
  const vt = MODEL.van_westendorp_all;
  const items = [
    {
      seg: "Urban Wellness Professionals",
      quote: MODEL.customer_quotes.find(q => q.segment === "Urban Wellness Professionals" && q.sentiment === "positive").quote,
      note: `The survey backs this up directionally (lowest price sensitivity, highest intent) — but this segment's own Van Westendorp ceiling is €${uw.van_westendorp.pme.toFixed(2)}, below VoltFit's price band. "Doesn't mind paying more" has a limit that's lower than a straight VoltFit match.`,
    },
    {
      seg: "Fitness & Gym-Goers",
      quote: MODEL.customer_quotes.find(q => q.segment === "Fitness & Gym-Goers" && q.sentiment === "mixed").quote,
      note: `This segment's stated purchase intent is high (7.97/10), but the quote is explicitly price-guarded — it reads as "convince me on the product first," not "price doesn't matter."`,
    },
    {
      seg: "All respondents",
      quote: "General population Van Westendorp range",
      note: `Stated acceptable range tops out at €${vt.pme.toFixed(2)}, yet the revealed-preference price test still shows ${MODEL.price_test_results.find(p=>p.price_eur===2.19).estimated_acceptance_pct_of_survey}% acceptance at €2.19. What people say is "fair" and what they'd actually buy aren't the same curve — worth flagging to Freya rather than picking one.`,
    },
  ];
  container.innerHTML = items.map((it) => `
    <div class="recon-item">
      <p class="segment-name">${it.seg}</p>
      <p class="quote">"${it.quote}"</p>
      <p>${it.note}</p>
    </div>
  `).join("");
}

function recommendation() {
  const contribution = blendedContribution(state.price, state.mix);
  const payback = paybackMonths(state.price, state.mix);
  const fit = segmentFitPct(state.price);
  const topMix = CHANNELS.slice().sort((a, b) => state.mix[b] - state.mix[a])[0];
  const monthName = MONTH_NAMES[state.month - 1];
  const seasonalRow = MODEL.seasonality[state.month - 1];

  let text = `At ${fmtEUR(state.price)}, led by ${CHANNEL_SHORT[topMix]} (${Math.round(state.mix[topMix])}% of the mix), LUMEN reaches roughly ${fit.toFixed(0)}% of the German segments surveyed, nets ${fmtEUR(contribution)} contribution per unit, and pays back its blended €${MODEL.blended_cac} acquisition cost in about ${isFinite(payback) ? payback.toFixed(1) : "an unbounded number of"} months. `;
  text += `Launching in ${monthName} lands on a demand index of ${seasonalRow.actual_demand_index} (home-market average = 100), so timing is ${seasonalRow.actual_demand_index >= 110 ? "working in your favor" : seasonalRow.actual_demand_index <= 90 ? "working against you" : "roughly neutral"}.`;

  const sweetSpot = fastestPaybackPriceForMix(state.mix);
  if (Math.abs(sweetSpot.price - state.price) >= 0.15 && sweetSpot.payback < payback - 0.5) {
    text += ` Note: at this same channel mix, €${sweetSpot.price.toFixed(2)} would pay back faster (${sweetSpot.payback.toFixed(1)} months) than the current price — going lower doesn't automatically mean faster payback once falling acceptance is priced in.`;
  }

  document.getElementById("recommendation-text").textContent = text;

  let tradeoff;
  if (state.price >= 2.3) {
    tradeoff = `You're optimizing for margin and brand position near VoltFit/Root & Rise — and deliberately giving up the Students & Budget-Conscious segment (32% of respondents), whose stated ceiling this price already exceeds.`;
  } else if (state.price <= 1.9) {
    tradeoff = `You're optimizing for reach and fast payback — and deliberately giving up the margin headroom Jonas wants, plus some distance from PulsUp on the low end.`;
  } else {
    tradeoff = `This sits between the two briefs deliberately — it doesn't fully deliver Jonas's premium story or Elena's fastest possible payback. Move the dial to see what each extreme costs.`;
  }
  document.getElementById("tradeoff-line").textContent = tradeoff;
}

function renderMethodologyNotes() {
  const ul = document.getElementById("methodology-notes");
  ul.innerHTML = MODEL.data_quality_notes.map((n) => `<li>${n}</li>`).join("");
}

function renderAll() {
  renderControlsReadouts();
  renderMixSliders();
  renderPositioningMap();
  renderStatStrip();
  renderSegments();
  renderSeasonality();
  recommendation();
}

// ---------- Live weather (optional stretch, no API key) ----------

async function fetchLiveWeather() {
  const cities = [
    { name: "Berlin", lat: 52.52, lon: 13.41 },
    { name: "Munich", lat: 48.14, lon: 11.58 },
    { name: "Hamburg", lat: 53.55, lon: 9.99 },
  ];
  const btn = document.getElementById("weather-btn");
  const status = document.getElementById("weather-status");
  btn.disabled = true;
  status.textContent = "Fetching current temperatures from Open-Meteo…";
  try {
    const results = await Promise.all(cities.map(async (c) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("weather fetch failed");
      const data = await res.json();
      return { name: c.name, temp: data.current.temperature_2m };
    }));
    const avg = results.reduce((s, r) => s + r.temp, 0) / results.length;
    const historicalForMonth = MODEL.seasonality[new Date().getMonth()].avg_temp_germany_celsius;
    const readout = document.getElementById("live-weather-readout");
    readout.textContent = `Right now: ${results.map(r => `${r.name} ${r.temp.toFixed(1)}°C`).join(" · ")} — average ${avg.toFixed(1)}°C vs. the ${MONTH_NAMES[new Date().getMonth()]} historical average of ${historicalForMonth}°C used above.`;
    status.textContent = "Live weather loaded from Open-Meteo (public endpoint, no key).";
  } catch (err) {
    status.textContent = "Couldn't reach Open-Meteo right now — the historical pattern above still holds either way.";
  } finally {
    btn.disabled = false;
  }
}

// ---------- Wiring ----------

function wireControls() {
  document.getElementById("price").addEventListener("input", (e) => {
    state.price = parseFloat(e.target.value);
    state.dial = null;
    renderAll();
  });

  document.getElementById("launch-month").addEventListener("input", (e) => {
    state.month = parseInt(e.target.value, 10);
    renderAll();
  });

  document.getElementById("dial").addEventListener("input", (e) => {
    state.dial = parseInt(e.target.value, 10);
    const t = state.dial / 100;
    const { price, mix } = interpolatePreset(t);
    state.price = Math.round(price * 100) / 100;
    state.mix = mix;
    document.getElementById("price").value = state.price;
    renderAll();
  });

  document.getElementById("weather-btn").addEventListener("click", fetchLiveWeather);
}

async function init() {
  const res = await fetch("data/lumen_model.json");
  MODEL = await res.json();
  renderPriceMarks();
  renderMethodologyNotes();
  renderCityChart();
  renderVoiceOfCustomer();
  renderCostBreakdown();
  renderMarketingChannels();
  renderHomeMixReference();
  renderPromoLiftNote();
  reconciliation();
  wireControls();
  renderAll();

  const hm = MODEL.channel_mix_home_markets_pct;
  document.getElementById("home-market-mix-note").textContent =
    `Home markets (NL/DK/SE) actually split: DTC ${hm["DTC Online"].toFixed(0)}% · Retail ${hm["Retail/Grocery"].toFixed(0)}% · Gym/Office ${hm["Gym & Office"].toFixed(0)}%.`;
}

init();
