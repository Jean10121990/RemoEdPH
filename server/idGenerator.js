function safeInitial(str) {
  const s = String(str || '').trim();
  return s ? s[0].toUpperCase() : '';
}

function initialsFromName({ firstName = '', middleName = '', lastName = '', fallback = '' } = {}) {
  const fromNames = `${safeInitial(firstName)}${safeInitial(middleName)}${safeInitial(lastName)}`;
  if (fromNames.length >= 3) return fromNames.slice(0, 3);

  const letters = String(fallback || '')
    .replace(/[^A-Za-z]+/g, '')
    .toUpperCase();
  const mixed = (fromNames + letters).slice(0, 3);
  return mixed.padEnd(3, 'X');
}

function monthYearKey(date = new Date()) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}${yyyy}`;
}

/**
 * Format: KBF07202500001 (3 initials + MMYYYY + 5-digit sequence)
 */
function makeCompanyId(initials, date, sequence) {
  const init = String(initials || 'XXX').toUpperCase().padEnd(3, 'X').slice(0, 3);
  const my = monthYearKey(date);
  const seq = String(sequence || 1).padStart(5, '0');
  return `${init}${my}${seq}`;
}

async function generateCompanyId(Model, fieldName, person, startDate = new Date()) {
  const initials = initialsFromName(person);
  const prefix = `${initials}${monthYearKey(startDate)}`;
  const regex = new RegExp(`^${prefix}`);
  const count = await Model.countDocuments({ [fieldName]: { $regex: regex } });
  return makeCompanyId(initials, startDate, count + 1);
}

module.exports = {
  initialsFromName,
  monthYearKey,
  makeCompanyId,
  generateCompanyId
};
