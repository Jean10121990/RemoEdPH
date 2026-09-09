/**
 * Shared badge icon glyphs (emoji) + tiny helpers for RemoEdKids badges.
 */
(function (global) {
  var ICONS = {
    'book-open': '📖',
    sparkle: '✨',
    book: '📚',
    pencil: '✏️',
    abc: '🔤',
    mic: '🎤',
    sun: '☀️',
    heart: '💖',
    handshake: '🤝',
    ear: '👂',
    clock: '⏰',
    trophy: '🏆',
    star: '⭐',
  };

  function iconFor(name) {
    return ICONS[name] || ICONS.star;
  }

  function burstConfetti(root) {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var host = document.createElement('div');
      host.className = 'sb-confetti';
      host.setAttribute('aria-hidden', 'true');
      var colors = ['#00aeef', '#38bdf8', '#fbbf24', '#34d399', '#f472b6', '#a78bfa'];
      for (var i = 0; i < 28; i++) {
        var bit = document.createElement('i');
        bit.style.left = Math.random() * 100 + '%';
        bit.style.background = colors[i % colors.length];
        bit.style.animationDelay = Math.random() * 0.4 + 's';
        bit.style.width = 6 + Math.random() * 8 + 'px';
        bit.style.height = 6 + Math.random() * 8 + 'px';
        host.appendChild(bit);
      }
      (root || document.body).appendChild(host);
      setTimeout(function () {
        try {
          host.remove();
        } catch (e) {}
      }, 1800);
    } catch (e) {}
  }

  global.RemoedStudentBadges = {
    iconFor: iconFor,
    burstConfetti: burstConfetti,
  };
})(typeof window !== 'undefined' ? window : globalThis);
