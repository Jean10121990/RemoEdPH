/**
 * Teacher portal guided tour (loads after js/portal-tour.js).
 */
(function () {
  'use strict';

  function buildSteps() {
    return [
      {
        element: '.remoed-sidebar',
        title: 'Welcome, teacher — find everything here',
        content:
          'This left sidebar is home base. Use it to switch pages without losing your place.\n\nTip: Your photo and name at the top jump to Profile when clicked.',
        position: 'right',
      },
      {
        element: '[data-nav="dashboard"]',
        title: 'Dashboard',
        content:
          'Your overview: key metrics, reminders, and shortcuts to what matters today. Start here after login to see upcoming classes and alerts.',
        position: 'right',
      },
      {
        element: '[data-nav="class-schedule"]',
        title: 'Class Schedule',
        content:
          'See all sessions in a calendar-style view. Check times, students, and statuses so you are never guessing what is next.',
        position: 'right',
      },
      {
        element: '[data-nav="class-configuration"]',
        title: 'Class Configuration',
        content:
          'Open or configure class sessions, links, and room settings so students can join the right meeting every time.',
        position: 'right',
      },
      {
        element: '[data-nav="device-check"]',
        title: 'Device Check',
        content:
          'Test camera, microphone, and connection before class. Run this if something feels off in the live classroom.',
        position: 'right',
      },
      {
        element: '[data-nav="lessons-library"]',
        title: 'Lessons Library',
        content:
          'Browse and attach lesson content. Pick materials that match your student’s level and session goals.',
        position: 'right',
      },
      {
        element: '[data-nav="teaching-fee"]',
        title: 'Teaching Fee',
        content:
          'Review earnings, payouts, and related records. Use this when you need clarity on compensation or history.',
        position: 'right',
      },
      {
        element: '[data-nav="referral-rewards"]',
        title: 'Referral Rewards',
        content:
          'Track referral activity and rewards. Share your link with families or teachers when the program is active.',
        position: 'right',
      },
      {
        element: '[data-nav="performance-indicator"]',
        title: 'Performance Indicator',
        content:
          'See teaching quality signals and achievements. Use feedback here to grow ratings and platform standing.',
        position: 'right',
      },
      {
        element: '[data-nav="professional-development"]',
        title: 'Career Growth',
        content:
          'Professional development points, milestones, and career ladder progress — keep credentials and PD up to date here.',
        position: 'right',
      },
      {
        element: '[data-nav="messages"]',
        title: 'Messages',
        content:
          'Chat with students, parents, or staff (depending on permissions). Prefer messages for quick coordination outside class.',
        position: 'right',
      },
      {
        element: '[data-nav="profile"]',
        title: 'Profile',
        content:
          'Update your bio, documents, assessments, and support materials. Keep your profile complete to inspire parent confidence.',
        position: 'right',
      },
      {
        element: '[data-nav="logout"]',
        title: 'Logout',
        content:
          'When you are done on a shared computer, use Exit to end your session securely.',
        position: 'right',
      },
    ];
  }

  function init() {
    if (typeof PortalTour === 'undefined') {
      console.warn('Load js/portal-tour.js before teacher-tour.js');
      return;
    }
    var welcome =
      'Welcome to the RemoEdPH Teacher Portal.\n\n' +
      'A short guided tour (about a minute) explains each menu item — scheduling, lessons, pay, performance, messages, and profile.\n\n' +
      'You can always reopen the tour with the button in the bottom-right corner.\n\n' +
      'Start the tour now?';

    window.teacherTour = new PortalTour({
      steps: buildSteps(),
      storageKey: 'teacherTourCompleted',
      accent: '#667eea',
      accentRgb: '102, 126, 234',
      portalLabel: 'Teacher',
      welcomeMessage: welcome,
    });

    if (typeof portalTourCleanup === 'function') portalTourCleanup();
    if (typeof portalTourAttach === 'function') {
      portalTourAttach(window.teacherTour, {
        buttonLabel: '📍 Teacher guide',
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
    if (window.teacherTour) window.teacherTour.cleanup();
  });
})();
