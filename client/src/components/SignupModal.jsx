import React, { useState, useEffect } from "react";
import {
  buildPlanDescription,
  getPlanComputedAmounts,
  EXCHANGE_RATE_USED,
} from "../config/plans.js";

function appBasePath() {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export default function SignupModal({
  open,
  onClose,
  selectedPlan,
  assessmentData,
  urlEmail,
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [parentName, setParentName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (urlEmail) setEmail(urlEmail);
    else if (assessmentData?.parentEmail) setEmail(assessmentData.parentEmail);
  }, [open, urlEmail, assessmentData]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e) {
    e.preventDefault();
    if (!selectedPlan) {
      alert("Please select a learning plan first.");
      return;
    }
    const amounts = getPlanComputedAmounts(selectedPlan);
    if (!amounts) {
      alert("Invalid plan selected.");
      return;
    }

    setSubmitting(true);
    try {
      const base = appBasePath();
      const cancelUrl = `${window.location.origin}${base || ""}/#plans`;
      const res = await fetch("/api/payments/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          parentName:
            parentName.trim() ||
            assessmentData?.parentEmail ||
            assessmentData?.childName ||
            "",
          planId: selectedPlan,
          description: buildPlanDescription(selectedPlan),
          referralCode: localStorage.getItem("referralCode") || "",
          success_url: `${window.location.origin}/student-login.html?payment=success&email=${encodeURIComponent(email.trim())}&username=${encodeURIComponent(username.trim())}`,
          cancel_url: cancelUrl,
          usd_total: amounts.usdTotal,
          exchange_rate_used: EXCHANGE_RATE_USED,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.checkout_url) {
        throw new Error(
          data.error || data.message || "Could not start checkout. Try again.",
        );
      }
      window.location.href = data.checkout_url;
    } catch (err) {
      alert(`❌ ${err.message}`);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal active"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content" style={{ position: "relative" }}>
        <button
          type="button"
          className="close-modal"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        <div className="modal-step active">
          <h2 id="signup-modal-title">📝 Create Your Account</h2>
          <p className="modal-subtitle">
            Sign up to receive your assessment results and start learning!
          </p>
          <form id="signup-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="signup-username">👤 Username</label>
              <input
                id="signup-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Choose a username"
                autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label htmlFor="signup-email">📧 Email</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter email"
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="signup-password">🔑 Password</label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Create a password"
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="signup-parent-name">👨‍👩‍👧 Parent/Guardian Name</label>
              <input
                id="signup-parent-name"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                required
                placeholder="Parent or guardian name"
                autoComplete="name"
              />
            </div>
            <button
              type="submit"
              className="assessment-btn signup-submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" /> Generating
                  secure payment link...
                </>
              ) : (
                "✨ Sign Up & Subscribe"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
