import { createId, DEFAULT_SETTINGS, formatCurrency, monthKey, safeNumber } from "./finance";

export const PAYCHECK_SLOT_OPTIONS = [
  { id: "slot1", label: "Paycheck 1", depositDay: 1, aliases: ["first"] },
  { id: "slot2", label: "Paycheck 2", depositDay: 15, aliases: ["fifteenth"] },
  { id: "slot3", label: "Paycheck 3", depositDay: 22, aliases: [] },
  { id: "slot4", label: "Paycheck 4", depositDay: 29, aliases: [] },
  { id: "slot5", label: "Paycheck 5", depositDay: 31, aliases: [] },
  { id: "slot6", label: "Paycheck 6", depositDay: 31, aliases: [] },
];

export const PAYCHECK_SLOTS = PAYCHECK_SLOT_OPTIONS.map((slot) => slot.id);

export const BILL_STATUS_LABELS = {
  planned: "Pending",
  paid: "Paid",
  overdue: "Overdue",
  skipped: "Skipped",
};

export const VERIFICATION_STATUS_LABELS = {
  unverified: "Unverified",
  matched: "Matched",
  manual: "Manual",
};

export const INCOME_STATUS_LABELS = {
  expected: "Expected",
  received: "Received",
};

const PAYCHECK_SLOT_ALIAS_MAP = new Map(
  PAYCHECK_SLOT_OPTIONS.flatMap((slot) => [[slot.id, slot.id], ...slot.aliases.map((alias) => [alias, slot.id])])
);

const STRUCTURAL_TEMPLATE_LABELS = new Set([
  "balance",
  "balances",
  "bills",
  "deductions",
  "deduction",
  "income",
  "expenses",
  "total",
  "totals",
  "placeholder",
]);

export function getDefaultPaychecks(settings = {}) {
  const configuredPaychecks = settings?.paychecks || {};
  return PAYCHECK_SLOT_OPTIONS.reduce((acc, slot) => {
    const legacyOverrides = slot.aliases.reduce(
      (merged, alias) => ({ ...merged, ...(configuredPaychecks?.[alias] || {}) }),
      {}
    );
    const overrides = configuredPaychecks?.[slot.id] || {};
    const defaultSettings = DEFAULT_SETTINGS.paychecks?.[slot.id] || {
      label: slot.label,
      depositDay: slot.depositDay,
      expectedIncome: 0,
    };
    acc[slot.id] = {
      ...defaultSettings,
      ...legacyOverrides,
      ...overrides,
      label: overrides.label || legacyOverrides.label || defaultSettings.label || slot.label,
      depositDay: Math.max(
        1,
        Math.min(31, Number(overrides.depositDay ?? legacyOverrides.depositDay ?? defaultSettings.depositDay ?? slot.depositDay) || slot.depositDay)
      ),
      expectedIncome: safeNumber(overrides.expectedIncome ?? legacyOverrides.expectedIncome ?? defaultSettings.expectedIncome, 0),
    };
    return acc;
  }, {});
}

export function normalizePaycheckSlot(slot, fallback = "slot1") {
  return PAYCHECK_SLOT_ALIAS_MAP.get(String(slot || "").trim()) || fallback;
}

export function getPaycheckLabel(slot) {
  const normalized = normalizePaycheckSlot(slot);
  return PAYCHECK_SLOT_OPTIONS.find((option) => option.id === normalized)?.label || "Paycheck";
}

export function getMonthDate(monthId, day) {
  const [year, month] = String(monthId || "").split("-").map(Number);
  if (!year || !month) return new Date();
  const maxDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(Math.max(1, Number(day) || 1), maxDay));
}

