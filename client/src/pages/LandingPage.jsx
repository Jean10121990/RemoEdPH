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
  const [searchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [assessmentData, setAssessmentData] = useState(null);

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
    const cefrLevel = searchParams.get("cefrLevel");
    const signup = searchParams.get("signup");
    if (email && cefrLevel && signup === "true") {
      const t = setTimeout(() => setModalOpen(true), 500);
      return () => clearTimeout(t);
    }
    if (email && cefrLevel && signup !== "true") {
      const t = setTimeout(() => {
        alert(
          `🎉 Welcome back! Your assessment result: ${cefrLevel}\n\nSign up now to access your results online and start learning!`,
        );
      }, 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [searchParams]);

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
      <PlansSection onOpenSignup={openSignup} />
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
