/**
 * Default wiring: Mongo repository + services + routers.
 * Mount: app.use('/api/garden', gardenRouter); app.use('/api/play-learn', playRouter).
 */
const { createMongoRepository } = require('./repository');
const { createGardenService } = require('./gardenService');
const { createCareService } = require('./careService');
const { createEcoDropService } = require('./ecoDropService');
const { createPlayService } = require('./playService');
const { createGardenRouter, createPlayRouter, createSharePageRouter, createGardenAdminRouter } = require('./routes');
const { createRewardService } = require('./rewardService');
const { createParentService } = require('./parentService');
const { createShareService } = require('./shareService');

let services = null;

function getServices() {
  if (services) return services;
  const { getJwtSecret } = require('../config/jwtSecret');
  const repo = createMongoRepository();
  const { ensureGardenIndexes } = require('./repository');
  ensureGardenIndexes().catch((err) => console.error('garden indexes', err && err.message));
  const garden = createGardenService({ repo });
  const rewards = createRewardService({ repo, garden });
  const parent = createParentService({ repo, garden });
  const shares = createShareService({ repo, parent, origin: process.env.APP_URL || 'https://remoedph.com' });
  const care = createCareService({ repo, garden });
  const ecoDropService = createEcoDropService({ repo, garden });
  const play = createPlayService({ ecoDrops: ecoDropService, secret: getJwtSecret() });
  services = { repo, garden, care, ecoDropService, play, rewards, parent, shares };
  return services;
}

/** Shared entry point for completion handlers. Never throws into their flow. */
async function awardEcoDrop(args) {
  try {
    return await getServices().ecoDropService.award(args);
  } catch (err) {
    console.warn('ecoDropService.award failed:', err && err.message);
    return { awarded: false, totalEcoDrops: 0, monthEcoDrops: 0, stageBefore: null, stageAfter: null, reason: 'error' };
  }
}

function buildRouters() {
  const { verifyToken, requireStudent } = require('../authMiddleware');
  const { isPaidSubscriber } = require('../services/freePlanAccess');
  const auth = [verifyToken, requireStudent];
  const { garden, care, play, rewards, parent, shares } = getServices();
  const { verifyAdminApiAuth, requirePermission } = require('../authMiddleware');
  return {
    gardenRouter: createGardenRouter({
      garden,
      care,
      rewards,
      parent,
      shares,
      auth,
      isLocked: (req) => !isPaidSubscriber(req.student),
    }),
    playRouter: createPlayRouter({ play, auth }),
    sharePageRouter: createSharePageRouter({ shares }),
    gardenAdminRouter: createGardenAdminRouter({
      parent,
      auth: [verifyAdminApiAuth, requirePermission('nav:reports')],
    }),
  };
}

module.exports = { getServices, awardEcoDrop, buildRouters };
