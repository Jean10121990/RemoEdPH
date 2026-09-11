/**
 * Teacher quick-award badge picker (1–3 badges) for post-lesson feedback.
 */
(function (global) {
  var catalogCache = null;
  var selected = new Set();

  function iconFor(name) {
    if (global.RemoedStudentBadges && RemoedStudentBadges.iconFor) {
      return RemoedStudentBadges.iconFor(name);
    }
    return '⭐';
  }

  function getToken() {
    if (global.RemoedAuthToken && typeof global.RemoedAuthToken.getTeacherToken === 'function') {
      return global.RemoedAuthToken.getTeacherToken() || '';
    }
    if (global.RemoedTeacherSession && typeof global.RemoedTeacherSession.getToken === 'function') {
      return global.RemoedTeacherSession.getToken() || '';
    }
    return (
      localStorage.getItem('remoed_teacher_token') ||
      localStorage.getItem('remoed_teacher_auth') ||
      localStorage.getItem('remoed_user_token') ||
      localStorage.getItem('token') ||
      ''
    );
  }

  async function loadCatalog() {
    if (catalogCache) return catalogCache;
    const token = getToken();
    if (!token) return [];
    const res = await fetch('/api/teacher/student-badges/catalog', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to load badges');
    }
    catalogCache = data.badges || [];
    return catalogCache;
  }

  function getSelectedKeys() {
    return Array.from(selected);
  }

  function getNote(root) {
    var ta = root && root.querySelector('#tb-award-note');
    return ta ? String(ta.value || '').trim() : '';
  }

  function renderInto(container) {
    if (!container) return Promise.resolve();
    selected = new Set();
    container.innerHTML =
      '<div class="tb-award" id="tb-award-panel">' +
      '<p class="tb-award-title">Celebrate growth (optional)</p>' +
      '<p class="tb-award-hint">Pick up to 3 badges — positive recognition only. No rankings.</p>' +
      '<div class="tb-award-grid" id="tb-award-grid"><span style="font-size:0.8rem;color:#64748b;">Loading badges…</span></div>' +
      '<textarea class="tb-award-note" id="tb-award-note" maxlength="280" placeholder="Optional 1-sentence cheer (e.g. Great job with your R sounds today!)"></textarea>' +
      '</div>';

    return loadCatalog()
      .then(function (badges) {
        var grid = container.querySelector('#tb-award-grid');
        if (!grid) return;
        if (!badges.length) {
          grid.innerHTML = '<span style="font-size:0.8rem;color:#64748b;">No badges available.</span>';
          return;
        }
        grid.innerHTML = badges
          .map(function (b) {
            return (
              '<button type="button" class="tb-award-chip" data-key="' +
              String(b.key) +
              '" title="' +
              String(b.description || '').replace(/"/g, '&quot;') +
              '">' +
              '<span class="tb-ico">' +
              iconFor(b.iconName) +
              '</span>' +
              String(b.name || '') +
              '</button>'
            );
          })
          .join('');

        grid.addEventListener('click', function (e) {
          var chip = e.target && e.target.closest && e.target.closest('.tb-award-chip');
          if (!chip) return;
          var key = chip.getAttribute('data-key');
          if (!key) return;
          if (selected.has(key)) {
            selected.delete(key);
            chip.classList.remove('is-selected');
            return;
          }
          if (selected.size >= 3) {
            alert('You can celebrate with up to 3 badges per lesson.');
            return;
          }
          selected.add(key);
          chip.classList.add('is-selected');
        });
      })
      .catch(function (err) {
        console.warn('Badge catalog:', err);
        var grid = container.querySelector('#tb-award-grid');
        if (grid) {
          grid.innerHTML =
            '<span style="font-size:0.8rem;color:#64748b;">Badges unavailable right now.</span>';
        }
      });
  }

  async function submitAwards(opts) {
    var keys = getSelectedKeys();
    if (!keys.length) return { skipped: true };
    var token = getToken();
    if (!token) throw new Error('Not signed in');
    var res = await fetch('/api/teacher/student-badges/award', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        bookingId: opts.bookingId,
        studentId: opts.studentId,
        badgeKeys: keys,
        teacherNote: opts.teacherNote != null ? opts.teacherNote : getNote(opts.root),
      }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Could not award badges');
    }
    return data;
  }

  global.RemoedTeacherBadgeAward = {
    renderInto: renderInto,
    submitAwards: submitAwards,
    getSelectedKeys: getSelectedKeys,
    getNote: getNote,
    loadCatalog: loadCatalog,
  };
})(typeof window !== 'undefined' ? window : globalThis);
