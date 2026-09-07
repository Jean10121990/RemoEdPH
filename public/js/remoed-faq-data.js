/**
 * RemoEd FAQ — single source of truth for faq.html + Remo AI Assistant.
 * Update questions/answers here; the FAQ page and chatbot pick them up automatically.
 */
(function (global) {
  'use strict';

  var RemoedFaqData = {
    title: 'RemoEd: Frequently Asked Questions (FAQ)',
    updatedLabel: 'September 2026',
    intro:
      'Welcome to the RemoEd FAQ. This guide covers who we are, our values, curriculum tracks, lesson flow, and enrollment plans. Content can be updated anytime in js/remoed-faq-data.js.',

    sections: [
      {
        id: 'general',
        title: '1. General Information',
        items: [
          {
            id: 'what-is-remoed',
            q: 'What is RemoEd?',
            keywords: [
              'what is remoed',
              'about remoed',
              'remoedph',
              'what is remoedph',
              'who is remoed',
              'online esl',
            ],
            weight: 4,
            a:
              'RemoEdPH is a Filipino online ESL (English as a Second Language) start-up initially targeted for young learners ages 3–6. The platform delivers high-quality education to Asian markets, including Taiwan, Japan, South Korea, and Vietnam.\n\n' +
              'Its mission is to provide an accessible, God-centered online education that builds English proficiency, moral integrity, and environmental stewardship.',
          },
          {
            id: 'mascots',
            q: 'Who are the characters and mascots of RemoEd?',
            keywords: [
              'mascot',
              'mascots',
              'characters',
              'who is ed',
              'who is remo',
              'sofie',
              'grace',
              'eco-robot',
            ],
            weight: 4,
            a:
              'To make learning interactive and fun, RemoEd uses several mascots:\n\n' +
              '• **Ed** — A young boy who is the main star and represents the students.\n' +
              '• **Remo** — An Eco-Robot who accompanies Ed on his adventures throughout the lessons.\n' +
              '• **Sofie** — A young, friendly girl who enjoys telling stories and making friends.\n' +
              '• **Grace** — A teacher character who educates Ed and represents RemoEd’s real-life teachers utilizing the HEART pedagogy.',
          },
        ],
      },
      {
        id: 'culture',
        title: '2. Culture and Core Values',
        items: [
          {
            id: 'principles',
            q: 'What are the foundational principles of RemoEd?',
            keywords: [
              'core values',
              'foundational principles',
              'christian',
              'worldview',
              'servant-leader',
              'servant leader',
              'culture',
            ],
            weight: 4,
            a:
              'RemoEd is built upon a Christian worldview. The institution upholds the biblical distinction of gender as male and female across its corporate conduct, classroom instruction, and curriculum.\n\n' +
              'Teachers act as **servant-leaders** who lead with humility and prioritize their students’ best interests above themselves.',
          },
          {
            id: 'heart',
            q: 'What is the H.E.A.R.T. Framework?',
            keywords: [
              'heart',
              'h.e.a.r.t',
              'heart framework',
              'hospitality',
              'excellence in learning',
              'affectionate',
              'togetherness',
            ],
            weight: 5,
            a:
              'Our educators teach using the **H.E.A.R.T.** framework to nurture character and confidence:\n\n' +
              '• **H — Hospitality & Honor** — Creating a warm, welcoming environment with a gentle spirit.\n' +
              '• **E — Excellence in Learning** — Pursuing high standards of global English proficiency with creative, inclusive methods.\n' +
              '• **A — Affectionate Relationships** — Building trust with students through patience and empathy.\n' +
              '• **R — Respectful Community** — Addressing conflicts with integrity, fairness, and reconciliation.\n' +
              '• **T — Togetherness Across Cultures** — Encouraging cross-cultural curiosity and reminding students that English connects the world.',
          },
        ],
      },
      {
        id: 'curriculum',
        title: '3. Curriculum and Learning Experience',
        items: [
          {
            id: 'levels',
            q: 'What are the different Curriculum Levels?',
            keywords: [
              'curriculum levels',
              'little seeds',
              'sprouts',
              'saplings',
              'young steward',
              'level 1',
              'level 2',
              'level 3',
              'level 4',
              'age 3',
              'age 4',
              'age 5',
              'age 6',
            ],
            weight: 4,
            a:
              'RemoEd structures its curriculum into four developmental stages:\n\n' +
              '• **Level 1 (Little Seeds — Age 3)** — A–Z phonics, single-word vocabulary, tracing lines, and early environmental awareness (e.g. “Bye-bye screen”, nature appreciation).\n' +
              '• **Level 2 (Sprouts — Age 4)** — Tracing full letters, simple identity phrases (“I am…”), basic energy saving, and days of the week.\n' +
              '• **Level 3 (Saplings — Age 5)** — Phonics blending, writing first names, reading short sentences, sorting trash, and anti-bullying awareness.\n' +
              '• **Level 4 (Young Steward — Age 6)** — Action verbs, recycling routines, places and nouns, and deeper reading with CVC words.',
          },
          {
            id: 'lesson-flow',
            q: 'How is a typical lesson structured?',
            keywords: [
              'typical lesson',
              'lesson flow',
              'young kids lesson',
              'older kids lesson',
              'mini-dialogue',
              'warmup song',
            ],
            weight: 4,
            a:
              'Lessons are tailored to the student’s level:\n\n' +
              '**Levels 0–2 (younger kids)**\n' +
              'Warm-up song or video → introduce 3–5 vocabulary words → picture drills → 2-line mini-dialogue → quick game/quiz → goodbye review.\n\n' +
              '**Levels 3–6 (older kids)**\n' +
              'Interactive warm-up question → reading passage → 5–8 new words → grammar focus → speaking/roleplay → short writing → review and reward.\n\n' +
              'Live RemoEd classes are typically **25 minutes** — keep energy high and one clear goal per session.',
          },
          {
            id: 'parents-students',
            q: 'What are the guidelines for Parents and Students?',
            keywords: [
              'parents',
              'parent guidelines',
              'student guidelines',
              'expectations',
              'classroom conduct',
            ],
            weight: 3,
            a:
              '**Parents** are asked to partner with teachers to foster a positive environment, encourage respect for all cultural backgrounds, support their child with kindness, and celebrate progress and effort.\n\n' +
              '**Students** are expected to be kind and respectful, listen carefully, ask questions, and have fun exploring new things.',
          },
        ],
      },
      {
        id: 'plans',
        title: '4. Subscription Plans',
        items: [
          {
            id: 'plans-pricing',
            q: 'What are the available enrollment plans?',
            keywords: [
              'subscription',
              'plans',
              'pricing',
              'enrollment',
              'remospark',
              'remosteady',
              'remoscholar',
              'remosummit',
              'how much',
              'tuition',
              'bundle',
            ],
            weight: 5,
            a:
              'RemoEd offers four flexible learning bundles (prices in USD; checkout may show PHP estimates):\n\n' +
              '• **RemoSpark (Starter)** — 1 month plan · **22 lessons** · valid 3 months · **$154.00**\n' +
              '• **RemoSteady (Progress)** — 3 months · **66 lessons** · valid 6 months · **$399.00**\n' +
              '• **RemoScholar (Mastery)** — 6 months · **132 lessons** · valid 12 months · **$798.00**\n' +
              '• **RemoSummit (Ultimate)** — 12 months · **264 lessons** · valid 24 months · **$1,596.00**\n\n' +
              'Families can review live plan cards on the RemoEd home page (#plans) or during student registration.',
          },
        ],
      },
    ],
  };

  global.RemoedFaqData = RemoedFaqData;
})(typeof window !== 'undefined' ? window : globalThis);
