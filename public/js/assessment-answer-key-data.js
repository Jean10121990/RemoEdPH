/**
 * Canonical skill & personality assessment questions + answer-key helpers.
 * Used by admin trainer reference page and teacher assessment review.
 */
(function (global) {
    'use strict';

    var GRAMMAR_QUESTIONS = [
        { question: 'She ____ to school every day.', options: ['go', 'goes', 'gone', 'going'], correctIndex: 1 },
        { question: 'If I ____ more time, I would travel.', options: ['have', 'had', 'having', 'will have'], correctIndex: 1 },
        { question: 'They have lived here ____ 2018.', options: ['for', 'since', 'during', 'from'], correctIndex: 1 },
        { question: 'The book was ____ by the teacher.', options: ['write', 'wrote', 'written', 'writing'], correctIndex: 2 },
        { question: 'Neither the students nor the teacher ____ late.', options: ['are', 'is', 'were', 'be'], correctIndex: 1 }
    ];

    var VOCABULARY_QUESTIONS = [
        { question: 'Choose the synonym of “assist”.', options: ['ignore', 'help', 'refuse', 'avoid'], correctIndex: 1 },
        { question: 'Choose the best meaning of “accurate”.', options: ['exact', 'late', 'noisy', 'weak'], correctIndex: 0 },
        { question: 'A “rapid” change means a change that is ____.', options: ['slow', 'quick', 'careful', 'silent'], correctIndex: 1 },
        { question: 'The word “expand” is closest in meaning to ____.', options: ['reduce', 'enlarge', 'hide', 'end'], correctIndex: 1 },
        { question: '“Comprehend” means ____.', options: ['understand', 'forget', 'repeat', 'argue'], correctIndex: 0 }
    ];

    var PERSONALITY_CATEGORIES = [
        'Interpersonal Communication',
        'Professionalism',
        'Cultural Awareness',
        'Technology Use',
        'Student Engagement'
    ];

    var PERSONALITY_RUBRIC = [
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

    var HEART_METERS = [
        { label: 'H – Hospitality', category: 'Interpersonal Communication' },
        { label: 'E – Excellence', category: 'Professionalism' },
        { label: 'A – Affection', category: 'Student Engagement' },
        { label: 'R – Respect', category: 'Cultural Awareness' },
        { label: 'T – Togetherness', category: 'Technology Use' }
    ];

    var HONOR_METERS = [
        { label: 'Avoid False Witness (Honesty)', category: 'Professionalism' },
        { label: 'No Gossip or Politics', category: 'Cultural Awareness' },
        { label: 'Integrity & Speech', category: 'Interpersonal Communication' },
        { label: 'Good Attitude (Anti-Greed)', category: 'Student Engagement' },
        { label: 'Financial Stewardship', category: 'Technology Use' }
    ];

    var PRONUNCIATION_WORDS = [
        'pronunciation', 'thorough', 'through', 'schedule', 'comfortable',
        'environment', 'opportunity', 'necessary', 'separate', 'definitely'
    ];

    var LISTENING_SENTENCE = 'Learning English takes patience, practice, and a positive mindset.';

    var COMMITMENT_PASS_PERCENT = 60;

    function getGrammarCorrectIndices() {
        return GRAMMAR_QUESTIONS.map(function (q) { return q.correctIndex; });
    }

    function getVocabularyCorrectIndices() {
        return VOCABULARY_QUESTIONS.map(function (q) { return q.correctIndex; });
    }

    function normalizeAnswerValues(answers) {
        if (!answers) return [];
        if (Array.isArray(answers)) return answers;
        return Object.keys(answers)
            .sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (key) { return answers[key]; });
    }

    function optionLabel(options, index) {
        if (!options || index === null || index === undefined || index === '') return '—';
        var idx = Number(index);
        if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) return String(index);
        var letters = ['A', 'B', 'C', 'D'];
        return (letters[idx] || String(idx + 1)) + '. ' + options[idx];
    }

    function analyzeMcqAnswers(questions, answers) {
        var values = normalizeAnswerValues(answers);
        var rows = [];
        questions.forEach(function (q, idx) {
            var selected = values[idx];
            var correct = q.correctIndex;
            var isCorrect = Number(selected) === Number(correct);
            rows.push({
                number: idx + 1,
                question: q.question,
                selectedIndex: selected,
                selectedLabel: optionLabel(q.options, selected),
                correctIndex: correct,
                correctLabel: optionLabel(q.options, correct),
                isCorrect: isCorrect
            });
        });
        return rows;
    }

    function analyzeGrammarAnswers(answers) {
        return analyzeMcqAnswers(GRAMMAR_QUESTIONS, answers);
    }

    function analyzeVocabularyAnswers(answers) {
        return analyzeMcqAnswers(VOCABULARY_QUESTIONS, answers);
    }

    function isLegacyPersonalityAnswers(answers) {
        if (!answers || typeof answers !== 'object') return false;
        var keys = Object.keys(answers);
        if (!keys.length) return false;
        return PERSONALITY_CATEGORIES.indexOf(keys[0]) !== -1;
    }

    function getSectionAnswerValues(answers, section, sectionIndex) {
        var storageKey = section.storageKey || ('section-' + sectionIndex);
        if (Array.isArray(answers[storageKey])) return answers[storageKey];
        if (section.category && Array.isArray(answers[section.category])) return answers[section.category];
        return [];
    }

    function computePersonalityCategoryScores(answers) {
        var categoryScores = {};
        PERSONALITY_CATEGORIES.forEach(function (cat) {
            categoryScores[cat] = { correct: 0, total: 0 };
        });

        if (isLegacyPersonalityAnswers(answers)) {
            PERSONALITY_CATEGORIES.forEach(function (category) {
                var items = Array.isArray(answers[category]) ? answers[category] : [];
                categoryScores[category].total = items.length;
                items.forEach(function (val) {
                    if (val === category) categoryScores[category].correct += 1;
                });
            });
            return categoryScores;
        }

        PERSONALITY_RUBRIC.forEach(function (section, sectionIndex) {
            var sectionAnswers = getSectionAnswerValues(answers, section, sectionIndex);
            section.items.forEach(function (item, qIndex) {
                var selected = sectionAnswers[qIndex];
                categoryScores[item.correct].total += 1;
                if (selected === item.correct) categoryScores[item.correct].correct += 1;
            });
        });
        return categoryScores;
    }

    function scorePersonalityAnswers(answers) {
        var total = 0;
        var score = 0;

        if (isLegacyPersonalityAnswers(answers)) {
            PERSONALITY_CATEGORIES.forEach(function (category) {
                var items = Array.isArray(answers[category]) ? answers[category] : [];
                items.forEach(function (val) {
                    total += 1;
                    if (val === category) score += 1;
                });
            });
            return { score: score, total: total, categoryScores: computePersonalityCategoryScores(answers) };
        }

        PERSONALITY_RUBRIC.forEach(function (section, sectionIndex) {
            var sectionAnswers = getSectionAnswerValues(answers, section, sectionIndex);
            section.items.forEach(function (item, qIndex) {
                total += 1;
                if (sectionAnswers[qIndex] === item.correct) score += 1;
            });
        });

        return {
            score: score,
            total: total,
            categoryScores: computePersonalityCategoryScores(answers)
        };
    }

    function analyzePersonalityAnswers(answers) {
        if (!answers || typeof answers !== 'object') return [];
        var rows = [];
        PERSONALITY_RUBRIC.forEach(function (section, sectionIndex) {
            var sectionAnswers = getSectionAnswerValues(answers, section, sectionIndex);
            section.items.forEach(function (item, qIndex) {
                var selected = sectionAnswers[qIndex];
                var isCorrect = selected === item.correct;
                rows.push({
                    number: (sectionIndex + 1) + '.' + (qIndex + 1),
                    section: section.title || ('Section ' + (sectionIndex + 1)),
                    scenario: item.text,
                    selected: selected || '—',
                    correct: item.correct,
                    isCorrect: isCorrect
                });
            });
        });
        return rows;
    }

    function countWrong(rows) {
        return rows.filter(function (row) { return !row.isCorrect; }).length;
    }

    function escHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderWrongRowsHtml(rows, type) {
        var wrong = rows.filter(function (row) { return !row.isCorrect; });
        if (!wrong.length) {
            return '<p class="answer-review-all-correct">All answers correct.</p>';
        }
        var html = '<div class="answer-review-wrong-list">';
        wrong.forEach(function (row) {
            if (type === 'personality') {
                html += '<div class="answer-review-item answer-review-item--wrong">' +
                    '<div class="answer-review-q"><strong>Q' + escHtml(row.number) + '</strong> ' + escHtml(row.scenario) + '</div>' +
                    '<div class="answer-review-meta"><span class="answer-review-picked">Picked: <strong>' + escHtml(row.selected) + '</strong></span>' +
                    '<span class="answer-review-correct">Correct: <strong>' + escHtml(row.correct) + '</strong></span></div>' +
                    '</div>';
            } else {
                html += '<div class="answer-review-item answer-review-item--wrong">' +
                    '<div class="answer-review-q"><strong>Q' + row.number + '.</strong> ' + escHtml(row.question) + '</div>' +
                    '<div class="answer-review-meta"><span class="answer-review-picked">Picked: <strong>' + escHtml(row.selectedLabel) + '</strong></span>' +
                    '<span class="answer-review-correct">Correct: <strong>' + escHtml(row.correctLabel) + '</strong></span></div>' +
                    '</div>';
            }
        });
        html += '</div>';
        return html;
    }

    function renderMcqWrongSection(questions, answers, title, type) {
        var rows = analyzeMcqAnswers(questions, answers);
        if (!rows.length) return '';
        var wrongCount = countWrong(rows);
        if (!wrongCount) return '';
        return '<div class="answer-review-section"><h5>' + escHtml(title) + ' (' + wrongCount + ' wrong)</h5>' +
            renderWrongRowsHtml(rows, type) + '</div>';
    }

    function renderPersonalityWrongSection(answers) {
        var rows = analyzePersonalityAnswers(answers);
        if (!rows.length) return '';
        var wrongCount = countWrong(rows);
        if (!wrongCount) return '';
        return '<div class="answer-review-section"><h5>Personality (' + wrongCount + ' wrong)</h5>' +
            renderWrongRowsHtml(rows, 'personality') + '</div>';
    }

    function renderTeacherReviewBlock(opts) {
        opts = opts || {};
        var grammarRows = analyzeGrammarAnswers(opts.grammarAnswers);
        var vocabularyRows = analyzeVocabularyAnswers(opts.vocabularyAnswers);
        var personalityRows = analyzePersonalityAnswers(opts.personalityAnswers);
        var grammarWrong = countWrong(grammarRows);
        var vocabularyWrong = countWrong(vocabularyRows);
        var personalityWrong = countWrong(personalityRows);

        if (!grammarRows.length && !vocabularyRows.length && !personalityRows.length) {
            return '';
        }

        var html = '<div class="answer-review-block">' +
            '<h4>Answer review (trainer reference)</h4>' +
            '<p class="answer-review-note">Shows incorrect grammar, vocabulary, and personality choices so you can coach the teacher.</p>';

        if (grammarRows.length) {
            html += '<div class="answer-review-section"><h5>Grammar (' + grammarWrong + ' wrong)</h5>' +
                renderWrongRowsHtml(grammarRows, 'grammar') + '</div>';
        }
        if (vocabularyRows.length) {
            html += '<div class="answer-review-section"><h5>Vocabulary (' + vocabularyWrong + ' wrong)</h5>' +
                renderWrongRowsHtml(vocabularyRows, 'vocabulary') + '</div>';
        }
        if (personalityRows.length) {
            html += '<div class="answer-review-section"><h5>Personality (' + personalityWrong + ' wrong)</h5>' +
                renderWrongRowsHtml(personalityRows, 'personality') + '</div>';
        }

        html += '<p class="answer-review-foot"><a href="admin-assessment-answer-key.html" target="_blank" rel="noopener">Open full answer key</a></p></div>';
        return html;
    }

    global.AssessmentAnswerKey = {
        GRAMMAR_QUESTIONS: GRAMMAR_QUESTIONS,
        VOCABULARY_QUESTIONS: VOCABULARY_QUESTIONS,
        PERSONALITY_CATEGORIES: PERSONALITY_CATEGORIES,
        PERSONALITY_RUBRIC: PERSONALITY_RUBRIC,
        HEART_METERS: HEART_METERS,
        HONOR_METERS: HONOR_METERS,
        PRONUNCIATION_WORDS: PRONUNCIATION_WORDS,
        LISTENING_SENTENCE: LISTENING_SENTENCE,
        COMMITMENT_PASS_PERCENT: COMMITMENT_PASS_PERCENT,
        getGrammarCorrectIndices: getGrammarCorrectIndices,
        getVocabularyCorrectIndices: getVocabularyCorrectIndices,
        analyzeGrammarAnswers: analyzeGrammarAnswers,
        analyzeVocabularyAnswers: analyzeVocabularyAnswers,
        analyzePersonalityAnswers: analyzePersonalityAnswers,
        computePersonalityCategoryScores: computePersonalityCategoryScores,
        scorePersonalityAnswers: scorePersonalityAnswers,
        isLegacyPersonalityAnswers: isLegacyPersonalityAnswers,
        renderMcqWrongSection: renderMcqWrongSection,
        renderPersonalityWrongSection: renderPersonalityWrongSection,
        renderTeacherReviewBlock: renderTeacherReviewBlock,
        escHtml: escHtml,
        optionLabel: optionLabel
    };
})(typeof window !== 'undefined' ? window : this);
