/**
 * Missed time-out notice and correction form.
 * Used by the teacher dashboard and the admin Time In button.
 */
(function () {
  'use strict';

  function el(tag, text, css) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (css) node.style.cssText = css;
    return node;
  }

  function stamp(value) {
    if (!value) return '—';
    return value.time || '—';
  }

  function closeModal() {
    var old = document.getElementById('attendance-exception-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function paint(opts, payload) {
    closeModal();
    var blocking = (payload && payload.blocking) || opts.exception || null;
    var rows = (payload && payload.rows) || [];
    var wrap = el('div', null, 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:10040;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;');
    wrap.id = 'attendance-exception-modal';
    var card = el('div', null, 'background:#fff;border-radius:12px;max-width:640px;width:100%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,0.18);');
    card.appendChild(el('h2', 'Missed Time-Out Detected', 'margin:0 0 8px;font-size:1.25rem;color:#0f172a;'));
    card.appendChild(el('p', 'You did not record your time-out for a previous attendance session. Your attendance session was automatically closed by the system. Before you can time in again, you must submit an attendance correction request for HR or administrator review. Please provide the actual time you stopped working and explain why you missed your time-out. You cannot directly modify your official attendance record. Your time-in access will be restored after the required approval is completed. Your account stays active.', 'margin:0 0 14px;color:#334155;line-height:1.45;font-size:0.95rem;'));
    if (!blocking) {
      card.appendChild(el('p', 'No open attendance exception was found. Try Time In again.', 'color:#166534;'));
    } else {
      var facts = el('div', null, 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px;font-size:0.92rem;');
      facts.appendChild(el('div', 'Reference: ' + (blocking.reference || '—')));
      facts.appendChild(el('div', 'Attendance date: ' + (blocking.attendanceDate || '—')));
      facts.appendChild(el('div', 'Original time-in: ' + stamp(blocking.originalTimeIn)));
      facts.appendChild(el('div', 'System-generated time-out: ' + stamp(blocking.systemClockOut)));
      facts.appendChild(el('div', 'Status: ' + (blocking.status || 'PENDING_REVIEW')));
      if (blocking.rejectionReason) facts.appendChild(el('div', 'Rejection reason: ' + blocking.rejectionReason, 'margin-top:6px;color:#991b1b;'));
      if (blocking.clarificationRequest) facts.appendChild(el('div', 'HR asked: ' + blocking.clarificationRequest, 'margin-top:6px;'));
      card.appendChild(facts);
      card.appendChild(el('p', 'If HR is unavailable before your next shift, leave the request in the queue. Do not ask a coworker to time in for you. A Super-Admin or HR reviewer with attendance review access is the backup approver.', 'font-size:0.85rem;color:#475569;'));

      var form = el('form');
      var timeLabel = el('label', blocking.status === 'NEEDS_CLARIFICATION' ? 'Clarification' : 'Actual time you stopped working (HH:MM, Philippine time)');
      timeLabel.style.display = 'block';
      timeLabel.style.fontWeight = '600';
      timeLabel.style.margin = '8px 0 4px';
      form.appendChild(timeLabel);
      if (blocking.status !== 'NEEDS_CLARIFICATION') {
        var timeInput = el('input');
        timeInput.type = 'time';
        timeInput.required = true;
        timeInput.name = 'reportedTimeOut';
        timeInput.style.cssText = 'width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;';
        form.appendChild(timeInput);
        var reason = el('textarea');
        reason.name = 'explanation';
        reason.required = true;
        reason.placeholder = 'Why the time-out was missed';
        reason.style.cssText = 'width:100%;min-height:72px;margin-top:8px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;';
        form.appendChild(reason);
        var evidence = el('textarea');
        evidence.name = 'evidenceNote';
        evidence.placeholder = 'Supporting details (optional). File upload is not used for time logs.';
        evidence.style.cssText = 'width:100%;min-height:56px;margin-top:8px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;';
        form.appendChild(evidence);
      } else {
        var note = el('textarea');
        note.name = 'note';
        note.required = true;
        note.placeholder = 'Your clarification';
        note.style.cssText = 'width:100%;min-height:72px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;';
        form.appendChild(note);
      }
      var actions = el('div', null, 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;');
      var submit = el('button', blocking.status === 'NEEDS_CLARIFICATION' ? 'Send clarification' : 'Submit correction');
      submit.type = 'submit';
      submit.style.cssText = 'background:#47BC3E;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;';
      var cancel = el('button', 'Close');
      cancel.type = 'button';
      cancel.style.cssText = 'background:#e2e8f0;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;';
      cancel.addEventListener('click', closeModal);
      actions.appendChild(submit);
      actions.appendChild(cancel);
      form.appendChild(actions);
      var msg = el('p', '', 'min-height:1.2em;font-size:0.9rem;');
      form.appendChild(msg);
      if (blocking.status === 'PENDING_REVIEW' && blocking.submittedAt) {
        form.querySelectorAll('input,textarea,button[type=submit]').forEach(function (node) {
          node.disabled = true;
        });
        msg.textContent = 'Submitted. Waiting for HR. Reference ' + blocking.reference + '.';
      }
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        submit.disabled = true;
        msg.textContent = 'Saving…';
        var body = {};
        if (blocking.status === 'NEEDS_CLARIFICATION') {
          body.note = form.note.value;
        } else {
          body.reportedTimeOut = form.reportedTimeOut.value;
          body.explanation = form.explanation.value;
          body.evidenceNote = form.evidenceNote.value;
        }
        var url = blocking.status === 'NEEDS_CLARIFICATION'
          ? opts.clarifyUrl(blocking.id)
          : opts.submitUrl(blocking.id);
        fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: 'Bearer ' + opts.token(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (r) {
          return r.json().then(function (j) { return { ok: r.ok, j: j }; });
        }).then(function (result) {
          if (!result.ok || !result.j.success) throw new Error((result.j && (result.j.message || result.j.error)) || 'Could not save');
          msg.textContent = 'Saved. Reference ' + ((result.j.doc && result.j.doc.reference) || blocking.reference) + '. Time In stays off until HR approves.';
          msg.style.color = '#166534';
        }).catch(function (err) {
          submit.disabled = false;
          msg.textContent = err.message || 'Could not save';
          msg.style.color = '#991b1b';
        });
      });
      card.appendChild(form);
    }
    if (rows.length) {
      card.appendChild(el('h3', 'Your requests', 'margin:16px 0 8px;font-size:1rem;'));
      rows.slice(0, 8).forEach(function (row) {
        card.appendChild(el('div', (row.reference || '') + ' · ' + (row.attendanceDate || '') + ' · ' + (row.status || '') + (row.reportedClockOut && row.reportedClockOut.time ? ' · reported ' + row.reportedClockOut.time : ''), 'font-size:0.85rem;padding:4px 0;border-bottom:1px solid #f1f5f9;'));
      });
    }
    wrap.addEventListener('click', function (ev) {
      if (ev.target === wrap) closeModal();
    });
    wrap.appendChild(card);
    document.body.appendChild(wrap);
  }

  function open(opts) {
    fetch(opts.mineUrl, {
      credentials: 'include',
      headers: { Authorization: 'Bearer ' + opts.token() }
    }).then(function (r) { return r.json(); }).then(function (payload) {
      paint(opts, payload && payload.success ? payload : { blocking: opts.exception, rows: [] });
    }).catch(function () {
      paint(opts, { blocking: opts.exception, rows: [] });
    });
  }

  window.RemoedAttendanceException = { open: open, close: closeModal };
})();
