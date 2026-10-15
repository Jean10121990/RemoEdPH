/**
 * Play & Learn game completion. Games run in the browser, so the server issues a
 * signed play ticket at Start and checks it at Finish (same student, same game,
 * all rounds, believable play time) before calling ecoDropService.award.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { gamesRegistry } = require('./games.config');
const { GardenError } = require('./errors');

const TICKET_TTL_SECONDS = 3 * 60 * 60;

function createPlayService({ ecoDrops, secret, games = gamesRegistry }) {
  if (!secret) throw new Error('playService needs a signing secret');

  function requireGame(gameId) {
    const game = games.get(gameId);
    if (!game) throw new GardenError(404, 'UNKNOWN_GAME', 'That game does not exist.');
    return game;
  }

  function startGame(studentId, gameId, now = new Date()) {
    const game = requireGame(gameId);
    const iat = Math.floor(now.getTime() / 1000);
    const ticket = jwt.sign(
      { typ: 'play', sub: String(studentId), gid: game.id, jti: crypto.randomUUID(), iat },
      secret,
      { expiresIn: TICKET_TTL_SECONDS }
    );
    return { gameId: game.id, ticket };
  }

  async function finishGame(studentId, gameId, body = {}, now = new Date()) {
    const game = requireGame(gameId);
    let claims;
    try {
      claims = jwt.verify(String(body.ticket || ''), secret, { clockTimestamp: Math.floor(now.getTime() / 1000) });
    } catch (_e) {
      throw new GardenError(400, 'INVALID_PLAY_TICKET', 'Start the game again to earn an Eco-Drop.');
    }
    if (!claims || claims.typ !== 'play' || claims.sub !== String(studentId) || claims.gid !== game.id) {
      throw new GardenError(400, 'INVALID_PLAY_TICKET', 'Start the game again to earn an Eco-Drop.');
    }
    const rounds = Number(body.roundsCompleted);
    if (!Number.isInteger(rounds) || rounds < game.rounds) {
      throw new GardenError(400, 'GAME_NOT_FINISHED', 'Finish every round to earn an Eco-Drop.');
    }
    const elapsed = Math.floor(now.getTime() / 1000) - Number(claims.iat);
    if (!(elapsed >= game.minSeconds)) {
      throw new GardenError(400, 'GAME_TOO_FAST', 'That was too fast. Play the game to earn an Eco-Drop.');
    }
    return ecoDrops.award({ studentId, sourceType: 'game', sourceId: game.id, playId: claims.jti, now });
  }

  return { startGame, finishGame };
}

module.exports = { createPlayService };
