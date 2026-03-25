export function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getAuthenticatedStudentContext() {
  const token =
    localStorage.getItem("studentToken") || localStorage.getItem("token") || "";
  if (!token) return null;
  const payload = parseJwtPayload(token);
  const studentId =
    localStorage.getItem("studentId") || payload?.studentId || "";
  if (!studentId) return null;
  return { token, studentId };
}
