import { useTranslation } from "react-i18next";
import { legacyUrl } from "../api/http.js";
import LanguageSwitcher from "./LanguageSwitcher.jsx";

export default function Navbar() {
  const { t } = useTranslation();

  return (
    <nav className="navbar">
      <a className="logo-section" href="/" aria-label="RemoEdPH home">
        <img src="/images/remoed-logo-new.png" alt="RemoEdPH" width="180" height="56" />
      </a>
      <div className="nav-buttons">
        <a href="#our-teachers" className="nav-btn">
          Our Teachers
        </a>
        <a href="#assessment" className="nav-btn">
          Free Assessment
        </a>
        <a href="#plans" className="nav-btn">
          Plans
        </a>
        <LanguageSwitcher />
        <a href={legacyUrl("/login/")} className="nav-btn primary">
          {t("login_title")}
        </a>
      </div>
    </nav>
  );
}
