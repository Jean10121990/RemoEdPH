/**
 * mongosh — delete referrals with legacy ₱25 commissionAmount.
 *
 * 1. Set APP_DB to your database name (same as in MONGODB_URI path).
 * 2. Run:
 *    mongosh "YOUR_URI" scripts/mongo/delete-referrals-commission-25.mongosh.js
 */
const APP_DB = "online-distance-learning";

const target = db.getSiblingDB(APP_DB);
const coll = target.getCollection("referrals");
const filter = { commissionAmount: 25 };
const n = coll.countDocuments(filter);
print("Found " + n + " referral(s) with commissionAmount === 25 in " + APP_DB);
if (n === 0) {
  quit(0);
}
const res = coll.deleteMany(filter);
print("Deleted " + res.deletedCount + " document(s).");
