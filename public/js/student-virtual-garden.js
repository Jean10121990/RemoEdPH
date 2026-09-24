/**
 * Virtual Garden page controller.
 */
(function (global) {
  'use strict';

  var state = null;
  var selectedPlot = null;
  var selectedItemId = null;

  function token() {
    if (global.RemoEdEcoDrops && RemoEdEcoDrops.studentToken) {
      return RemoEdEcoDrops.studentToken();
    }
    return (
      localStorage.getItem('remoed_student_token') ||
      localStorage.getItem('remoed_student_auth') ||
      localStorage.getItem('studentToken') ||
      localStorage.getItem('token') ||
      ''
    );
  }

  function authHeaders(json) {
    var h = { Authorization: 'Bearer ' + token() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  function setMsg(text, ok) {
    var el = document.getElementById('vg-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'vg-msg' + (ok ? ' ok' : '');
  }

  function emojiFor(item) {
    if (!item) return '';
    var stage = Number(item.growthStage) || 0;
    if (item.itemType === 'flower' || (stage >= 3 && item.itemType === 'flower')) return '🌸';
    if (stage <= 0) return '🌱';
    if (stage === 1) return '🌿';
    if (stage === 2) return '🌳';
    return '🌲';
  }

  function stageLabel(item) {
    if (!item) return 'Empty';
    var labels = ['Seed', 'Sprout', 'Young Tree', 'Blooming'];
    return labels[Math.min(3, Number(item.growthStage) || 0)] || 'Plant';
  }

  function updateStats(data) {
    var a = document.getElementById('vg-available');
    var t = document.getElementById('vg-total-earned');
    var p = document.getElementById('vg-plants-grown');
    if (a) a.textContent = data.ecoDropsBalance != null ? data.ecoDropsBalance : '—';
    if (t) t.textContent = data.totalEcoDropsEarned != null ? data.totalEcoDropsEarned : '—';
    if (p) p.textContent = data.plantsGrown != null ? data.plantsGrown : '—';
    if (global.RemoEdEcoDropsBadge && RemoEdEcoDropsBadge.update) {
      RemoEdEcoDropsBadge.update(data.ecoDropsBalance);
    }
  }

  function renderMilestones(data) {
    var host = document.getElementById('vg-milestones-list');
    if (!host) return;
    var list = data.milestones || [];
    if (!list.length) {
      host.innerHTML = '<div class="vg-milestone">Keep learning to unlock surprises!</div>';
      return;
    }
    host.innerHTML = list
      .map(function (m) {
        return (
          '<div class="vg-milestone' +
          (m.unlocked ? ' unlocked' : '') +
          '">' +
          (m.unlocked ? '✓ ' : '🔒 ') +
          escapeHtml(m.label) +
          ' (' +
          m.at +
          ' drops)</div>'
        );
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function renderPlots(data, anim) {
    var host = document.getElementById('vg-plots');
    if (!host) return;
    var plots = data.plots || [];
    host.innerHTML = plots
      .map(function (plot) {
        var item = plot.item;
        var sel =
          selectedPlot === plot.positionIndex ||
          (item && selectedItemId && item.id === selectedItemId)
            ? ' selected'
            : '';
        var animCls = '';
        if (anim && anim.positionIndex === plot.positionIndex) {
          animCls = anim.kind === 'water' ? ' vg-anim-water' : ' vg-anim-plant';
        }
        return (
          '<button type="button" class="vg-plot' +
          sel +
          animCls +
          '" data-plot="' +
          plot.positionIndex +
          '" data-item-id="' +
          (item ? escapeHtml(item.id) : '') +
          '" aria-label="Plot ' +
          (plot.positionIndex + 1) +
          '">' +
          (item ? '<span class="vg-plant">' + emojiFor(item) + '</span>' : '') +
          '<span class="vg-plot-label">' +
          (item ? stageLabel(item) : 'Empty') +
          '</span></button>'
        );
      })
      .join('');

    host.querySelectorAll('.vg-plot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedPlot = Number(btn.getAttribute('data-plot'));
        selectedItemId = btn.getAttribute('data-item-id') || null;
        renderPlots(state, null);
        setMsg(
          selectedItemId
            ? 'Selected plot ' + (selectedPlot + 1) + ' — use Water Plant to grow it.'
            : 'Selected empty plot ' + (selectedPlot + 1) + ' — Buy Seeds or Buy Flowers & Trees.',
          true
        );
      });
    });
  }

  function applyState(data, anim) {
    state = data;
    updateStats(data);
    renderPlots(data, anim);
    renderMilestones(data);
    refreshShopButtons(data);
  }

  function refreshShopButtons(data) {
    var bal = Number(data.ecoDropsBalance) || 0;
    var seedBtn = document.getElementById('vg-buy-seed');
    var waterBtn = document.getElementById('vg-water');
    var treeBtn = document.getElementById('vg-buy-tree');
    if (seedBtn) seedBtn.disabled = bal < 5;
    if (waterBtn) waterBtn.disabled = bal < 5;
    if (treeBtn) treeBtn.disabled = bal < 22;
  }

  function loadGarden(ack) {
    var q = ack ? '?ackCelebration=1' : '';
    return fetch('/api/student/garden' + q, {
      headers: authHeaders(false),
      credentials: 'include',
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error) || 'Could not load garden');
        applyState(res.j, null);
        return res.j;
      });
  }

  function doAction(action) {
    setMsg('');
    var body = { action: action };
    if (selectedPlot != null) body.positionIndex = selectedPlot;
    if (selectedItemId) body.itemId = selectedItemId;
    if (action === 'buy_tree') body.itemType = 'tree';

    return fetch('/api/student/garden/action', {
      method: 'POST',
      headers: authHeaders(true),
      credentials: 'include',
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          setMsg((res.j && res.j.error) || 'Action failed', false);
          return;
        }
        var anim = null;
        if (res.j.actionResult) {
          anim = {
            positionIndex:
              res.j.actionResult.positionIndex != null
                ? res.j.actionResult.positionIndex
                : selectedPlot,
            kind: action === 'water_plant' ? 'water' : 'plant',
          };
          if (res.j.actionResult.itemId) selectedItemId = res.j.actionResult.itemId;
        }
        applyState(res.j, anim);
        var labels = {
          buy_seed: 'Seed planted! 🌱',
          water_plant: 'Plant watered! Growing…',
          buy_tree: 'Blooming tree planted! 🌲',
        };
        setMsg(labels[action] || 'Done!', true);
      })
      .catch(function (e) {
        setMsg(e.message || 'Network error', false);
      });
  }

  function init() {
    if (localStorage.getItem('userType') !== 'student') {
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('vg-buy-seed').addEventListener('click', function () {
      doAction('buy_seed');
    });
    document.getElementById('vg-water').addEventListener('click', function () {
      if (!selectedItemId) {
        setMsg('Tap a plant in your garden first, then Water Plant.', false);
        return;
      }
      doAction('water_plant');
    });
    document.getElementById('vg-buy-tree').addEventListener('click', function () {
      doAction('buy_tree');
    });

    loadGarden(false)
      .then(function (data) {
        if (data && data.celebration > 0 && global.RemoEdEcoDrops) {
          RemoEdEcoDrops.showModal(data.celebration);
          loadGarden(true);
        }
      })
      .catch(function (e) {
        setMsg(e.message || 'Failed to load garden', false);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
