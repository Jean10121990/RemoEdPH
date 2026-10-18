/** Credits granted once, when a referred student buys their first paid plan. */
const REFERRAL_REWARD_CREDITS = 3;
/** Older rewards were a 1–5 roll. Keep that span so those rows can still be reversed. */
const REFERRAL_REWARD_MIN = 1;
const REFERRAL_REWARD_MAX = 5;

/** Successful paid-plan count thresholds. Add a row to extend milestones. */
const REFERRAL_BADGES = [
  { key: 'first_referral', name: 'First Referral', threshold: 1, color: '#1CA7E7' },
  { key: 'rising_ambassador', name: 'Rising Ambassador', threshold: 3, color: '#7C3AED' },
  { key: 'community_champion', name: 'Community Champion', threshold: 5, color: '#059669' },
  { key: 'top_recruiter', name: 'Top Recruiter', threshold: 10, color: '#D97706' },
];

const PAID_PLAN_IDS = new Set(['spark', 'steady', 'scholar', 'summit']);

module.exports = {
  REFERRAL_REWARD_CREDITS,
  REFERRAL_REWARD_MIN,
  REFERRAL_REWARD_MAX,
  REFERRAL_BADGES,
  PAID_PLAN_IDS,
};
