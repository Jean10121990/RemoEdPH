/**
 * Virtual Garden & Eco-Drop wallet — separate from lesson credits.
 * Spec: SKILLS.md § Gamification: Virtual Garden & Eco-Drop Engine
 */
const Student = require('../models/Student');
const StudentGardenItem = require('../models/StudentGardenItem');
const EcoDropLedger = require('../models/EcoDropLedger');
const LessonProgress = require('../models/LessonProgress');
const { isMongoObjectId } = require('../utils/mongoObjectId');

const PLOT_COUNT = 8;
const COST_SEED = 5;
const COST_WATER = 5;
const COST_TREE = 22;
const MAX_STAGE = 3;

const MILESTONE_THRESHOLDS = [
  { code: 'drops_5', at: 5, label: 'Garden butterfly' },
  { code: 'drops_11', at: 11, label: 'Rainbow flower' },
  { code: 'drops_22', at: 22, label: 'Remo treehouse' },
];

const MILESTONE_CATALOG = MILESTONE_THRESHOLDS.map((m) => ({
  code: m.code,
  label: m.label,
  at: m.at,
}));

function stageToItemType(stage, preferFlower) {
  if (stage <= 0) return 'seed';
  if (stage === 1) return 'plant';
  if (preferFlower) return 'flower';
  return 'tree';
}

async function findStudentDoc(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid) return null;
  return Student.findOne({
    $or: [{ username: sid }, { studentCode: sid }],
  });
}

function serializeState(student, items, celebration) {
  const balance = Number(student.ecoDropsBalance) || 0;
  const totalEarned = Number(student.totalEcoDropsEarned) || 0;
  const unlocked = Array.isArray(student.gardenUnlockedMilestones)
    ? student.gardenUnlockedMilestones
    : [];
  const plantsGrown = items.filter(
    (it) => Number(it.growthStage) >= 1 || it.itemType === 'flower' || it.itemType === 'tree'
  ).length;
  const plots = [];
  for (let i = 0; i < PLOT_COUNT; i++) {
    const found = items.find((it) => Number(it.positionIndex) === i) || null;
    plots.push(
      found
        ? {
            positionIndex: i,
            occupied: true,
            item: {
              id: String(found._id),
              itemType: found.itemType,
              growthStage: found.growthStage,
              plantedAt: found.plantedAt,
              variant: found.variant || '',
            },
          }
        : { positionIndex: i, occupied: false, item: null }
    );
  }
  return {
    success: true,
    ecoDropsBalance: balance,
    eco_drops_balance: balance,
    totalEcoDropsEarned: totalEarned,
    total_eco_drops_earned: totalEarned,
    plantsGrown,
    total_plants_grown: plantsGrown,
    pendingCelebration: celebration,
    celebration,
    plotCount: PLOT_COUNT,
    costs: { buy_seed: COST_SEED, water_plant: COST_WATER, buy_tree: COST_TREE },
    milestones: MILESTONE_CATALOG.map((m) => ({
      ...m,
      unlocked: unlocked.indexOf(m.code) !== -1,
    })),
    unlockedMilestones: unlocked,
    items: items.map((it) => ({
      id: String(it._id),
      itemType: it.itemType,
      growthStage: it.growthStage,
      positionIndex: it.positionIndex,
      plantedAt: it.plantedAt,
      variant: it.variant || '',
    })),
    plots,
  };
}

async function applyMilestones(student) {
  const total = Number(student.totalEcoDropsEarned) || 0;
  const unlocked = new Set(student.gardenUnlockedMilestones || []);
  let changed = false;
  for (const m of MILESTONE_THRESHOLDS) {
    if (total >= m.at && !unlocked.has(m.code)) {
      unlocked.add(m.code);
      changed = true;
    }
  }
  if (changed) {
    student.gardenUnlockedMilestones = Array.from(unlocked);
    await student.save();
  }
  return student;
}

/**
 * +1 Eco-Drop on first lesson completion. Idempotent via ledger.
 */
