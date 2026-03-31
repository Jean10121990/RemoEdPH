/**
 * Student portal guided tour.
 */
(function () {
  'use strict';

  function buildSteps() {
    return [
      {
        element: '.remoed-sidebar',
        title: 'Your learning home',
        content:
          'This sidebar is how you move around RemoEdPH. Each item opens a different part of your learning adventure.\n\nTip: Tap your avatar to open Profile.',
        position: 'right',
      },
      {
        element: '[data-nav="dashboard"]',
        title: 'Dashboard',
        content:
          'Your dashboard shows announcements, progress snippets, and shortcuts. Open this page when you first log in.',
        position: 'right',
      },
      {
        element: '[data-nav="schedule"]',
        title: 'My Schedule',
        content:
          'See when your classes run. Check here the day before so you are ready with time, teacher, and topic.',
        position: 'right',
      },
      {
        element: '[data-nav="book"]',
        title: 'Book a Class',
        content:
          'Pick a teacher, time slot, and subject to book a new lesson. Use filters and your credits as shown on the page.',
        position: 'right',
      },
      {
        element: '[data-nav="classes"]',
        title: 'My Classes',
        content:
          'History and details of lessons you have taken — great for revisiting links, homework, or attendance notes.',
        position: 'right',
      },
      {
        element: '[data-nav="games"]',
        title: 'Play & Learn',
        content:
          'Fun practice activities and games that reinforce English skills outside live class.',
        position: 'right',
      },
      {
        element: '[data-nav="profile"]',
        title: 'My Profile',
        content:
          'Update your photo, contact info, and documents parents or the school may need. Keep this accurate for safety.',
        position: 'right',
      },
      {
        element: '[data-nav="level"]',
        title: 'My Level',
        content:
          'Take or review your level assessment. Results help teachers place you in the right materials.',
        position: 'right',
      },
      {
        element: '[data-nav="credits"]',
        title: 'My Credits',
        content:
          'See remaining lesson credits or packages. Book new classes when you have enough balance.',
        position: 'right',
      },
      {
        element: '[data-nav="logout"]',
        title: 'Exit',
        content:
          'Logs you out on this device. Always exit on a shared tablet or family computer.',
        position: 'right',
      },
    ];
  }

  function init() {
    if (typeof PortalTour === 'undefined') {
      console.warn('Load js/portal-tour.js before student-tour.js');
      return;
    }
    window.studentTour = new PortalTour({
      steps: buildSteps(),
      storageKey: 'studentTourCompleted',
      accent: '#5a67d8',
      accentRgb: '28, 167, 231',
      portalLabel: 'Student',
      welcomeMessage: '',
    });

    if (typeof portalTourCleanup === 'function') portalTourCleanup();
    if (typeof portalTourAttach === 'function') {
      portalTourAttach(window.studentTour, {
        buttonLabel: '📍 Student guide',
        skipIfCompleted: true,
        welcomeConfirm: false,
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', function () {
    if (window.studentTour) window.studentTour.cleanup();
  });
})();
