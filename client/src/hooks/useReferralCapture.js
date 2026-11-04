import { useEffect } from "react";

/** Mirrors public/js/referral-tracking.js */
export function useReferralCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => {
        const value = params.get(key);
        if (value) localStorage.setItem(key, String(value).trim());
      });
      const ref = params.get("ref");
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
