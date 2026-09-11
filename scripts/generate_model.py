import pandas as pd
import numpy as np
import json

D = "/home/claude/lumen/data/"

# ---------- Channel economics (reverse-engineered formulas) ----------
COGS = 0.62
channel_formulas = {
    "DTC Online":      {"slope": 0.971, "intercept": -0.35, "label": "Direct-to-consumer (own site)"},
    "Retail/Grocery":  {"slope": 0.57,  "intercept": 0.0,   "label": "Supermarkets & grocery"},
    "Gym & Office":    {"slope": 0.80,  "intercept": 0.0,   "label": "Gyms, offices, vending"},
}

# ---------- Competitors ----------
comp = pd.read_csv(D+"competitor_prices_by_channel.csv")
comp_summary = (comp.groupby(["competitor","positioning"])
                .agg(avg_price=("price_eur","mean"), min_price=("price_eur","min"),
                     max_price=("price_eur","max"), marketing_spend_index=("marketing_spend_index_0_100","first"))
                .reset_index())
competitors = comp_summary.round(2).to_dict(orient="records")

hist = pd.read_csv(D+"competitor_price_history.csv")
promo = (hist.groupby("competitor")
         .agg(promo_months=("promo_active","sum"), total_months=("promo_active","count"),
              avg_discount_pct=("promo_discount_pct","mean"), avg_shelf_price=("shelf_price_eur","mean"))
         .round(2).reset_index())
promo_dict = {r["competitor"]: {"promo_months": int(r["promo_months"]), "total_months": int(r["total_months"]),
                                  "avg_discount_pct": r["avg_discount_pct"], "avg_shelf_price": r["avg_shelf_price"]}
              for _, r in promo.iterrows()}
for c in competitors:
    c["price_history"] = promo_dict.get(c["competitor"], {})

# ---------- Survey segments (aggregated only, PII dropped) ----------
survey = pd.read_csv(D+"customer_survey.csv").drop(columns=["first_name","last_name","email"])
seg_stats = survey.groupby("segment").agg(
    n=("respondent_id","count"),
    avg_age=("age","mean"), avg_spend=("monthly_beverage_spend_eur","mean"),
    avg_freq=("purchase_frequency_per_month","mean"), avg_sensitivity=("price_sensitivity_1_10","mean"),
    avg_intent=("lumen_purchase_intent_1_10","mean")
).round(2)
seg_stats["share_pct"] = (100*seg_stats["n"]/seg_stats["n"].sum()).round(1)
channel_pref = pd.crosstab(survey["segment"], survey["preferred_channel"], normalize="index").round(3)

city_counts = survey["city"].value_counts(normalize=True).round(3).to_dict()

# ---------- Van Westendorp per segment ----------
psens = pd.read_csv(D+"price_sensitivity_survey.csv")
prices = np.arange(0.5, 4.01, 0.01)
def van_westendorp(sub):
    curve = pd.DataFrame({"price": prices})
    curve["too_cheap_pct"] = [(sub["too_cheap_eur"] >= p).mean()*100 for p in prices]
    curve["cheap_pct"] = [(sub["cheap_eur"] >= p).mean()*100 for p in prices]
    curve["expensive_pct"] = [(sub["expensive_eur"] <= p).mean()*100 for p in prices]
    curve["too_expensive_pct"] = [(sub["too_expensive_eur"] <= p).mean()*100 for p in prices]
    def cross(c1, c2):
        diff = curve[c1] - curve[c2]
        sc = np.where(np.diff(np.sign(diff)))[0]
        return round(float(curve["price"].iloc[sc[0]]), 2) if len(sc) else None
    return {
        "pmc": cross("too_cheap_pct","expensive_pct"),
        "opp": cross("too_cheap_pct","too_expensive_pct"),
        "idpp": cross("cheap_pct","expensive_pct"),
        "pme": cross("cheap_pct","too_expensive_pct"),
    }

segments = {}
for seg, row in seg_stats.iterrows():
    sub = psens[psens["segment"] == seg]
    vw = van_westendorp(sub) if len(sub) else None
    segments[seg] = {
        **row.to_dict(),
        "channel_pref": channel_pref.loc[seg].round(3).to_dict() if seg in channel_pref.index else {},
        "van_westendorp": vw,
    }

vw_all = van_westendorp(psens)

