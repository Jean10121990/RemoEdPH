/**
 * Copy screening ID / NBI onto a teacher profile after they pass and sign up.
 * Application stores public upload URLs; teacher profile stores { fileData, fileName }.
 */

function fileNameFromUploadUrl(url, fallback) {
  const raw = String(url || '').trim();
  if (!raw) return fallback;
  try {
    const base = decodeURIComponent(raw.split('?')[0].split('/').pop() || '');
    const cleaned = base.replace(/^\d+-\d+-/, '').replace(/[_]+/g, ' ').trim();
    return cleaned || fallback;
  } catch (_e) {
    return fallback;
  }
}

function teacherDocumentFieldsFromApplication(application) {
  const docs = (application && application.uploadedDocuments) || {};
  const nationalId = String(docs.nationalId || '').trim();
  const nbi = String(docs.nbi || '').trim();
  const fields = {};
  if (nationalId) {
    fields.validIds = [{ fileData: nationalId, fileName: fileNameFromUploadUrl(nationalId, 'National ID') }];
  }
  if (nbi) {
    fields.nbiClearances = [{ fileData: nbi, fileName: fileNameFromUploadUrl(nbi, 'NBI Clearance') }];
    fields.nbiClearanceStatus = 'submitted';
  }
  return fields;
}

function hasDocEntries(list) {
  return Array.isArray(list) && list.some((d) => d && (d.fileData || d.fileName));
}

function applyApplicantDocumentsToTeacher(teacher, application) {
  if (!teacher) return {};
  const fields = teacherDocumentFieldsFromApplication(application);
  if (!teacher.documents) teacher.documents = {};
  if (fields.validIds && !hasDocEntries(teacher.documents.validIds) && !teacher.documents.validId) {
    teacher.documents.validIds = fields.validIds;
  }
  if (fields.nbiClearances && !hasDocEntries(teacher.documents.nbiClearances)) {
    teacher.documents.nbiClearances = fields.nbiClearances;
  }
  if (fields.nbiClearanceStatus && (!teacher.nbiClearanceStatus || teacher.nbiClearanceStatus === 'none')) {
    teacher.nbiClearanceStatus = fields.nbiClearanceStatus;
  }
  return fields;
}

module.exports = {
  fileNameFromUploadUrl,
  teacherDocumentFieldsFromApplication,
  applyApplicantDocumentsToTeacher,
};
