/**
 * Remo AI Engine — local, zero-token teacher help.
 * Scored FAQ + page context + short conversation memory (no paid LLM).
 */
(function (global) {
  'use strict';

  function btn(text, icon, topicOrAction) {
    if (typeof topicOrAction === 'function') {
      return { text: text, icon: icon, action: topicOrAction };
    }
    if (topicOrAction && typeof topicOrAction === 'object') {
      return Object.assign({ text: text, icon: icon }, topicOrAction);
    }
    return { text: text, icon: icon, topic: topicOrAction || text.toLowerCase() };
  }

  function go(href) {
    return function () {
      window.location.href = href;
    };
  }

  /** @type {Array<{id:string, pages?:string[], keywords:string[], weight?:number, followUps?:string[], answer:function(ctx):{text:string,buttons?:any[],startTour?:boolean}}>} */
  var INTENTS = [
    {
      id: 'greeting',
      keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'kumusta'],
      weight: 1,
      answer: function (ctx) {
        return {
          text:
            "Hello! I'm Remo AI Assistant 👋 I help with the teacher portal — schedule, classes, lessons, teaching fee/payslips, profile privacy, and troubleshooting.\n\n" +
            (ctx.pageHint ? '**You are on:** ' + ctx.pageHint + '\n\n' : '') +
            'Ask me anything, or tap a quick action below.',
          buttons: [
            btn('Troubleshooting', '🔧', 'troubleshooting'),
            btn('Teaching Fee / Payslip', '💰', 'payslip'),
            btn('Schedule Help', '📅', 'schedule'),
            btn('Start Tour', '🎯', 'tour'),
          ],
        };
      },
    },
    {
      id: 'tour',
      keywords: ['tour', 'guide', 'walkthrough', 'show me around', 'onboarding', 'start tour'],
      weight: 3,
      answer: function () {
        return {
          text: "Great! I'll start the interactive tour so you can learn the main teacher portal features.",
          startTour: true,
        };
      },
    },
    {
      id: 'help',
      keywords: ['help', 'support', 'what can you do', 'assist', 'menu', 'options'],
      weight: 2,
      answer: function (ctx) {
        return {
          text:
            "I can help with:\n\n" +
            "🔧 **Troubleshooting** — camera, mic, browser, connection\n" +
            "📚 **Lessons** — library, structure, teaching tips\n" +
            "📅 **Schedule** — open slots, bookings, cut-offs\n" +
            "💰 **Pay** — teaching fee, payslip, payout dates\n" +
            "👤 **Profile** — nickname, TOS, privacy, documents\n" +
            "📊 **Performance** — attendance, PD, KPIs\n\n" +
            (ctx.pageHint ? 'Tip: since you are on **' + ctx.pageHint + '**, ask about that page specifically.\n\n' : '') +
            'What do you need?',
          buttons: [
            btn('Troubleshooting', '🔧', 'troubleshooting'),
            btn('Lessons', '📚', 'lesson support'),
            btn('Payslip', '🧾', 'payslip'),
            btn('Nickname privacy', '🛡️', 'nickname'),
          ],
        };
      },
    },
    {
      id: 'troubleshooting',
      keywords: ['troubleshoot', 'troubleshooting', 'problem', 'issue', 'not working', 'broken', 'fix'],
      weight: 3,
      pages: ['dashboard', 'class', 'open-class', 'schedule'],
      answer: function () {
        return {
          text:
            "**Troubleshooting menu** — what is going wrong?\n\n" +
            "• Camera / microphone\n" +
            "• Internet / lag\n" +
            "• Browser compatibility\n" +
            "• Platform or classroom errors\n\n" +
            'Pick a topic or describe the symptom (e.g. “students can’t hear me”).',
          buttons: [
            btn('Camera / Mic', '🎥', 'camera'),
            btn('Internet', '🌐', 'internet'),
            btn('Browser', '🧭', 'browser'),
            btn('Classroom error', '⚠️', 'platform error'),
          ],
        };
      },
    },
    {
      id: 'camera_mic',
      keywords: [
        'camera',
        'microphone',
        'mic',
        'audio',
        'video',
        'cant hear',
        "can't hear",
        'cannot hear',
        'hear me',
        'no sound',
        'black screen',
        'permission',
        'webcam',
        'no video',
        'students can t hear',
        'student cant hear',
      ],
      weight: 4,
      followUps: ['troubleshooting'],
      answer: function () {
        return {
          text:
            "**Camera & microphone checklist**\n\n" +
            "1. Allow camera/mic when the browser asks\n" +
            "2. Check OS privacy settings (Windows: Settings → Privacy → Camera/Microphone)\n" +
            "3. Close Zoom/Meet/Discord that may lock the device\n" +
            "4. Use **Chrome** or **Edge** (latest)\n" +
            "5. Refresh the classroom tab and rejoin\n" +
            "6. Test at chrome://settings/content/camera (or Edge equivalent)\n\n" +
            "If students still can’t hear you, ask them to check speaker volume and that they joined with audio allowed.",
          buttons: [
            btn('Internet issues', '🌐', 'internet'),
            btn('Browser tips', '🧭', 'browser'),
            btn('More troubleshooting', '🔧', 'troubleshooting'),
          ],
        };
      },
    },
    {
      id: 'internet',
      keywords: ['internet', 'connection', 'wifi', 'network', 'lag', 'slow', 'disconnect', 'unstable', 'ping'],
      weight: 4,
      followUps: ['troubleshooting'],
      answer: function () {
        return {
          text:
            "**Connection tips for live class**\n\n" +
            "• Prefer wired Ethernet or strong 5 GHz Wi‑Fi\n" +
            "• Pause downloads / streaming on the same network\n" +
            "• Close extra tabs and heavy apps\n" +
            "• If video freezes, turn camera off temporarily and keep audio\n" +
            "• Rejoin the classroom if the socket drops\n\n" +
            "RemoEd classes are short (25 min) — reconnect quickly and continue; report outages in class issues if needed.",
          buttons: [
            btn('Camera / Mic', '🎥', 'camera'),
            btn('Cancel / absent rules', '📋', 'cancel class'),
          ],
        };
      },
    },
    {
      id: 'browser',
      keywords: ['browser', 'chrome', 'edge', 'firefox', 'safari', 'compatibility', 'update browser'],
      weight: 3,
      followUps: ['troubleshooting'],
      answer: function () {
        return {
          text:
            "**Recommended browsers**\n\n" +
            "• Best: **Google Chrome** or **Microsoft Edge** (latest)\n" +
            "• Enable hardware acceleration if video is choppy\n" +
            "• Disable aggressive ad blockers on RemoEd domains\n" +
            "• Clear cache if pages look stuck on an old version\n" +
            "• Avoid outdated Safari/Firefox for live classroom when possible",
        };
      },
    },
    {
      id: 'platform_error',
      keywords: ['platform error', 'error message', 'something went wrong', '500', 'failed to load', 'blank page'],
      weight: 3,
      followUps: ['troubleshooting'],
      answer: function () {
        return {
          text:
            "**If you see a platform error**\n\n" +
            "1. Hard refresh (Ctrl+F5 / Cmd+Shift+R)\n" +
            "2. Log out and log back in\n" +
            "3. Try another browser profile / Incognito with extensions off\n" +
            "4. Note the page URL + time (PH) and screenshot the message\n" +
            "5. Contact RemoEd admin/support with those details\n\n" +
            "For classroom join issues, confirm the class is still within the entry window.",
          buttons: [btn('Schedule help', '📅', 'schedule'), btn('Open Class page', '🗓️', { action: go('teacher-open-class.html') })],
        };
      },
    },
    {
      id: 'lessons',
      keywords: ['lesson support', 'lesson', 'lessons', 'materials', 'curriculum', 'slides', 'teaching material'],
      weight: 2,
      pages: ['lessons', 'dashboard'],
      answer: function () {
        return {
          text:
            "**Lesson support** — what do you need?\n\n" +
            "• Find materials in Lessons Library\n" +
            "• 25‑minute lesson structure\n" +
            "• Teaching tips for online ESL\n" +
            "• Create / upload your own lesson",
          buttons: [
            btn('Find materials', '📚', 'lesson material'),
            btn('Lesson structure', '🧩', 'lesson structure'),
            btn('Teaching tips', '💡', 'teaching tips'),
            btn('Open Library', '➡️', { action: go('teacher-lessons-library.html') }),
          ],
        };
      },
    },
    {
      id: 'lesson_material',
      keywords: ['lesson material', 'finding lesson', 'lesson resources', 'download lesson', 'library'],
      weight: 4,
      pages: ['lessons'],
      followUps: ['lessons'],
      answer: function () {
        return {
          text:
            "**Finding lesson materials**\n\n" +
            "1. Open **Lessons Library** in the sidebar\n" +
            "2. Filter by level / topic / keywords\n" +
            "3. Preview, then use files in class\n" +
            "4. Do **not** download RemoEd materials for sharing outside the platform (see your TOS)\n\n" +
            "Need a custom file? Use Create / upload where available.",
          buttons: [
            btn('Open Lessons Library', '📚', { action: go('teacher-lessons-library.html') }),
            btn('Lesson structure', '🧩', 'lesson structure'),
          ],
        };
      },
    },
    {
      id: 'lesson_structure',
      keywords: ['lesson structure', 'lesson format', '25 minute', 'warm-up', 'wrap-up', 'structure and format'],
      weight: 4,
      followUps: ['lessons'],
      answer: function () {
        return {
          text:
            "**Standard 25‑minute lesson structure**\n\n" +
            "1️⃣ Warm‑up (5 min) — greet, quick recap\n" +
            "2️⃣ Introduction (5 min) — goals + new language\n" +
            "3️⃣ Practice (10 min) — guided activities\n" +
            "4️⃣ Production (3 min) — student output\n" +
            "5️⃣ Wrap‑up (2 min) — review + close\n\n" +
            'Keep energy high and goals clear — short classes reward focus.',
        };
      },
    },
    {
      id: 'teaching_tips',
      keywords: ['teaching tip', 'teaching tips', 'effective teaching', 'online teaching', 'engagement'],
      weight: 3,
      followUps: ['lessons'],
      answer: function () {
        return {
          text:
            "**Online teaching tips**\n\n" +
            "• Smile on camera; greet by name (use student first name only)\n" +
            "• One clear objective per class\n" +
            "• Alternate teacher talk and student talk often\n" +
            "• Use visuals / slides from Lessons Library\n" +
            "• Give specific praise + one next step\n" +
            "• Never share your legal name or personal contacts with students (use nickname)",
          buttons: [btn('Nickname privacy', '🛡️', 'nickname')],
        };
      },
    },
    {
      id: 'create_lesson',
      keywords: ['create lesson', 'make lesson', 'upload lesson', 'new lesson'],
      weight: 4,
      pages: ['lessons'],
      answer: function () {
        return {
          text:
            "**Create / manage lessons**\n\n" +
            "• Go to **Lessons Library**\n" +
            "• Use Create / Upload where enabled for your account\n" +
            "• Prefer PDF or classroom‑ready slides\n" +
            "• Keep file names clear (level + topic)\n\n" +
            "RemoEd curriculum remains company IP — do not redistribute outside class.",
          buttons: [btn('Open Lessons Library', '📚', { action: go('teacher-lessons-library.html') })],
        };
      },
    },
    {
      id: 'schedule',
      keywords: ['schedule', 'class time', 'availability', 'open slot', 'open class', 'calendar', 'schedule help'],
      weight: 3,
      pages: ['schedule', 'open-class', 'dashboard'],
      answer: function () {
        return {
          text:
            "**Schedule help**\n\n" +
            "• **Open Class** — open/close teaching slots students can book\n" +
            "• **Schedule** — review your calendar\n" +
            "• **Class Table** — upcoming/past classes, join, feedback, cancel rules\n\n" +
            "Bi‑monthly pay cut‑offs: **1st–15th** and **16th–end of month** (PH time).",
          buttons: [
            btn('Open Class', '🗓️', { action: go('teacher-open-class.html') }),
            btn('Class Table', '📋', { action: go('teacher-class-table.html') }),
            btn('Bookings', '✅', 'booking'),
            btn('Payslip / fee', '💰', 'payslip'),
          ],
        };
      },
    },
    {
      id: 'booking',
      keywords: ['booking', 'booked', 'accept booking', 'student booked', 'reservation'],
      weight: 3,
      pages: ['schedule', 'class', 'open-class'],
      followUps: ['schedule'],
      answer: function () {
        return {
          text:
            "**Bookings**\n\n" +
            "• Students book your open slots\n" +
            "• Check **Class Table** for upcoming sessions\n" +
            "• Join from Class Table when the class window opens\n" +
            "• After class, submit feedback when prompted\n" +
            "• Cancellations may affect pay — ask about cancel rules if needed",
          buttons: [
            btn('Class Table', '📋', { action: go('teacher-class-table.html') }),
            btn('Cancel rules', '⚠️', 'cancel class'),
          ],
        };
      },
    },
    {
      id: 'cancel_class',
      keywords: ['cancel class', 'cancellation', 'absent', 'no-show', 'late', 'penalty', 'deduction'],
      weight: 4,
      answer: function () {
        return {
          text:
            "**Attendance & deductions (summary)**\n\n" +
            "• Be on time — late arrivals can incur deductions\n" +
            "• Cancel with enough notice when possible (policy aims for 24h+)\n" +
            "• Unexcused absence / no‑show can mean larger deductions\n" +
            "• Details are in your **Terms of Service** annex and Teaching Fee page\n\n" +
            "Check **Teaching Fee** for the current cut‑off impact.",
          buttons: [
            btn('Teaching Fee', '💰', { action: go('teacher-service-fee.html') }),
            btn('Open TOS', '📄', { action: go('terms-of-service.html') }),
          ],
        };
      },
    },
    {
      id: 'payslip',
      keywords: [
        'payslip',
        'pay slip',
        'salary',
        'payout',
        'teaching fee',
        'payment',
        'wage',
        'cut-off',
        'cutoff',
        'cut off',
        '15th',
        'end of month',
        'how much did i earn',
        'net pay',
      ],
      weight: 5,
      pages: ['service-fee', 'payslip', 'dashboard'],
      answer: function () {
        return {
          text:
            "**Teaching fee & payslips**\n\n" +
            "• Pay is bi‑monthly: **1st–15th** and **16th–end** (Asia/Manila)\n" +
            "• Open **Teaching Fee** to see current/previous cut‑off\n" +
            "• Click **Print Payslip** for an official statement (bank / legal use)\n" +
            "• **Payment History** also has a Payslip link per dispensed period\n" +
            "• Rate is per completed **25‑minute** class; deductions may apply\n\n" +
            "Paid status appears after admin dispenses that cut‑off.",
          buttons: [
            btn('Open Teaching Fee', '💰', { action: go('teacher-service-fee.html') }),
            btn('Cancel / deduction rules', '📋', 'cancel class'),
          ],
        };
      },
    },
    {
      id: 'nickname',
      keywords: ['nickname', 'display name', 'privacy', 'legal name', 'real name', 'identity', 'alias'],
      weight: 5,
      pages: ['profile'],
      answer: function () {
        return {
          text:
            "**Teacher nickname (privacy)**\n\n" +
            "• Set **Teacher Nickname** under Personal Information on your Profile\n" +
            "• Students and public pages see your **nickname**, not your legal name\n" +
            "• Never share full legal name or personal contacts with students/parents\n" +
            "• Keep legal name accurate for contracts / TOS signing",
          buttons: [
            btn('Open Profile', '👤', { action: go('teacher-profile.html') }),
            btn('TOS / contract', '📄', 'terms of service'),
          ],
        };
      },
    },
    {
      id: 'tos',
      keywords: ['terms of service', 'tos', 'contract', 'independent contractor', 'agreement', 'sign tos', 'privacy policy'],
      weight: 4,
      pages: ['profile'],
      answer: function () {
        return {
          text:
            "**Legal documents**\n\n" +
            "In **Profile → Settings → Legal & Policies**:\n" +
            "• **Terms of Service** — Independent Contractor Agreement (sign + print)\n" +
            "• **Privacy Policy** — data & child‑safety rules (sign + print)\n\n" +
            "Fill Effective Date + full legal name, check I Accept, then Accept & Sign. Print anytime afterward.",
          buttons: [
            btn('Terms of Service', '📄', { action: go('terms-of-service.html') }),
            btn('Privacy Policy', '🔒', { action: go('privacy-policy.html') }),
            btn('Profile Settings', '⚙️', { action: go('teacher-profile.html') }),
          ],
        };
      },
    },
    {
      id: 'profile',
      keywords: ['profile', 'upload video', 'documents', 'certificate', 'diploma', 'hire date', 'edit profile'],
      weight: 3,
      pages: ['profile'],
      answer: function () {
        return {
          text:
            "**Profile help**\n\n" +
            "• Edit Personal Information (including nickname)\n" +
            "• Upload Video Introduction, diplomas, certificates, valid ID\n" +
            "• Complete required fields for profile %\n" +
            "• Settings: email/username/password + Legal & Policies\n\n" +
            "Preview Profile shows what others see (nickname‑first).",
          buttons: [
            btn('Open Profile', '👤', { action: go('teacher-profile.html') }),
            btn('Nickname', '🛡️', 'nickname'),
            btn('Sign TOS', '📄', 'terms of service'),
          ],
        };
      },
    },
    {
      id: 'pd',
      keywords: ['professional development', 'training', 'pd', 'course', 'certificate course', 'heart', 'honor'],
      weight: 3,
      pages: ['professional', 'pd'],
      answer: function () {
        return {
          text:
            "**Professional Development**\n\n" +
            "• Open **Professional Development** from the sidebar\n" +
            "• Complete H.E.A.R.T. / Code of Honor commitments when prompted\n" +
            "• Track courses and growth toward badges / regularization pathway\n" +
            "• Align teaching with RemoEd culture & conduct standards",
          buttons: [btn('Open PD', '🎓', { action: go('teacher-professional-development.html') })],
        };
      },
    },
    {
      id: 'attendance',
      keywords: ['attendance', 'punctuality', 'attendance analysis', 'lateness'],
      weight: 3,
      pages: ['attendance'],
      answer: function () {
        return {
          text:
            "**Attendance**\n\n" +
            "• Review patterns in **Attendance Analysis**\n" +
            "• Punctuality affects Excellence Badge / incentives\n" +
            "• Late and absence deductions appear in Teaching Fee\n\n" +
            "Aim to join a few minutes early every class.",
          buttons: [
            btn('Attendance Analysis', '📈', { action: go('teacher-attendance-analysis.html') }),
            btn('Teaching Fee', '💰', { action: go('teacher-service-fee.html') }),
          ],
        };
      },
    },
    {
      id: 'performance',
      keywords: ['performance', 'kpi', 'rating', 'badge', 'indicator', 'excellence'],
      weight: 3,
      pages: ['performance'],
      answer: function () {
        return {
          text:
            "**Performance indicators**\n\n" +
            "• High ratings + low late/absence support Excellence Badge\n" +
            "• Community / CSR participation helps regularization scoring\n" +
            "• See **Performance Indicator** for your metrics\n" +
            "• Details also appear in TOS Annex B",
          buttons: [btn('Performance page', '📊', { action: go('teacher-performance-indicator.html') })],
        };
      },
    },
    {
      id: 'peer',
      keywords: ['peer', 'peer learning', 'connect with teacher', 'colleague', 'mentor teacher'],
      weight: 3,
      pages: ['peer'],
      answer: function () {
        return {
          text:
            "**Peer Learning Connections**\n\n" +
            "• Connect with other RemoEd teachers for tips and support\n" +
            "• Keep conversations professional and private\n" +
            "• Do not share student personal data in peer chats",
          buttons: [btn('Open Peer Learning', '🤝', { action: go('teacher-peer-learning-connections.html') })],
        };
      },
    },
    {
      id: 'referral',
      keywords: ['referral', 'refer', 'commission', 'invite student', 'referral code', 'bonus'],
      weight: 3,
      answer: function () {
        return {
          text:
            "**Referrals**\n\n" +
            "• Share your referral link/code when available in the portal\n" +
            "• Bonuses apply when referred students successfully enroll\n" +
            "• See Teaching Fee / admin policy for payout of referral incentives",
          buttons: [btn('Teaching Fee', '💰', { action: go('teacher-service-fee.html') })],
        };
      },
    },
    {
      id: 'feedback',
      keywords: ['feedback', 'rate student', 'class feedback', 'comment'],
      weight: 3,
      pages: ['class'],
      answer: function () {
        return {
          text:
            "**Class feedback**\n\n" +
            "• After completed classes, submit honest feedback from Class Table\n" +
            "• Accurate notes help student progress and your professionalism score\n" +
            "• Pending feedback can delay fee recognition for that class — finish it promptly",
          buttons: [btn('Class Table', '📋', { action: go('teacher-class-table.html') })],
        };
      },
    },
    {
      id: 'reminder',
      keywords: ['reminder', 'notify', 'notification', 'alert'],
      weight: 2,
      answer: function () {
        return {
          text:
            "**Notifications**\n\n" +
            "• Check the bell icon in the teacher header for salary, booking, and system alerts\n" +
            "• Keep your email updated in Profile → Settings\n" +
            "• Join classes from Class Table when reminders appear",
        };
      },
    },
  ];

  var PAGE_HINTS = [
    { test: /teacher-dashboard/, hint: 'Dashboard', key: 'dashboard' },
    { test: /teacher-service-fee/, hint: 'Teaching Fee', key: 'service-fee' },
    { test: /teacher-payslip/, hint: 'Payslip', key: 'payslip' },
    { test: /teacher-profile/, hint: 'Profile', key: 'profile' },
    { test: /teacher-schedule/, hint: 'Schedule', key: 'schedule' },
    { test: /teacher-open-class/, hint: 'Open Class', key: 'open-class' },
    { test: /teacher-class-table/, hint: 'Class Table', key: 'class' },
    { test: /teacher-lessons-library/, hint: 'Lessons Library', key: 'lessons' },
    { test: /teacher-professional/, hint: 'Professional Development', key: 'professional' },
    { test: /teacher-attendance/, hint: 'Attendance Analysis', key: 'attendance' },
    { test: /teacher-performance/, hint: 'Performance Indicator', key: 'performance' },
    { test: /teacher-peer/, hint: 'Peer Learning', key: 'peer' },
    { test: /terms-of-service/, hint: 'Terms of Service', key: 'profile' },
    { test: /privacy-policy/, hint: 'Privacy Policy', key: 'profile' },
  ];

  function detectPage(pathname) {
    var path = String(pathname || '').toLowerCase();
    for (var i = 0; i < PAGE_HINTS.length; i++) {
      if (PAGE_HINTS[i].test.test(path)) return PAGE_HINTS[i];
    }
    return { hint: '', key: '' };
  }

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9\s\-\/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreIntent(intent, message, pageKey, lastIntentId) {
    var score = 0;
    var hits = 0;
    var kws = intent.keywords || [];
    for (var i = 0; i < kws.length; i++) {
      var kw = kws[i];
      if (!kw) continue;
      if (message.indexOf(kw) !== -1) {
        hits++;
        // Longer phrases score higher
        score += (intent.weight || 1) * (1 + Math.min(3, kw.split(' ').length) * 0.35);
      }
    }
    if (!hits) return 0;

    if (intent.pages && pageKey && intent.pages.indexOf(pageKey) !== -1) {
      score += 1.5;
    }
    if (lastIntentId && intent.followUps && intent.followUps.indexOf(lastIntentId) !== -1) {
      score += 1.25;
    }
    // Prefer more specific intents when multiple match
    score += Math.min(hits, 4) * 0.15;
    return score;
  }

  function fallback(ctx) {
    return {
      intentId: 'fallback',
      text:
        "I'm not fully sure what you mean yet, but I can still help.\n\n" +
        (ctx.pageHint ? 'You are on **' + ctx.pageHint + '**. ' : '') +
        'Try asking about troubleshooting, lessons, schedule, payslip, nickname, or TOS — or pick a topic:',
      buttons: [
        btn('Troubleshooting', '🔧', 'troubleshooting'),
        btn('Lesson Support', '📚', 'lesson support'),
        btn('Payslip / Fee', '💰', 'payslip'),
        btn('Schedule', '📅', 'schedule'),
      ],
    };
  }

  function answer(userMessage, options) {
    options = options || {};
    var page = detectPage(options.path || (global.location && global.location.pathname) || '');
    var ctx = {
      pageHint: page.hint,
      pageKey: page.key,
      lastIntent: options.lastIntent || null,
    };
    var message = normalize(userMessage);
    if (!message) {
      return Object.assign({ intentId: 'empty' }, fallback(ctx));
    }

    var best = null;
    var bestScore = 0;
    for (var i = 0; i < INTENTS.length; i++) {
      var intent = INTENTS[i];
      var s = scoreIntent(intent, message, page.key, options.lastIntent);
      if (s > bestScore) {
        bestScore = s;
        best = intent;
      }
    }

    // Require a minimum score so weak single-letter overlaps don't win
    if (!best || bestScore < 1.1) {
      return fallback(ctx);
    }

    var payload = best.answer(ctx) || {};
    return {
      intentId: best.id,
      text: payload.text || fallback(ctx).text,
      buttons: payload.buttons || [],
      startTour: !!payload.startTour,
      score: bestScore,
    };
  }

  function contextualGreeting() {
    var page = detectPage(global.location && global.location.pathname);
    var base =
      "Hello! I'm Remo AI Assistant 👋 I can help with troubleshooting, lessons, schedule, teaching fee/payslips, and profile privacy.";
    if (page.hint) {
      base += "\n\nYou're on **" + page.hint + "** — ask me about this page, or choose a quick action.";
    } else {
      base += '\n\nHow can I assist you today?';
    }
    return base;
  }

  global.RemoAIEngine = {
    answer: answer,
    contextualGreeting: contextualGreeting,
    detectPage: detectPage,
    intents: INTENTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
