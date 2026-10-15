/**
 * Default wiring: Mongo repository + services + routers.
 * Mount: app.use('/api/garden', gardenRouter); app.use('/api/play-learn', playRouter).
 */
const { createMongoRepository } = require('./repository');
const { createGardenService } = require('./gardenService');
const { createEcoDropService } = require('./ecoDropService');
const { createPlayService } = require('./playService');
const { createGardenRouter, createPlayRouter } = require('./routes');

let services = null;

function getServices() {
  if (services) return services;
  const { getJwtSecret } = require('../config/jwtSecret');
  const repo = createMongoRepository();
  const garden = createGardenService({ repo });
  const ecoDropService = createEcoDropService({ repo, garden });
  const play = createPlayService({ ecoDrops: ecoDropService, secret: getJwtSecret() });
  services = { repo, garden, ecoDropService, play };
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
  const { garden, play } = getServices();
  return {
    gardenRouter: createGardenRouter({ garden, auth, isLocked: (req) => !isPaidSubscriber(req.student) }),
    playRouter: createPlayRouter({ play, auth }),
  };
}

module.exports = { getServices, awardEcoDrop, buildRouters };
