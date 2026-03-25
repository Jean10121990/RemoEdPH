import axios from "axios";

const legacyBase = import.meta.env.VITE_LEGACY_BASE || "";

export const legacyUrl = (path) => {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!legacyBase) return p;
  return `${legacyBase.replace(/\/$/, "")}${p}`;
};

export const api = axios.create({
  baseURL: "/api",
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});
