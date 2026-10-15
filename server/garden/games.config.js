/**
 * Play & Learn games that can earn an Eco-Drop. Ids match the game ids in
 * public/js/student-play-learn.js (CATEGORIES). To add a game: add an entry here;
 * the shared finish handler already calls the award service.
 *
 * rounds: rounds a full play has (the client must report all of them).
 * minSeconds: shortest believable full play; faster finishes are rejected.
 */
const GAMES = [
  { id: 'pop-the-bubbles', title: 'Pop the Bubbles', rounds: 6, minSeconds: 15 },
  { id: 'mystery-box', title: 'Mystery Box', rounds: 6, minSeconds: 15 },
  { id: 'feed-the-teddy-bear', title: 'Feed the Teddy Bear', rounds: 5, minSeconds: 12 },
  { id: 'hide-and-seek', title: 'Hide and Seek', rounds: 5, minSeconds: 12 },
];

function createGamesRegistry(list) {
  const byId = new Map();
  (list || []).forEach((g) => {
    if (g && /^[a-z0-9-]{1,60}$/.test(String(g.id))) byId.set(String(g.id), Object.freeze({ ...g }));
  });
  return {
    get: (id) => byId.get(String(id || '')) || null,
    list: () => Array.from(byId.values()),
    count: () => byId.size,
  };
}

module.exports = {
  GAMES,
  createGamesRegistry,
  gamesRegistry: createGamesRegistry(GAMES),
};
