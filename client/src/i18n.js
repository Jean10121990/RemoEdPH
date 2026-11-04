import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import vi from "./locales/vi.json";
import th from "./locales/th.json";
import ar from "./locales/ar.json";
import es from "./locales/es.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
      ja: { translation: ja },
      ko: { translation: ko },
      vi: { translation: vi },
      th: { translation: th },
      ar: { translation: ar },
      es: { translation: es },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "zh", "ja", "ko", "vi", "th", "ar", "es"],
    /** Map e.g. zh-CN / zh-Hans to our `zh` bundle */
    load: "languageOnly",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

i18n.on("languageChanged", (lng) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng || "en";
  document.documentElement.dir = String(lng || "").startsWith("ar") ? "rtl" : "ltr";
});

export default i18n;
