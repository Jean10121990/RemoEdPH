export default function Hero() {
  return (
    <section
      className="hero japandi-hero hero-fullbleed"
      aria-label="RemoEdPH introduction"
    >
      <div className="hero-fullbleed__stage" aria-hidden="true">
        <div className="hero-fullbleed__glow" />
      </div>
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="brand-kicker">RemoEdPH</p>
          <h1>Learn English at Home!</h1>
          <p>
            Calm, engaging English lessons for children ages 3–6. Live classes
            designed for busy Filipino families.
          </p>
          <div className="cta-buttons">
            <div className="assessment-cta-wrap">
              <a href="#assessment" className="cta-btn primary">
                Take Free Assessment
              </a>
            </div>
          </div>
        </div>
        <div className="hero-media">
          <div className="hero-media__frame">
            <img
              src="/images/hero-remoed-family.png"
              alt="RemoEdPH teacher and students with Remo mascot waving hello"
              className="hero-illustration"
              width="960"
              height="720"
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
