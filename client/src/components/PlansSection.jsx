import React from "react";
import PlanIcon from "./PlanIcon.jsx";
import {
  PLAN_CARDS,
  buildPlanDescription,
  getPlanComputedAmounts,
  EXCHANGE_RATE_USED,
} from "../config/plans.js";
import { getAuthenticatedStudentContext } from "../utils/authStudent.js";

export default function PlansSection({ onOpenSignup }) {
  const [loadingId, setLoadingId] = React.useState(null);

  async function handleEnroll(planId) {
    const amounts = getPlanComputedAmounts(planId);
    if (!amounts) {
      alert("Invalid plan selected.");
      return;
    }

    const auth = getAuthenticatedStudentContext();
    if (auth) {
      setLoadingId(planId);
      try {
        const res = await fetch("/api/payments/create-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            userId: auth.studentId,
            planId,
            description: buildPlanDescription(planId),
            success_url: `${window.location.origin}/student-credits.html?payment=success`,
            cancel_url: `${window.location.origin}/student-credits.html?payment=cancelled`,
            usd_total: amounts.usdTotal,
            exchange_rate_used: EXCHANGE_RATE_USED,
          }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result.success || !result.checkout_url) {
          throw new Error(
            result.error || result.message || "Failed to generate payment link",
          );
        }
        window.location.href = result.checkout_url;
      } catch (e) {
        alert(`❌ ${e.message}`);
        setLoadingId(null);
      }
      return;
    }

    onOpenSignup(planId);
  }

  return (
    <section className="section plans-section" id="plans">
      <h2 className="section-title">Choose Your Learning Plan</h2>
      <div className="plans-grid">
        {PLAN_CARDS.map((p) => (
          <div key={p.id} className={`plan-card ${p.cardClass}`}>
            {p.tag ? <div className="plan-tag">{p.tag}</div> : null}
            {p.badge ? <div className="plan-badge">{p.badge}</div> : null}
            <div className="plan-icon" aria-hidden="true">
              <PlanIcon variant={p.icon} />
            </div>
            <div className="plan-name">{p.name}</div>
            <div className="plan-price">{p.priceUsd}</div>
            <div className="plan-price-local">{p.pricePhp}</div>
            <div className="plan-period">
              <strong>{p.period}</strong>
            </div>
            <p className="plan-tagline">{p.tagline}</p>
            <ul className="plan-features">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button
              type="button"
              className="plan-btn"
              disabled={loadingId === p.id}
              onClick={() => handleEnroll(p.id)}
            >
              {loadingId === p.id ? "Processing…" : "Enroll Now"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
