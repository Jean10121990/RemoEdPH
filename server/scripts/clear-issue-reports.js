/**
 * Clear QA Issue Management test data:
 * - IssueReport (class issue cards)
 * - CancellationRequest (cancellation request cards on the same tab)
 *
 * Does not remove files under uploads/issue-screenshots.
 *
 * Usage: node server/scripts/clear-issue-reports.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const IssueReport = require('../models/IssueReport');
const CancellationRequest = require('../models/CancellationRequest');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/online-learning';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const issues = await IssueReport.deleteMany({});
  console.log('Deleted IssueReport count:', issues.deletedCount);

  const cancels = await CancellationRequest.deleteMany({});
  console.log('Deleted CancellationRequest count:', cancels.deletedCount);

  console.log(
    'Note: screenshot files under uploads/issue-screenshots (if any) were left on disk.'
  );

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
