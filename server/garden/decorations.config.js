/**
 * Spare Eco-Drop sink. Pond is live. Fence and gnome are listed so the shop can grow
 * without a new table.
 * TODO: fence, gnome — art, copy, and a care interaction.
 */
const DECORATIONS = [
  { key: 'pond', name: 'Pond', cost: 5, enabled: true },
  { key: 'fence', name: 'Fence', cost: 4, enabled: false },
  { key: 'gnome', name: 'Gnome', cost: 6, enabled: false },
];

function decorationByKey(key) {
  return DECORATIONS.find((item) => item.key === key) || null;
}

module.exports = { DECORATIONS, decorationByKey };
