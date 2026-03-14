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

function toDateValue(value, fallback = new Date()) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function isBillPaid(bill, now = new Date()) {
  if (bill?.status) return bill.status === "paid";
  return billStatus(bill, now) === "paid";
}

function isIncomeReceived(item) {
  return item?.status === "received";
}

export function getBillsDueWithinDays(bills, days = 7, fromDate = new Date()) {
  const start = startOfDay(fromDate);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return (bills || [])
    .map((bill) => ({
      ...bill,
      nextDueDate: getBillDueDate(bill, fromDate),
      status: billStatus(bill, fromDate),
    }))
    .filter((bill) => !isBillPaid(bill, fromDate))
    .filter((bill) => {
      const due = startOfDay(bill.nextDueDate);
      return due >= start && due <= end;
    })
    .sort((a, b) => a.nextDueDate - b.nextDueDate);
}

export function getPastDueBills(bills, fromDate = new Date()) {
  const today = startOfDay(fromDate);
  return (bills || [])
    .map((bill) => ({
      ...bill,
      nextDueDate: getBillDueDate(bill, fromDate),
      status: billStatus(bill, fromDate),
    }))
    .filter((bill) => !isBillPaid(bill, fromDate))
    .filter((bill) => startOfDay(bill.nextDueDate) < today)
    .sort((a, b) => a.nextDueDate - b.nextDueDate);
}

export function getBillsDueLaterThisMonth(bills, fromDate = new Date(), withinDays = 7) {
  const start = startOfDay(fromDate);
  const cutoff = new Date(start);
  cutoff.setDate(cutoff.getDate() + withinDays);
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  return (bills || [])
    .map((bill) => ({
      ...bill,
      nextDueDate: getBillDueDate(bill, fromDate),
      status: billStatus(bill, fromDate),
    }))
    .filter((bill) => !isBillPaid(bill, fromDate))
    .filter((bill) => {
      const due = startOfDay(bill.nextDueDate);
      return due > cutoff && due <= monthEnd;
    })
    .sort((a, b) => a.nextDueDate - b.nextDueDate);
}

export function computeMonthTotals(bills, incomes, options = {}) {
  const now = options.now || new Date();
  const totalIncomeExpected = (incomes || []).reduce(
    (sum, item) => sum + safeNumber(item.amount ?? item.expectedAmount, 0),
    0
  );
  const totalIncomeReceived = (incomes || [])
    .filter((item) => isIncomeReceived(item))
    .reduce((sum, item) => sum + safeNumber(item.amount ?? item.expectedAmount, 0), 0);

  const totalBills = (bills || []).reduce((sum, bill) => sum + safeNumber(bill.amount, 0), 0);
  const totalBillsPaid = (bills || [])
    .filter((bill) => isBillPaid(bill, now))
    .reduce((sum, bill) => sum + safeNumber(bill.amount, 0), 0);
  const totalBillsUnpaid = Math.max(0, totalBills - totalBillsPaid);

  const remainingFromReceived = totalIncomeReceived - totalBillsPaid;
  const projectedRemaining = totalIncomeExpected - totalBills;

  const sortedIncome = [...(incomes || [])]
    .map((item) => ({ ...item, _date: toDateValue(getIncomePayDate(item, now), now) }))
    .sort((a, b) => a._date - b._date);
  const sortedBills = [...(bills || [])]
    .map((bill) => ({ ...bill, _date: toDateValue(getBillDueDate(bill, now), now) }))
    .sort((a, b) => a._date - b._date);

  const nextExpectedIncome = sortedIncome.find((item) => item._date >= startOfDay(now) && !isIncomeReceived(item)) || null;
  const nextDueBill = sortedBills.find((bill) => bill._date >= startOfDay(now) && !isBillPaid(bill, now)) || null;

  const events = [
    ...sortedIncome.map((item) => ({
      id: `income-${item.id}`,
      type: "income",
      label: item.source || item.name || "Income",
      date: item._date,
      amount: safeNumber(item.amount ?? item.expectedAmount, 0),
      status: item.status || "expected",
    })),
    ...sortedBills.map((bill) => ({
      id: `bill-${bill.id}`,
      type: "bill",
      label: bill.merchant || bill.name || "Bill",
      date: bill._date,
      amount: safeNumber(bill.amount, 0),
      status: bill.status || "unpaid",
    })),
  ]
    .sort((a, b) => a.date - b.date)
    .slice(0, 6);

  return {
    totalIncomeExpected,
    totalIncomeReceived,
    totalBills,
    totalBillsPaid,
    totalBillsUnpaid,
    remainingFromReceived,
    projectedRemaining,
    nextExpectedIncome,
    nextDueBill,
    events,
  };
}

