'use strict';

const SCENES = [
  {
    test: /bonifacio/i,
    subject: 'A quiet kind of courage, from our family to yours',
    opening: 'Hello,\n\nHappy Bonifacio Day. I hope this finds you with your little one nearby, maybe in the middle of a small adventure that only a parent would notice.',
    heart: 'We often picture heroes as loud and far away. At home, courage is quieter. It is a child trying a new English word for the first time, sharing a smile with a friend, or looking after someone smaller. Andres Bonifacio cared for the people around him. That same care can live in an ordinary afternoon, in the way a family looks after one another.',
  },
  {
    test: /rizal/i,
    subject: 'A love of learning, passed gently at home',
    opening: 'Hello,\n\nHappy Rizal Day. I hope the house is calm enough for a child to ask one more question.',
    heart: 'Jose Rizal loved learning, and he loved home. A young child does not need a lecture about that. They need someone who is glad when they try a word, look at a picture, and stay a little longer.',
  },
  {
    test: /valor|heroes|independence/i,
    subject: 'Brave hearts are often gentle ones',
    opening: 'Hello,\n\nI hope today has a little room in it for your family, even if the calendar is full.',
    heart: 'Courage in a small child rarely looks like a parade. It looks like speaking up, waiting a turn, or being kind when it would be easier to walk away. Those are the moments worth noticing.',
  },
  {
    test: /christmas/i,
    subject: 'Warmth for your home this Christmas',
    opening: 'Hello,\n\nMerry Christmas. I hope your home has a soft light in it, and a child who feels glad to be there.',
    heart: 'The best part of this season is rarely the noise. It is the people in the room, the stories told twice, and the way a little one leans in when they feel safe.',
  },
  {
    test: /new year/i,
    subject: 'A warm hello as the year begins',
    opening: 'Hello,\n\nHappy New Year. I hope the first days feel unhurried, with room for your child to settle beside you.',
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
    test: /grandparent|family day|lolo|lola/i,
    subject: 'For the family that holds a child close',
    opening: 'Hello,\n\nI hope today gives your family a little time that does not have to be productive.',
    heart: 'Lolo, Lola, Mommy, Daddy, and the child in the middle of it all: that circle is already a classroom. Love, patience, and a story told again are how a child learns they belong.',
  },
  {
    test: /teacher/i,
    subject: 'A thank-you for the teacher who stays',
    opening: 'Hello,\n\nToday we are thinking of the real teachers who sit with one child and make the room feel safe.',
    heart: 'A good teacher does not rush a young learner. They wait for the word, smile when it comes, and try again when it does not. Children remember that feeling.',
  },
  {
    test: /children|child/i,
    subject: 'A celebration of the little learner in your home',
    opening: 'Hello,\n\nThis note is for the child in your house, and for you, the person who already cheers for the small wins.',
    heart: 'Play, a new word, a question asked twice: these are not interruptions. They are how a child aged 3 to 6 learns that their voice matters.',
  },
  {
    test: /heart|love/i,
    subject: 'Kind words, kept close at home',
    opening: 'Hello,\n\nI hope someone in your home hears a kind sentence today, and gets to say one back.',
    heart: 'Love at this age is practical. It is a snack shared, a hand held, a “you can try.” Those sentences are how trust is built, one ordinary day at a time.',
  },
  {
    test: /holy|saints|souls/i,
    subject: 'A gentle note for a quiet day',
    opening: 'Hello,\n\nI hope this quieter day gives your family room to be together without hurrying.',
    heart: 'Gratitude does not need a long speech. A child feels it when the people they love are peaceful, present, and glad to have them close.',
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
  'If your child is between 3 and 6, a RemoEd class is one gentle place to practice that. They sit with one real teacher for 25 minutes. The class is live. Remo, Ed, Sofie, and Teacher Grace keep the lesson warm, so a new word can come out without a crowd watching.',
  'Whenever your family is ready, a free trial is waiting on the Remo App at remoedph.com. There is no rush. We are simply glad to walk with you.',
  'With care,',
  'RemoEd Support',
].join('\n\n');

function warmParentLetter(topic) {
  const theme = String(topic || '').trim();
  const scene = SCENES.find((item) => item.test.test(theme)) || {
    subject: 'A warm note for your family',
    opening: 'Hello,\n\nI hope your day has a soft place in it, the kind where a child can tell you about something small that mattered.',
    heart: theme
      ? 'Today we are holding this with you: ' + theme.replace(/[:]+/g, ',').replace(/\s+/g, ' ') + '. A child does not need that turned into a speech. They need to feel safe, noticed, and glad they tried.'
      : 'A child feels brave when the people at home are kind, steady, and glad they are here.',
  };
  return {
    subject: scene.subject,
    body: scene.opening + '\n\n' + scene.heart + '\n\n' + CLOSE,
    variation: '',
  };
}

module.exports = { warmParentLetter };