# ---------- Marketing funnel ----------
funnel = pd.read_csv(D+"marketing_funnel_monthly.csv")
fg = funnel.groupby("channel").agg(
    total_conversions=("conversions_customers_acquired","sum"),
    total_spend=("spend_eur","sum"), avg_ltv=("ltv_estimate_eur","mean"),
    total_reach=("reach","sum")
)
fg["blended_cac"] = (fg["total_spend"]/fg["total_conversions"]).round(2)
fg["ltv_cac_ratio"] = (fg["avg_ltv"]/fg["blended_cac"]).round(2)
fg["conv_rate_of_reach_pct"] = (100*fg["total_conversions"]/fg["total_reach"]).round(3)
marketing_channels = fg.round(2).reset_index().to_dict(orient="records")
overall_cac = round(funnel["spend_eur"].sum()/funnel["conversions_customers_acquired"].sum(), 2)
overall_ltv = round((funnel["ltv_estimate_eur"]*funnel["conversions_customers_acquired"]).sum()/funnel["conversions_customers_acquired"].sum(), 2)

# ---------- Historical sales -> corrected seasonality ----------
sales = pd.read_csv(D+"historical_sales_weekly.csv").drop_duplicates(subset=["week_start_date","country","channel"])
sales["week_start_date"] = pd.to_datetime(sales["week_start_date"])
sales["month"] = sales["week_start_date"].dt.month
weekly_totals = sales.groupby("week_start_date")["units_sold"].sum().reset_index()
weekly_totals["month"] = weekly_totals["week_start_date"].dt.month
avg_by_month = weekly_totals.groupby("month")["units_sold"].mean()
seas = pd.read_csv(D+"seasonality_and_weather.csv").set_index("month")
seas["actual_demand_index"] = (100*avg_by_month/avg_by_month.mean()).round(1)
seasonality = seas.reset_index().round(2).to_dict(orient="records")
correlation_seasonality = round(float(seas["actual_demand_index"].corr(seas["seasonality_index_100_avg"])), 3)
correlation_temp = round(float(avg_by_month.corr(seas["avg_temp_germany_celsius"])), 3)

channel_mix_home = sales.groupby("channel")["units_sold"].sum()
channel_mix_home_pct = (100*channel_mix_home/channel_mix_home.sum()).round(1).to_dict()

promo_lift = sales.groupby("promo_active")["units_sold"].mean().round(1).to_dict()

# ---------- Market context ----------
mc = pd.read_csv(D+"market_context.csv")
subcat = mc[mc["dimension_type"]=="subcategory"].pivot(index="year", columns="name", values="value")
regions = mc[mc["dimension_type"]=="region"].pivot(index="name", columns="metric", values="value")

# ---------- Price test (given, verbatim) ----------
price_test = pd.read_csv(D+"price_test_results.csv").to_dict(orient="records")

# ---------- Quotes ----------
quotes = pd.read_csv(D+"customer_quotes.csv").to_dict(orient="records")

model = {
    "cogs_per_unit_eur": COGS,
    "channel_formulas": channel_formulas,
    "competitors": competitors,
    "segments": segments,
    "van_westendorp_all": vw_all,
    "city_distribution_pct": {k: round(v*100,1) for k,v in city_counts.items()},
    "marketing_channels": marketing_channels,
    "blended_cac": overall_cac,
    "blended_ltv": overall_ltv,
    "seasonality": seasonality,
    "seasonality_correlation": correlation_seasonality,
    "temperature_correlation": correlation_temp,
    "channel_mix_home_markets_pct": channel_mix_home_pct,
    "promo_lift_avg_units": promo_lift,
    "market_size_by_subcategory_eur": subcat.round(0).to_dict(),
    "regions": regions.round(3).to_dict(orient="index"),
    "price_test_results": price_test,
    "customer_quotes": quotes,
    "data_quality_notes": [
        "4 exact duplicate rows removed from historical_sales_weekly.csv (Denmark 2025-09-22, Denmark 2025-12-22, Netherlands 2025-07-14, Netherlands 2026-04-27).",
        "Seasonality index recomputed on a per-week average basis, not a monthly sum, because Jan-Jun weeks are covered by both 2025 and 2026 in the 78-week window while Jul-Dec is covered once -- naive monthly sums overstate H1.",
        "customer_survey.csv name/email columns were dropped before any aggregation and never reach this file or the app."
    ]
}

with open("/home/claude/lumen/build/lumen_model.json", "w") as f:
    json.dump(model, f, indent=2, default=str)

print("Model written. Keys:", list(model.keys()))
print("Segments:", list(segments.keys()))
