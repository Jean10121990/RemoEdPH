/* Renders Super-Admin or Marketing copy fields returned by the content API. */
(function () {
  function headers(json) {
    var token = (window.RemoedAdminSession && RemoedAdminSession.getAuthToken)
      ? RemoedAdminSession.getAuthToken()
      : (localStorage.getItem('remoed_admin_token') || localStorage.getItem('remoed_admin_auth') || localStorage.getItem('adminToken') || '');
    var h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mount(host, opts) {
    var status = document.getElementById(opts.statusId);
    function say(text) { if (status) status.textContent = text || ''; }

    function paint(blocks) {
      var allow = {};
      (opts.pages || []).forEach(function (page) { allow[page] = 1; });
      var groups = {};
      (blocks || []).forEach(function (row) {
        if (!allow[row.pageKey]) return;
        if (!groups[row.pageKey]) groups[row.pageKey] = [];
        groups[row.pageKey].push(row);
      });
      host.innerHTML = Object.keys(groups).map(function (page) {
        var fields = groups[page].map(function (row) {
          var id = page + '-' + row.blockKey;
          return '<div style="padding:10px 0;border-top:1px solid #e2e8f0;">' +
            '<label for="' + esc(id) + '" style="font-weight:700;display:block;margin-bottom:4px;">' + esc(row.label) + '</label>' +
            '<textarea id="' + esc(id) + '" data-page="' + esc(row.pageKey) + '" data-block="' + esc(row.blockKey) + '" rows="' + (row.format === 'html' ? 8 : 3) + '" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:8px;">' + esc(row.body) + '</textarea>' +
            '<label style="display:inline-flex;gap:6px;align-items:center;margin-top:6px;"><input type="checkbox" data-publish="' + esc(id) + '"' + (row.published ? ' checked' : '') + '> Show on the site</label>' +
            '<button type="button" class="btn btn-primary" data-save="' + esc(id) + '" style="margin-left:8px;">Save</button>' +
            '</div>';
        }).join('');
        return '<h3 style="margin:18px 0 6px;text-transform:capitalize;">' + esc(page.replace(/-/g, ' ')) + '</h3>' + fields;
      }).join('') || '<p>No fields for this screen.</p>';
    }

    host.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-save]');
      if (!btn) return;
      var id = btn.getAttribute('data-save');
      var field = document.getElementById(id);
      var box = host.querySelector('[data-publish="' + id + '"]');
      if (!field) return;
      say('Saving…');
      fetch(opts.saveUrl, {
        method: 'PUT',
        credentials: 'include',
        headers: headers(true),
        body: JSON.stringify({
          pageKey: field.getAttribute('data-page'),
          blockKey: field.getAttribute('data-block'),
          body: field.value,
          published: !!(box && box.checked)
        })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) { say(res.ok ? 'Saved. The public page updates without a deploy.' : (res.j.error || 'Save failed.')); })
        .catch(function () { say('Network error.'); });
    });

    say('Loading…');
    fetch(opts.listUrl, { credentials: 'include', headers: headers(false) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { say(res.j.error || 'Could not load.'); return; }
        paint(res.j.blocks || []);
        say('');
      })
      .catch(function () { say('Network error.'); });
  }

  window.RemoedCopyEditor = { mount: mount };
})();
