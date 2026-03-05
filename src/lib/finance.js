export const DEFAULT_SETTINGS = {
  utilizationThreshold: 30,
  currency: "USD",
  monthStartDay: 1,
  recommendedPaymentRate: 0.03,
};

export function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseMonthKey(key) {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { y, m };
}

export function inMonth(dateStr, key) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return monthKey(d) === key;
}

export function formatCurrency(value, currency = "USD") {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(1)}%`;
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function computeNextDueDate(dueDay, now = new Date()) {
  const day = Math.min(31, Math.max(1, Number(dueDay) || 1));
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisMonthDate = new Date(y, m, Math.min(day, daysInMonth(y, m)));
  if (thisMonthDate >= startOfDay(now)) return thisMonthDate;
  const next = new Date(y, m + 1, Math.min(day, daysInMonth(y, m + 1)));
  return next;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(y, mZeroBased) {
  return new Date(y, mZeroBased + 1, 0).getDate();
}

export function daysBetween(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function billStatus(bill, now = new Date()) {
  const due = computeNextDueDate(bill.dueDay, now);
  const diff = daysBetween(now, due);
  const lastPaid = bill.lastPaidDate ? new Date(bill.lastPaidDate) : null;
  const isPaidThisMonth = lastPaid && monthKey(lastPaid) === monthKey(due);
  if (isPaidThisMonth) return "paid";
  if (diff < 0) return "overdue";
  if (diff <= 7) return "dueSoon";
  return "upcoming";
}
