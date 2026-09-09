import { legacyUrl } from "../api/http.js";

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <a href="/" className="site-footer__logo" aria-label="RemoEdPH home">
            <img
              src="/images/remoed-logo-new.png"
              alt="RemoEdPH"
              width="140"
              height="44"
            />
          </a>
          <p className="site-footer__tagline">Live English for ages 3–6</p>
          <a className="site-footer__contact" href="mailto:support@remoedph.com">
            support@remoedph.com
          </a>
          <a
            className="site-footer__social"
            href="https://www.facebook.com/remoed"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RemoEdPH on Facebook"
          >
            <i className="fa-brands fa-facebook" aria-hidden="true" />
            <span>Facebook</span>
          </a>
        </div>
        <nav className="site-footer__col" aria-label="Learn">
          <h3 className="site-footer__heading">Learn</h3>
          <a href="#assessment">Free Assessment</a>
          <a href="#plans">Plans</a>
          <a href={legacyUrl("/teachers")}>Our Teachers</a>
          <a href={legacyUrl("/site-faq.html")}>FAQ</a>
        </nav>
        <nav className="site-footer__col" aria-label="For teachers">
          <h3 className="site-footer__heading">For Teachers</h3>
          <a href={legacyUrl("/application-form")}>Apply to Teach</a>
        </nav>
        <nav className="site-footer__col" aria-label="Account">
          <h3 className="site-footer__heading">Account</h3>
          <a href={legacyUrl("/login/")}>Login</a>
          <a href="#assessment">Register</a>
        </nav>
        <nav className="site-footer__col" aria-label="Legal">
          <h3 className="site-footer__heading">Legal</h3>
          <a href={legacyUrl("/site-terms.html")}>Terms of Service</a>
          <a href={legacyUrl("/site-privacy.html")}>Privacy Policy</a>
        </nav>
      </div>
      <p className="site-footer__copy">
        © {year} RemoEdPH. All rights reserved.
      </p>
    </footer>
  );
}
