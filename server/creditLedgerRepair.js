/**
 * Dedupe PayMongo / purchase rows for API display and optional DB repair.
 * Duplicates came from: (1) both creditHistory + creditTransactions for one payment,
 * (2) webhook retries with different ids, (3) two creditHistory rows with same paymentId.
 */

function _purchaseFingerprint(h) {
  const pid = String(h.paymentId || '').trim();
  if (pid) return `pid:${pid}`;
  return `t:${Math.floor(new Date(h.date || 0).getTime() / 1000)}:${Number(h.credits)}:${String(h.plan || '')}:${Number(h.amountPaid || 0)}`;
}

/**
 * Remove redundant PayMongo duplicate rows from merged display rows (same payment / same moment).
 * Prefers creditHistory over transaction and rows with balanceAfter set.
 */
function dedupeMergedCreditRows(rows) {
  const isPurchaseRow = (r) =>
    r.type === 'purchase' || (r.type !== 'use' && Number(r.credits) > 0);

  const rank = (r) => {
    let s = 0;
    const purchase = isPurchaseRow(r);
    if (purchase) {
      if (r.source === 'creditHistory') s += 8;
    } else {
      // Usage / deductions: prefer creditTransactions (richer description, canonical ledger).
      if (r.source === 'transaction') s += 8;
    }
    if (r.balanceAfter != null && r.balanceAfter !== '') s += 4;
    if (purchase && r.type === 'purchase' && String(r.description || '').startsWith('Purchase')) s += 2;
    return s;
  };

  const best = new Map();
  for (const row of rows) {
    let key;
    if (isPurchaseRow(row)) {
      const pid = String(row.paymentId || '').trim();
      key = pid
        ? `p:${pid}`
        : `p:${Math.floor(new Date(row.date || 0).getTime() / 1000)}:${Number(row.credits)}:${String(row.plan || '')}:${Number(row.amountPaid || 0)}`;
    } else {
      const pid = String(row.paymentId || '').trim();
      // Same millisecond + same delta => one ledger event (e.g. creditTransactions + creditHistory for one class).
      const ts = new Date(row.date || 0).getTime();
      key = pid ? `u:${pid}` : `u:${ts}:${Number(row.credits)}`;
    }
    const prev = best.get(key);
    if (!prev || rank(row) > rank(prev)) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

/**
 * Strip legacy PayMongo-only duplicate lines from mapped transaction rows (before merge).
 */
function filterLegacyPaymongoTransactionRows(txRows) {
  return txRows.filter((row) => {
    if (row.type !== 'purchase' || row.source !== 'transaction') return true;
    const d = String(row.description || '');
    if (/paymongo/i.test(d)) return false;
    return true;
  });
}

/**
 * Returns true if stored arrays likely contain duplicate purchase data worth fixing.
 */
function studentLedgerNeedsRepair(student) {
  const txs = student.creditTransactions || [];
  const hasPaymongoTx = txs.some((tx) => {
    if (tx.type !== 'purchase') return false;
    return /paymongo/i.test(String(tx.description || ''));
  });
  if (hasPaymongoTx) return true;

  const hist = student.creditHistory || [];
  const purchaseKeys = [];
  for (const h of hist) {
    if (h.entryType === 'usage') continue;
    purchaseKeys.push(_purchaseFingerprint(h));
  }
  return purchaseKeys.length !== new Set(purchaseKeys).size;
}

/**
 * Mutates a Mongoose Student document: removes duplicate PayMongo tx rows and duplicate purchase creditHistory.
 */
function repairStudentLedgerDoc(student) {
  const txs = student.creditTransactions || [];
  student.creditTransactions = txs.filter((tx) => {
    if (tx.type !== 'purchase') return true;
    return !/paymongo/i.test(String(tx.description || ''));
  });

  const hist = student.creditHistory || [];
  const usages = hist.filter((h) => h.entryType === 'usage');
  const purchases = hist.filter((h) => h.entryType !== 'usage');

  const byFp = new Map();
  for (const h of purchases) {
    const fp = _purchaseFingerprint(h);
    const ex = byFp.get(fp);
    if (!ex) {
      byFp.set(fp, h);
      continue;
    }
    const keep =
      h.balanceAfter != null && ex.balanceAfter == null
        ? h
        : ex.balanceAfter != null && h.balanceAfter == null
          ? ex
          : h.date > ex.date
            ? h
            : ex;
    byFp.set(fp, keep);
  }

  student.creditHistory = [...usages, ...byFp.values()].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
  );
}

module.exports = {
  dedupeMergedCreditRows,
  filterLegacyPaymongoTransactionRows,
  studentLedgerNeedsRepair,
  repairStudentLedgerDoc
};
