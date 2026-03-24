function toBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
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
  calculateProfessionalDevelopment
};
