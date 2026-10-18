/** Tree completion rewards. Change weights and caps here. The roll stays on the server. */
const MAX_TREES_PER_MONTH = 2;
const MAX_TREE_CREDITS_PER_STUDENT_PER_MONTH = 4;
const CREDIT_EXPIRY_DAYS = 60;
const EXPIRY_REMINDER_DAYS = 7;
const LESSON_ELIGIBILITY_RATIO = 0.8;

const REWARDS = {
  creditsEnabled: true,
};

/** Inclusive ranges shown before the student claims. */
const TIER_RANGES = {
  1: { min: 1, max: 3, label: '1 to 3' },
  2: { min: 2, max: 4, label: '2 to 4' },
};

/** Weights sum to 100. crypto.randomInt picks a ticket from 1..100. */
const TIERS = {
  1: [
    { credits: 1, weight: 60 },
    { credits: 2, weight: 30 },
    { credits: 3, weight: 10 },
  ],
  2: [
    { credits: 2, weight: 50 },
    { credits: 3, weight: 35 },
    { credits: 4, weight: 15 },
  ],
};

module.exports = {
  MAX_TREES_PER_MONTH,
  MAX_TREE_CREDITS_PER_STUDENT_PER_MONTH,
  CREDIT_EXPIRY_DAYS,
  EXPIRY_REMINDER_DAYS,
  LESSON_ELIGIBILITY_RATIO,
  REWARDS,
  TIER_RANGES,
  TIERS,
};
