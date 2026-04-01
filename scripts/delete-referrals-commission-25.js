/**
 * One-time cleanup: delete Referral rows recorded at the old ₱25 commission.
 *
 * Usage (from RemoEdPH directory, with MONGODB_URI in .env):
 *   node scripts/delete-referrals-commission-25.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const mongoose = require("mongoose");

const MONGO_URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/online-distance-learning";

async function main() {
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const Referral = require(path.join(__dirname, "..", "server", "models", "Referral"));
  const filter = { commissionAmount: 25 };
  const count = await Referral.countDocuments(filter);
  console.log(`Found ${count} referral(s) with commissionAmount === 25.`);
  if (count === 0) {
    await mongoose.disconnect();
    return;
  }
  const res = await Referral.deleteMany(filter);
  console.log(`Deleted ${res.deletedCount} document(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
