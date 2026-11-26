'use strict';

const SCENES = [
  {
    test: /bonifacio/i,
    marker: /Katipunan/,
    subject: 'A quiet kind of courage, from our family to yours',
    opening: 'Hello,\n\nHappy Bonifacio Day. I hope this finds you with your little one nearby, maybe in the middle of a small adventure that only a parent would notice.',
    context: 'A little background, in case this day is new to your family. Andres Bonifacio was born on November 30, 1863, in Tondo, Manila. He founded the Katipunan, a secret group of ordinary Filipinos who chose to stand together for freedom from Spanish rule. The Philippines remembers him on his birthday as the Father of the Philippine Revolution.',
    heart: 'We often picture heroes as loud and far away. At home, courage is quieter. It is a child trying a new English word for the first time, sharing a smile with a friend, or looking after someone smaller. Bonifacio believed ordinary people could care for one another and still be brave. That same care can live in an ordinary afternoon.',
  },
  {
    test: /rizal/i,
    marker: /Noli Me Tangere/,
    subject: 'A love of learning, passed gently at home',
    opening: 'Hello,\n\nHappy Rizal Day. I hope the house is calm enough for a child to ask one more question.',
    context: 'A little background, in case this day is new to your family. Jose Rizal was a Filipino doctor and writer, honored as the national hero of the Philippines. In his books Noli Me Tangere and El Filibusterismo, he wrote about the hard life of his people under Spanish rule and asked for education and fairness. He died on December 30, 1896. Rizal Day keeps that date, and it keeps his love of study.',
    heart: 'A young child does not need a long lesson about a hero. They need someone who is glad when they try a word, look at a picture, and stay a little longer. That is a love of learning, practiced at home.',
  },
  {
    test: /valor/i,
    marker: /Bataan/,
    subject: 'Courage worth remembering, told gently',
    opening: 'Hello,\n\nI hope today has a little room in it for your family, even if the calendar is full.',
    context: 'A little background, in case this day is new to your family. April 9 is Araw ng Kagitingan, the Day of Valor in the Philippines. It marks April 9, 1942, when Filipino and American soldiers in Bataan could no longer hold their line during the Second World War. The country keeps the day to honor that courage.',
    heart: 'For a small child, courage rarely looks like a battle. It looks like speaking up, waiting a turn, or being kind when it would be easier to walk away. Those are the moments worth noticing.',
  },
  {
    test: /independence/i,
    marker: /Kawit/,
    subject: 'A morning the Philippines still remembers',
    opening: 'Hello,\n\nI hope today has a little room in it for your family, even if the calendar is full.',
    context: 'A little background, in case this day is new to your family. On June 12, 1898, in Kawit, Cavite, General Emilio Aguinaldo declared that the Philippines was independent after more than three centuries of Spanish rule. The Philippine flag was raised that morning. June 12 is still the country’s Independence Day.',
    heart: 'Freedom in a child’s day is smaller and closer. It is a voice that is allowed to try, a home that feels safe, and a family that is glad to be together.',
  },
  {
    test: /heroes/i,
    marker: /last Monday of August/,
    subject: 'For every brave and gentle heart',
    opening: 'Hello,\n\nI hope today has a little room in it for your family, even if the calendar is full.',
    context: 'A little background, in case this day is new to your family. National Heroes Day in the Philippines falls on the last Monday of August. It is not for one famous name only. It remembers all Filipinos who stood up for their country, including those who began the revolution against Spain in August 1896.',
    heart: 'A child can learn that kind of courage at home. It looks like telling the truth, helping someone smaller, and trying again after a mistake.',
  },
  {
    test: /christmas/i,
    marker: /Noche Buena/,
    subject: 'Warmth for your home this Christmas',
    opening: 'Hello,\n\nMerry Christmas. I hope your home has a soft light in it, and a child who feels glad to be there.',
    context: 'A little of how this day is kept in the Philippines. Christmas there is a long family season. On Christmas Eve, many homes share Noche Buena, a meal late in the evening, because being together is the heart of the night.',
    heart: 'The best part of this season is rarely the noise. It is the people in the room, the stories told twice, and the way a little one leans in when they feel safe.',
  },
  {
    test: /new year/i,
    marker: /Media Noche/,
    subject: 'A warm hello as the year begins',
    opening: 'Hello,\n\nHappy New Year. I hope the first days feel unhurried, with room for your child to settle beside you.',
    context: 'A little of how this day is kept in the Philippines. Many families share Media Noche, a meal as the old year ends and the new one begins. The wish is for the people at the table, more than for a perfect year.',
    heart: 'A new year does not have to be a list of big promises. For a young child, it can simply be a fresh morning, a familiar voice, and the feeling that someone is glad they are here.',
  },
  {
    test: /mother/i,
    subject: 'A thank-you for Mommy, said with care',
    opening: 'Hello,\n\nHappy Mother’s Day. This note is for the one who already knows the small brave things her child did this week.',
    heart: 'Children learn kindness by being on the receiving end of it. A mother’s steady “I see you” is often the first classroom they ever have.',
  },
  {
    test: /father/i,
    subject: 'A thank-you for Daddy, said with care',
    opening: 'Hello,\n\nHappy Father’s Day. I hope there is a moment today when Daddy gets to hear how much he is loved, in a child’s own words.',
    heart: 'A father who listens, plays, and stays close teaches a child that the world is a safe place to try. That lesson lasts longer than any speech.',
  },
  {
    test: /grandparent|lolo|lola/i,
    marker: /Lolo and Lola/,
    subject: 'For the family that holds a child close',
    opening: 'Hello,\n\nI hope today gives your family a little time that does not have to be productive.',
    context: 'A little of how this day is kept in the Philippines. Grandparents are Lolo and Lola, and they are often the heart of the house. Grandparents’ Day is a thank-you for the stories, the patience, and the lap that already feels like home.',
    heart: 'Lolo, Lola, and the child in the middle of it all: that circle is already a classroom. Love, patience, and a story told again are how a child learns they belong.',
  },
  {
    test: /family day/i,
    marker: /not a national holiday/,
    subject: 'For the family that holds a child close',
    opening: 'Hello,\n\nI hope today gives your family a little time that does not have to be productive.',
    context: 'A little context, so this day is clear. This Family Day is one we set aside at RemoEd. It is not a national holiday. It is a pause to notice the family a child already has.',
    heart: 'Mommy, Daddy, Lolo, Lola, and the child in the middle of it all: that circle is already a classroom. Love, patience, and a story told again are how a child learns they belong.',
  },
  {
    test: /teacher/i,
    subject: 'A thank-you for the teacher who stays',
    opening: 'Hello,\n\nToday we are thinking of the real teachers who sit with one child and make the room feel safe.',
    heart: 'A good teacher does not rush a young learner. They wait for the word, smile when it comes, and try again when it does not. Children remember that feeling.',
  },
  {
    test: /children|child/i,
    marker: /National Children's Month/,
    subject: 'A celebration of the little learner in your home',
    opening: 'Hello,\n\nThis note is for the child in your house, and for you, the person who already cheers for the small wins.',
    context: 'A little background, in case this month is new to your family. In the Philippines, November is National Children’s Month. It honors every child’s right to be safe, to play, and to be heard. November 20 is Children’s Day, a date many countries keep for the same reason.',
    heart: 'Play, a new word, a question asked twice: these are not interruptions. They are how a child aged 3 to 6 learns that their voice matters.',
  },
  {
    test: /heart's day|hearts day|valentine/i,
    marker: /February 14/,
    subject: 'Kind words, kept close at home',
    opening: 'Hello,\n\nI hope someone in your home hears a kind sentence today, and gets to say one back.',
    context: 'A little of how this day is kept in the Philippines. February 14 is often called Heart’s Day. It is less about a grand gesture and more about kind words at home.',
    heart: 'Love at this age is practical. It is a snack shared, a hand held, a “you can try.” Those sentences are how trust is built, one ordinary day at a time.',
  },
  {
    test: /holy/i,
    marker: /Holy Week/,
    subject: 'A gentle note for a quiet week',
    opening: 'Hello,\n\nI hope this quieter week gives your family room to be together without hurrying.',
    context: 'A little background, in case this week is new to your family. In the Philippines, Holy Week is the quiet week before Easter. Many people travel home, daily work slows, and families remember the last days of Jesus with prayer and rest.',
    heart: 'Gratitude does not need a long speech. A child feels it when the people they love are peaceful, present, and glad to have them close.',
  },
  {
    test: /saints/i,
    marker: /Undas/,
    subject: 'A gentle note for a day of remembering',
    opening: 'Hello,\n\nI hope this quieter day gives your family room to be together without hurrying.',
    context: 'A little background, in case this day is new to your family. In the Philippines, November 1 is All Saints’ Day, the first of two days called Undas. Families visit the graves of relatives, bring flowers and candles, and children learn the names of the people who came before them.',
    heart: 'Remembering can be gentle. A child feels it when a name is said with love, and when the people they love are close.',
  },
  {
    test: /souls/i,
    marker: /Undas/,
    subject: 'A quiet thank-you for the family before us',
    opening: 'Hello,\n\nI hope this quieter day gives your family room to be together without hurrying.',
    context: 'A little background, in case this day is new to your family. November 2 is All Souls’ Day, the second day of Undas in the Philippines. Families stay near the resting places of loved ones and spend the day remembering them together.',
    heart: 'A child does not need every story at once. One name, said kindly, is enough to learn that they come from people who were loved.',
  },
  {
    test: /earth|summer/i,
    subject: 'Caring for the world, starting at home',
    opening: 'Hello,\n\nI hope there is a window open, or a little walk, or a plant your child has decided is theirs.',
    heart: 'Caring for the world starts small. Watering a plant, picking up a toy, noticing a bird: a child learns care by doing it beside someone patient.',
  },
  {
    test: /labor|work/i,
    subject: 'A thank-you for work done with care',
    opening: 'Hello,\n\nToday we are grateful for the people who work so a child can have a calm place to learn.',
    heart: 'Children notice effort. When they see an adult do a job with care, they learn that their own small efforts are worth something too.',
  },
  {
    test: /mental|calm|kindness/i,
    subject: 'A calm corner for you and your child',
    opening: 'Hello,\n\nI hope today has at least one unhurried minute for you and your little one.',
    heart: 'A child feels safe when a voice stays gentle. Calm is not the absence of noise. It is knowing someone will listen, even when the word comes out crooked.',
  },
];

