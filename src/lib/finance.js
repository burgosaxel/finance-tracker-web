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
  const due = getBillDueDate(bill, now);
  const diff = daysBetween(now, due);
  const lastPaid = bill.lastPaidDate ? new Date(bill.lastPaidDate) : null;
  const isPaidThisMonth = lastPaid && monthKey(lastPaid) === monthKey(due);
  if (bill.status === "paid") return "paid";
  if (isPaidThisMonth) return "paid";
  if (diff < 0) return "overdue";
  if (diff <= 7) return "dueSoon";
  return "upcoming";
}

export function getBillDueDate(bill, now = new Date()) {
  if (bill?.dueDate?.toDate) return bill.dueDate.toDate();
  if (bill?.dueDate) {
    const parsed = new Date(bill.dueDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return computeNextDueDate(bill?.dueDay, now);
}

export function getIncomePayDate(income, now = new Date()) {
  if (income?.payDate?.toDate) return income.payDate.toDate();
  if (income?.payDate) {
    const parsed = new Date(income.payDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (income?.nextPayDate) {
    const parsed = new Date(income.nextPayDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return now;
}

export function getUpcomingBills(bills, { days = 7, now = new Date() } = {}) {
  const start = startOfDay(now);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return (bills || [])
    .map((bill) => ({
      ...bill,
      nextDueDate: getBillDueDate(bill, now),
      status: billStatus(bill, now),
    }))
    .filter((bill) => bill.status !== "paid")
    .filter((bill) => {
      const due = startOfDay(bill.nextDueDate);
      return due >= start && due <= end;
    })
    .sort((a, b) => a.nextDueDate - b.nextDueDate);
}

export function monthFromMonthId(monthId) {
  const parsed = parseMonthKey(monthId);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, 1);
}
