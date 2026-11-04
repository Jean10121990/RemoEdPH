'use strict';

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function monthlySplit({ grossPhp, teachersPhp, affiliatesPhp }) {
  const gross = round2(grossPhp);
  const teachers = round2(teachersPhp);
  const affiliates = round2(affiliatesPhp);
  const partners = round2(gross * 0.02);
  const growth = round2(gross * 0.05);
  const charity = round2(gross * 0.05);
  const buffer = round2(gross * 0.05);
  const ops = 6400;
  const profit = round2(gross - teachers - affiliates - partners - ops - growth - charity - buffer);
  return { gross, teachers, affiliates, partners, ops, growth, charity, buffer, profit };
}

module.exports = { monthlySplit, round2 };
