/**
 * Personality assessment rubric — keep in sync with public/js/assessment-answer-key-data.js
 */
const PERSONALITY_CATEGORIES = [
  'Interpersonal Communication',
  'Professionalism',
  'Cultural Awareness',
  'Technology Use',
  'Student Engagement'
];

const PERSONALITY_RUBRIC = [
  {
    title: 'Section 1',
    storageKey: 'section-0',
    items: [
      { text: 'I use games or interactive activities to keep learners motivated.', correct: 'Student Engagement' },
      { text: 'A student makes repeated mistakes. I give supportive feedback and model the correct answer calmly.', correct: 'Interpersonal Communication' },
      { text: 'A technical issue happens mid-class. I follow RemoEd procedures and keep students calm while fixing it.', correct: 'Professionalism' },
      { text: 'I avoid stereotypes and model respectful, inclusive language at all times.', correct: 'Cultural Awareness' },
      { text: 'I can confidently use RemoEd’s online platform without delays.', correct: 'Technology Use' }
    ]
  },
  {
    title: 'Section 2',
    storageKey: 'section-1',
    items: [
      { text: 'I choose examples and topics that feel inclusive for learners from different backgrounds.', correct: 'Cultural Awareness' },
      { text: 'I use technology to make activities interactive and engaging.', correct: 'Technology Use' },
      { text: 'A young learner is shy and avoids speaking. I use gentle encouragement and simple prompts to build their confidence.', correct: 'Interpersonal Communication' },
      { text: 'I build confidence by praising effort and progress, not just correct answers.', correct: 'Student Engagement' },
      { text: 'A schedule change is announced. I respond promptly and confirm my availability professionally.', correct: 'Professionalism' }
    ]
  },
  {
    title: 'Section 3',
    storageKey: 'section-2',
    items: [
      { text: 'I arrive on time and have my materials ready before class begins.', correct: 'Professionalism' },
      { text: 'I maintain a calm and respectful tone even when students are noisy or distracted.', correct: 'Student Engagement' },
      { text: 'If a tool fails, I troubleshoot basic issues calmly and continue the lesson.', correct: 'Technology Use' },
      { text: 'I adjust greetings and classroom routines to be culturally sensitive.', correct: 'Cultural Awareness' },
      { text: 'I use age-appropriate language and tone so children can follow the lesson.', correct: 'Interpersonal Communication' }
    ]
  },
  {
    title: 'Section 4',
    storageKey: 'section-3',
    items: [
      { text: 'When needed, I ask for technical support using approved channels.', correct: 'Technology Use' },
      { text: 'A learner asks a personal question. I redirect politely back to the lesson topic.', correct: 'Interpersonal Communication' },
      { text: 'When I need help, I contact support or use approved tools to resolve the issue quickly.', correct: 'Professionalism' },
      { text: 'A student loses focus during class. I use a quick interactive task to re-engage them.', correct: 'Student Engagement' },
      { text: 'A student uses a term that might be offensive. I correct it gently and explain why.', correct: 'Cultural Awareness' }
    ]
  },
  {
    title: 'Section 5',
    storageKey: 'section-4',
    items: [
      { text: 'A student seems confused by my instructions. I rephrase clearly and check understanding without frustration.', correct: 'Interpersonal Communication' },
      { text: 'A student shares a cultural holiday. I respond respectfully and invite them to share briefly.', correct: 'Cultural Awareness' },
      { text: 'I encourage participation with gentle guidance instead of pressuring students.', correct: 'Student Engagement' },
      { text: 'I follow RemoEd guidelines consistently, even when no one is watching.', correct: 'Professionalism' },
      { text: 'I use tools like annotations or breakout rooms smoothly to support learning.', correct: 'Technology Use' }
    ]
  }
];

function isLegacyPersonalityAnswers(answers) {
  if (!answers || typeof answers !== 'object') return false;
  const keys = Object.keys(answers);
  if (!keys.length) return false;
  return PERSONALITY_CATEGORIES.includes(keys[0]);
}

function getSectionAnswerValues(answers, section, sectionIndex) {
  const storageKey = section.storageKey || `section-${sectionIndex}`;
  if (Array.isArray(answers[storageKey])) return answers[storageKey];
  if (section.category && Array.isArray(answers[section.category])) return answers[section.category];
  return [];
}

function computePersonalityCategoryScores(answers) {
  const categoryScores = {};
  PERSONALITY_CATEGORIES.forEach((cat) => {
    categoryScores[cat] = { correct: 0, total: 0 };
  });

  if (isLegacyPersonalityAnswers(answers)) {
    PERSONALITY_CATEGORIES.forEach((category) => {
      const items = Array.isArray(answers[category]) ? answers[category] : [];
      categoryScores[category].total = items.length;
      items.forEach((val) => {
        if (val === category) categoryScores[category].correct += 1;
      });
    });
    return categoryScores;
  }

  PERSONALITY_RUBRIC.forEach((section, sectionIndex) => {
    const sectionAnswers = getSectionAnswerValues(answers, section, sectionIndex);
    section.items.forEach((item, qIndex) => {
      const selected = sectionAnswers[qIndex];
      categoryScores[item.correct].total += 1;
      if (selected === item.correct) categoryScores[item.correct].correct += 1;
    });
  });
  return categoryScores;
}

function scorePersonalityAnswers(answers) {
  let total = 0;
  let score = 0;

  if (isLegacyPersonalityAnswers(answers)) {
    PERSONALITY_CATEGORIES.forEach((category) => {
      const items = Array.isArray(answers[category]) ? answers[category] : [];
      items.forEach((val) => {
        total += 1;
        if (val === category) score += 1;
      });
    });
    return { score, total, categoryScores: computePersonalityCategoryScores(answers) };
  }

  PERSONALITY_RUBRIC.forEach((section, sectionIndex) => {
    const sectionAnswers = getSectionAnswerValues(answers, section, sectionIndex);
    section.items.forEach((item, qIndex) => {
      total += 1;
      if (sectionAnswers[qIndex] === item.correct) score += 1;
    });
  });

  return {
    score,
    total,
    categoryScores: computePersonalityCategoryScores(answers)
  };
}

module.exports = {
  PERSONALITY_CATEGORIES,
  PERSONALITY_RUBRIC,
  isLegacyPersonalityAnswers,
  computePersonalityCategoryScores,
  scorePersonalityAnswers
};
