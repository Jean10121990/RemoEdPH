/**
 * Syllabus accordion on Book a Class. Titles come from public/data/syllabus.json.
 */
(function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function section(title, bodyHtml, nested) {
    return (
      '<section class="syllabus-section' + (nested ? ' is-nested' : '') + '">' +
        '<button type="button" class="syllabus-section__bar" aria-expanded="false">' +
          '<span class="syllabus-section__chevron" data-lucide="chevron-down"></span>' +
          '<span class="syllabus-section__title">' + esc(title) + '</span>' +
        '</button>' +
        '<div class="syllabus-section__body" hidden>' + bodyHtml + '</div>' +
      '</section>'
    );
  }

  function render(levels) {
    return (levels || []).map(function (level) {
      var label = level.age ? level.level + ' \u2014 ' + level.age : level.level;
      var months = (level.months || []).map(function (month) {
        var lessons = (month.lessons || []).map(function (title) {
          return '<div class="syllabus-lesson">' + esc(title) + '</div>';
        }).join('');
        return section(month.title, lessons, true);
      }).join('');
      return section(label, months, false);
    }).join('');
  }

  function bind(root) {
    root.addEventListener('click', function (event) {
      var btn = event.target.closest('.syllabus-section__bar');
      if (!btn || !root.contains(btn)) return;
      var body = btn.nextElementSibling;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      btn.parentElement.classList.toggle('is-open', !open);
      if (body) body.hidden = open;
    });
  }

  function show(which) {
    var schedule = document.getElementById('book-schedule-panel');
    var syllabus = document.getElementById('book-syllabus-panel');
    var scheduleTab = document.getElementById('book-tab-schedule');
    var syllabusTab = document.getElementById('book-tab-syllabus');
    var onSyllabus = which === 'syllabus';
    if (schedule) schedule.hidden = onSyllabus;
    if (syllabus) syllabus.hidden = !onSyllabus;
    if (scheduleTab) {
      scheduleTab.classList.toggle('is-active', !onSyllabus);
      scheduleTab.setAttribute('aria-selected', onSyllabus ? 'false' : 'true');
    }
    if (syllabusTab) {
      syllabusTab.classList.toggle('is-active', onSyllabus);
      syllabusTab.setAttribute('aria-selected', onSyllabus ? 'true' : 'false');
    }
  }

  function init() {
    var root = document.getElementById('syllabus-root');
    var scheduleTab = document.getElementById('book-tab-schedule');
    var syllabusTab = document.getElementById('book-tab-syllabus');
    if (!root || !scheduleTab || !syllabusTab) return;
    scheduleTab.addEventListener('click', function () { show('schedule'); });
    syllabusTab.addEventListener('click', function () { show('syllabus'); });
    fetch('data/syllabus.json?v=little-seeds-full')
      .then(function (res) {
        if (!res.ok) throw new Error('syllabus');
        return res.json();
      })
      .then(function (data) {
        root.innerHTML = render(data);
        if (window.RemoedLucide) window.RemoedLucide.fillAll(root);
        bind(root);
      })
      .catch(function () {
        root.innerHTML = '<p class="syllabus-empty">Syllabus could not be loaded.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