export function formatShortDate(value) {
  const date = toDate(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatMonthLabel(monthId) {
  const date = getMonthDate(monthId, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function getPaycheckSlotFromDueDay(dueDay) {
  return Number(dueDay) <= 14 ? "slot1" : "slot2";
}

export function isStructuralTemplateName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return true;
  return STRUCTURAL_TEMPLATE_LABELS.has(normalized);
}

export function toDate(value, fallback = new Date()) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export function normalizeBillTemplate(template = {}) {
  const name = template.name || template.merchant || "";
  const structural = Boolean(template.system || template.isSystem || isStructuralTemplateName(name));
  return {
    id: template.id || createId("bill-template"),
    name,
    category: template.category || "",
    defaultAccountId: template.defaultAccountId || template.defaultPaidFrom || template.accountId || "",
    dueDay: Math.max(1, Math.min(31, Number(template.dueDay) || 1)),
    paycheckSlot: normalizePaycheckSlot(template.paycheckSlot, getPaycheckSlotFromDueDay(template.dueDay)),
    amountType: template.amountType || "fixed",
    defaultAmount: safeNumber(template.defaultAmount ?? template.amount, 0),
    autopay: Boolean(template.autopay),
    plaidMatchEnabled: template.plaidMatchEnabled !== false,
    plaidMatchRules: template.plaidMatchRules || null,
    notes: template.notes || "",
    active: template.active !== false && template.isActive !== false,
    hidden: Boolean(template.hidden),
    system: structural,
  };
}

export function normalizeIncomeTemplate(template = {}) {
  return {
    id: template.id || createId("income-template"),
    source: template.source || template.name || "",
    depositAccountId: template.depositAccountId || template.accountId || "",
    payDay: Math.max(1, Math.min(31, Number(template.payDay) || 1)),
    paycheckSlot: normalizePaycheckSlot(template.paycheckSlot, getPaycheckSlotFromDueDay(template.payDay)),
    defaultAmount: safeNumber(template.defaultAmount ?? template.amount, 0),
    active: template.active !== false && template.isActive !== false,
    notes: template.notes || "",
    matchPattern: String(template.matchPattern || "").trim(),
  };
}

export function normalizeIncomeInstance(instance = {}, template = null, monthId = monthKey()) {
  const resolvedTemplate = template ? normalizeIncomeTemplate(template) : null;
  const payDay = Math.max(
    1,
    Math.min(31, Number(instance.payDay || resolvedTemplate?.payDay || 1) || 1)
  );
  const payDate = toDate(instance.payDate || getMonthDate(monthId, payDay));
  const amount = safeNumber(
    instance.amount ?? instance.expectedAmount ?? resolvedTemplate?.defaultAmount,
    0
  );
  return {
    id: instance.id || createId("income-instance"),
    templateId: instance.templateId || resolvedTemplate?.id || null,
    monthKey: instance.monthKey || monthId,
    source: instance.source || instance.name || resolvedTemplate?.source || "Income",
    payDay,
    payDate,
    paycheckSlot: normalizePaycheckSlot(instance.paycheckSlot, resolvedTemplate?.paycheckSlot || getPaycheckSlotFromDueDay(payDay)),
    depositAccountId: instance.depositAccountId || instance.accountId || resolvedTemplate?.depositAccountId || "",
    amount,
    expectedAmount: amount,
    status: instance.status || "expected",
    receivedAt: instance.receivedAt || null,
    linkedTransactionId: instance.linkedTransactionId || "",
    notes: instance.notes ?? resolvedTemplate?.notes ?? "",
    active: instance.active ?? resolvedTemplate?.active ?? true,
  };
}

export function normalizeBillInstance(instance = {}, template = null, monthId = monthKey()) {
  const resolvedTemplate = template ? normalizeBillTemplate(template) : null;
  const dueDay = Math.max(
    1,
    Math.min(31, Number(instance.dueDay || resolvedTemplate?.dueDay || 1) || 1)
  );
  const dueDate = toDate(instance.dueDate || getMonthDate(monthId, dueDay));
  const plannedAmountValue = instance.plannedAmount;
  const suggestedAmount = safeNumber(
    instance.suggestedAmount ?? resolvedTemplate?.defaultAmount ?? instance.amount,
    0
  );
  const plannedAmount =
    plannedAmountValue === "" || plannedAmountValue === null || plannedAmountValue === undefined
      ? (resolvedTemplate?.amountType === "variable" ? null : suggestedAmount)
      : safeNumber(plannedAmountValue, suggestedAmount);
  const actualAmount =
    instance.actualAmount === "" || instance.actualAmount === null || instance.actualAmount === undefined
      ? null
      : safeNumber(instance.actualAmount, 0);
  const status = normalizeBillStatus(instance.status, dueDate);
  return {
    id: instance.id || createId("bill-instance"),
    templateId: instance.templateId || resolvedTemplate?.id || null,
    monthKey: instance.monthKey || monthId,
    name: instance.name || instance.merchant || resolvedTemplate?.name || "Bill",
    category: instance.category || resolvedTemplate?.category || "",
    dueDay,
    dueDate,
    paycheckSlot: normalizePaycheckSlot(instance.paycheckSlot, resolvedTemplate?.paycheckSlot || getPaycheckSlotFromDueDay(dueDay)),
    plannedAccountId:
      instance.plannedAccountId || instance.accountId || resolvedTemplate?.defaultAccountId || "",
    plannedAmount,
    suggestedAmount,
    actualAmount,
    amountType: instance.amountType || resolvedTemplate?.amountType || "fixed",
    status,
    paidDate: instance.paidDate || instance.paidAt || null,
    linkedTransactionId: instance.linkedTransactionId || "",
    manuallyConfirmed: Boolean(instance.manuallyConfirmed),
    verificationStatus:
      instance.verificationStatus ||
      (instance.linkedTransactionId ? "matched" : instance.manuallyConfirmed ? "manual" : "unverified"),
    autopay: instance.autopay ?? resolvedTemplate?.autopay ?? false,
    plaidMatchEnabled: instance.plaidMatchEnabled ?? resolvedTemplate?.plaidMatchEnabled ?? true,
    plaidMatchRules: instance.plaidMatchRules ?? resolvedTemplate?.plaidMatchRules ?? null,
    notes: instance.notes ?? resolvedTemplate?.notes ?? "",
    hidden: instance.hidden ?? resolvedTemplate?.hidden ?? false,
    system: instance.system ?? resolvedTemplate?.system ?? false,
    orphanedTemplate: Boolean(instance.templateId && !resolvedTemplate),
    inactive: !(instance.active ?? resolvedTemplate?.active ?? true),
    setupIssues: {
      missingAccount: !(instance.plannedAccountId || instance.accountId || resolvedTemplate?.defaultAccountId),
      missingAmount: plannedAmount === null || Number(plannedAmount) <= 0,
    },
    variableNeedsReview:
      (instance.amountType || resolvedTemplate?.amountType) === "variable" &&
      (plannedAmount === null || Number(plannedAmount) <= 0),
  };
}

export function normalizeBillStatus(status, dueDate, now = new Date()) {
  if (status === "paid" || status === "skipped") return status;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  return due < today ? "overdue" : "planned";
}

export function normalizeAccount(account = {}, linkedAccount = null) {
  const linkedBalance = linkedAccount
    ? safeNumber(linkedAccount.currentBalance ?? linkedAccount.availableBalance, 0)
    : null;
  const manualBalance = safeNumber(account.balance, 0);
  const balance = linkedBalance ?? manualBalance;
  const linkedId = linkedAccount?.accountId || linkedAccount?.id || "";
  return {
    id: account.id || linkedAccount?.accountId || linkedAccount?.id || createId("account"),
    name:
      linkedAccount?.name ||
      linkedAccount?.officialName ||
      account.name ||
      linkedAccount?.institutionName ||
      "Account",
    type: linkedAccount?.subtype || linkedAccount?.type || account.type || "checking",
    balance,
    availableBalance: linkedBalance,
    institutionName: linkedAccount?.institutionName || account.institutionName || "",
    plaidAccountId: linkedAccount?.plaidAccountId || account.plaidAccountId || "",
    linkedAccountId: account.linkedAccountId || linkedId,
    manualName: account.name || "",
    linkedName: linkedAccount?.name || linkedAccount?.officialName || "",
    source: account.id ? (linkedAccount ? "manual-linked" : "manual") : "linked",
  };
}

export function buildAccountDirectory(accounts = [], linkedAccounts = []) {
  const linkedById = new Map(
    (linkedAccounts || []).flatMap((account) => {
      const keys = [account.accountId, account.id, account.plaidAccountId].filter(Boolean);
      return keys.map((key) => [key, account]);
    })
  );
  const matchedLinkedIds = new Set();
  const combined = (accounts || []).map((account) => {
    const linked = linkedById.get(account.linkedAccountId) || linkedById.get(account.id) || null;
    if (linked) {
      matchedLinkedIds.add(linked.accountId || linked.id || linked.plaidAccountId);
    }
    return normalizeAccount(account, linked);
  });
  for (const linked of linkedAccounts || []) {
    const id = linked.accountId || linked.id;
    if (matchedLinkedIds.has(id)) continue;
    if (combined.some((account) => account.id === id || account.linkedAccountId === id)) continue;
    combined.push(normalizeAccount({}, linked));
  }
  return combined.sort((a, b) => a.name.localeCompare(b.name));
}

function getAccountMatchIds(account = {}) {
  return [...new Set([account.id, account.linkedAccountId, account.plaidAccountId].filter(Boolean))];
}

export function findBillMatchCandidates(instance, transactions = [], template = null, monthId = monthKey()) {
  const plannedAmount = Math.abs(
    safeNumber(instance.actualAmount ?? instance.plannedAmount ?? template?.defaultAmount, 0)
  );
  const dueDate = toDate(instance.dueDate);
  const billName = `${instance.name || template?.name || ""}`.toLowerCase();
  const allowedAccountIds = [...new Set([
    ...(instance.accountMatchIds || []),
    instance.plannedAccountId,
    instance.plaidAccountId,
  ].filter(Boolean))];

  return (transactions || [])
    .filter((transaction) => !transaction.removed)
    .filter((transaction) => monthKey(new Date(transaction.date || new Date())) === monthId)
    .filter((transaction) => safeNumber(transaction.amount, 0) < 0)
    .filter((transaction) => {
      if (allowedAccountIds.length === 0) return true;
      return allowedAccountIds.includes(transaction.accountId);
    })
    .map((transaction) => {
      const amount = Math.abs(safeNumber(transaction.amount, 0));
      const amountDelta = Math.abs(amount - plannedAmount);
      const txDate = toDate(transaction.date);
      const daysFromDue = Math.abs(
        Math.round((txDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      );
      const payee = `${transaction.merchantName || transaction.payee || ""}`.toLowerCase();
      const textScore = billName && payee.includes(billName) ? 20 : 0;
      const score = Math.max(0, 100 - amountDelta * 3 - daysFromDue * 4) + textScore;
      return { transaction, score, amountDelta, daysFromDue };
    })
    .filter((candidate) => candidate.amountDelta <= Math.max(10, plannedAmount * 0.35))
    .filter((candidate) => candidate.daysFromDue <= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function getVariableBillHistory(instance, transactions = [], template = null, monthId = monthKey()) {
  const currentMonthDate = getMonthDate(monthId, 1);
  const earliestDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 3, 1);
  const billName = `${instance.name || template?.name || ""}`.toLowerCase();
  const allowedAccountIds = [...new Set([
    ...(instance.accountMatchIds || []),
    instance.plannedAccountId,
    instance.plaidAccountId,
  ].filter(Boolean))];

  return (transactions || [])
    .filter((transaction) => !transaction.removed)
    .filter((transaction) => safeNumber(transaction.amount, 0) < 0)
    .filter((transaction) => {
      const txDate = toDate(transaction.date);
      return txDate >= earliestDate && txDate < currentMonthDate;
    })
    .filter((transaction) => {
      if (allowedAccountIds.length > 0 && transaction.accountId && !allowedAccountIds.includes(transaction.accountId)) {
        return false;
      }
      const payee = `${transaction.merchantName || transaction.payee || ""}`.toLowerCase();
      return billName ? payee.includes(billName) || billName.includes(payee) : false;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 3)
    .map((transaction) => ({
      id: transaction.id,
      monthLabel: toDate(transaction.date).toLocaleDateString(undefined, { month: "short" }),
      amount: Math.abs(safeNumber(transaction.amount, 0)),
      date: transaction.date,
    }));
}

export function findIncomeMatchCandidates(instance, transactions = [], template = null, monthId = monthKey()) {
  const expectedAmount = Math.abs(
    safeNumber(instance.amount ?? instance.expectedAmount ?? template?.defaultAmount, 0)
  );
  const payDate = toDate(instance.payDate);
  const incomeName = `${instance.source || instance.name || template?.source || ""}`.toLowerCase();
  const learnedPattern = `${template?.matchPattern || ""}`.toLowerCase();
  const allowedAccountIds = [...new Set([
    ...(instance.accountMatchIds || []),
    instance.depositAccountId,
    instance.plaidAccountId,
  ].filter(Boolean))];

  return (transactions || [])
    .filter((transaction) => !transaction.removed)
    .filter((transaction) => safeNumber(transaction.amount, 0) > 0)
    .filter((transaction) => {
      if (allowedAccountIds.length === 0) return true;
      return allowedAccountIds.includes(transaction.accountId);
    })
    .map((transaction) => {
      const amount = Math.abs(safeNumber(transaction.amount, 0));
      const amountDelta = Math.abs(amount - expectedAmount);
      const txDate = toDate(transaction.date);
      const daysFromPayDate = Math.abs(
        Math.round((txDate.getTime() - payDate.getTime()) / (1000 * 60 * 60 * 24))
      );
      const payee = `${transaction.merchantName || transaction.payee || ""}`.toLowerCase();
      let textScore = 0;
      if (learnedPattern && payee.includes(learnedPattern)) {
        textScore += 35;
      } else if (incomeName && payee.includes(incomeName)) {
        textScore += 20;
      }
      const score = Math.max(0, 100 - amountDelta * 2 - daysFromPayDate * 4) + textScore;
      return { transaction, score, amountDelta, daysFromPayDate };
    })
    .filter((candidate) => candidate.amountDelta <= Math.max(25, expectedAmount * 0.35))
    .filter((candidate) => candidate.daysFromPayDate <= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function shouldShowBillInPlanner(bill, options = {}) {
  const {
    showHidden = false,
    showUnconfigured = false,
  } = options;

  if (bill.system || bill.hidden || bill.inactive) {
    return showHidden;
  }

  if (bill.orphanedTemplate) {
    return showHidden;
  }

  const isZeroDollar = safeNumber(bill.plannedAmount ?? bill.suggestedAmount, 0) === 0;
  const isUnconfigured =
    bill.setupIssues?.missingAccount &&
    bill.setupIssues?.missingAmount &&
    !bill.variableNeedsReview;

  if (isZeroDollar && !bill.variableNeedsReview && bill.status !== "paid") {
    return showHidden;
  }

  if (isUnconfigured) {
    return showUnconfigured;
  }

  return true;
}

export function buildPlannerModel({
  monthId,
  settings,
  billTemplates = [],
  billInstances = [],
  incomeTemplates = [],
  incomeInstances = [],
  accounts = [],
  linkedAccounts = [],
  transactions = [],
  visibility = {},
}) {
  const paychecks = getDefaultPaychecks(settings);
  const accountDirectory = buildAccountDirectory(accounts, linkedAccounts);
  const accountMap = new Map(accountDirectory.map((account) => [account.id, account]));
  const templateMap = new Map(billTemplates.map((template) => [template.id, normalizeBillTemplate(template)]));
  const incomeTemplateMap = new Map(
    incomeTemplates.map((template) => [template.id, normalizeIncomeTemplate(template)])
  );
  const normalizedBills = (billInstances || [])
    .map((instance) => normalizeBillInstance(instance, templateMap.get(instance.templateId), monthId))
    .sort((a, b) => a.dueDate - b.dueDate);
  const normalizedIncomes = (incomeInstances || [])
    .map((instance) => normalizeIncomeInstance(instance, incomeTemplateMap.get(instance.templateId), monthId))
    .filter((income) => income.active !== false)
    .sort((a, b) => a.payDate - b.payDate);

  const configuredIncomeSlots = [...new Set(
    [
      ...normalizedIncomes.map((income) => normalizePaycheckSlot(income.paycheckSlot)),
      ...(incomeTemplates || [])
        .map((template) => normalizeIncomeTemplate(template))
        .filter((template) => template.active)
        .map((template) => normalizePaycheckSlot(template.paycheckSlot)),
    ].filter(Boolean)
  )];
  const legacySlots = PAYCHECK_SLOTS.filter((slot) => safeNumber(paychecks[slot]?.expectedIncome, 0) > 0);
  const activeSlots = configuredIncomeSlots.length > 0 ? configuredIncomeSlots : legacySlots;

  const paycheckCards = activeSlots.map((slot) => {
    const paycheck = paychecks[slot] || {
      label: getPaycheckLabel(slot),
      depositDay: 1,
      expectedIncome: 0,
    };
    const incomes = normalizedIncomes
      .filter((income) => income.paycheckSlot === slot)
      .map((income) => {
        const account = accountMap.get(income.depositAccountId) || null;
        return {
          ...income,
          account,
          matchCandidates: findIncomeMatchCandidates(
            {
              ...income,
              plaidAccountId: account?.plaidAccountId || "",
              accountMatchIds: getAccountMatchIds(account),
            },
            transactions,
            incomeTemplateMap.get(income.templateId),
            monthId
          ),
        };
      });
    const bills = normalizedBills
      .filter((bill) => bill.paycheckSlot === slot)
      .map((bill) => {
        const template = templateMap.get(bill.templateId);
        const account = accountMap.get(bill.plannedAccountId) || null;
        const matchCandidates = bill.plaidMatchEnabled
          ? findBillMatchCandidates(
            { ...bill, plaidAccountId: account?.plaidAccountId || "", accountMatchIds: getAccountMatchIds(account) },
            transactions,
            template,
            monthId
          )
          : [];
        const variableHistory =
          bill.amountType === "variable"
            ? getVariableBillHistory(
              { ...bill, plaidAccountId: account?.plaidAccountId || "", accountMatchIds: getAccountMatchIds(account) },
              transactions,
              template,
              monthId
            )
            : [];
        return {
          ...bill,
          template,
          account,
          displayAmount: safeNumber(bill.actualAmount ?? bill.plannedAmount, 0),
          matchCandidates,
          variableHistory,
        };
      });

    const visibleBills = bills.filter((bill) => shouldShowBillInPlanner(bill, visibility));
    const totalPlanned = visibleBills.reduce((sum, bill) => sum + safeNumber(bill.plannedAmount, 0), 0);
    const totalPaid = visibleBills
      .filter((bill) => bill.status === "paid")
      .reduce((sum, bill) => sum + safeNumber(bill.actualAmount ?? bill.plannedAmount, 0), 0);
    const totalRemaining = visibleBills
      .filter((bill) => bill.status !== "paid" && bill.status !== "skipped")
      .reduce((sum, bill) => sum + safeNumber(bill.plannedAmount, 0), 0);
    const income = incomes.length > 0
      ? incomes.reduce((sum, item) => sum + safeNumber(item.amount, 0), 0)
      : safeNumber(paycheck.expectedIncome, 0);
    const receivedIncome = incomes
      .filter((item) => item.status === "received")
      .reduce((sum, item) => sum + safeNumber(item.amount, 0), 0);

    const accountGroups = accountDirectory
      .map((account) => {
        const assignedBills = visibleBills.filter((bill) => bill.plannedAccountId === account.id);
        const assignedIncome = incomes.filter((incomeItem) => incomeItem.depositAccountId === account.id);
        const planned = assignedBills.reduce((sum, bill) => sum + safeNumber(bill.plannedAmount, 0), 0);
        const paid = assignedBills
          .filter((bill) => bill.status === "paid")
          .reduce((sum, bill) => sum + safeNumber(bill.actualAmount ?? bill.plannedAmount, 0), 0);
        return {
          account,
          count: assignedBills.length,
          incomes: assignedIncome,
          incomePlanned: assignedIncome.reduce((sum, item) => sum + safeNumber(item.amount, 0), 0),
          incomeReceived: assignedIncome
            .filter((item) => item.status === "received")
            .reduce((sum, item) => sum + safeNumber(item.amount, 0), 0),
          incomeExpectedCount: assignedIncome.length,
          incomeReceivedCount: assignedIncome.filter((item) => item.status === "received").length,
          incomeReviewNeededCount: assignedIncome.filter((item) => (item.matchCandidates || []).length > 0 && item.status !== "received").length,
          bills: assignedBills,
          planned,
          paid,
          outstanding: Math.max(0, planned - paid),
          projectedRemaining:
            assignedIncome.length > 0
              ? assignedIncome.reduce((sum, item) => sum + safeNumber(item.amount, 0), 0) - planned
              : Math.max(0, planned - paid),
        };
      })
      .filter((entry) => entry.count > 0 || entry.incomes.length > 0);

    const danglingAccountBills = visibleBills.filter(
      (bill) => bill.plannedAccountId && !accountMap.has(bill.plannedAccountId)
    );
    if (danglingAccountBills.length > 0) {
      const planned = danglingAccountBills.reduce((sum, bill) => sum + safeNumber(bill.plannedAmount, 0), 0);
      const paid = danglingAccountBills
        .filter((bill) => bill.status === "paid")
        .reduce((sum, bill) => sum + safeNumber(bill.actualAmount ?? bill.plannedAmount, 0), 0);
      accountGroups.push({
        account: {
          id: "missing-account",
          name: "Missing Account Mapping",
          balance: 0,
          institutionName: "",
          type: "other",
        },
        count: danglingAccountBills.length,
        bills: danglingAccountBills.map((bill) => ({
          ...bill,
          setupIssues: {
            ...bill.setupIssues,
            missingAccount: true,
          },
        })),
        incomes: [],
        incomePlanned: 0,
        incomeReceived: 0,
        incomeExpectedCount: 0,
        incomeReceivedCount: 0,
        incomeReviewNeededCount: 0,
        planned,
        paid,
        outstanding: Math.max(0, planned - paid),
        projectedRemaining: Math.max(0, planned - paid),
      });
    }

    const unassignedBills = visibleBills.filter((bill) => !bill.plannedAccountId);
    if (unassignedBills.length > 0) {
      const planned = unassignedBills.reduce((sum, bill) => sum + safeNumber(bill.plannedAmount, 0), 0);
      const paid = unassignedBills
        .filter((bill) => bill.status === "paid")
        .reduce((sum, bill) => sum + safeNumber(bill.actualAmount ?? bill.plannedAmount, 0), 0);
      accountGroups.push({
        account: {
          id: "unassigned",
          name: "Unassigned",
          balance: 0,
          institutionName: "",
          type: "other",
        },
        count: unassignedBills.length,
        bills: unassignedBills,
        incomes: [],
        incomePlanned: 0,
        incomeReceived: 0,
        incomeExpectedCount: 0,
        incomeReceivedCount: 0,
        incomeReviewNeededCount: 0,
        planned,
        paid,
        outstanding: Math.max(0, planned - paid),
        projectedRemaining: Math.max(0, planned - paid),
      });
    }

    return {
      slot,
      label: paycheck.label || getPaycheckLabel(slot),
      expectedIncome: income,
      receivedIncome,
      expectedDepositDate: incomes[0]?.payDate || getMonthDate(monthId, paycheck.depositDay),
      incomeManagedByTemplates: incomes.length > 0,
      incomes,
      totalPlanned,
      totalPaid,
      totalRemaining,
      projectedRemaining: income - totalPlanned,
      currentlyRemaining: income - totalPaid,
      bills: visibleBills,
      allBills: bills,
      accountGroups,
    };
  });

  const alerts = [];
  normalizedBills.forEach((bill) => {
    const template = templateMap.get(bill.templateId);
    const matches = findBillMatchCandidates(bill, transactions, template, monthId);
    if (bill.variableNeedsReview) {
      alerts.push({
        id: `variable-${bill.id}`,
        tone: "warning",
        message: `${bill.name} needs a variable amount reviewed.`,
      });
    }
    if (bill.status === "overdue") {
      alerts.push({
        id: `overdue-${bill.id}`,
        tone: "danger",
        message: `${bill.name} is overdue.`,
      });
    }
    if (matches.length > 0 && bill.status !== "paid" && !bill.linkedTransactionId) {
      alerts.push({
        id: `match-${bill.id}`,
        tone: "info",
        message: `${bill.name} has ${matches.length} possible match${matches.length > 1 ? "es" : ""}.`,
      });
    }
  });

  paycheckCards.forEach((paycheck) => {
    if (paycheck.projectedRemaining < 0) {
      alerts.push({
        id: `low-${paycheck.slot}`,
        tone: "danger",
        message: `${paycheck.label} is projected to finish ${formatCurrency(Math.abs(paycheck.projectedRemaining))} short.`,
      });
    }
  });

  const overall = {
    totalIncome: paycheckCards.reduce((sum, paycheck) => sum + paycheck.expectedIncome, 0),
    totalPlanned: paycheckCards.reduce((sum, paycheck) => sum + paycheck.totalPlanned, 0),
    totalPaid: paycheckCards.reduce((sum, paycheck) => sum + paycheck.totalPaid, 0),
    totalRemaining: paycheckCards.reduce((sum, paycheck) => sum + paycheck.totalRemaining, 0),
  };

  const cleanup = {
    hiddenOrSystem: normalizedBills.filter(
      (bill) => bill.hidden || bill.system || bill.inactive || bill.orphanedTemplate
    ),
    missingAccount: normalizedBills.filter((bill) => !bill.hidden && !bill.system && !bill.inactive && bill.setupIssues.missingAccount),
    missingAmount: normalizedBills.filter((bill) => !bill.hidden && !bill.system && !bill.inactive && bill.setupIssues.missingAmount),
    variableNeedsReview: normalizedBills.filter((bill) => bill.variableNeedsReview),
    unconfigured: normalizedBills.filter(
      (bill) => !bill.hidden && !bill.system && !bill.inactive && bill.setupIssues.missingAccount && bill.setupIssues.missingAmount
    ),
  };

  return {
    monthId,
    monthLabel: formatMonthLabel(monthId),
    paychecks: paycheckCards,
    alerts,
    alertCounts: {
      variable: alerts.filter((alert) => alert.id.startsWith("variable-")).length,
      overdue: alerts.filter((alert) => alert.id.startsWith("overdue-")).length,
      match: alerts.filter((alert) => alert.id.startsWith("match-")).length,
      lowBalance: alerts.filter((alert) => alert.id.startsWith("low-")).length,
    },
    overall,
    accounts: accountDirectory,
    bills: normalizedBills,
    cleanup,
  };
}

export function getBillFormDefaults(template = null) {
  const normalizedTemplate = template ? normalizeBillTemplate(template) : null;
  return {
    name: normalizedTemplate?.name || "",
    category: normalizedTemplate?.category || "",
    defaultAccountId: normalizedTemplate?.defaultAccountId || "",
    dueDay: normalizedTemplate?.dueDay || 1,
    paycheckSlot: normalizedTemplate?.paycheckSlot || "slot1",
    amountType: normalizedTemplate?.amountType || "fixed",
    defaultAmount: normalizedTemplate?.defaultAmount ?? 0,
    autopay: normalizedTemplate?.autopay || false,
    plaidMatchEnabled: normalizedTemplate?.plaidMatchEnabled ?? true,
    notes: normalizedTemplate?.notes || "",
    active: normalizedTemplate?.active ?? true,
    hidden: normalizedTemplate?.hidden ?? false,
    system: normalizedTemplate?.system ?? false,
  };
}

export function getIncomeTemplateFormDefaults(template = null) {
  const normalizedTemplate = template ? normalizeIncomeTemplate(template) : null;
  return {
    source: normalizedTemplate?.source || "",
    depositAccountId: normalizedTemplate?.depositAccountId || "",
    payDay: normalizedTemplate?.payDay || 1,
    paycheckSlot: normalizedTemplate?.paycheckSlot || "slot1",
    defaultAmount: normalizedTemplate?.defaultAmount ?? 0,
    notes: normalizedTemplate?.notes || "",
    active: normalizedTemplate?.active ?? true,
  };
}
