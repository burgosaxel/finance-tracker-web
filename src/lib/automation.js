export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeMerchantName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(card|payment|ach|debit|credit|online|purchase)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getTransactionDisplayName(transaction) {
  return (
    transaction?.userMerchantRename ||
    transaction?.displayName ||
    transaction?.merchantName ||
    transaction?.payee ||
    transaction?.name ||
    "Transaction"
  );
}

export function getTransactionDirection(transaction) {
  if (transaction?.direction) return transaction.direction;
  return Number(transaction?.amount || 0) >= 0 ? "credit" : "debit";
}

export function isTransactionTransfer(transaction) {
  return Boolean(
    transaction?.isTransfer ||
      transaction?.transferStatus === "matched" ||
      transaction?.transactionKind === "transfer"
  );
}

export function isTransactionCardPayment(transaction) {
  return Boolean(transaction?.isCardPayment || transaction?.transactionKind === "card_payment");
}

export function shouldExcludeFromSpending(transaction) {
  return Boolean(
    transaction?.removed ||
      transaction?.ignoredFromAnalytics ||
      transaction?.excludeFromSpending ||
      transaction?.isDuplicate ||
      isTransactionTransfer(transaction) ||
      isTransactionCardPayment(transaction)
  );
}

export function shouldExcludeFromIncome(transaction) {
  return Boolean(
    transaction?.removed ||
      transaction?.ignoredFromAnalytics ||
      transaction?.excludeFromIncome ||
      transaction?.isDuplicate ||
      isTransactionTransfer(transaction) ||
      isTransactionCardPayment(transaction)
  );
}

export function getAutomationReviewSummary({
  bills = [],
  income = [],
  transactions = [],
}) {
  const billSuggestions = (bills || []).filter(
    (item) => item?.reviewRequired || item?.automationStatus === "suggested"
  );
  const incomeSuggestions = (income || []).filter(
    (item) => item?.reviewRequired || item?.automationStatus === "suggested"
  );
  const transactionReviews = (transactions || []).filter(
    (item) =>
      item?.reviewRequired ||
      item?.transferReviewRequired ||
      (!item?.ignoredFromAnalytics &&
        !item?.removed &&
        !item?.userCategoryOverride &&
        !item?.categoryDetailed &&
        !item?.categoryPrimary &&
        !item?.category)
  );

  return {
    billSuggestions,
    incomeSuggestions,
    transactionReviews,
    totalReviews:
      billSuggestions.length + incomeSuggestions.length + transactionReviews.length,
  };
}
