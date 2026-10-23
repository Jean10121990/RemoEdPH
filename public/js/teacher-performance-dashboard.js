(function () {
  let payload = null;
  let filter = 'all';
  let loading = false;

  function token() {
    if (typeof getTeacherAuthToken === 'function') return getTeacherAuthToken();
    if (window.RemoedAuthToken && typeof RemoedAuthToken.getTeacherToken === 'function') {
      return RemoedAuthToken.getTeacherToken() || '';
    }
    return localStorage.getItem('remoed_teacher_token') || '';
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stars(n) {
    const count = Math.max(0, Math.min(5, Number(n) || 0));
    return '★★★★★'.slice(0, count) + '☆☆☆☆☆'.slice(0, 5 - count);
  }

  function dateLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function reviewGroup(row) {
    const rating = Number(row.rating) || 0;
    if (rating >= 4) return 'positive';
    if (rating >= 1) return 'growth';
    return 'other';
  }

  function render() {
    const root = document.getElementById('tpd-root');
    if (!root || !payload) return;
    const q = payload.quality || { score: 0, band: 'Getting started' };
    const k = payload.kpis || {};
    const rank = payload.rank || {};
    const badges = Array.isArray(payload.badges) ? payload.badges : [];
    const reviews = (Array.isArray(payload.reviews) ? payload.reviews : []).filter((row) => {
      if (filter === 'all') return true;
      return reviewGroup(row) === filter;
    });
    const ratingText = k.ratingCount
      ? esc(Number(k.averageRating).toFixed(2)) + ' / 5'
      : 'No ratings yet';
    const positiveText = k.ratingCount ? esc(k.positivePercent) + '%' : 'No ratings yet';

    root.innerHTML =
      '<div class="tpd-banner">' + esc(rank.banner || 'Complete lessons this month to join the RemoEd Teacher Leaderboard.') + '</div>' +
      '<div class="tpd-score">' +
        '<div class="tpd-meter" style="--score:' + esc(q.score || 0) + '" aria-label="Quality score ' + esc(q.score || 0) + ' percent"><span>' + esc(q.score || 0) + '%</span></div>' +
        '<div><p class="tpd-band">' + esc(q.band || 'Getting started') + '</p>' +
        '<p class="tpd-note">Quality score from your ratings and this month’s punctuality.</p></div>' +
      '</div>' +
      '<div class="tpd-kpis">' +
        '<div class="tpd-kpi"><span>Star rating</span><strong>' + ratingText + '</strong></div>' +
        '<div class="tpd-kpi"><span>Completed lessons</span><strong>' + esc(k.completedLessons || 0) + '</strong></div>' +
        '<div class="tpd-kpi"><span>Positive ratings</span><strong>' + positiveText + '</strong></div>' +
        '<div class="tpd-kpi"><span>Leaderboard</span><strong>' + esc(k.standing || 'Not on the board yet') + '</strong></div>' +
      '</div>' +
      '<h3>Badges</h3>' +
      '<div class="tpd-badges">' +
      badges.map((badge) => {
        const locked = !badge.earned;
        const tip = badge.name + (badge.description ? '. ' + badge.description : '');
        return '<div class="tpd-badge' + (locked ? ' is-locked' : '') + '" tabindex="0" title="' + esc(tip) + '">' +
          '<span class="tpd-ico" aria-hidden="true">' + esc(badge.icon || '🏅') + '</span>' +
          '<span class="tpd-name">' + esc(badge.name) + '</span></div>';
      }).join('') +
      '</div>' +
      '<h3>Parent feedback</h3>' +
      '<div class="tpd-filters">' +
        filterButton('all', 'All') +
        filterButton('positive', 'Positive') +
        filterButton('growth', 'Growth') +
      '</div>' +
      (reviews.length
        ? reviews.map((row) => {
            const quote = row.comment ? row.comment : 'Rated this class.';
            return '<article class="tpd-review"><header><span>Parent</span><span class="tpd-stars" aria-label="' +
              esc(row.rating) + ' out of 5">' + stars(row.rating) + '</span></header><p>' +
              esc(quote) + '</p><p class="tpd-note">' + esc(dateLabel(row.submittedAt)) + '</p></article>';
          }).join('')
        : '<p class="tpd-empty">No reviews in this group yet.</p>');
  }

  function filterButton(id, label) {
    return '<button type="button" class="tpd-filter' + (filter === id ? ' is-on' : '') + '" data-filter="' + id + '">' + label + '</button>';
  }

  function bind() {
    const root = document.getElementById('tpd-root');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    root.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-filter]');
      if (!btn || !root.contains(btn)) return;
      filter = btn.getAttribute('data-filter') || 'all';
      render();
    });
  }

  async function load() {
    const root = document.getElementById('tpd-root');
    if (!root || loading) return;
    bind();
    if (payload) {
      render();
      return;
    }
    const auth = token();
    if (!auth) {
      root.innerHTML = '<p class="tpd-empty">Sign in again to see your performance.</p>';
      return;
    }
    loading = true;
    root.innerHTML = '<p class="tpd-empty">Loading your performance…</p>';
    try {
      const res = await fetch('/api/teacher/performance-summary', {
        headers: { Authorization: 'Bearer ' + auth },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || data.success === false) {
        root.innerHTML = '<p class="tpd-empty">Performance could not be loaded. Try again in a moment.</p>';
        return;
      }
      payload = data;
      render();
    } catch (err) {
      root.innerHTML = '<p class="tpd-empty">Performance could not be loaded. Try again in a moment.</p>';
    } finally {
      loading = false;
    }
  }

  window.RemoedTeacherPerformance = { load };
  var panel = document.getElementById('performance-tab');
  if (panel && panel.classList.contains('active')) load();
})();
