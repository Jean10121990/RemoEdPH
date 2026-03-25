/** Match server/payments.js PLAN_PRICING (single source for client display only; server recomputes totals). */
export const EXCHANGE_RATE_USED = 60.03;

export const PLAN_PRICING = {
  spark: { usdDailyRate: 4.17, days: 22, name: "RemoSpark Plan" },
  steady: { usdDailyRate: 4.08, days: 66, name: "RemoSteady Plan" },
  scholar: { usdDailyRate: 4.0, days: 132, name: "RemoScholar Plan" },
  summit: { usdDailyRate: 3.92, days: 246, name: "RemoSummit Plan" },
};

export function buildPlanDescription(plan) {
  return PLAN_PRICING[plan]?.name || "RemoEd Subscription Plan";
}

export function getPlanComputedAmounts(plan) {
  const config = PLAN_PRICING[plan];
  if (!config) return null;
  const usdTotal = Number((config.usdDailyRate * config.days).toFixed(2));
  const phpEstimate = Number((usdTotal * EXCHANGE_RATE_USED).toFixed(2));
  return { usdTotal, phpEstimate };
}

/** Static display copy for plan cards (prices match public/index.html). */
export const PLAN_CARDS = [
  {
    id: "spark",
    cardClass: "plan-spark",
    icon: "book",
    name: "RemoSpark (1 Month)",
    priceUsd: "$91.74 USD",
    pricePhp: "~₱5,507.15 PHP est.",
    period: "$4.17/day x 22 days",
    tagline: "Spark their curiosity.",
    features: ["Perfect for beginners", "Access to digital library"],
  },
  {
    id: "steady",
    cardClass: "plan-steady plan-popular",
    icon: "bookLines",
    badge: "Save 2%",
    name: "RemoSteady (3 Months)",
    priceUsd: "$269.28 USD",
    pricePhp: "~₱16,164.88 PHP est.",
    period: "$4.08/day x 66 days",
    tagline: "Building a routine.",
    features: ["Digital print outs"],
  },
  {
    id: "scholar",
    cardClass: "plan-scholar",
    icon: "chat",
    badge: "Save 4%",
    name: "RemoScholar (6 Months)",
    priceUsd: "$528.00 USD",
    pricePhp: "~₱31,695.84 PHP est.",
    period: "$4.00/day x 132 days",
    tagline: "Mastering the basics.",
    features: ["Mid-term progress report"],
  },
  {
    id: "summit",
    cardClass: "plan-summit plan-recommended",
    icon: "stack",
    tag: "Recommended",
    badge: "Save 6%",
    name: "RemoSummit (12 Months)",
    priceUsd: "$964.32 USD",
    pricePhp: "~₱57,888.13 PHP est.",
    period: "$3.92/day x 246 days",
    tagline: "Reaching the peak.",
    features: ["End-of-year certificate"],
  },
];
