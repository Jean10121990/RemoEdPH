import { useEffect } from "react";

/** Mirrors public/js/referral-tracking.js */
export function useReferralCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      const trimmed = ref && String(ref).trim() ? String(ref).trim() : null;
      if (trimmed) {
        localStorage.setItem("referralCode", trimmed);
        localStorage.setItem("referralCapturedAt", new Date().toISOString());
      }
    } catch {
      /* ignore */
    }
  }, []);
}
