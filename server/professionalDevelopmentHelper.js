function toBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Comma-separated teacher emails treated as founders (top ladder / Legacy Guide exception).
 * Defaults: CEO + co-founder.
 */
function getFounderTeacherEmails() {
  const raw =
    process.env.REMOED_FOUNDER_TEACHER_EMAIL ||
    'jean10121990@gmail.com,plflores3301@gmail.com';
  return raw
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isFounderTeacherEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  return Boolean(e && getFounderTeacherEmails().includes(e));
}

function normalizeTeachingExperienceBand(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['y3', 'y5', 'y10', 'y15', 'y20plus', 'none'].includes(v)) return v;
  return 'none';
}

function teachingExperiencePoints(band) {
  const b = normalizeTeachingExperienceBand(band);
  if (b === 'y3') return 20;
  if (b === 'y5') return 30;
  if (b === 'y10') return 40;
  if (b === 'y15') return 50;
  if (b === 'y20plus') return 50;
  return 0;
}

function founderGrowthSnapshot() {
  return {
    professionalPoints: 245,
    ladderTier: 'Legacy Guide',
    careerGrowthTitle: 'Legacy Guide · Founder',
    hasEnglishDegree4Year: true,
    hasTesolTeylTefl: true,
    hasIeltsCertificate: true,
    eslExperienceLevel: '5plus',
    teachingExperienceBand: 'y20plus',
    teachingExperiencePoints: 50,
    hasValuesAlignment: true,
    heartHospitality: true,
    heartExcellence: true,
    heartAffection: true,
    heartRespect: true,
    heartTogetherness: true,
    honorAvoidFalseWitness: true,
    honorNoGossipPolitics: true,
    honorIntegritySpeech: true,
    honorGoodAttitudeAntiGreed: true,
    honorFinancialStewardship: true,
    hasProfessionalLetLicense: true,
    hasMastersDegree: true,
    hasDoctorateDegree: true,
    loyaltyPoints: 35,
    loyaltyYears: 25,
    allHeartCommitments: true,
    allHonorCommitments: true,
    allCommitmentsComplete: true
  };
}

function normalizeEslExperienceLevel(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === '2years') return '2years';
  if (v === '3to5') return '3to5';
  if (v === '5plus') return '5plus';
  return 'none';
}

