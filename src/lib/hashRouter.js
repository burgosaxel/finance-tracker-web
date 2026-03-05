const ROUTES = ["dashboard", "budget", "credit-cards", "bills-income", "transactions", "settings"];

export function getRouteFromHash() {
  const hash = window.location.hash || "#/dashboard";
  const raw = hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (ROUTES.includes(raw)) return raw;
  return "dashboard";
}

export function routeHref(route) {
  return `#/${route}`;
}
