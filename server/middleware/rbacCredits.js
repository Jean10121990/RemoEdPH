/**
 * Explicit RBAC for credit mutations (documentation + single import point).
 * Actual enforcement: POST /api/credits/update uses verifyAdminApiAuth + requireAdmin;
 * POST /api/credits/spend uses verifyToken + requireStudent.
 */

const { verifyAdminApiAuth, requireAdmin, verifyToken, requireStudent } = require('../authMiddleware');

const creditsAdminGrantChain = [verifyAdminApiAuth, requireAdmin];
const creditsStudentSpendChain = [verifyToken, requireStudent];

module.exports = {
  creditsAdminGrantChain,
  creditsStudentSpendChain,
};