function parseHireDate(value) {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function wholeYearsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  let years = endDate.getFullYear() - startDate.getFullYear();
  const monthDelta = endDate.getMonth() - startDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && endDate.getDate() < startDate.getDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

function loyaltyPointsFromHireDate(hireDateValue) {
  const hireDate = parseHireDate(hireDateValue);
  if (!hireDate) return { loyaltyYears: 0, loyaltyPoints: 0 };
  const loyaltyYears = wholeYearsBetween(hireDate, new Date());
  let loyaltyPoints = 0;
  if (loyaltyYears >= 25) loyaltyPoints = 35;
  else if (loyaltyYears >= 20) loyaltyPoints = 30;
  else if (loyaltyYears >= 15) loyaltyPoints = 25;
  else if (loyaltyYears >= 10) loyaltyPoints = 20;
  else if (loyaltyYears >= 5) loyaltyPoints = 15;
  else if (loyaltyYears >= 3) loyaltyPoints = 10;
  else if (loyaltyYears >= 1) loyaltyPoints = 5;
  return { loyaltyYears, loyaltyPoints };
}

function calculateGrowth(data = {}) {
  if (isFounderTeacherEmail(data.email)) {
    return founderGrowthSnapshot();
  }
  const hasEnglishDegree4Year = toBool(data.hasEnglishDegree4Year);
  const hasTesolTeylTefl = toBool(data.hasTesolTeylTefl);
  const hasIeltsCertificate = toBool(data.hasIeltsCertificate);
  const legacyValuesAlignment = toBool(data.hasValuesAlignment);
  const heartHospitality = toBool(data.heartHospitality);
  const heartExcellence = toBool(data.heartExcellence);
  const heartAffection = toBool(data.heartAffection);
  const heartRespect = toBool(data.heartRespect);
  const heartTogetherness = toBool(data.heartTogetherness);
  const honorAvoidFalseWitness = toBool(data.honorAvoidFalseWitness);
  const honorNoGossipPolitics = toBool(data.honorNoGossipPolitics);
  const honorIntegritySpeech = toBool(data.honorIntegritySpeech);
  const honorGoodAttitudeAntiGreed = toBool(data.honorGoodAttitudeAntiGreed);
  const honorFinancialStewardship = toBool(data.honorFinancialStewardship);
  const hasProfessionalLetLicense = toBool(data.hasProfessionalLetLicense);
  const hasMastersDegree = toBool(data.hasMastersDegree);
  const hasDoctorateDegree = toBool(data.hasDoctorateDegree);
  const eslExperienceLevel = normalizeEslExperienceLevel(data.eslExperienceLevel);
  const teachingExperienceBand = normalizeTeachingExperienceBand(data.teachingExperienceBand);
  const teachingExpPts = teachingExperiencePoints(teachingExperienceBand);
  const { loyaltyYears, loyaltyPoints } = loyaltyPointsFromHireDate(data.hireDate);

  let points = 0;
  if (hasEnglishDegree4Year) points += 20;
  if (hasTesolTeylTefl) points += 15;
  if (hasIeltsCertificate) points += 15;
  if (eslExperienceLevel === '2years') points += 15;
  if (eslExperienceLevel === '3to5') points += 20;
  if (eslExperienceLevel === '5plus') points += 25;
  if (hasProfessionalLetLicense) points += 25;
  if (hasMastersDegree) points += 30;
  if (hasDoctorateDegree) points += 30;
  points += loyaltyPoints;
  points += teachingExpPts;

  const hasEntryRequirement = hasTesolTeylTefl || hasEnglishDegree4Year;
  const hasAtLeast2Years = ['2years', '3to5', '5plus'].includes(eslExperienceLevel);
  const hasAtLeast3Years = ['3to5', '5plus'].includes(eslExperienceLevel);
  const hasAtLeast5Years = eslExperienceLevel === '5plus';
  const allHeartCommitments =
    heartHospitality &&
    heartExcellence &&
    heartAffection &&
    heartRespect &&
    heartTogetherness;
  const allHonorCommitments =
    honorAvoidFalseWitness &&
    honorNoGossipPolitics &&
    honorIntegritySpeech &&
    honorGoodAttitudeAntiGreed &&
    honorFinancialStewardship;
  const allCommitmentsComplete = (allHeartCommitments && allHonorCommitments) || legacyValuesAlignment;

  const hasCoreCertification =
    hasEnglishDegree4Year &&
    hasTesolTeylTefl &&
    hasIeltsCertificate &&
    hasProfessionalLetLicense;
  let ladderTier = 'Not Qualified';
  if (hasAtLeast5Years && hasCoreCertification && allCommitmentsComplete) {
    ladderTier = 'Legacy Guide';
  } else if (hasAtLeast3Years && hasEnglishDegree4Year && hasTesolTeylTefl && allCommitmentsComplete) {
    ladderTier = 'Steward Mentor';
  } else if (hasAtLeast2Years) {
    ladderTier = 'Cultivator';
  } else if (hasEntryRequirement) {
    ladderTier = 'Seedling Educator';
  }

  return {
    professionalPoints: points,
    ladderTier,
    careerGrowthTitle: ladderTier,
    hasEnglishDegree4Year,
    hasTesolTeylTefl,
    hasIeltsCertificate,
    eslExperienceLevel,
    teachingExperienceBand,
    teachingExperiencePoints: teachingExpPts,
    hasValuesAlignment: allCommitmentsComplete,
    heartHospitality,
    heartExcellence,
    heartAffection,
    heartRespect,
    heartTogetherness,
    honorAvoidFalseWitness,
    honorNoGossipPolitics,
    honorIntegritySpeech,
    honorGoodAttitudeAntiGreed,
    honorFinancialStewardship,
    hasProfessionalLetLicense,
    hasMastersDegree,
    hasDoctorateDegree,
    loyaltyPoints,
    loyaltyYears,
    allHeartCommitments,
    allHonorCommitments,
    allCommitmentsComplete
  };
}

function calculateProfessionalDevelopment(data = {}) {
  return calculateGrowth(data);
}

module.exports = {
  calculateGrowth,
  calculateProfessionalDevelopment,
  getFounderTeacherEmails,
  isFounderTeacherEmail,
  founderGrowthSnapshot,
  normalizeTeachingExperienceBand,
  teachingExperiencePoints
};
