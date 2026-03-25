import { legacyUrl } from "../api/http.js";

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="logo-section">
        <img src="/images/remoed-logo-new.png" alt="RemoEdPH Logo" />
        <span>RemoEdPH</span>
      </div>
      <div className="nav-buttons">
        <a href={legacyUrl("/teachers")} className="nav-btn">
          Our Teachers
        </a>
        <a href="#assessment" className="nav-btn">
          Free Assessment
        </a>
        <a href="#plans" className="nav-btn">
          Plans
        </a>
        <a href={legacyUrl("/application-form")} className="nav-btn">
          Apply Now
        </a>
        <a href={legacyUrl("/teacher-login.html")} className="nav-btn">
          Teacher Login
        </a>
        <a href={legacyUrl("/student-login.html")} className="nav-btn primary">
          Student Login
        </a>
      </div>
    </nav>
  );
}
