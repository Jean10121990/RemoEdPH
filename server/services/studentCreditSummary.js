/**
 * Single source of truth for student credit figures returned to clients.
 * All arithmetic stays on the server; UIs must not recompute balances from raw fields.
 *
 * Field meanings (see Student model):
 * - creditBalance: purchased pool not yet consumed by finished classes
 * - reservedCredits: held for upcoming bookings
 * - usedCredits: lifetime consumed count
 * - totalCreditsEarned: lifetime purchased / credited top-ups
 */

function buildStudentCreditApiResponse(student) {
  if (!student) return null;

  const pool = Math.max(0, Number(student.creditBalance) || 0);
  const reserved = Math.max(0, Number(student.reservedCredits) || 0);
  const used = Math.max(0, Number(student.usedCredits) || 0);
  const totalEarned = Math.max(0, Number(student.totalCreditsEarned) || 0);

  const availableBalance = Math.max(pool - reserved, 0);

  const totalPurchased =
    totalEarned > 0 ? totalEarned : Math.max(used + pool, pool);

  const credits = Array.isArray(student.creditTransactions)
    ? [...student.creditTransactions]
    : [];
  credits.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const creditHistory = Array.isArray(student.creditHistory)
    ? [...student.creditHistory]
    : [];
  creditHistory.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return {
    success: true,
    balance: pool,
    availableBalance,
    totalCredits: pool,
    totalPurchased,
    reservedCredits: reserved,
    totalEarned: totalPurchased,
    used,
    usedCredits: used,
    subscriptionPlan: student.subscriptionPlan || null,
    subscriptionStatus: student.subscriptionStatus || null,
    paymentStatus: student.paymentStatus || null,
    creditHistory: creditHistory.map((c) => ({
      date: c.date,
      plan: c.plan,
      credits: c.credits,
      amountPaid: c.amountPaid,
      paymentId: c.paymentId || '',
    })),
    credits: credits.map((c) => ({
      date: c.date,
      type: c.type,
      plan: c.plan,
      description: c.description,
      credits: c.credits,
      balanceAfter: c.balanceAfter,
      amountPaid: c.amountPaid,
    })),
  };
}

module.exports = { buildStudentCreditApiResponse };
