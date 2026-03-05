export function getAllowedEmails() {
  // Comma-separated list, e.g. "axel@example.com,other@example.com"
  const raw = (import.meta.env.VITE_ALLOWED_EMAILS || "").trim();
  if (!raw) return [];
  return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function isEmailAllowed(email) {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return true; // If you don't set it, anyone with access can login
  return allowed.includes((email || "").toLowerCase());
}
