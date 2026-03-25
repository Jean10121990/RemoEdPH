import { useTranslation } from "react-i18next";

const OPTIONS = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label className="nav-lang-switcher">
      <span className="visually-hidden">{t("language_switcher_label")}</span>
      <select
        className="nav-lang-select"
        value={i18n.resolvedLanguage?.split("-")[0] || "en"}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        aria-label={t("language_switcher_label")}
      >
        {OPTIONS.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
