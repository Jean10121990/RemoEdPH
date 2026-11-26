(function () {
  var MONTHS = [
    { year: 2026, month: 11, label: 'November 2026' },
    { year: 2026, month: 12, label: 'December 2026' }
  ];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (var m = 1; m <= 12; m++) {
    MONTHS.push({ year: 2027, month: m, label: MONTH_NAMES[m - 1] + ' 2027' });
  }
  var THEMES = {
    new_year: ['New Year', '#1a365d', '#f6e27a'],
    hearts: ["Heart's Day", '#9f1239', '#fecdd3'],
    holy_week: ['Holy Week / Graduation', '#4c1d95', '#e9d5ff'],
    summer: ['Summer and Earth Day', '#0f766e', '#99f6e4'],
    mothers: ["Mother's Day", '#9d174d', '#fbcfe8'],
    fathers: ["Father's Day", '#1e3a8a', '#bfdbfe'],
    grandparents: ["Grandparents' Day", '#7c2d12', '#fed7aa'],
    heroes: ['Independence / Heroes / Bonifacio', '#1e3a5f', '#fde68a'],
    teachers: ["Teachers' Day", '#0f766e', '#fde68a'],
    mental_health: ['Mental Health', '#155e75', '#a5f3fc'],
    children: ["Children's Day", '#0369a1', '#fde68a'],
    christmas: ['Christmas', '#14532d', '#fecaca'],
    csr: ['CSR Outreach', '#166534', '#bbf7d0'],
    custom: ['Others / Custom', '#1a365d', '#7dd3fc']
  };
  var TYPE_LABEL = { facebook: 'Facebook Post / FB Group', email: 'Email Newsletter / Parent Email', ad: 'Social Media Ad' };

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
  function firstWeekday(year, month) { return new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text || '').split(/\s+/);
    var line = '';
    var lines = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = words[i];
        lines += 1;
        if (lines >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y);
  }

  window.RemoEdMarketingSpecialist = {
    mount: function (root, helpers) {
      var esc = helpers.esc;
      var api = helpers.api;
      var monthIndex = 0;
      var cache = { 2026: null, 2027: null };
      var selectedKey = '';
      var selectedSlot = '';
      var audienceNote = '';

      root.innerHTML =
        '<h1>RemoEdPH AI Marketing Specialist</h1>' +
        '<p class="muted">November 30, 2026 is the Bonifacio Day test. December 2026 is the dry run. Click a date to fill the topic. A holiday on Monday or Thursday keeps the regular post as well. The copy describes live classes with real teachers.</p>' +
        '<div class="row-actions"><button type="button" class="ghost" id="mkt-prev">Previous</button><strong id="mkt-month-label"></strong><button type="button" class="ghost" id="mkt-next">Next</button></div>' +
        '<p id="mkt-dry" class="muted"></p>' +
        '<div id="mkt-cal" class="mkt-cal"></div>' +
        '<div id="mkt-slots" class="row-actions"></div>' +
        '<section class="chart"><label>Content type</label>' +
        '<select id="aiContentType"><option value="facebook">Facebook Post / FB Group</option><option value="email">Email Newsletter / Parent Email</option><option value="ad">Social Media Ad</option></select>' +
        '<label>Target region</label>' +
        '<select id="aiTargetMarket"><option>Taiwan</option><option>Japan</option><option>South Korea</option><option selected>General International (Asia)</option></select>' +
        '<label>Key topic</label><textarea id="aiTopicDetails" rows="3"></textarea>' +
        '<div class="row-actions"><button type="button" id="btnGenerateAi">Generate marketing copy</button>' +
        '<button type="button" class="ghost" id="btnCopyText">Copy</button>' +
        '<button type="button" class="ghost" id="btnSaveEntry">Save</button>' +
        '<button type="button" class="ghost" id="btnSchedule">Mark scheduled</button></div>' +
        '<label>Generated copy</label><textarea id="aiOutputBox" rows="8"></textarea>' +
        '<div id="mkt-email-fields" style="display:none"><label>Email subject</label><input id="aiEmailSubject">' +
        '<label>Email body</label><textarea id="aiEmailBody" rows="6"></textarea>' +
        '<p id="mkt-audience" class="muted"></p>' +
        '<div class="row-actions"><button type="button" id="btnTestEmail">Send test to me</button>' +
        '<button type="button" class="ghost" id="btnAffiliateEmail">Send to affiliates</button></div></div>' +
        '<p id="ai-msg" class="muted"></p></section>' +
        '<section class="chart"><h2>Poster</h2>' +
        '<label>Size</label><select id="posterFormat"><option value="square">1080×1080 Square</option><option value="portrait">1080×1350 Portrait</option></select>' +
        '<label>Theme</label><select id="posterTheme"></select>' +
        '<label>Headline</label><input id="posterHeadline">' +
        '<label>Subheadline or value note</label><input id="posterSub">' +
        '<label>CTA footer</label><input id="posterCta" value="remoedph.com • Free Trial on Remo App">' +
        '<label>Mascot badge</label><select id="posterMascot"><option value="remo">Remo</option><option value="ed">Ed</option><option value="sofie">Sofie</option></select>' +
        '<canvas id="posterCanvas" width="1080" height="1080" style="width:100%;max-width:420px;height:auto;border-radius:12px;display:block;margin:8px 0;"></canvas>' +
        '<button type="button" class="ghost" id="btnPosterPng">Download PNG</button></section>' +
        '<section class="chart"><h2>Others</h2><p class="muted">Add an occasion that is not already on the calendar.</p>' +
        '<label>Date</label><input id="customDate" type="date" min="2026-11-30" max="2027-12-31">' +
        '<label>Occasion</label><input id="customTitle" placeholder="Family picnic, school fair, or another date">' +
        '<button type="button" id="btnCustom">Add custom event</button></section>';

      var themeSelect = document.getElementById('posterTheme');
      Object.keys(THEMES).forEach(function (key) {
        var opt = document.createElement('option');
        opt.value = key;
        opt.textContent = THEMES[key][0];
        themeSelect.appendChild(opt);
      });

      function entries() {
        var month = MONTHS[monthIndex];
        var rows = cache[month.year] || [];
        var prefix = month.year + '-' + pad(month.month);
        return rows.filter(function (row) { return row.dateKey.indexOf(prefix) === 0; });
      }
      function current() {
        return entries().filter(function (row) { return row.dateKey === selectedKey && row.slot === selectedSlot; })[0] || null;
      }
      function msg(text) { document.getElementById('ai-msg').textContent = text || ''; }

      var posterCast = {
        ed: { src: '/images/ed-boy.png', mode: 'black' },
        sofie: { src: '/images/sofie-pixar.jpg', mode: 'pink' },
        remo: { src: '/images/remo-green.png', mode: 'black' },
        grace: { src: '/images/grace-teacher.png', mode: 'black' }
      };
      var posterImages = {};

      function knockout(img, mode) {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        var frame = g.getImageData(0, 0, c.width, c.height);
        var p = frame.data;
        for (var i = 0; i < p.length; i += 4) {
          var r = p[i];
          var gv = p[i + 1];
          var b = p[i + 2];
          var max = Math.max(r, gv, b);
          var min = Math.min(r, gv, b);
          if (mode === 'pink' && r > 214 && gv > 176 && b > 186 && (max - min) < 46) p[i + 3] = 0;
          else if (r < 22 && gv < 22 && b < 22) p[i + 3] = 0;
        }
        g.putImageData(frame, 0, 0);
        return c;
      }

      function ensurePosterImages() {
        Object.keys(posterCast).forEach(function (key) {
          if (posterImages[key]) return;
          posterImages[key] = { ready: null };
          var spec = posterCast[key];
          var img = new Image();
          img.onload = function () {
            posterImages[key].ready = knockout(img, spec.mode);
            drawPoster();
          };
          img.src = spec.src;
        });
      }

      function paintCloud(ctx, x, y, scale) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(x, y, 70 * scale, 28 * scale, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 48 * scale, y + 8 * scale, 48 * scale, 22 * scale, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 46 * scale, y + 10 * scale, 40 * scale, 18 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawPoster() {
        ensurePosterImages();
        var canvas = document.getElementById('posterCanvas');
        var format = document.getElementById('posterFormat').value;
        var height = format === 'portrait' ? 1350 : 1080;
        canvas.width = 1080;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        var theme = THEMES[document.getElementById('posterTheme').value] || THEMES.custom;
        var sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#79c6f5');
        sky.addColorStop(0.42, '#fff3d6');
        sky.addColorStop(1, '#6fbf78');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 1080, height);
        ctx.fillStyle = theme[2];
        ctx.globalAlpha = 0.16;
        ctx.fillRect(0, 0, 1080, height);
        ctx.globalAlpha = 1;
        var sun = ctx.createRadialGradient(860, 150, 10, 860, 150, 120);
        sun.addColorStop(0, '#fff4c2');
        sun.addColorStop(1, 'rgba(255, 214, 102, 0)');
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(860, 150, 120, 0, Math.PI * 2);
        ctx.fill();
        paintCloud(ctx, 180, 150, 1);
        paintCloud(ctx, 520, 110, 0.8);
        ctx.fillStyle = '#3e9a55';
        ctx.beginPath();
        ctx.ellipse(540, height - 20, 760, 210, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#2f7d45';
        ctx.beginPath();
        ctx.ellipse(240, height - 30, 280, 90, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(20, 60, 30, 0.18)';
        ctx.beginPath();
        ctx.ellipse(540, height - 150, 420, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        var mascot = document.getElementById('posterMascot').value || 'remo';
        var cast = [
          { key: 'grace', x: 40, h: 430 },
          { key: 'ed', x: 210, h: 500 },
          { key: 'sofie', x: 430, h: 500 },
          { key: 'remo', x: 700, h: 420 }
        ];
        cast.forEach(function (person) {
          var art = posterImages[person.key] && posterImages[person.key].ready;
          if (!art) return;
          var featured = person.key === mascot;
          var h = person.h * (featured ? 1.12 : 0.92);
          var w = art.width * (h / art.height);
          var y = height - 150 - h;
          if (person.key === 'grace') {
            ctx.drawImage(art, 0, 0, art.width * 0.72, art.height, person.x, y, w * 0.72, h);
          } else {
            ctx.drawImage(art, person.x, y, w, h);
          }
        });

        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 68px Segoe UI, Arial, sans-serif';
        wrapText(ctx, document.getElementById('posterHeadline').value || 'RemoEd', 64, 250, 760, 78, 3);
        ctx.font = '600 34px Segoe UI, Arial, sans-serif';
        wrapText(ctx, document.getElementById('posterSub').value, 64, 500, 620, 44, 3);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(12, 48, 72, 0.78)';
        ctx.fillRect(0, height - 118, 1080, 118);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 30px Segoe UI, Arial, sans-serif';
        ctx.fillText(document.getElementById('posterCta').value || 'remoedph.com • Free Trial on Remo App', 48, height - 48);
      }

      function readPoster() {
        return {
          format: document.getElementById('posterFormat').value,
          theme: document.getElementById('posterTheme').value,
          headline: document.getElementById('posterHeadline').value,
          subheadline: document.getElementById('posterSub').value,
          cta: document.getElementById('posterCta').value,
          mascot: document.getElementById('posterMascot').value
        };
      }

      function fill(row) {
        selectedKey = row ? row.dateKey : '';
        selectedSlot = row ? row.slot : '';
        document.getElementById('aiContentType').value = row && row.contentType ? row.contentType : 'facebook';
        document.getElementById('aiTargetMarket').value = (row && row.targetMarket) || 'General International (Asia)';
        document.getElementById('aiTopicDetails').value = row ? row.keyTopic || '' : '';
        document.getElementById('aiOutputBox').value = row ? row.generatedCopy || '' : '';
        document.getElementById('aiEmailSubject').value = row ? row.emailSubject || '' : '';
        document.getElementById('aiEmailBody').value = row ? row.emailBody || '' : '';
        var poster = (row && row.posterConfig) || {};
        document.getElementById('posterFormat').value = poster.format === 'portrait' ? 'portrait' : 'square';
        document.getElementById('posterTheme').value = THEMES[poster.theme] ? poster.theme : 'custom';
        document.getElementById('posterHeadline').value = poster.headline || (row ? row.title : '');
        document.getElementById('posterSub').value = poster.subheadline || '';
        document.getElementById('posterCta').value = poster.cta || 'remoedph.com • Free Trial on Remo App';
        document.getElementById('posterMascot').value = poster.mascot || 'remo';
        syncEmailFields();
        drawPoster();
        paintSlots();
      }

      function syncEmailFields() {
        var email = document.getElementById('aiContentType').value === 'email';
        document.getElementById('mkt-email-fields').style.display = email ? 'block' : 'none';
      }

      function paintSlots() {
        var box = document.getElementById('mkt-slots');
        var dayRows = entries().filter(function (row) { return row.dateKey === selectedKey; });
        if (!dayRows.length) {
          box.innerHTML = '';
          return;
        }
        box.innerHTML = dayRows.map(function (row) {
          var on = row.slot === selectedSlot ? ' style="outline:3px solid #0f766e"' : '';
          return '<button type="button" class="ghost" data-slot="' + esc(row.slot) + '"' + on + '>' + esc(row.title || row.slot) + ' · ' + esc(row.status) + '</button>';
        }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('[data-slot]'), function (btn) {
          btn.addEventListener('click', function () {
            var row = dayRows.filter(function (item) { return item.slot === btn.getAttribute('data-slot'); })[0];
            fill(row);
          });
        });
      }

      function paint() {
        var month = MONTHS[monthIndex];
        document.getElementById('mkt-month-label').textContent = month.label;
        document.getElementById('mkt-dry').textContent = month.year === 2026 && month.month === 11
          ? 'Test. November 30 is Bonifacio Day, a Monday, so the regular class post stays beside the holiday.'
          : (month.year === 2026 ? 'Dry run. Saves stay on these December dates so you can open them again. Nothing is posted to Facebook.' : '');
        document.getElementById('mkt-prev').disabled = monthIndex === 0;
        document.getElementById('mkt-next').disabled = monthIndex === MONTHS.length - 1;
        var byDay = {};
        entries().forEach(function (row) {
          var day = Number(row.dateKey.slice(8));
          byDay[day] = byDay[day] || [];
          byDay[day].push(row);
        });
        var html = '<div class="mkt-dow">Sun</div><div class="mkt-dow">Mon</div><div class="mkt-dow">Tue</div><div class="mkt-dow">Wed</div><div class="mkt-dow">Thu</div><div class="mkt-dow">Fri</div><div class="mkt-dow">Sat</div>';
        var blanks = firstWeekday(month.year, month.month);
        for (var b = 0; b < blanks; b++) html += '<div></div>';
        var total = daysInMonth(month.year, month.month);
        for (var day = 1; day <= total; day++) {
          var key = month.year + '-' + pad(month.month) + '-' + pad(day);
          var rows = byDay[day] || [];
          var titles = rows.map(function (row) { return row.title; }).join(' · ');
          var mark = rows.some(function (row) { return row.status === 'drafted' || row.status === 'edited' || row.status === 'scheduled'; }) ? ' ●' : '';
          html += '<button type="button" class="mkt-day' + (key === selectedKey ? ' on' : '') + '" data-date="' + key + '"><strong>' + day + mark + '</strong><span>' + esc(titles) + '</span></button>';
        }
        var cal = document.getElementById('mkt-cal');
        cal.innerHTML = html;
        Array.prototype.forEach.call(cal.querySelectorAll('[data-date]'), function (btn) {
          btn.addEventListener('click', function () {
            selectedKey = btn.getAttribute('data-date');
            var dayRows = entries().filter(function (row) { return row.dateKey === selectedKey; });
            fill(dayRows[0] || null);
            paint();
          });
        });
        paintSlots();
      }

      function payload(status) {
        var row = current();
        return {
          slot: selectedSlot,
          title: row ? row.title : '',
          keyTopic: document.getElementById('aiTopicDetails').value,
          contentType: document.getElementById('aiContentType').value,
          targetMarket: document.getElementById('aiTargetMarket').value,
          generatedCopy: document.getElementById('aiOutputBox').value,
          emailSubject: document.getElementById('aiEmailSubject').value,
          emailBody: document.getElementById('aiEmailBody').value,
          posterConfig: readPoster(),
          status: status || (row && row.status) || 'edited'
        };
      }

      function replaceRow(entry) {
        var year = entry.dateKey.slice(0, 4);
        var rows = cache[year] || [];
        var found = false;
        cache[year] = rows.map(function (row) {
          if (row.dateKey === entry.dateKey && row.slot === entry.slot) {
            found = true;
            return entry;
          }
          return row;
        });
        if (!found) cache[year].push(entry);
      }

      async function save(status) {
        if (!selectedKey || !selectedSlot) {
          msg('Choose a date first.');
          return null;
        }
        msg('Saving…');
        var data = await api('/api/admin/marketing/calendar/' + selectedKey, {
          method: 'PUT',
          body: JSON.stringify(payload(status))
        });
        replaceRow(data.entry);
        fill(data.entry);
        paint();
        msg('Saved.');
        return data.entry;
      }

      async function loadYear(year) {
        var data = await api('/api/admin/marketing/calendar?year=' + year);
        cache[year] = data.entries || [];
      }

      document.getElementById('mkt-prev').addEventListener('click', function () {
        if (monthIndex > 0) { monthIndex -= 1; paint(); }
      });
      document.getElementById('mkt-next').addEventListener('click', function () {
        if (monthIndex < MONTHS.length - 1) { monthIndex += 1; paint(); }
      });
      ['posterFormat', 'posterTheme', 'posterHeadline', 'posterSub', 'posterCta', 'posterMascot'].forEach(function (id) {
        document.getElementById(id).addEventListener('input', drawPoster);
        document.getElementById(id).addEventListener('change', drawPoster);
      });
      document.getElementById('aiContentType').addEventListener('change', syncEmailFields);
      document.getElementById('btnSaveEntry').addEventListener('click', function () {
        save('edited').catch(function (err) { msg(err.message || String(err)); });
      });
      document.getElementById('btnSchedule').addEventListener('click', function () {
        save('scheduled').catch(function (err) { msg(err.message || String(err)); });
      });
      document.getElementById('btnGenerateAi').addEventListener('click', async function () {
        var topic = document.getElementById('aiTopicDetails').value.trim();
        msg('');
        if (!topic) { msg('Add a topic first.'); return; }
        var btn = document.getElementById('btnGenerateAi');
        btn.disabled = true;
        btn.textContent = 'Generating…';
        try {
          var type = document.getElementById('aiContentType').value;
          var data = await api('/api/admin/marketing/ai-generate', {
            method: 'POST',
            body: JSON.stringify({
              contentType: TYPE_LABEL[type] || type,
              format: type,
              targetMarket: document.getElementById('aiTargetMarket').value,
              topicDetails: topic
            })
          });
          document.getElementById('aiOutputBox').value = data.content || '';
          if (data.email) {
            document.getElementById('aiEmailSubject').value = data.email.subject || '';
            document.getElementById('aiEmailBody').value = data.email.body || '';
          }
          if (selectedKey) await save('drafted');
          else msg('Copy is ready. Choose a date to keep it.');
        } catch (err) {
          msg(err.message || String(err));
        }
        btn.disabled = false;
        btn.textContent = 'Generate marketing copy';
      });
      document.getElementById('btnCopyText').addEventListener('click', function () {
        var output = document.getElementById('aiOutputBox').value;
        if (!output.trim()) return;
        navigator.clipboard.writeText(output).then(function () { msg('Copied.'); }).catch(function () {});
      });
      document.getElementById('btnPosterPng').addEventListener('click', function () {
        drawPoster();
        var canvas = document.getElementById('posterCanvas');
        var link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = 'remoed-poster-' + (document.getElementById('posterFormat').value || 'square') + '.png';
        link.click();
      });
      document.getElementById('btnCustom').addEventListener('click', async function () {
        var date = document.getElementById('customDate').value;
        var title = document.getElementById('customTitle').value.trim();
        if (!date || !title) { msg('Add a date and an occasion name.'); return; }
        msg('Adding…');
        try {
          var data = await api('/api/admin/marketing/calendar/' + date, {
            method: 'PUT',
            body: JSON.stringify({
              customTitle: title,
              title: title,
              keyTopic: title,
              contentType: document.getElementById('aiContentType').value,
              targetMarket: document.getElementById('aiTargetMarket').value,
              status: 'edited',
              posterConfig: readPoster()
            })
          });
          replaceRow(data.entry);
          var year = Number(date.slice(0, 4));
          var month = Number(date.slice(5, 7));
          monthIndex = MONTHS.findIndex(function (item) { return item.year === year && item.month === month; });
          if (monthIndex < 0) monthIndex = 0;
          fill(data.entry);
          paint();
          msg('Custom occasion added.');
        } catch (err) {
          msg(err.message || String(err));
        }
      });
      document.getElementById('btnAffiliateEmail').addEventListener('click', async function () {
        var subject = document.getElementById('aiEmailSubject').value.trim();
        var body = document.getElementById('aiEmailBody').value.trim() || document.getElementById('aiOutputBox').value.trim();
        if (!subject || !body) { msg('Add an email subject and body first.'); return; }
        if (!window.confirm('Send this email to active and pending affiliates?')) return;
        msg('Sending to affiliates…');
        try {
          var data = await api('/api/admin/marketing/calendar/send-affiliates', {
            method: 'POST',
            body: JSON.stringify({ subject: subject, text: body })
          });
          msg('Sent to ' + (data.sent || 0) + ' affiliates from ' + (data.from || 'support@remoedph.com') + '.');
        } catch (err) {
          msg(err.message || String(err));
        }
      });
      document.getElementById('btnTestEmail').addEventListener('click', async function () {
        var subject = document.getElementById('aiEmailSubject').value.trim();
        var body = document.getElementById('aiEmailBody').value.trim() || document.getElementById('aiOutputBox').value.trim();
        if (!subject || !body) { msg('Add an email subject and body first.'); return; }
        msg('Sending the test…');
        try {
          var data = await api('/api/admin/marketing/calendar/test-email', {
            method: 'POST',
            body: JSON.stringify({ subject: subject, text: body })
          });
          msg('Test sent from ' + (data.from || 'support@remoedph.com') + '.');
        } catch (err) {
          msg(err.message || String(err));
        }
      });

      drawPoster();
      loadYear(2026).then(function () { return loadYear(2027); }).then(function () {
        paint();
        return api('/api/admin/marketing/calendar/audience').then(function (data) {
          var groups = data.groups || {};
          audienceNote = 'Audience counts only. Assessments ' + (groups.assessments || 0) +
            ', leads ' + (groups.leads || 0) +
            ', students ' + (groups.students || 0) +
            ', teachers ' + (groups.teachers || 0) +
            ', admins ' + (groups.admins || 0) +
            ', affiliates ' + (groups.affiliates || 0) +
            '. Unique addresses ' + (data.unique || 0) +
            '. Send test to me goes to your inbox. Send to affiliates uses active and pending affiliate emails only.';
          var note = document.getElementById('mkt-audience');
          if (note) note.textContent = audienceNote;
        }).catch(function () {
          var note = document.getElementById('mkt-audience');
          if (note) note.textContent = 'Audience counts are unavailable right now.';
        });
      }).catch(function (err) {
        root.innerHTML = '<p class="err">' + esc(err.message || err) + '</p>';
      });
    }
  };
})();
