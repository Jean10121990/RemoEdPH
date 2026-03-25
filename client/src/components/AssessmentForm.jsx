import { useState } from "react";
import { legacyUrl } from "../api/http.js";

const ASSESSMENT_DRAFT_KEY = "remoedAssessmentDraft";

export default function AssessmentForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.target);
    const childName = fd.get("childName");
    const parentEmail = fd.get("parentEmail");
    const contactNumber = fd.get("contactNumber");
    setSubmitting(true);
    try {
      const res = await fetch(legacyUrl("/api/public/assessment-prefill"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName,
          parentEmail,
          contactNumber: contactNumber || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error ||
          (Array.isArray(data.details) && data.details[0]?.msg) ||
          "Could not start assessment";
        throw new Error(msg);
      }
      if (!data.token) throw new Error("Invalid server response");
      try {
        sessionStorage.setItem(
          ASSESSMENT_DRAFT_KEY,
          JSON.stringify({ childName, parentEmail, contactNumber }),
        );
      } catch {
        /* ignore */
      }
      window.location.href = legacyUrl(
        `/student-assessment.html?p=${encodeURIComponent(data.token)}`,
      );
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
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
          {error ? (
            <p className="assessment-error" role="alert" style={{ color: "#b00020" }}>
              {error}
            </p>
          ) : null}
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
            <button type="submit" className="assessment-btn" disabled={submitting}>
              {submitting ? "Starting…" : "Start Free Assessment"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
