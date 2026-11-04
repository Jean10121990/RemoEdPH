import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Hero from "../components/Hero.jsx";
import BenefitsSection from "../components/BenefitsSection.jsx";
import AssessmentForm from "../components/AssessmentForm.jsx";
import PlansSection from "../components/PlansSection.jsx";
import SignupModal from "../components/SignupModal.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { useReferralCapture } from "../hooks/useReferralCapture.js";

const ASSESSMENT_DRAFT_KEY = "remoedAssessmentDraft";

export default function LandingPage() {
  useReferralCapture();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [assessmentData, setAssessmentData] = useState(null);
  const [cefrLevel, setCefrLevel] = useState("");

  const urlEmail = searchParams.get("email") || "";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ASSESSMENT_DRAFT_KEY);
      if (raw) setAssessmentData(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const email = searchParams.get("email");
    const level = searchParams.get("cefrLevel");
    const signup = searchParams.get("signup");

    const scrollPlans = () => {
      const t = setTimeout(() => {
        document
          .getElementById("plans")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
      return () => clearTimeout(t);
    };

    if (email && level) {
      setCefrLevel(level);
      if (signup === "true") {
        const next = new URLSearchParams(searchParams);
        next.delete("signup");
        setSearchParams(next, { replace: true });
        if (!window.location.hash || window.location.hash === "#") {
          window.location.hash = "plans";
        }
      }
      return scrollPlans();
    }

    if (window.location.hash === "#plans") return scrollPlans();
    return undefined;
  }, [searchParams, setSearchParams]);

  function openSignup(planId) {
    setSelectedPlan(planId);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  return (
    <div className="page-index">
      <Navbar />
      <Hero />
      <BenefitsSection />
      <AssessmentForm />
      <PlansSection onOpenSignup={openSignup} cefrLevel={cefrLevel} />
      <section className="section home-faq" id="faq">
        <h2 className="section-title">Questions parents ask</h2>
        <p>Live classes are 25 minutes for ages 3–6.</p>
        <p>RemoSpark lasts 3 months, RemoSteady 6, RemoScholar 12, and RemoSummit 24. Booked classes stay on the calendar when unused credits expire.</p>
        <p>Pay from any country by scanning the MariBank QR after you log in.</p>
        <p>TODO-KRISTINE: cancellation window and minimum internet speed.</p>
      </section>
      <SiteFooter />
      <SignupModal
        open={modalOpen}
        onClose={closeModal}
        selectedPlan={selectedPlan}
        assessmentData={assessmentData}
        urlEmail={urlEmail}
      />
    </div>
  );
}
