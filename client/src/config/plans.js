/** Match server/config/planCredits.js + server/payments.js (client display; server is authoritative). */
export const CREDITS_PER_MONTH = 22;

export const EXCHANGE_RATE_USED = 60.03;

export const USD_PER_CLASS = 7;
export const FOUNDER_DISCOUNT_PER_MONTH = 21;

export const PLAN_PRICING = {
  spark: {
    name: "RemoSpark Plan",
    months: 1,
    validityMonths: 1,
    lessonCredits: 22,
    usdList: 154.0,
    usdFounderDiscount: 0,
    usdTotal: 154.0,
    savingsUsd: 0,
    bundleName: "Starter Bundle",
  },
  steady: {
    name: "RemoSteady Plan",
    months: 3,
    validityMonths: 3,
    lessonCredits: 66,
    usdList: 462.0,
    usdFounderDiscount: 63.0,
    usdTotal: 399.0,
    savingsUsd: 63.0,
    bundleName: "Progress Bundle",
  },
  scholar: {
    name: "RemoScholar Plan",
    months: 6,
    validityMonths: 6,
    lessonCredits: 132,
    usdList: 924.0,
    usdFounderDiscount: 126.0,
    usdTotal: 798.0,
    savingsUsd: 126.0,
    bundleName: "Mastery Bundle",
  },
  summit: {
    name: "RemoSummit Plan",
    months: 12,
    validityMonths: 12,
    lessonCredits: 264,
    usdList: 1848.0,
    usdFounderDiscount: 252.0,
    usdTotal: 1596.0,
    savingsUsd: 252.0,
    bundleName: "Ultimate Bundle",
  },
};

export function buildPlanDescription(plan) {
  return PLAN_PRICING[plan]?.name || "RemoEd Subscription Plan";
}

export function getPlanComputedAmounts(plan) {
  const config = PLAN_PRICING[plan];
  if (!config) return null;
  const usdTotal = Number(Number(config.usdTotal).toFixed(2));
  const phpEstimate = Number((usdTotal * EXCHANGE_RATE_USED).toFixed(2));
  return {
    usdList: config.usdList,
    usdFounderDiscount: config.usdFounderDiscount,
    usdTotal,
    phpEstimate,
  };
}

function formatPhpEst(usd) {
  const php = Number((usd * EXCHANGE_RATE_USED).toFixed(2));
  return `~₱${php.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PHP est.`;
}

function formatUsd(usd) {
  return `$${Number(usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

/** Static display copy for plan cards (prices match public/index.html + pricing table). */
export const PLAN_CARDS = [
  {
    id: "spark",
    cardClass: "plan-spark",
    icon: "book",
    name: "RemoSpark — Starter Bundle",
    priceUsd: formatUsd(154),
    pricePhp: formatPhpEst(154),
    period: "22 Lessons · 1 month plan.",
    tagline: "Spark their curiosity.",
    features: [
      "22 classes × $7.00 = $154.00",
      "Valid for 1 month",
      "Access to digital library",
    ],
  },
  {
    id: "steady",
    cardClass: "plan-steady plan-popular",
    icon: "bookLines",
    badge: "Save $63",
    name: "RemoSteady — Progress Bundle",
    priceUsd: formatUsd(399),
    pricePhp: formatPhpEst(399),
    period: "66 Lessons · 3 month plan.",
    tagline: "Building a routine.",
    features: [
      "66 classes × $7.00",
      "Founder Discount −$21/mo × 3 (−$63)",
      "Valid for 3 months",
      "Digital print outs",
    ],
  },
  {
    id: "scholar",
    cardClass: "plan-scholar",
    icon: "chat",
    badge: "Save $126",
    name: "RemoScholar — Mastery Bundle",
    priceUsd: formatUsd(798),
    pricePhp: formatPhpEst(798),
    period: "132 Lessons · 6 month plan.",
    tagline: "Mastering the basics.",
    features: [
      "132 classes × $7.00",
      "Founder Discount −$21/mo × 6 (−$126)",
      "Valid for 6 months",
      "Mid-term progress report",
    ],
  },
  {
    id: "summit",
    cardClass: "plan-summit plan-recommended",
    icon: "stack",
    tag: "Recommended",
    badge: "Save $252",
    name: "RemoSummit — Ultimate Bundle",
    priceUsd: formatUsd(1596),
    pricePhp: formatPhpEst(1596),
    period: "264 Lessons · 12 month plan.",
    tagline: "Reaching the peak.",
    features: [
      "264 classes × $7.00",
      "Founder Discount −$21/mo × 12 (−$252)",
      "Valid for 12 months",
      "End-of-year certificate",
    ],
  },
];
