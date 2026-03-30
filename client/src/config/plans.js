/** Match server/config/planCredits.js + server/payments.js (client display; server is authoritative). */
export const CREDITS_PER_MONTH = 22;

export const EXCHANGE_RATE_USED = 60.03;

export const PLAN_PRICING = {
  spark: { name: "RemoSpark Plan", months: 1, lessonCredits: 22, usdTotal: 91.74 },
  steady: { name: "RemoSteady Plan", months: 3, lessonCredits: 66, usdTotal: 269.28 },
  scholar: { name: "RemoScholar Plan", months: 6, lessonCredits: 132, usdTotal: 528.0 },
  summit: { name: "RemoSummit Plan", months: 12, lessonCredits: 264, usdTotal: 964.32 },
};

export function buildPlanDescription(plan) {
  return PLAN_PRICING[plan]?.name || "RemoEd Subscription Plan";
}

export function getPlanComputedAmounts(plan) {
  const config = PLAN_PRICING[plan];
  if (!config) return null;
  const usdTotal = Number(Number(config.usdTotal).toFixed(2));
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
    period: "22 lesson credits · 1 month · 22 credits/mo",
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
    period: "66 lesson credits · 3 months · 22 credits/mo",
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
    period: "132 lesson credits · 6 months · 22 credits/mo",
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
    period: "264 lesson credits · 12 months · 22 credits/mo",
    tagline: "Reaching the peak.",
    features: ["End-of-year certificate"],
  },
];
