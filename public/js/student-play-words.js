/**
 * Play & Learn picture words (ages 3–6). Shared by every game in student-play-learn.js.
 * Pictures live in images/play-learn/<id>.png (transparent, storybook 3D style).
 */
(function (global) {
  'use strict';

  var IMG = 'images/play-learn/';

  var GROUPS = {
    food: 'Food',
    animals: 'Animals',
    clothes: 'Clothes',
    toys: 'Toys'
  };

  // `a` is the article used in spoken prompts; `sound` is what the picture "says" in Hide and Seek.
  var WORDS = [
    { id: 'apple', word: 'apple', a: 'an', group: 'food', sound: 'Crunch!' },
    { id: 'banana', word: 'banana', a: 'a', group: 'food', sound: 'Yummy!' },
    { id: 'orange', word: 'orange', a: 'an', group: 'food', sound: 'Juicy!' },
    { id: 'carrot', word: 'carrot', a: 'a', group: 'food', sound: 'Crunch!' },
    { id: 'cat', word: 'cat', a: 'a', group: 'animals', sound: 'Meow!' },
    { id: 'dog', word: 'dog', a: 'a', group: 'animals', sound: 'Woof woof!' },
    { id: 'duck', word: 'duck', a: 'a', group: 'animals', sound: 'Quack quack!' },
    { id: 'fish', word: 'fish', a: 'a', group: 'animals', sound: 'Blub blub!' },
    { id: 'hat', word: 'hat', a: 'a', group: 'clothes', sound: 'Hooray!' },
    { id: 'shoe', word: 'shoe', a: 'a', group: 'clothes', sound: 'Tap tap!' },
    { id: 'shirt', word: 'shirt', a: 'a', group: 'clothes', sound: 'Ta-da!' },
    { id: 'socks', word: 'socks', a: 'the', group: 'clothes', sound: 'Ta-da!' },
    { id: 'ball', word: 'ball', a: 'a', group: 'toys', sound: 'Boing!' },
    { id: 'car', word: 'car', a: 'a', group: 'toys', sound: 'Vroom vroom!' },
    { id: 'teddy', word: 'teddy bear', a: 'a', group: 'toys', sound: 'Hug me!' },
    { id: 'kite', word: 'kite', a: 'a', group: 'toys', sound: 'Whoosh!' }
  ];

  WORDS.forEach(function (w) {
    w.img = IMG + w.id + '.png';
  });

  var PIECES = {
    bubble: IMG + 'bubble.png',
    gift: IMG + 'gift.png',
    monster: IMG + 'monster.png',
    room: IMG + 'room.jpg',
    remo: 'images/remo-green.png'
  };

  function byId(id) {
    for (var i = 0; i < WORDS.length; i++) if (WORDS[i].id === id) return WORDS[i];
    return null;
  }

  function inGroup(group) {
    return WORDS.filter(function (w) { return w.group === group; });
  }

  /** "an apple", "a dog", "the socks" */
  function withArticle(w) {
    return (w.a ? w.a + ' ' : '') + w.word;
  }

  global.RemoedPlayWords = {
    groups: GROUPS,
    words: WORDS,
    pieces: PIECES,
    byId: byId,
    inGroup: inGroup,
    withArticle: withArticle
  };
})(typeof window !== 'undefined' ? window : globalThis);
