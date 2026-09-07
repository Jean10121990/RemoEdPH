/**
 * Enhances existing Remo AI chatbot instances with RemoAIEngine (zero-token).
 * Load after remo-ai-engine.js. Patches window.chatbot.processMessage when ready.
 */
(function () {
  'use strict';

  function startTourSoon() {
    setTimeout(function () {
      if (typeof teacherTour !== 'undefined' && teacherTour && typeof teacherTour.startTour === 'function') {
        teacherTour.startTour();
      } else if (window.TeacherTour && typeof window.TeacherTour.startTour === 'function') {
        window.TeacherTour.startTour();
      }
    }, 400);
  }

  function enhanceBot(bot) {
    if (!bot || bot.__remoSmart || typeof bot.processMessage !== 'function') return false;
    if (!window.RemoAIEngine || typeof window.RemoAIEngine.answer !== 'function') return false;

    bot.__lastIntent = bot.__lastIntent || null;
    bot.__remoSmart = true;

    bot.processMessage = async function (userMessage) {
      try {
        if (typeof this.showTyping === 'function') this.showTyping();
        await new Promise(function (resolve) {
          setTimeout(resolve, 380 + Math.floor(Math.random() * 320));
        });
        if (typeof this.hideTyping === 'function') this.hideTyping();

        var result = window.RemoAIEngine.answer(userMessage, {
          path: window.location.pathname,
          lastIntent: this.__lastIntent,
        });
        this.__lastIntent = result.intentId || null;

        if (result.startTour) {
          if (typeof this.addBotMessage === 'function') {
            this.addBotMessage(result.text || 'Starting the tour…');
          }
          startTourSoon();
          return;
        }

        if (typeof this.addBotMessage === 'function') {
          this.addBotMessage(result.text, result.buttons || []);
        }
      } catch (err) {
        console.error('Remo AI enhance error:', err);
        if (typeof this.hideTyping === 'function') this.hideTyping();
        if (typeof this.addBotMessage === 'function') {
          this.addBotMessage(
            "Sorry — I hit a snag answering that. Try Troubleshooting, Schedule, or Payslip from the quick actions."
          );
        }
      }
    };

    // Soft contextual tip once per page load (does not spam if messages already exist)
    try {
      if (!sessionStorage.getItem('remo_ai_ctx_' + location.pathname)) {
        sessionStorage.setItem('remo_ai_ctx_' + location.pathname, '1');
      }
    } catch (e) {
      /* ignore */
    }

    return true;
  }

  function tryEnhance() {
    var bot = window.chatbot;
    if (bot) return enhanceBot(bot);
    return false;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (tryEnhance() || ++tries > 50) clearInterval(timer);
  }, 100);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryEnhance);
  } else {
    tryEnhance();
  }
})();
