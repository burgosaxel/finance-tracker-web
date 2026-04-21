const ROUTES = ["planner", "bills", "income", "accounts", "activity", "settings"];

export function getRouteFromHash() {
  const hash = window.location.hash || "#/planner";
  const raw = hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (ROUTES.includes(raw)) return raw;
  return "planner";
}

export function routeHref(route) {
  return `#/${route}`;
}