export function getEffectiveTransactionCategory(transaction) {
  return (
    transaction?.userCategoryOverride ||
    transaction?.effectiveCategory ||
    transaction?.categoryDetailed ||
    transaction?.categoryPrimary ||
    transaction?.category ||
    transaction?.personalFinanceCategory?.detailed ||
    transaction?.personalFinanceCategory?.primary ||
    "Uncategorized"
  );
}

function toTitleWord(word) {
  const lower = String(word || "").toLowerCase();
  if (!lower) return "";
  if (lower === "and") return "and";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatCategorySegment(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map(toTitleWord)
    .join(" ");
}

export function formatCategoryLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Uncategorized";

  const normalized = raw.replace(/\./g, "_").replace(/\//g, "_").replace(/\s+/g, "_").toUpperCase();
  const groupedPrefixes = [
    "BANK_FEES",
    "GENERAL_MERCHANDISE",
    "FOOD_AND_DRINK",
    "HOME_IMPROVEMENT",
    "INCOME_DIVIDENDS",
    "INCOME_INTEREST",
    "INCOME_RETIREMENT",
    "INCOME_TAX_REFUND",
    "INCOME_UNEMPLOYMENT",
    "INCOME_WAGES",
    "LOAN_PAYMENTS",
    "PERSONAL_CARE",
    "TRANSFER_IN",
    "TRANSFER_OUT",
  ];

  const prefix = groupedPrefixes.find((candidate) => normalized === candidate || normalized.startsWith(`${candidate}_`));
  if (prefix) {
    const remainder = normalized.slice(prefix.length).replace(/^_+/, "");
    return remainder
      ? `${formatCategorySegment(prefix)} / ${formatCategorySegment(remainder)}`
      : formatCategorySegment(prefix);
  }

  return formatCategorySegment(normalized);
}

export function getMonthTransactions(transactions, month = monthKey()) {
  return (transactions || []).filter((transaction) => {
    if (transaction?.removed) return false;
    return monthKey(new Date(transaction.date || new Date())) === month;
  });
}

export function summarizeCashFlowFromTransactions(transactions, month = monthKey()) {
  const scoped = getMonthTransactions(transactions, month);
  return scoped.reduce(
    (summary, transaction) => {
      const amount = safeNumber(transaction.amount, 0);
      if (amount >= 0) {
        summary.inflow += amount;
      } else {
        summary.outflow += Math.abs(amount);
      }
      return summary;
    },
    { inflow: 0, outflow: 0 }
  );
}

export function summarizeSpendingByCategory(transactions, month = monthKey(), limit = 5) {
  const totals = new Map();
  for (const transaction of getMonthTransactions(transactions, month)) {
    const amount = safeNumber(transaction.amount, 0);
    if (amount >= 0) continue;
    const key = getEffectiveTransactionCategory(transaction);
    totals.set(key, (totals.get(key) || 0) + Math.abs(amount));
  }

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, label: formatCategoryLabel(category), amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function getRecentSyncedTransactions(transactions, limit = 5) {
  return [...(transactions || [])]
    .filter((transaction) => transaction?.source === "plaid" && !transaction?.removed)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, limit);
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ach|pmt|payment|autopay|debit|credit|online|transfer|deposit|withdrawal)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeMatchText(value).split(" ").filter(Boolean));
}

function overlapScore(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let matches = 0;
  left.forEach((token) => {
    if (right.has(token)) matches += 1;
  });
  return matches / Math.max(left.size, right.size);
}

function dateDistanceScore(transactionDate, candidateDate) {
  if (!transactionDate || !candidateDate) return 0;
  const diff = Math.abs(daysBetween(new Date(transactionDate), new Date(candidateDate)));
  if (diff === 0) return 1;
  if (diff <= 3) return 0.7;
  if (diff <= 7) return 0.45;
  return 0;
}

function amountDistanceScore(transactionAmount, candidateAmount) {
  const tx = Math.abs(safeNumber(transactionAmount, 0));
  const target = Math.abs(safeNumber(candidateAmount, 0));
  if (!tx || !target) return 0;
  const diff = Math.abs(tx - target);
  if (diff < 0.01) return 1;
  if (diff <= Math.max(5, target * 0.05)) return 0.7;
  if (diff <= Math.max(15, target * 0.12)) return 0.4;
  return 0;
}

