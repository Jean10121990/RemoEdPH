/**
 * Admin portal guided tour.
 */
(function () {
  'use strict';

  function buildSteps() {
    return [
      {
        element: '.admin-sidebar.remoed-sidebar, .remoed-sidebar.admin-sidebar',
        title: 'Admin control center',
        content:
          'This sidebar lists every admin tool. Use it to switch between users, academics, finance, and support.\n\nTip: Your avatar links to Settings.',
        position: 'right',
      },
      {
        element: '[data-nav="dashboard"]',
        title: 'Dashboard',
        content:
          'High-level stats: registrations, bookings, income, and activity snapshots. Begin here for daily health checks.',
        position: 'right',
      },
      {
        element: '[data-nav="hr-hub"]',
        title: 'HR Hub',
        content:
          'User Management, Teacher Assessments, and Teacher Pipeline — switch tabs inside the hub for people and hiring workflows.',
        position: 'right',
      },
      {
        element: '[data-nav="qa-hub"]',
        title: 'QA Hub',
        content:
          'Lesson Library, lesson recordings, and Issue Management — tabs for curricula, class clips, and ticket triage.',
        position: 'right',
      },
      {
        element: '[data-nav="accounting-hub"]',
        title: 'Accounting Hub',
        content:
          'Payroll Management and Unique Link Commissions in one place — use tabs for pay settings and referral payouts.',
        position: 'right',
      },
      {
        element: '[data-nav="announcements"]',
        title: 'Announcements',
        content:
          'Broadcast updates to the portal or specific groups. Use for holidays, maintenance, or programs.',
        position: 'right',
      },
      {
        element: '[data-nav="reports"]',
        title: 'Reports',
        content:
          'Export or view operational and financial reports. Use for audits and leadership reviews.',
        position: 'right',
      },
      {
        element: '[data-nav="messages"]',
        title: 'Messages',
        content:
          'Internal messaging for coordination — follow up on users without leaving the portal.',
        position: 'right',
      },
      {
        element: '[data-nav="settings"]',
        title: 'Settings',
        content:
          'System configuration, admin profile, and sensitive options. Restrict access in production.',
        position: 'right',
      },
      {
        element: '[data-nav="logout"]',
        title: 'Logout',
        content:
          'End your admin session, especially on shared workstations.',
        position: 'right',
      },
    ];
  }

  function init() {
    if (typeof PortalTour === 'undefined') {
      console.warn('Load js/portal-tour.js before admin-tour.js');
      return;
    }
    var welcome =
      'Welcome to the RemoEdPH Admin Portal.\n\n' +
      'This tour maps each sidebar section — HR Hub, QA Hub, Accounting Hub, reports, and more — so you can navigate with confidence.\n\n' +
      'Reopen the guide anytime from the bottom-right button.\n\n' +
      'Start the tour now?';

    window.adminTour = new PortalTour({
      steps: buildSteps(),
      storageKey: 'adminTourCompleted',
      accent: '#2563eb',
      accentRgb: '37, 99, 235',
      portalLabel: 'Admin',
      welcomeMessage: welcome,
    });

    if (typeof portalTourCleanup === 'function') portalTourCleanup();
    if (typeof portalTourAttach === 'function') {
      portalTourAttach(window.adminTour, {
        buttonLabel: '📍 Admin guide',
        skipIfCompleted: true,
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', function () {
    if (window.adminTour) window.adminTour.cleanup();
  });
})();
