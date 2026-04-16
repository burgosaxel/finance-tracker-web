import { Timestamp } from "firebase-admin/firestore";

const TRANSFER_KEYWORDS = [
  "transfer",
  "xfer",
  "zelle",
  "venmo cashout",
  "cash app cash out",
  "internal transfer",
  "online transfer",
];

const CARD_PAYMENT_KEYWORDS = [
  "card payment",
  "credit card payment",
  "cc payment",
  "autopay",
];

const REFUND_KEYWORDS = ["refund", "reversal", "reimburse", "reimbursement", "return"];
const INCOME_KEYWORDS = ["payroll", "salary", "paycheck", "direct deposit", "adp", "gusto", "stripe"];

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(left, right) {
  const a = startOfDay(left);
  const b = startOfDay(right);
  if (!a || !b) return 999;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function monthKey(value = new Date()) {
  const date = asDate(value) || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(card|payment|pos|dbt|ach|trf|pymt|online|purchase|debit|credit)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMerchantName(value) {
  const normalized = normalizeText(value)
    .replace(/\binc\b/g, "")
    .replace(/\bllc\b/g, "")
    .replace(/\bco\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "unknown";
}

function titleize(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function amountTolerance(amount) {
  return Math.max(5, Math.abs(safeNumber(amount, 0)) * 0.12);
}

function moneyMatches(left, right, tolerance = amountTolerance(right)) {
  return Math.abs(Math.abs(safeNumber(left, 0)) - Math.abs(safeNumber(right, 0))) <= tolerance;
}

function tokenSet(value) {
  return new Set(normalizeMerchantName(value).split(" ").filter(Boolean));
}

function similarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let matches = 0;
  a.forEach((token) => {
    if (b.has(token)) matches += 1;
  });
  const overlap = matches / Math.max(a.size, b.size);
  const joinedA = [...a].join(" ");
  const joinedB = [...b].join(" ");
  if (joinedA && joinedB && (joinedA.includes(joinedB) || joinedB.includes(joinedA))) {
    return Math.max(overlap, 0.82);
  }
  return overlap;
}

function includesKeyword(text, keywords) {
  const haystack = normalizeText(text);
  return keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
}

function amountDirection(amount) {
  return safeNumber(amount, 0) >= 0 ? "credit" : "debit";
}

function categoryLabel(transaction) {
  return String(
    transaction?.userCategoryOverride ||
      transaction?.effectiveCategory ||
      transaction?.categoryDetailed ||
      transaction?.categoryPrimary ||
      transaction?.category ||
      transaction?.personalFinanceCategory?.detailed ||
      transaction?.personalFinanceCategory?.primary ||
      ""
  );
}

export function normalizeTransactionRecord(transaction, accountMap = new Map()) {
  const account = accountMap.get(transaction.accountId) || {};
  const originalName =
    transaction.originalName ||
    transaction.original_description ||
    transaction.name ||
    transaction.payee ||
    transaction.merchantName ||
    "";
  const merchantName =
    transaction.userMerchantRename ||
    transaction.merchantName ||
    transaction.payee ||
    transaction.name ||
    originalName ||
    "Unknown merchant";
  const normalizedMerchant = normalizeMerchantName(merchantName);
  const postedDate = transaction.postedDate || transaction.date || transaction.authorizedDate || "";
  const authorizedDate = transaction.authorizedDate || transaction.authorized_date || "";
  const pendingDate = transaction.pendingTransactionDate || authorizedDate || "";
  const amount = safeNumber(transaction.amount, 0);
  const detailedCategory =
    transaction.userCategoryOverride ||
    transaction.effectiveCategory ||
    transaction.categoryDetailed ||
    transaction.personalFinanceCategory?.detailed ||
    transaction.category ||
    "Uncategorized";
  const primaryCategory =
    transaction.categoryPrimary ||
    transaction.personalFinanceCategory?.primary ||
    detailedCategory;
  const displayName = transaction.userMerchantRename || titleize(merchantName);

  return {
    ...transaction,
    source: transaction.source || "manual",
    sourceType: transaction.sourceType || transaction.source || "manual",
    accountId: transaction.accountId || "",
    accountName: transaction.accountName || account.name || account.officialName || "",
    accountType: transaction.accountType || account.type || "",
    accountSubtype: transaction.accountSubtype || account.subtype || "",
    postedDate,
    date: postedDate,
    authorizedDate,
    pendingTransactionDate: pendingDate,
    pending: Boolean(transaction.pending),
    amount,
    direction: amountDirection(amount),
    merchantName,
    originalName,
    normalizedMerchantName: normalizedMerchant,
    displayName,
    category: transaction.category || detailedCategory,
    categoryPrimary: primaryCategory,
    categoryDetailed: detailedCategory,
    plaidPersonalFinanceCategory: transaction.plaidPersonalFinanceCategory || transaction.personalFinanceCategory || null,
    personalFinanceCategory: transaction.personalFinanceCategory || transaction.plaidPersonalFinanceCategory || null,
    paymentChannel: transaction.paymentChannel || transaction.payment_channel || "",
    isIgnored: Boolean(transaction.removed || transaction.ignoredFromAnalytics),
    ignoredFromAnalytics: Boolean(transaction.ignoredFromAnalytics),
    tags: Array.isArray(transaction.tags) ? transaction.tags : [],
    linkedBillId: transaction.linkedBillId || null,
    linkedIncomeId: transaction.linkedIncomeId || null,
    linkedDebtId: transaction.linkedDebtId || null,
    linkedCardId: transaction.linkedCardId || null,
    reviewRequired: Boolean(transaction.reviewRequired),
    transferReviewRequired: Boolean(transaction.transferReviewRequired),
  };
}

function buildHistoryMap(items, keyField) {
  const map = new Map();
  for (const item of items || []) {
    const key = item.templateId || item.id;
    if (!key) continue;
    map.set(key, {
      matchedTransactionId: item.matchedTransactionId || null,
      matchedAccountId: item.matchedAccountId || item.paidFromAccountId || item.receivedAccountId || item.accountId || "",
      normalizedMerchantName: normalizeMerchantName(item[keyField] || item.name || ""),
      amount: safeNumber(item.paidAmount ?? item.receivedAmount ?? item.amount ?? item.expectedAmount, 0),
    });
  }
  return map;
}

function determineConfidence(score) {
  if (score >= 0.82) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

function confidenceToBoolean(confidence) {
  return confidence === "high";
}

function makeTimestamp(value) {
  const date = asDate(value);
  return date ? Timestamp.fromDate(date) : null;
}

function baseAutomationFields(item, defaults = {}) {
  return {
    sourceType: item.sourceType || defaults.sourceType || "manual",
    automationStatus: item.automationStatus || defaults.automationStatus || "unmatched",
    matchConfidence: item.matchConfidence || defaults.matchConfidence || "low",
    matchedTransactionId: item.matchedTransactionId || defaults.matchedTransactionId || null,
    matchedAccountId: item.matchedAccountId || defaults.matchedAccountId || null,
    matchedTransactionIds: Array.isArray(item.matchedTransactionIds)
      ? item.matchedTransactionIds
      : defaults.matchedTransactionIds || [],
    reviewRequired: Boolean(item.reviewRequired ?? defaults.reviewRequired),
    manualOverride: Boolean(item.manualOverride),
    ignoredFromAutomation: Boolean(item.ignoredFromAutomation),
    manuallyAdjusted: Boolean(item.manuallyAdjusted),
    overrideReason: item.overrideReason || defaults.overrideReason || "",
  };
}

function shouldSkipAutomation(item) {
  return Boolean(item?.manualOverride || item?.ignoredFromAutomation);
}

function statementDate(item, fallbackField) {
  return asDate(item[fallbackField]) || asDate(item.date) || new Date();
}

function transferSignal(transaction) {
  const text = `${transaction.displayName || ""} ${transaction.merchantName || ""} ${categoryLabel(transaction)}`;
  return (
    includesKeyword(text, TRANSFER_KEYWORDS) ||
    /transfer/i.test(categoryLabel(transaction)) ||
    /TRANSFER_/.test(String(transaction?.categoryDetailed || transaction?.categoryPrimary || ""))
  );
}

function cardPaymentSignal(transaction) {
  const text = `${transaction.displayName || ""} ${transaction.merchantName || ""} ${categoryLabel(transaction)}`;
  return includesKeyword(text, CARD_PAYMENT_KEYWORDS) || /credit card/i.test(categoryLabel(transaction));
}

function incomeSignal(transaction) {
  const text = `${transaction.displayName || ""} ${transaction.merchantName || ""} ${categoryLabel(transaction)}`;
  return includesKeyword(text, INCOME_KEYWORDS) || /income|payroll|wages/i.test(categoryLabel(transaction));
}

function refundSignal(transaction) {
  const text = `${transaction.displayName || ""} ${transaction.merchantName || ""} ${categoryLabel(transaction)}`;
  return includesKeyword(text, REFUND_KEYWORDS);
}

function markTransactionUpdate(existing, patch) {
  return {
    id: existing.id,
    ...patch,
  };
}

function detectDuplicates(transactions) {
  const updates = [];
  const ordered = [...transactions].sort((a, b) => {
    const left = asDate(a.postedDate || a.date)?.getTime() || 0;
    const right = asDate(b.postedDate || b.date)?.getTime() || 0;
    return left - right;
  });

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (current.source !== "plaid" || current.isDuplicate) continue;
    for (let scan = index + 1; scan < ordered.length; scan += 1) {
      const candidate = ordered[scan];
      if (candidate.source !== "plaid" || candidate.isDuplicate) continue;
      if (current.accountId !== candidate.accountId) continue;
      if (!moneyMatches(current.amount, candidate.amount, 0.01)) continue;
      if (similarity(current.displayName, candidate.displayName) < 0.85) continue;
      if (Math.abs(daysBetween(current.postedDate || current.date, candidate.postedDate || candidate.date)) > 2) continue;
      const duplicate = current.pending && !candidate.pending ? current : candidate.pending && !current.pending ? candidate : null;
      const canonical = duplicate?.id === current.id ? candidate : current;
      if (!duplicate || !canonical) continue;
      updates.push(
        markTransactionUpdate(duplicate, {
          isDuplicate: true,
          duplicateOfTransactionId: canonical.id,
          reviewRequired: false,
          excludeFromSpending: true,
          excludeFromIncome: true,
        })
      );
      break;
    }
  }

  return updates;
}

function detectTransfers(transactions, accountMap, cardMap) {
  const updates = [];
  const eligible = transactions.filter((transaction) => !transaction.isDuplicate && !transaction.isIgnored);
  const credits = eligible.filter((transaction) => transaction.direction === "credit");
  const debits = eligible.filter((transaction) => transaction.direction === "debit");
  const paired = new Set();

  for (const debit of debits) {
    if (paired.has(debit.id)) continue;
    const match = credits.find((credit) => {
      if (paired.has(credit.id)) return false;
      if (credit.accountId === debit.accountId) return false;
      if (!accountMap.has(credit.accountId) || !accountMap.has(debit.accountId)) return false;
      if (!moneyMatches(debit.amount, credit.amount, 1)) return false;
      if (Math.abs(daysBetween(debit.postedDate || debit.date, credit.postedDate || credit.date)) > 3) return false;
      const strongSignal =
        transferSignal(debit) ||
        transferSignal(credit) ||
        cardPaymentSignal(debit) ||
        cardPaymentSignal(credit);
      return strongSignal || similarity(debit.displayName, credit.displayName) >= 0.35;
    });

    if (!match) continue;
    paired.add(debit.id);
    paired.add(match.id);
    const possibleCardId =
      debit.linkedCardId ||
      match.linkedCardId ||
      [...cardMap.values()].find((card) => {
        const label = `${card.name || ""} ${card.issuer || ""}`;
        return similarity(label, debit.displayName) >= 0.55 || similarity(label, match.displayName) >= 0.55;
      })?.id ||
      null;

    updates.push(
      markTransactionUpdate(debit, {
        isTransfer: true,
        transferStatus: "matched",
        transferPairTransactionId: match.id,
        transferReviewRequired: false,
        linkedCardId: possibleCardId || debit.linkedCardId || null,
        transactionKind: possibleCardId ? "card_payment" : "transfer",
        excludeFromSpending: true,
        excludeFromIncome: true,
        reviewRequired: false,
      }),
      markTransactionUpdate(match, {
        isTransfer: true,
        transferStatus: "matched",
        transferPairTransactionId: debit.id,
        transferReviewRequired: false,
        linkedCardId: possibleCardId || match.linkedCardId || null,
        transactionKind: possibleCardId ? "card_payment" : "transfer",
        excludeFromSpending: true,
        excludeFromIncome: true,
        reviewRequired: false,
      })
    );
  }

  for (const transaction of eligible) {
    if (paired.has(transaction.id)) continue;
    if (!transferSignal(transaction) && !cardPaymentSignal(transaction)) continue;
    updates.push(
      markTransactionUpdate(transaction, {
        isTransfer: transferSignal(transaction),
        transferStatus: "review",
        transactionKind: cardPaymentSignal(transaction) ? "card_payment" : "transfer",
        transferReviewRequired: true,
        excludeFromSpending: true,
        excludeFromIncome: true,
        reviewRequired: true,
      })
    );
  }

  return updates;
}

function matchBills({ monthId, bills, transactions, history }) {
  const itemUpdates = [];
  const transactionUpdates = [];
  const usedTransactions = new Set();

  for (const bill of bills || []) {
    const automation = baseAutomationFields(bill, { sourceType: bill.sourceType || "manual" });
    if (shouldSkipAutomation(bill)) continue;

    const dueDate = statementDate(bill, "dueDate");
    const historyEntry = history.get(bill.templateId || bill.id) || null;
    const candidates = transactions
      .filter((transaction) => transaction.direction === "debit")
      .filter((transaction) => !transaction.pending)
      .filter((transaction) => !transaction.isDuplicate && !transaction.isIgnored)
      .filter((transaction) => !transaction.isTransfer && transaction.transactionKind !== "card_payment")
      .filter((transaction) => !usedTransactions.has(transaction.id))
      .map((transaction) => {
        const merchantScore = similarity(
          transaction.normalizedMerchantName,
          bill.merchant || bill.name || historyEntry?.normalizedMerchantName || ""
        );
        const amountScore = moneyMatches(transaction.amount, bill.amount)
          ? 1
          : moneyMatches(transaction.amount, bill.amount, Math.max(10, Math.abs(safeNumber(bill.amount, 0)) * 0.18))
            ? 0.72
            : 0;
        const dateScore = (() => {
          const diff = Math.abs(daysBetween(transaction.postedDate || transaction.date, dueDate));
          if (diff <= 2) return 1;
          if (diff <= 5) return 0.8;
          if (diff <= 10) return 0.45;
          return 0;
        })();
        const accountScore =
          historyEntry?.matchedAccountId && historyEntry.matchedAccountId === transaction.accountId
            ? 0.18
            : bill.accountId && bill.accountId === transaction.accountId
              ? 0.15
              : 0;
        const total = merchantScore * 0.48 + amountScore * 0.3 + dateScore * 0.17 + accountScore;
        return { transaction, score: clamp(total, 0, 1) };
      })
      .filter((entry) => entry.score >= 0.4)
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best) {
      if (automation.automationStatus !== "ignored") {
        itemUpdates.push({
          id: bill.id,
          monthId,
          patch: {
            automationStatus: bill.status === "paid" ? "paid" : "unmatched",
            matchConfidence: "low",
            matchedTransactionId: null,
            matchedAccountId: null,
            matchedTransactionIds: [],
            lastMatchedAt: null,
            reviewRequired: false,
          },
        });
      }
      continue;
    }

    const confidence = determineConfidence(best.score);
    const transaction = best.transaction;
    const autoApply = confidenceToBoolean(confidence);
    usedTransactions.add(transaction.id);

    itemUpdates.push({
      id: bill.id,
      monthId,
      patch: {
        monthKey: monthId,
        sourceType:
          bill.sourceType === "manual" && transaction.source === "plaid"
            ? "hybrid"
            : transaction.source || bill.sourceType || "manual",
        automationStatus: autoApply ? "paid" : "suggested",
        matchConfidence: confidence,
        matchedTransactionId: transaction.id,
        matchedAccountId: transaction.accountId || "",
        matchedTransactionIds: [transaction.id],
        lastMatchedAt: Timestamp.now(),
        reviewRequired: !autoApply,
        status: autoApply ? "paid" : bill.status || "unpaid",
        paidAt: autoApply ? makeTimestamp(transaction.postedDate || transaction.date) : bill.paidAt || null,
        paidAmount: Math.abs(safeNumber(transaction.amount, 0)),
        paidFromAccountId: transaction.accountId || "",
        isAutoMatched: autoApply,
        manuallyAdjusted: Boolean(bill.manuallyAdjusted),
      },
    });

    transactionUpdates.push(
      markTransactionUpdate(transaction, {
        linkedBillId: bill.id,
        linkedManualType: "bill",
        linkedManualId: bill.id,
        linkedManualMonthId: monthId,
        matchStatus: autoApply ? "matched" : "suggested",
        reviewRequired: !autoApply,
      })
    );
  }

  return { itemUpdates, transactionUpdates };
}

function matchIncome({ monthId, incomes, transactions, history }) {
  const itemUpdates = [];
  const transactionUpdates = [];
  const usedTransactions = new Set();

  for (const income of incomes || []) {
    if (shouldSkipAutomation(income)) continue;
    const payDate = statementDate(income, "payDate");
    const historyEntry = history.get(income.templateId || income.id) || null;
    const candidates = transactions
      .filter((transaction) => transaction.direction === "credit")
      .filter((transaction) => !transaction.pending)
      .filter((transaction) => !transaction.isDuplicate && !transaction.isIgnored)
      .filter((transaction) => !transaction.isTransfer && transaction.transactionKind !== "card_payment")
      .filter((transaction) => !refundSignal(transaction))
      .filter((transaction) => !usedTransactions.has(transaction.id))
      .map((transaction) => {
        const merchantScore = similarity(
          transaction.normalizedMerchantName,
          income.source || income.name || historyEntry?.normalizedMerchantName || ""
        );
        const amountScore = moneyMatches(transaction.amount, income.expectedAmount ?? income.amount)
          ? 1
          : moneyMatches(transaction.amount, income.expectedAmount ?? income.amount, Math.max(20, Math.abs(safeNumber(income.expectedAmount ?? income.amount, 0)) * 0.18))
            ? 0.72
            : 0;
        const dateDiff = Math.abs(daysBetween(transaction.postedDate || transaction.date, payDate));
        const dateScore = dateDiff <= 2 ? 1 : dateDiff <= 5 ? 0.8 : dateDiff <= 10 ? 0.45 : 0;
        const accountScore =
          historyEntry?.matchedAccountId && historyEntry.matchedAccountId === transaction.accountId
            ? 0.18
            : income.depositAccountId && income.depositAccountId === transaction.accountId
              ? 0.15
              : 0;
        const keywordScore = incomeSignal(transaction) ? 0.08 : 0;
        const total = merchantScore * 0.45 + amountScore * 0.28 + dateScore * 0.17 + accountScore + keywordScore;
        return { transaction, score: clamp(total, 0, 1) };
      })
      .filter((entry) => entry.score >= 0.42)
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best) {
      itemUpdates.push({
        id: income.id,
        monthId,
        patch: {
          automationStatus: income.status === "received" ? "received" : "unmatched",
          matchConfidence: "low",
          matchedTransactionId: null,
          matchedAccountId: null,
          matchedTransactionIds: [],
          lastMatchedAt: null,
          reviewRequired: false,
        },
      });
      continue;
    }

    const confidence = determineConfidence(best.score);
    const autoApply = confidenceToBoolean(confidence);
    const transaction = best.transaction;
    usedTransactions.add(transaction.id);

    itemUpdates.push({
      id: income.id,
      monthId,
      patch: {
        monthKey: monthId,
        sourceType:
          income.sourceType === "manual" && transaction.source === "plaid"
            ? "hybrid"
            : transaction.source || income.sourceType || "manual",
        automationStatus: autoApply ? "received" : "suggested",
        matchConfidence: confidence,
        matchedTransactionId: transaction.id,
        matchedAccountId: transaction.accountId || "",
        matchedTransactionIds: [transaction.id],
        lastMatchedAt: Timestamp.now(),
        reviewRequired: !autoApply,
        status: autoApply ? "received" : income.status || "expected",
        receivedAt: autoApply ? makeTimestamp(transaction.postedDate || transaction.date) : income.receivedAt || null,
        receivedAmount: Math.abs(safeNumber(transaction.amount, 0)),
        receivedAccountId: transaction.accountId || "",
        isAutoMatched: autoApply,
        manuallyAdjusted: Boolean(income.manuallyAdjusted),
      },
    });

    transactionUpdates.push(
      markTransactionUpdate(transaction, {
        linkedIncomeId: income.id,
        linkedManualType: "income",
        linkedManualId: income.id,
        linkedManualMonthId: monthId,
        matchStatus: autoApply ? "matched" : "suggested",
        reviewRequired: !autoApply,
      })
    );
  }

  return { itemUpdates, transactionUpdates };
}

function linkCardPayments({ transactions, cards }) {
  const transactionUpdates = [];
  const cardUpdates = [];
  const cardList = cards || [];

  for (const transaction of transactions) {
    if (transaction.direction !== "debit" || transaction.isIgnored || transaction.isDuplicate) continue;
    if (transaction.isTransfer && transaction.transactionKind !== "card_payment") continue;

    const card = cardList
      .map((entry) => ({
        entry,
        score: Math.max(
          similarity(`${entry.name || ""} ${entry.issuer || ""}`, transaction.displayName),
          similarity(`${entry.name || ""} ${entry.issuer || ""}`, transaction.merchantName)
        ),
      }))
      .sort((left, right) => right.score - left.score)[0];

    if (!card || card.score < 0.58) continue;
    const destination = card.entry;
    transactionUpdates.push(
      markTransactionUpdate(transaction, {
        linkedCardId: destination.id,
        linkedDebtId: destination.id,
        transactionKind: "card_payment",
        excludeFromSpending: true,
        reviewRequired: Boolean(transaction.reviewRequired && !transaction.isTransfer),
      })
    );
    cardUpdates.push({
      id: destination.id,
      patch: {
        lastPaymentAmount: Math.abs(safeNumber(transaction.amount, 0)),
        lastPaymentDate: makeTimestamp(transaction.postedDate || transaction.date),
        lastPaymentTransactionId: transaction.id,
        paymentFromAccountId: transaction.accountId || "",
      },
    });
  }

  return { transactionUpdates, cardUpdates };
}

export function runAutomationEngine({
  transactions = [],
  billsByMonth = new Map(),
  incomesByMonth = new Map(),
  cards = [],
  accounts = [],
}) {
  const accountMap = new Map(accounts.map((account) => [account.id || account.accountId, account]));
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const normalizedTransactions = transactions.map((transaction) =>
    normalizeTransactionRecord(transaction, accountMap)
  );
  const transactionPatchMap = new Map();
  const statementUpdates = { bills: [], incomes: [] };
  const cardPatchMap = new Map();

  function queueTransactionPatch(update) {
    if (!update?.id) return;
    transactionPatchMap.set(update.id, {
      ...(transactionPatchMap.get(update.id) || {}),
      ...update,
    });
  }

  function queueCardPatch(update) {
    if (!update?.id) return;
    cardPatchMap.set(update.id, {
      ...(cardPatchMap.get(update.id) || {}),
      ...update.patch,
    });
  }

  for (const duplicate of detectDuplicates(normalizedTransactions)) {
    queueTransactionPatch(duplicate);
  }

  const withDuplicateState = normalizedTransactions.map((transaction) => ({
    ...transaction,
    ...(transactionPatchMap.get(transaction.id) || {}),
  }));

  for (const transfer of detectTransfers(withDuplicateState, accountMap, cardMap)) {
    queueTransactionPatch(transfer);
  }

  const withTransferState = withDuplicateState.map((transaction) => ({
    ...transaction,
    ...(transactionPatchMap.get(transaction.id) || {}),
  }));

  for (const [monthId, bills] of billsByMonth.entries()) {
    const history = buildHistoryMap(bills, "merchant");
    const result = matchBills({ monthId, bills, transactions: withTransferState, history });
    result.itemUpdates.forEach((entry) => statementUpdates.bills.push(entry));
    result.transactionUpdates.forEach(queueTransactionPatch);
  }

  const withBillsState = withTransferState.map((transaction) => ({
    ...transaction,
    ...(transactionPatchMap.get(transaction.id) || {}),
  }));

  for (const [monthId, incomes] of incomesByMonth.entries()) {
    const history = buildHistoryMap(incomes, "source");
    const result = matchIncome({ monthId, incomes, transactions: withBillsState, history });
    result.itemUpdates.forEach((entry) => statementUpdates.incomes.push(entry));
    result.transactionUpdates.forEach(queueTransactionPatch);
  }

  const withIncomeState = withBillsState.map((transaction) => ({
    ...transaction,
    ...(transactionPatchMap.get(transaction.id) || {}),
  }));
  const cardLinkResult = linkCardPayments({ transactions: withIncomeState, cards });
  cardLinkResult.transactionUpdates.forEach(queueTransactionPatch);
  cardLinkResult.cardUpdates.forEach(queueCardPatch);

  const finalTransactionUpdates = withIncomeState.map((transaction) => {
    const patch = transactionPatchMap.get(transaction.id) || {};
    const effective = { ...transaction, ...patch };
    const uncategorized =
      !effective.userCategoryOverride &&
      !effective.categoryDetailed &&
      !effective.categoryPrimary &&
      !effective.category;
    return {
      id: transaction.id,
      patch: {
        accountName: effective.accountName || "",
        accountType: effective.accountType || "",
        accountSubtype: effective.accountSubtype || "",
        postedDate: effective.postedDate || effective.date || "",
        direction: effective.direction || amountDirection(effective.amount),
        normalizedMerchantName: effective.normalizedMerchantName || normalizeMerchantName(effective.displayName),
        displayName: effective.displayName || effective.merchantName || effective.name || "Transaction",
        transactionKind:
          effective.transactionKind ||
          (effective.isTransfer ? "transfer" : effective.linkedIncomeId ? "income" : effective.linkedBillId ? "bill_payment" : "spend"),
        isTransfer: Boolean(effective.isTransfer),
        transferStatus: effective.transferStatus || "none",
        transferPairTransactionId: effective.transferPairTransactionId || null,
        transferReviewRequired: Boolean(effective.transferReviewRequired),
        linkedBillId: effective.linkedBillId || null,
        linkedIncomeId: effective.linkedIncomeId || null,
        linkedCardId: effective.linkedCardId || null,
        linkedDebtId: effective.linkedDebtId || null,
        isCardPayment: effective.transactionKind === "card_payment",
        excludeFromSpending: Boolean(
          effective.excludeFromSpending || effective.isTransfer || effective.transactionKind === "card_payment"
        ),
        excludeFromIncome: Boolean(
          effective.excludeFromIncome || effective.isTransfer || refundSignal(effective)
        ),
        reviewRequired: Boolean(
          patch.reviewRequired ??
            effective.reviewRequired ??
            effective.transferReviewRequired ??
            uncategorized
        ),
        automationStatus:
          effective.linkedBillId || effective.linkedIncomeId
            ? effective.matchStatus === "suggested"
              ? "suggested"
              : "matched"
            : effective.transferReviewRequired
              ? "review"
              : "unmatched",
      },
    };
  });

  return {
    transactions: finalTransactionUpdates,
    statements: statementUpdates,
    cards: [...cardPatchMap.entries()].map(([id, patch]) => ({ id, patch })),
    summary: {
      monthKeys: [...new Set([...billsByMonth.keys(), ...incomesByMonth.keys()])],
      transactionCount: finalTransactionUpdates.length,
      billSuggestionCount: statementUpdates.bills.filter((entry) => entry.patch.reviewRequired).length,
      incomeSuggestionCount: statementUpdates.incomes.filter((entry) => entry.patch.reviewRequired).length,
    },
  };
}

export function buildLinkedCreditCardPayload(account, institutionName = "") {
  const balance = Math.max(0, safeNumber(account.currentBalance ?? account.balance, 0));
  const limit = Math.max(balance, safeNumber(account.creditLimit ?? account.limit ?? 0, 0));
  return {
    id: `plaid-card-${account.accountId || account.plaidAccountId}`,
    plaidAccountId: account.accountId || account.plaidAccountId || "",
    linkedAccountId: account.accountId || account.plaidAccountId || "",
    sourceType: "plaid",
    name: account.name || account.officialName || "Synced Card",
    issuer: institutionName || account.institutionName || "",
    balance,
    limit,
    syncedBalance: balance,
    syncedLimit: limit,
    manualOnly: false,
    isSynced: true,
    updatedFromPlaidAt: Timestamp.now(),
  };
}

export function monthKeyForValue(value) {
  return monthKey(value);
}