export function getManualMatchCandidates({
  bills = [],
  income = [],
  loans = [],
  creditCards = [],
  selectedMonth = "",
} = {}) {
  const billCandidates = (bills || []).map((bill) => ({
    manualType: "bill",
    manualId: bill.id,
    monthId: selectedMonth || "",
    label: bill.merchant || bill.name || "Bill",
    subtitle: `Bill${bill.dueDate || bill.dueDay ? ` - due ${getBillDueDate(bill).toLocaleDateString()}` : ""}`,
    amount: safeNumber(bill.amount, 0),
    date: getBillDueDate(bill),
    searchText: `${bill.merchant || ""} ${bill.name || ""}`,
  }));
  const incomeCandidates = (income || []).map((item) => ({
    manualType: "income",
    manualId: item.id,
    monthId: selectedMonth || "",
    label: item.source || item.name || "Income",
    subtitle: `Income${item.payDate || item.payDay ? ` - ${getIncomePayDate(item).toLocaleDateString()}` : ""}`,
    amount: safeNumber(item.amount ?? item.expectedAmount, 0),
    date: getIncomePayDate(item),
    searchText: `${item.source || ""} ${item.name || ""}`,
  }));
  const loanCandidates = (loans || []).map((loan) => ({
    manualType: "loan",
    manualId: loan.id,
    monthId: "",
    label: loan.lender || loan.name || "Loan",
    subtitle: "Loan payment",
    amount: safeNumber(loan.monthlyPayment, 0),
    date: null,
    searchText: `${loan.lender || ""} ${loan.name || ""}`,
  }));
  const creditCardCandidates = (creditCards || []).map((card) => ({
    manualType: "creditCard",
    manualId: card.id,
    monthId: "",
    label: card.name || "Credit card",
    subtitle: `${card.issuer || "Credit card"}${card.minimumPayment ? ` - min ${formatCurrency(card.minimumPayment)}` : ""}`,
    amount: safeNumber(card.minimumPayment, 0),
    date: null,
    searchText: `${card.name || ""} ${card.issuer || ""}`,
  }));
  return [...billCandidates, ...incomeCandidates, ...loanCandidates, ...creditCardCandidates];
}

function getRuleMatchCandidate(transaction, rules, candidates) {
  const haystack = normalizeMatchText(
    `${transaction.merchantName || ""} ${transaction.payee || ""} ${transaction.name || ""}`
  );
  for (const rule of rules || []) {
    if (!rule?.pattern) continue;
    const pattern = normalizeMatchText(rule.pattern);
    const exact = haystack === pattern;
    const includes = haystack.includes(pattern);
    const eligible =
      rule.ruleType === "exact_name"
        ? exact
        : rule.ruleType === "amount_and_name"
          ? includes
            && candidates.some(
              (candidate) =>
                candidate.manualType === rule.targetManualType
                && candidate.manualId === rule.targetManualId
                && (!rule.targetManualMonthId || candidate.monthId === rule.targetManualMonthId)
                && amountDistanceScore(transaction.amount, candidate.amount) > 0
            )
          : includes;
    if (!eligible) continue;
    return candidates.find(
      (candidate) =>
        candidate.manualType === rule.targetManualType
        && candidate.manualId === rule.targetManualId
        && (!rule.targetManualMonthId || candidate.monthId === rule.targetManualMonthId)
    ) || null;
  }
  return null;
}

export function getTransactionMatchSuggestions(transaction, candidates, rules = [], limit = 3) {
  const ruleCandidate = getRuleMatchCandidate(transaction, rules, candidates);
  const scored = (candidates || [])
    .map((candidate) => {
      let score = overlapScore(
        `${transaction.merchantName || ""} ${transaction.payee || ""} ${transaction.name || ""}`,
        candidate.searchText
      );
      score += amountDistanceScore(transaction.amount, candidate.amount) * 0.35;
      score += dateDistanceScore(transaction.date, candidate.date) * 0.2;
      if (
        ruleCandidate
        && candidate.manualType === ruleCandidate.manualType
        && candidate.manualId === ruleCandidate.manualId
        && candidate.monthId === ruleCandidate.monthId
      ) {
        score += 1;
      }
      return { ...candidate, score };
    })
    .filter((candidate) => candidate.score > 0.15)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function getMatchedManualLabel(transaction, candidates) {
  if (!transaction?.linkedManualType || !transaction?.linkedManualId) return "";
  const match = (candidates || []).find(
    (candidate) =>
      candidate.manualType === transaction.linkedManualType
      && candidate.manualId === transaction.linkedManualId
      && (candidate.monthId || "") === (transaction.linkedManualMonthId || "")
  );
  return match?.label || transaction.linkedManualName || "";
}
