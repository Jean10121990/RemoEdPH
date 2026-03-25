import { legacyUrl } from "../api/http.js";

const ASSESSMENT_DRAFT_KEY = "remoedAssessmentDraft";

export default function AssessmentForm() {
  function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const childName = fd.get("childName");
    const parentEmail = fd.get("parentEmail");
    const contactNumber = fd.get("contactNumber");
    try {
      sessionStorage.setItem(
        ASSESSMENT_DRAFT_KEY,
        JSON.stringify({ childName, parentEmail, contactNumber }),
      );
    } catch {
      /* ignore */
    }
    const q = new URLSearchParams({
      childName: String(childName),
      parentEmail: String(parentEmail),
      contactNumber: String(contactNumber),
    });
    window.location.href = legacyUrl(`/student-assessment.html?${q.toString()}`);
  }

  return (
    <section className="assessment-section" id="assessment">
      <h2>Free Level Assessment</h2>
      <p>
        Find out your child&apos;s English level and get personalized
        recommendations straight to your email.
      </p>
      <p className="assessment-lead">
        No sign-up required. Perfect for first-time parents checking readiness.
      </p>
      <div className="assessment-layout">
        <div className="sophia-guide">
          <div className="speech-bubble">
            Hi! I&apos;m Sophia. Let&apos;s find the perfect level for you!
          </div>
          <img
            src="/images/sophia-girl.png"
            alt="Sophia guide"
            className="sophia-illu"
          />
        </div>
        <div className="assessment-form">
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="childName">Child&apos;s Name</label>
              <input
                id="childName"
                name="childName"
                type="text"
                required
                placeholder="Enter child's name"
                autoComplete="name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="parentEmail">Parent&apos;s Email</label>
              <input
                id="parentEmail"
                name="parentEmail"
                type="email"
                required
                placeholder="Enter parent's email"
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="contactNumber">Contact Number</label>
              <input
                id="contactNumber"
                name="contactNumber"
                type="tel"
                required
                placeholder="Enter contact number"
                autoComplete="tel"
              />
            </div>
            <button type="submit" className="assessment-btn">
              Start Free Assessment
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
