/**
 * Garden milestones. `count` is completed trees, a streak of months, or unique species.
 * Bonus credits are granted once and sit outside the monthly tree-credit cap.
 */
const GARDEN_BADGES = [
  { key: 'first_seedling', name: 'First Seedling', kind: 'trees', count: 1, requirement: 'Finish 1 tree' },
  { key: 'green_thumb', name: 'Green Thumb', kind: 'trees', count: 3, requirement: 'Finish 3 trees' },
  { key: 'forest_builder', name: 'Forest Builder', kind: 'trees', count: 6, requirement: 'Finish 6 trees' },
  { key: 'evergreen', name: 'Evergreen', kind: 'trees', count: 12, credits: 3, requirement: 'Finish 12 trees' },
  { key: 'perfect_month', name: 'Perfect Month', kind: 'perfect', requirement: 'Finish every scheduled lesson in a month' },
  { key: 'species_collector', name: 'Species Collector', kind: 'species', count: 10, requirement: 'Grow all 10 species' },
  { key: 'early_bird', name: 'Early Bird', kind: 'early', day: 25, requirement: 'Finish a tree before the 25th' },
  { key: 'consistent_3', name: 'Consistent', kind: 'streak', count: 3, credits: 1, requirement: 'Finish a tree 3 months in a row' },
  { key: 'consistent_6', name: 'Steady Forest', kind: 'streak', count: 6, credits: 2, requirement: 'Finish a tree 6 months in a row' },
];

module.exports = { GARDEN_BADGES };
