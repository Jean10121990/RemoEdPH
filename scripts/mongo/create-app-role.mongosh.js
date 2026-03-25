/**
 * mongosh — create a DB-scoped role without dropDatabase / dropCollection.
 *
 * Usage:
 *   mongosh "mongodb://admin:...@host:27017/admin" create-app-role.mongosh.js
 *
 * Then create user (example):
 *   use admin
 *   db.createUser({
 *     user: "remoed_app",
 *     pwd: "CHANGE_ME_STRONG_PASSWORD",
 *     roles: [ { role: "remoedAppReadWriteLimited", db: "YOUR_DB_NAME" } ]
 *   });
 *
 * Atlas: mirror privileges in a Custom Role instead of running this script.
 */

const APP_DB = 'online-distance-learning'; // must match MONGODB_URI database name

const target = db.getSiblingDB(APP_DB);

const existing = target.getRole('remoedAppReadWriteLimited');
if (existing) {
  print('Role remoedAppReadWriteLimited already exists on', APP_DB, '- update manually if needed.');
} else {
  target.createRole({
    role: 'remoedAppReadWriteLimited',
    privileges: [
      {
        resource: { db: APP_DB, collection: '' },
        actions: [
          'find',
          'insert',
          'update',
          'remove',
          'createIndex',
          'listIndexes',
          'dbStats',
          'collStats',
        ],
      },
    ],
    roles: [],
  });
  print('Created role remoedAppReadWriteLimited on database', APP_DB);
}

print('Next: create application user with only this role on', APP_DB);
