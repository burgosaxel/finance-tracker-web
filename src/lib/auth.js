export function getAllowedEmails() {
  const raw = (import.meta.env.VITE_ALLOWED_EMAILS || "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isEmailAllowed(email) {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return true;
  return allowed.includes((email || "").toLowerCase());
}
