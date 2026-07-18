const PeerMessage = require('../models/PeerMessage');

/**
 * Chats with at least one message involving `me`, newest first.
 * @param {string} me - Canonical peer id (teacherId or student username)
 */
async function aggregateActiveChats(me) {
  const lastPerPeer = await PeerMessage.aggregate([
    { $match: { $or: [{ senderId: me }, { recipientId: me }] } },
    {
      $addFields: {
        otherId: {
          $cond: [{ $eq: ['$senderId', me] }, '$recipientId', '$senderId'],
        },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$otherId',
        lastMessage: { $first: '$message' },
        lastAt: { $first: '$createdAt' },
      },
    },
    { $sort: { lastAt: -1 } },
  ]);

  const unreadAgg = await PeerMessage.aggregate([
    {
      $match: {
        recipientId: me,
        readAt: null,
        senderId: { $ne: me },
      },
    },
    { $group: { _id: '$senderId', unreadCount: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unreadAgg.map((u) => [u._id, u.unreadCount]));

  return lastPerPeer.map((row) => ({
    peerId: row._id,
    lastMessage: row.lastMessage,
    lastAt: row.lastAt,
    unreadCount: unreadMap.get(row._id) || 0,
  }));
}

/**
 * Paginated thread: newest first in DB, returned chronological (oldest → newest in array).
 */
async function fetchPeerMessagesPage({ me, peerId, before, limit }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const query = {
    $or: [
      { senderId: me, recipientId: peerId },
      { senderId: peerId, recipientId: me },
    ],
  };
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) {
      query.createdAt = { $lt: d };
    }
  }

  const raw = await PeerMessage.find(query).sort({ createdAt: -1 }).limit(lim + 1).lean();
  const hasMore = raw.length > lim;
  const slice = raw.slice(0, lim);
  const messages = slice.reverse().map((m) => ({
    id: m._id.toString(),
    senderId: m.senderId,
    recipientId: m.recipientId,
    message: m.message,
    createdAt: m.createdAt,
    readAt: m.readAt,
  }));

  const oldest = slice.length ? slice[slice.length - 1].createdAt : null;
  return {
    messages,
    hasMore,
    nextBefore: oldest ? new Date(oldest).toISOString() : null,
  };
}

module.exports = {
  aggregateActiveChats,
  fetchPeerMessagesPage,
};