const CLOSE = [
  'The free interactive trial, and the level assessment if you want it, are on the RemoEd App. No card is needed. They are not a live class.',
  'A live 25-minute one-on-one lesson with a real teacher is on a paid plan: RemoSpark, RemoSteady, RemoScholar, or RemoSummit.',
  'Whenever your family is ready, sign up for the free trial on the RemoEd App at remoedph.com. There is no rush. We are simply glad to walk with you.',
  'With care,',
  'RemoEd Support',
].join('\n\n');

function sceneFor(topic) {
  const theme = String(topic || '');
  return SCENES.find((item) => item.test.test(theme)) || null;
}

function letterNeedsHistory(topic, body) {
  const scene = sceneFor(topic);
  if (!scene || !scene.marker) return false;
  return !scene.marker.test(String(body || ''));
}

function warmParentLetter(topic) {
  const theme = String(topic || '').trim();
  const scene = sceneFor(theme) || {
    subject: 'A warm note for your family',
    opening: 'Hello,\n\nI hope your day has a soft place in it, the kind where a child can tell you about something small that mattered.',
    heart: theme
      ? 'Today we are holding this with you: ' + theme.replace(/[:]+/g, ',').replace(/\s+/g, ' ') + '. A child does not need that turned into a speech. They need to feel safe, noticed, and glad they tried.'
      : 'A child feels brave when the people at home are kind, steady, and glad they are here.',
  };
  const parts = [scene.opening, scene.context, scene.heart, CLOSE].filter(Boolean);
  return {
    subject: scene.subject,
    body: parts.join('\n\n'),
    variation: '',
  };
}

module.exports = { warmParentLetter, letterNeedsHistory };
