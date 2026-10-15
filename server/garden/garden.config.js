/**
 * Virtual Garden settings: stages, species rotation, month timezone, reward rules.
 * Stage art lives in public/images/garden/ (placeholder SVGs; swap files, keep names).
 */

/** Months are YYYY-MM in this timezone (rollover at local midnight on the 1st). */
const GARDEN_TIMEZONE = process.env.GARDEN_TIMEZONE || 'Asia/Manila';

/**
 * How often a Play & Learn game can pay a drop:
 * - 'once-per-month' (default): each game pays once per month, so replaying a favourite
 *   cannot fill the tree, but the monthly reset makes every game worth playing again.
 * - 'once-ever': each game pays once for the life of the account.
 * - 'every-play': every finished play pays (one drop per server-issued play ticket).
 */
const GAME_REWARD_MODE = 'once-per-month';

/** Used when the student has no lessons scheduled in the month (nothing to count). */
const DEFAULT_MONTHLY_TARGET = 12;

/** Lowest stage first. minPercent is of this month’s care growthPoints / monthlyTarget. */
const STAGES = [
  { key: 'seed', name: 'Seed', minPercent: 0, asset: '/images/garden/stage-0-seed.svg', ambient: { butterflies: 0, bees: 0, birds: 0, rainbow: false } },
  { key: 'sprout', name: 'Sprout', minPercent: 20, asset: '/images/garden/stage-1-sprout.svg', ambient: { butterflies: 0, bees: 0, birds: 0, rainbow: false } },
  { key: 'small-plant', name: 'Small Plant', minPercent: 40, asset: '/images/garden/stage-2-small-plant.svg', ambient: { butterflies: 1, bees: 0, birds: 0, rainbow: false } },
  { key: 'medium-plant', name: 'Medium Plant', minPercent: 60, asset: '/images/garden/stage-3-medium-plant.svg', ambient: { butterflies: 2, bees: 1, birds: 0, rainbow: false } },
  { key: 'large-tree', name: 'Large Tree', minPercent: 80, asset: '/images/garden/stage-4-large-tree.svg', ambient: { butterflies: 2, bees: 2, birds: 1, rainbow: false } },
  { key: 'fully-grown', name: 'Fully Grown Tree', minPercent: 100, asset: '/images/garden/stage-5-fully-grown.svg', ambient: { butterflies: 3, bees: 2, birds: 2, rainbow: true } },
];

/** Monthly species, in rotation order. Consecutive months always differ. Assigned once at create. */
const SPECIES = [
  'Oak',
  'Cherry Blossom',
  'Pine',
  'Mango',
  'Banyan',
  'Maple',
  'Narra',
  'Acacia',
  'Mahogany',
  'Molave',
];

module.exports = {
  GARDEN_TIMEZONE,
  GAME_REWARD_MODE,
  DEFAULT_MONTHLY_TARGET,
  STAGES,
  SPECIES,
};
