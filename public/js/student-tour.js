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
          'This sidebar is how you move around RemoEdPH. Each item opens a different part of your learning adventure.\n\nTip: In Parents mode, tap your photo to open Profile.',
        position: 'right',
      },
      {
        element: '[data-nav="dashboard"]',
        title: 'Dashboard',
        content:
          'Your home page shows what is next, announcements, and shortcuts. Open this when you first log in.',
        position: 'right',
      },
      {
        element: '[data-nav="leaderboard"]',
        title: 'Leaderboard',
        content:
          'See how learners are shining together. It is a friendly scoreboard, not a race you have to win.',
        position: 'right',
      },
      {
        element: '[data-nav="schedule"]',
        title: 'My Schedule',
        content:
          'See when your classes run. Check the day before so you are ready with the time, teacher, and topic.',
        position: 'right',
      },
      {
        element: '[data-nav="book"]',
        title: 'Classes and the free trial',
        content:
          'This item follows your plan. It may say Claim free trial lessons, Book a Class, or Subscribe to Book. Free trial steps are practice on your own. Live one-on-one classes open after you have lesson credits.',
        position: 'right',
      },
      {
        element: '[data-nav="classes"]',
        title: 'My Classes',
        content:
          'History and details of lessons you have taken. Use it to revisit a class, homework, or attendance notes.',
        position: 'right',
      },
      {
        element: '[data-nav="games"]',
        title: 'Play & Learn',
        content:
          'Short games and practice that build English outside the live class.',
        position: 'right',
      },
      {
        element: '[data-nav="videos"]',
        title: 'Videos',
        content:
          'Watch lesson videos whenever you want a little extra practice.',
        position: 'right',
      },
      {
        element: '[data-nav="messages"]',
        title: 'Messages',
        content:
          'Read notes from your teachers and the RemoEdPH team.',
        position: 'right',
      },
      {
        element: '[data-nav="journey"]',
        title: 'My Learning Journey',
        content:
          'Follow the path of lessons you have finished and see what comes next in your level.',
        position: 'right',
      },
      {
        element: '[data-nav="garden"]',
        title: 'Virtual Garden',
        content:
          'A growing garden that celebrates practice. Come back after class and watch it bloom.',
        position: 'right',
      },
      {
        element: '[data-nav="referrals"]',
        title: 'Refer & Earn',
        content:
          'Share your link. When a friend starts a plan, you earn 3 free lessons. Open the My Badges tab on that page for your trophy cabinet, progress reports, and referral badges.',
        position: 'right',
      },
      {
        element: '[data-nav="profile"]',
        title: 'My Profile',
        content:
          'Update the photo, contact details, and family information the school needs. Badge privacy stays in Settings.',
        position: 'right',
      },
      {
        element: '[data-nav="level"]',
        title: 'My Level',
        content:
          'Take or review the level assessment. Results help teachers place you in the right materials.',
        position: 'right',
      },
      {
        element: '[data-nav="credits"]',
        title: 'My Credits',
        content:
          'See lesson credits and plans. Live classes use credits from a subscription.',
        position: 'right',
      },
      {
        element: '[data-nav="logout"]',
        title: 'Log out',
        content:
          'Signs you out on this device. Always log out on a shared tablet or family computer.',
        position: 'right',
      },
    ];
  }

  function studentToken() {
    try {
      if (window.RemoedUserSession && RemoedUserSession.getUserToken) {
        var via = RemoedUserSession.getUserToken();
        if (via) return via;
      }
    } catch (_e) {}
    try {
      return localStorage.getItem('remoed_student_token') || sessionStorage.getItem('remoed_student_token') || '';
    } catch (_e2) {
      return '';
    }
  }

  function attachStudentTour() {
    if (typeof portalTourCleanup === 'function') portalTourCleanup();
    if (typeof portalTourAttach === 'function') {
      portalTourAttach(window.studentTour, {
        buttonLabel: '📍 User guide',
        skipIfCompleted: true,
        welcomeConfirm: true,
      });
    }
  }

  function init() {
    if (typeof PortalTour === 'undefined') {
      console.warn('Load js/portal-tour.js before student-tour.js');
      return;
    }
    window.studentTour = new PortalTour({
      steps: buildSteps(),
      storageKey: 'studentTourCompleted',
      accent: '#008fc4',
      accentRgb: '0, 143, 196',
      portalLabel: 'Student',
      welcomeMessage:
        'Welcome to the RemoEdPH Student Portal.\n\n' +
        'A short guided tour explains each menu item — schedule, classes, videos, the garden, Refer & Earn, and your profile.\n\n' +
        'Choose OK to start. You can skip the tour now, or skip any step after it starts.',
    });
    window.studentTour.onDismiss = function () {
      var token = studentToken();
      if (!token) return;
      fetch('/api/student/welcome-tour/dismiss', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      }).catch(function () {});
    };

    var token = studentToken();
    if (!token) {
      attachStudentTour();
      return;
    }
    fetch('/api/student/profile', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var seen = data && data.profile && data.profile.hasSeenWelcomeTour === true;
        if (seen) {
          try { localStorage.setItem('studentTourCompleted', 'true'); } catch (_e) {}
        }
      })
      .catch(function () {})
      .then(attachStudentTour);
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
