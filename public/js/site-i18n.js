/**
 * Static-site i18n — uses the same localStorage key as client/src/i18n.js (i18nextLng)
 * so language choice syncs between /app and public/*.html pages.
 */
(function () {
  var STORAGE_KEY = "i18nextLng";

  var STRINGS = {
    en: {
      login_title: "Student Login",
      page_title: "Welcome to RemoEdPH! — Student Login",
      login_subtitle: "Jump back into your lessons and track your progress.",
      student_id_label: "Student username",
      student_id_placeholder: "Enter your student username",
      password_label: "Password",
      password_placeholder: "Enter your password",
      submit_login: "Start Learning",
      submit_logging_in: "Logging in...",
      submit_retry: "Start Learning",
      submit_success: "Success!",
      link_register: "New here? Join the fun!",
      link_forgot: "Forgot password?",
      link_home: "Back to Home",
      brand_subtitle: "Student Portal",
      feature_title: "Welcome back, ready to learn?",
      feature_p:
        "Stay on track with your lessons, progress, and classroom activities.",
      feature_li_1: "Monitor learning progress and scores.",
      feature_li_2: "Keep up with schedules and activities.",
      feature_li_3: "Access lessons and interactive resources.",
      lang_label: "Language",
      error_form: "Form error. Please refresh the page.",
      error_connection: "Connection error. Please try again.",
      error_invalid: "Invalid student username or password.",
      suspended_generic:
        "Your account has been suspended. Please contact the administrator.",
      show_password_aria: "Show password",
      hide_password_aria: "Hide password",
    },
    zh: {
      login_title: "学生登录",
      page_title: "欢迎来到 RemoEdPH！— 学生登录",
      login_subtitle: "继续课程并查看学习进度。",
      student_id_label: "学生用户名",
      student_id_placeholder: "请输入学生用户名",
      password_label: "密码",
      password_placeholder: "请输入密码",
      submit_login: "开始学习",
      submit_logging_in: "登录中…",
      submit_retry: "开始学习",
      submit_success: "成功！",
      link_register: "新用户？立即加入",
      link_forgot: "忘记密码？",
      link_home: "返回首页",
      brand_subtitle: "学生门户",
      feature_title: "欢迎回来，准备好学习了吗？",
      feature_p: "随时掌握课程、进度与课堂活动。",
      feature_li_1: "查看学习进度与成绩。",
      feature_li_2: "掌握课表与活动安排。",
      feature_li_3: "使用课程与互动资源。",
      lang_label: "语言",
      error_form: "表单错误，请刷新页面。",
      error_connection: "网络错误，请重试。",
      error_invalid: "学生用户名或密码无效。",
      suspended_generic: "您的账号已被暂停，请联系管理员。",
      show_password_aria: "显示密码",
      hide_password_aria: "隐藏密码",
    },
    ja: {
      login_title: "学生ログイン",
      page_title: "RemoEdPH へようこそ！ — 学生ログイン",
      login_subtitle: "レッスンに戻り、進捗を確認しましょう。",
      student_id_label: "学生ユーザー名",
      student_id_placeholder: "学生ユーザー名を入力",
      password_label: "パスワード",
      password_placeholder: "パスワードを入力",
      submit_login: "学習を始める",
      submit_logging_in: "ログイン中…",
      submit_retry: "学習を始める",
      submit_success: "成功！",
      link_register: "はじめての方 · 登録する",
      link_forgot: "パスワードをお忘れですか？",
      link_home: "ホームに戻る",
      brand_subtitle: "学生ポータル",
      feature_title: "おかえりなさい、学習の準備はOK？",
      feature_p: "レッスン・進捗・教室のアクティビティをひとまとめに。",
      feature_li_1: "学習の進みとスコアを確認。",
      feature_li_2: "予定とアクティビティをチェック。",
      feature_li_3: "教材とインタラクティブなリソースにアクセス。",
      lang_label: "言語",
      error_form: "フォームエラーです。ページを更新してください。",
      error_connection: "接続エラー。もう一度お試しください。",
      error_invalid: "学生ユーザー名またはパスワードが正しくありません。",
      suspended_generic:
        "アカウントが停止されています。管理者にお問い合わせください。",
      show_password_aria: "パスワードを表示",
      hide_password_aria: "パスワードを隠す",
    },
    ko: {
      login_title: "학생 로그인",
      page_title: "RemoEdPH에 오신 것을 환영합니다! — 학생 로그인",
      login_subtitle: "수업으로 돌아가 진행 상황을 확인하세요.",
      student_id_label: "학생 사용자 이름",
      student_id_placeholder: "학생 사용자 이름 입력",
      password_label: "비밀번호",
      password_placeholder: "비밀번호 입력",
      submit_login: "학습 시작",
      submit_logging_in: "로그인 중…",
      submit_retry: "학습 시작",
      submit_success: "성공!",
      link_register: "처음이신가요? 함께해요!",
      link_forgot: "비밀번호를 잊으셨나요?",
      link_home: "홈으로",
      brand_subtitle: "학생 포털",
      feature_title: "환영합니다, 학습 준비되셨나요?",
      feature_p: "수업·진행 상황·교실 활동을 한눈에 관리하세요.",
      feature_li_1: "학습 진행과 점수를 확인하세요.",
      feature_li_2: "일정과 활동을 놓치지 마세요.",
      feature_li_3: "수업과 인터랙티브 자료를 이용하세요.",
      lang_label: "언어",
      error_form: "양식 오류입니다. 페이지를 새로고침하세요.",
      error_connection: "연결 오류입니다. 다시 시도하세요.",
      error_invalid: "학생 사용자 이름 또는 비밀번호가 올바르지 않습니다.",
      suspended_generic:
        "계정이 정지되었습니다. 관리자에게 문의하세요.",
      show_password_aria: "비밀번호 표시",
      hide_password_aria: "비밀번호 숨기기",
    },
  };

  var currentLang = "en";

  function normalizeLang(code) {
    if (!code) return "en";
    var base = String(code).toLowerCase().split("-")[0];
    if (base === "zh" || base === "ja" || base === "ko" || base === "en")
      return base;
    return "en";
  }

  function readStoredOrBrowser() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return normalizeLang(stored);
    } catch (e) {}
    return normalizeLang(
      (navigator.languages && navigator.languages[0]) || navigator.language || "en",
    );
  }

  function t(lang, key) {
    var L = normalizeLang(lang);
    var pack = STRINGS[L] || STRINGS.en;
    if (pack[key] != null) return pack[key];
    return STRINGS.en[key] != null ? STRINGS.en[key] : key;
  }

  function apply(lang) {
    var L = normalizeLang(lang);
    currentLang = L;
    document.documentElement.lang = L;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      if (el.tagName === "TITLE") {
        document.title = t(L, key);
        return;
      }
      el.textContent = t(L, key);
    });
    document
      .querySelectorAll("[data-i18n-placeholder]")
      .forEach(function (el) {
        var key = el.getAttribute("data-i18n-placeholder");
        if (key) el.setAttribute("placeholder", t(L, key));
      });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria-label");
      if (key) el.setAttribute("aria-label", t(L, key));
    });
  }

  function syncSwitchers() {
    document.querySelectorAll(".site-lang-switcher").forEach(function (sel) {
      if (sel.value !== currentLang) sel.value = currentLang;
    });
  }

  function mountSwitchers() {
    document.querySelectorAll(".site-lang-switcher").forEach(function (sel) {
      if (sel.dataset.i18nMounted) return;
      sel.dataset.i18nMounted = "1";
      sel.setAttribute("aria-label", t(currentLang, "lang_label"));
      sel.innerHTML =
        '<option value="en">English</option>' +
        '<option value="zh">中文</option>' +
        '<option value="ja">日本語</option>' +
        '<option value="ko">한국어</option>';
      sel.value = currentLang;
      sel.addEventListener("change", function () {
        setLang(sel.value);
      });
    });
  }

  function setLang(lang) {
    var L = normalizeLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, L);
    } catch (e) {}
    apply(L);
    mountSwitchers();
    syncSwitchers();
    window.dispatchEvent(
      new CustomEvent("sitei18n:languagechanged", { detail: { lang: L } }),
    );
  }

  function init() {
    currentLang = readStoredOrBrowser();
    apply(currentLang);
    mountSwitchers();
    syncSwitchers();
  }

  window.SiteI18n = {
    init: init,
    setLang: setLang,
    getLang: function () {
      return currentLang;
    },
    t: function (key) {
      return t(currentLang, key);
    },
  };
})();
