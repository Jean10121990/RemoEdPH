import Guide from "./Guide.jsx";
import { legacyUrl } from "../api/http.js";

export default function Hero() {
  return (
    <section className="hero japandi-hero">
      <div className="hero-grid">
        <div className="hero-copy">
          <h1>Learn English at Home!</h1>
          <p>
            Calm, playful English learning for children ages 2–6. Designed for
            busy Filipino families using phones and tablets.
          </p>
          <div className="cta-buttons">
            <div className="assessment-cta-wrap">
              <Guide character="ed" className="intro-kid" />
              <a href="#assessment" className="cta-btn primary">
                Take Free Assessment
              </a>
              <Guide character="sophia" className="intro-kid" />
            </div>
            <a href="#plans" className="cta-btn secondary">
              View Plans
            </a>
            <a href={legacyUrl("/application-form")} className="cta-btn secondary">
              Apply Now
            </a>
          </div>
        </div>
        <div className="hero-media">
          <Guide character="remo" className="robot-float" alt="Remo Robot" />
        </div>
      </div>
    </section>
  );
}
