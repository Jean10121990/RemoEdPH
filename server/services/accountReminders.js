/**
 * Persistent bell reminders. Not stored — they stay until the profile or legal step is done.
 */

function filled(value) {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim().length > 0;
}

function missingAny(doc, fields) {
  if (!doc) return true;
  return fields.some((key) => !filled(doc[key]));
}

function reminder(id, type, message, actionUrl) {
  return {
    _id: id,
    type,
    message,
    actionUrl,
    read: false,
    createdAt: new Date().toISOString(),
    importance: 'actionable',
    actionable: true,
    persistent: true,
  };
}

function legalReminders(doc, termsUrl, privacyUrl) {
  const items = [];
  const tos = doc && doc.tosAgreement;
  const privacy = doc && doc.privacyPolicy;
  if (!tos || tos.accepted !== true) {
    items.push(
      reminder(
        'reminder-tos',
        'tos-reminder',
        'Please read and sign the Terms and Conditions.',
        termsUrl
      )
    );
  }
  if (!privacy || privacy.accepted !== true) {
    items.push(
      reminder(
        'reminder-privacy',
        'privacy-reminder',
        'Please read and sign the Privacy Policy.',
        privacyUrl
      )
    );
  }
  return items;
}

function studentAccountReminders(student) {
  const incomplete = missingAny(student, [
    'firstName',
    'middleName',
    'lastName',
    'nickname',
    'gender',
    'birthday',
    'email',
    'contact',
    'address',
    'language',
    'hobbies',
    'aboutMe',
    'parentName',
    'parentContact',
    'parentEmail',
    'emergencyContactPerson',
    'emergencyContactNumber',
  ]);
  if (!incomplete) return [];
  return [
    reminder(
      'reminder-profile',
      'profile-reminder',
      'Please complete your profile. Required details are still missing.',
      '/student-profile.html'
    ),
  ];
}

function teacherAccountReminders(teacher) {
  const items = [];
  if (
    missingAny(teacher, [
      'firstName',
      'lastName',
      'nickname',
      'birthday',
      'hireDate',
      'gender',
      'language',
      'hobbies',
      'address',
      'contact',
      'email',
      'username',
      'emergencyContact',
    ])
  ) {
    items.push(
      reminder(
        'reminder-profile',
        'profile-reminder',
        'Please complete your profile. Required details are still missing.',
        '/teacher-profile.html'
      )
    );
  }
  items.push(...legalReminders(teacher, '/terms-of-service.html', '/privacy-policy.html'));
  return items;
}

function adminAccountReminders(admin) {
  const items = [];
  if (
    missingAny(admin, ['firstName', 'lastName', 'address', 'contactPhone', 'birthday', 'email'])
  ) {
    items.push(
      reminder(
        'reminder-profile',
        'profile-reminder',
        'Please complete your profile. Required details are still missing.',
        '/admin-profile-settings.html'
      )
    );
  }
  items.push(
    ...legalReminders(admin, '/admin-terms-of-service.html', '/admin-privacy-policy.html')
  );
  return items;
}

module.exports = {
  studentAccountReminders,
  teacherAccountReminders,
  adminAccountReminders,
};