async function grantEcoDropForLessonComplete({ studentId, lessonId, bookingId }) {
  const sid = String(studentId || '').trim();
  if (!sid || !lessonId || !isMongoObjectId(lessonId._id || lessonId)) {
    return { awarded: false, reason: 'invalid_args' };
  }
  const lid = lessonId._id || lessonId;

  try {
    await EcoDropLedger.create({
      studentId: sid,
      amount: 1,
      reason: 'lesson_complete',
      lessonId: lid,
      bookingId: bookingId || null,
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      return { awarded: false, reason: 'already_awarded' };
    }
    throw err;
  }

  let student = await findStudentDoc(sid);
  if (!student) {
    // Ledger row exists; try username-only lookup after create failure path
    student = await Student.findOne({ username: sid });
  }
  if (!student) {
    return { awarded: false, reason: 'student_not_found' };
  }

  student.ecoDropsBalance = (Number(student.ecoDropsBalance) || 0) + 1;
  student.totalEcoDropsEarned = (Number(student.totalEcoDropsEarned) || 0) + 1;
  student.pendingEcoDropCelebration =
    (Number(student.pendingEcoDropCelebration) || 0) + 1;
  await student.save();
  await applyMilestones(student);

  await EcoDropLedger.updateOne(
    { studentId: sid, lessonId: lid, reason: 'lesson_complete' },
    { $set: { balanceAfter: student.ecoDropsBalance } }
  );

  return {
    awarded: true,
    balance: student.ecoDropsBalance,
    totalEarned: student.totalEcoDropsEarned,
  };
}

async function getGardenState(studentId, opts = {}) {
  const student = await findStudentDoc(studentId);
  if (!student) {
    const err = new Error('Student not found');
    err.status = 404;
    throw err;
  }
  let celebration = Number(student.pendingEcoDropCelebration) || 0;
  if (opts.ackCelebration && celebration > 0) {
    student.pendingEcoDropCelebration = 0;
    await student.save();
  }
  const items = await StudentGardenItem.find({ studentId: student.username })
    .sort({ positionIndex: 1 })
    .lean();
  return serializeState(student, items, opts.ackCelebration ? 0 : celebration);
}

async function getEcoDropBalance(studentId) {
  const student = await findStudentDoc(studentId);
  if (!student) {
    return { ecoDropsBalance: 0, pendingCelebration: 0 };
  }
  return {
    ecoDropsBalance: Number(student.ecoDropsBalance) || 0,
    eco_drops_balance: Number(student.ecoDropsBalance) || 0,
    totalEcoDropsEarned: Number(student.totalEcoDropsEarned) || 0,
    pendingCelebration: Number(student.pendingEcoDropCelebration) || 0,
  };
}

function firstEmptyPlot(items) {
  const used = new Set(items.map((it) => Number(it.positionIndex)));
  for (let i = 0; i < PLOT_COUNT; i++) {
    if (!used.has(i)) return i;
  }
  return -1;
}

async function gardenAction(studentId, body = {}) {
  const action = String(body.action || '').trim().toLowerCase();
  const student = await findStudentDoc(studentId);
  if (!student) {
    const err = new Error('Student not found');
    err.status = 404;
    throw err;
  }
  const username = student.username;
  const items = await StudentGardenItem.find({ studentId: username });

  if (action === 'buy_seed') {
    if ((Number(student.ecoDropsBalance) || 0) < COST_SEED) {
      const err = new Error('Not enough Eco-Drops. Need 5 to buy seeds.');
      err.status = 400;
      err.code = 'INSUFFICIENT_ECO_DROPS';
      throw err;
    }
    let pos =
      body.positionIndex != null && body.positionIndex !== ''
        ? Number(body.positionIndex)
        : firstEmptyPlot(items);
    if (!Number.isInteger(pos) || pos < 0 || pos >= PLOT_COUNT) {
      const err = new Error('No empty garden plots left.');
      err.status = 400;
      err.code = 'GARDEN_FULL';
      throw err;
    }
    if (items.some((it) => Number(it.positionIndex) === pos)) {
      const err = new Error('That plot already has a plant.');
      err.status = 400;
      err.code = 'PLOT_OCCUPIED';
      throw err;
    }
    student.ecoDropsBalance = (Number(student.ecoDropsBalance) || 0) - COST_SEED;
    await student.save();
    const item = await StudentGardenItem.create({
      studentId: username,
      itemType: 'seed',
      growthStage: 0,
      positionIndex: pos,
      plantedAt: new Date(),
    });
    await EcoDropLedger.create({
      studentId: username,
      amount: -COST_SEED,
      reason: 'buy_seed',
      gardenItemId: item._id,
      balanceAfter: student.ecoDropsBalance,
    });
    const fresh = await StudentGardenItem.find({ studentId: username }).sort({ positionIndex: 1 }).lean();
    return {
      ...serializeState(student, fresh, Number(student.pendingEcoDropCelebration) || 0),
      actionResult: { action: 'buy_seed', itemId: String(item._id), positionIndex: pos },
    };
  }

  if (action === 'water_plant') {
    if ((Number(student.ecoDropsBalance) || 0) < COST_WATER) {
      const err = new Error('Not enough Eco-Drops. Need 5 to water a plant.');
      err.status = 400;
      err.code = 'INSUFFICIENT_ECO_DROPS';
      throw err;
    }
    let item = null;
    if (body.itemId && isMongoObjectId(body.itemId)) {
      item = items.find((it) => String(it._id) === String(body.itemId));
    } else if (body.positionIndex != null) {
      item = items.find((it) => Number(it.positionIndex) === Number(body.positionIndex));
    }
    if (!item) {
      const err = new Error('Pick a plant to water.');
      err.status = 400;
      err.code = 'ITEM_REQUIRED';
      throw err;
    }
    if (Number(item.growthStage) >= MAX_STAGE) {
      const err = new Error('This plant is already fully grown!');
      err.status = 400;
      err.code = 'ALREADY_MAX';
      throw err;
    }
    student.ecoDropsBalance = (Number(student.ecoDropsBalance) || 0) - COST_WATER;
    await student.save();
    item.growthStage = Number(item.growthStage) + 1;
    item.itemType = stageToItemType(item.growthStage, false);
    await item.save();
    await EcoDropLedger.create({
      studentId: username,
      amount: -COST_WATER,
      reason: 'water_plant',
      gardenItemId: item._id,
      balanceAfter: student.ecoDropsBalance,
    });
    const fresh = await StudentGardenItem.find({ studentId: username }).sort({ positionIndex: 1 }).lean();
    return {
      ...serializeState(student, fresh, Number(student.pendingEcoDropCelebration) || 0),
      actionResult: {
        action: 'water_plant',
        itemId: String(item._id),
        growthStage: item.growthStage,
      },
    };
  }

  if (action === 'buy_tree') {
    if ((Number(student.ecoDropsBalance) || 0) < COST_TREE) {
      const err = new Error('Not enough Eco-Drops. Need 22 to buy flowers & trees.');
      err.status = 400;
      err.code = 'INSUFFICIENT_ECO_DROPS';
      throw err;
    }
    let pos =
      body.positionIndex != null && body.positionIndex !== ''
        ? Number(body.positionIndex)
        : firstEmptyPlot(items);
    if (!Number.isInteger(pos) || pos < 0 || pos >= PLOT_COUNT) {
      const err = new Error('No empty garden plots left.');
      err.status = 400;
      err.code = 'GARDEN_FULL';
      throw err;
    }
    if (items.some((it) => Number(it.positionIndex) === pos)) {
      const err = new Error('That plot already has a plant.');
      err.status = 400;
      err.code = 'PLOT_OCCUPIED';
      throw err;
    }
    const preferFlower = String(body.itemType || '').toLowerCase() === 'flower';
    student.ecoDropsBalance = (Number(student.ecoDropsBalance) || 0) - COST_TREE;
    await student.save();
    const item = await StudentGardenItem.create({
      studentId: username,
      itemType: preferFlower ? 'flower' : 'tree',
      growthStage: MAX_STAGE,
      positionIndex: pos,
      plantedAt: new Date(),
    });
    await EcoDropLedger.create({
      studentId: username,
      amount: -COST_TREE,
      reason: 'buy_tree',
      gardenItemId: item._id,
      balanceAfter: student.ecoDropsBalance,
    });
    const fresh = await StudentGardenItem.find({ studentId: username }).sort({ positionIndex: 1 }).lean();
    return {
      ...serializeState(student, fresh, Number(student.pendingEcoDropCelebration) || 0),
      actionResult: { action: 'buy_tree', itemId: String(item._id), positionIndex: pos },
    };
  }

  const err = new Error('Unknown garden action. Use buy_seed, water_plant, or buy_tree.');
  err.status = 400;
  err.code = 'INVALID_ACTION';
  throw err;
}

/**
 * Backfill grant when LessonProgress is already completed.
 */
async function ensureEcoDropForCompletedLesson(studentId, lessonId, bookingId) {
  const sid = String(studentId || '').trim();
  if (!sid || !lessonId) {
    return { awarded: false, reason: 'invalid_args' };
  }
  let aliasList = [sid];
  try {
    const studentBadgeService = require('./studentBadgeService');
    const aliases = await studentBadgeService.resolveStudentIdAliases(sid);
    if (aliases && aliases.length) aliasList = aliases;
  } catch (_e) {}
  const progress = await LessonProgress.findOne({
    studentId: { $in: aliasList },
    lessonId,
    status: 'completed',
  }).lean();
  if (!progress) {
    const err = new Error('Lesson is not completed yet.');
    err.status = 409;
    err.code = 'LESSON_NOT_COMPLETED';
    throw err;
  }
  const grantSid =
    (await (async () => {
      try {
        const studentBadgeService = require('./studentBadgeService');
        return (
          (await studentBadgeService.canonicalBookingStudentId(sid)) || sid
        );
      } catch (_e2) {
        return sid;
      }
    })());
  return grantEcoDropForLessonComplete({
    studentId: grantSid,
    lessonId,
    bookingId: bookingId || progress.bookingId || null,
  });
}

module.exports = {
  PLOT_COUNT,
  COST_SEED,
  COST_WATER,
  COST_TREE,
  grantEcoDropForLessonComplete,
  getGardenState,
  getEcoDropBalance,
  gardenAction,
  ensureEcoDropForCompletedLesson,
  applyMilestones,
};
