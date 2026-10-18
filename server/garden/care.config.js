/**
 * Garden care costs and growth. Rebalance here; clients cannot send these values.
 */
const ACTIONS = {
  water: { action: 'water', cost: 1, growthPoints: 1 },
  fertilize: { action: 'fertilize', cost: 2, growthPoints: 3, oncePerStage: true },
};

function careAction(name) {
  return ACTIONS[String(name || '').trim().toLowerCase()] || null;
}

module.exports = { ACTIONS, careAction };
