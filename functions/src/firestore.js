import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  guessCadence,
  normalizeInstitutionName,
  normalizeMerchantKey,
  normalizeMerchantName,
  pickCategoryFields,
  plaidAmountToSignedAmount,
} from "./plaid.js";

function db() {
  return getFirestore();
}

function recurringBatchWriter() {
  let batch = db().batch();
  let operations = 0;
  const commits = [];

  function queueSet(ref, payload, options = { merge: true }) {
    batch.set(ref, payload, options);
    operations += 1;
    if (operations >= 400) {
      commits.push(batch.commit());
      batch = db().batch();
      operations = 0;
    }
  }

  async function flush() {
    if (operations > 0) {
      commits.push(batch.commit());
    }
    await Promise.all(commits);
  }

  return { queueSet, flush };
}

export function userDoc(uid, collectionName, id) {
  return db().doc(`users/${uid}/${collectionName}/${id}`);
}

export function userCollection(uid, collectionName) {
  return db().collection(`users/${uid}/${collectionName}`);
}

export function privateItemDoc(uid, plaidItemId) {
  return db().doc(`plaidPrivateItems/${uid}_${plaidItemId}`);
}

export async function writePlaidItemMetadata(uid, plaidItemId, payload) {
  const publicRef = userDoc(uid, "plaidItems", plaidItemId);
  await publicRef.set(
    {
      itemId: plaidItemId,
      plaidItemId,
      createdAt: payload.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...payload,
    },
    { merge: true }
  );
}

export async function writePrivateItem(uid, plaidItemId, payload) {
  const privateRef = privateItemDoc(uid, plaidItemId);
  await privateRef.set(
    {
      uid,
      plaidItemId,
      createdAt: payload.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...payload,
    },
    { merge: true }
  );
}

export async function loadPrivateItem(uid, plaidItemId) {
  const snapshot = await privateItemDoc(uid, plaidItemId).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function getUserPrivateItems(uid) {
  const snapshot = await db().collection("plaidPrivateItems").where("uid", "==", uid).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getAllPrivateItems() {
  const snapshot = await db().collection("plaidPrivateItems").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getPrivateItemByPlaidItemId(plaidItemId) {
  const snapshot = await db()
    .collection("plaidPrivateItems")
    .where("plaidItemId", "==", plaidItemId)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function syncLinkedAccounts(uid, plaidItemId, institution, accounts) {
  const batch = db().batch();
  const now = FieldValue.serverTimestamp();

  for (const account of accounts) {
    const ref = userDoc(uid, "linkedAccounts", account.account_id);
    batch.set(
      ref,
      {
        accountId: account.account_id,
        plaidAccountId: account.account_id,
        itemId: plaidItemId,
        institutionName: normalizeInstitutionName(institution),
        name: account.name || account.official_name || "Linked account",
        officialName: account.official_name || "",
        mask: account.mask || "",
        type: account.type || "",
        subtype: account.subtype || "",
        currentBalance: Number(account.balances?.current ?? 0),
        availableBalance:
          account.balances?.available === null || account.balances?.available === undefined
            ? null
            : Number(account.balances.available),
        isoCurrencyCode: account.balances?.iso_currency_code || "USD",
        source: "plaid",
        createdAt: now,
        updatedAt: now,
        lastBalanceSyncAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

export async function syncTransactionsPage(uid, plaidItemId, accountMap, page) {
  const batch = db().batch();
  const now = FieldValue.serverTimestamp();

  for (const transaction of page.added || []) {
    const docRef = userDoc(uid, "transactions", transaction.transaction_id);
    const account = accountMap.get(transaction.account_id) || {};
    const categoryFields = pickCategoryFields(transaction);
    const effectiveCategory =
      categoryFields.categoryDetailed ||
      categoryFields.categoryPrimary ||
      transaction.personal_finance_category?.detailed ||
      transaction.personal_finance_category?.primary ||
      transaction.category?.[transaction.category?.length - 1] ||
      transaction.category?.[0] ||
      "Uncategorized";
    batch.set(
      docRef,
      {
        transactionId: transaction.transaction_id,
        plaidTransactionId: transaction.transaction_id,
        accountId: transaction.account_id,
        itemId: plaidItemId,
        institutionName: account.institutionName || "",
        date: transaction.date || "",
        authorizedDate: transaction.authorized_date || "",
        name: transaction.name || "",
        merchantName: normalizeMerchantName(transaction),
        amount: plaidAmountToSignedAmount(transaction),
        isoCurrencyCode: transaction.iso_currency_code || "USD",
        pending: Boolean(transaction.pending),
        source: "plaid",
        userCategoryOverride: null,
        effectiveCategory,
        notes: "",
        recurringCandidate: false,
        removed: false,
        createdAt: now,
        updatedAt: now,
        ...categoryFields,
      },
      { merge: true }
    );
  }

  for (const transaction of page.modified || []) {
    const docRef = userDoc(uid, "transactions", transaction.transaction_id);
    const categoryFields = pickCategoryFields(transaction);
    const effectiveCategory =
      categoryFields.categoryDetailed ||
      categoryFields.categoryPrimary ||
      transaction.personal_finance_category?.detailed ||
      transaction.personal_finance_category?.primary ||
      transaction.category?.[transaction.category?.length - 1] ||
      transaction.category?.[0] ||
      "Uncategorized";
    batch.set(
      docRef,
      {
        date: transaction.date || "",
        authorizedDate: transaction.authorized_date || "",
        name: transaction.name || "",
        merchantName: normalizeMerchantName(transaction),
        amount: plaidAmountToSignedAmount(transaction),
        isoCurrencyCode: transaction.iso_currency_code || "USD",
        pending: Boolean(transaction.pending),
        effectiveCategory,
        removed: false,
        updatedAt: now,
        ...categoryFields,
      },
      { merge: true }
    );
  }

  for (const removed of page.removed || []) {
    const docRef = userDoc(uid, "transactions", removed.transaction_id);
    batch.set(
      docRef,
      {
        removed: true,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

export async function updateSyncState(uid, payload) {
  await userDoc(uid, "syncState", "plaid").set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      ...payload,
    },
    { merge: true }
  );
}

export async function refreshRecurringPayments(uid) {
  const txSnapshot = await userCollection(uid, "transactions").where("source", "==", "plaid").get();
  const existingRecurringSnapshot = await userCollection(uid, "recurringPayments").get();
  const existingRecurring = new Map(
    existingRecurringSnapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
  );
  const groups = new Map();

  function merchantIdentity(tx) {
    return normalizeMerchantKey(tx.merchantName || tx.name || tx.payee);
  }

  function typeGuessFromEntries(entries, averageAmount, matchedType) {
    if (matchedType === "bill") return "bill";
    if (matchedType === "income") return "income";
    if (matchedType === "loan") return "loan_payment";
    if (matchedType === "creditCard") return "credit_card_payment";

    const last = entries[entries.length - 1] || {};
    const categoryText = `${last.categoryDetailed || ""} ${last.categoryPrimary || ""}`.toLowerCase();
    const merchantText = `${last.merchantName || ""} ${last.name || ""}`.toLowerCase();

    if (averageAmount > 0) {
      if (merchantText.includes("dfas") || merchantText.includes("payroll") || merchantText.includes("salary")) {
        return "income";
      }
      if (categoryText.includes("payroll") || categoryText.includes("income")) return "income";
      if (categoryText.includes("transfer")) return "transfer";
      return "income";
    }

    if (
      /(netflix|spotify|hulu|prime|apple|google one|icloud|youtube|patreon|adobe|canva|audible)/.test(
        merchantText
      )
    ) {
      return "subscription";
    }
    if (/(best egg|upstart|sofi|loan|lending|mortgage|student loan|auto loan)/.test(merchantText)) {
      return "loan_payment";
    }
    if (/(visa|mastercard|discover|amex|american express|card payment|credit card|capital one|navy fed)/.test(merchantText)) {
      return "credit_card_payment";
    }
    if (/(insurance|geico|progressive|state farm|usaa|verizon|t mobile|internet|electric|water|gas)/.test(merchantText)) {
      return "bill";
    }
    if (categoryText.includes("loan")) return "loan_payment";
    if (categoryText.includes("credit card")) return "credit_card_payment";
    if (categoryText.includes("insurance") || categoryText.includes("utility")) return "bill";
    if (categoryText.includes("transfer")) return "transfer";
    return "bill";
  }

  function nextExpectedFromCadence(lastDate, cadence) {
    const next = new Date(lastDate);
    if (cadence === "weekly") next.setDate(next.getDate() + 7);
    else if (cadence === "biweekly") next.setDate(next.getDate() + 14);
    else if (cadence === "semi-monthly") next.setDate(next.getDate() + 15);
    else if (cadence === "monthly") next.setMonth(next.getMonth() + 1);
    else return null;
    return next;
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function stddev(values, mean) {
    if (!values.length) return 0;
    const variance = average(values.map((value) => (value - mean) ** 2));
    return Math.sqrt(variance);
  }

  for (const doc of txSnapshot.docs) {
    const tx = { id: doc.id, ...doc.data() };
    if (tx.removed || tx.pending) continue;
    const merchantKey = merchantIdentity(tx);
    if (!merchantKey) continue;
    const direction = Number(tx.amount || 0) >= 0 ? "income" : "expense";
    const recurringId = `${direction}-${merchantKey}`;
    const existing = groups.get(recurringId) || [];
    existing.push(tx);
    groups.set(recurringId, existing);
  }

  const writer = recurringBatchWriter();
  const now = FieldValue.serverTimestamp();
  const detectedIds = new Set();
  const recurringTransactionIds = new Set();

  for (const [recurringId, entries] of groups.entries()) {
    const ordered = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (ordered.length < 2) continue;

    const diffs = [];
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = new Date(ordered[i - 1].date);
      const current = new Date(ordered[i].date);
      diffs.push(Math.round((current - previous) / (1000 * 60 * 60 * 24)));
    }

    const averageDiff = average(diffs);
    const cadenceGuess = guessCadence(averageDiff);
    const absAmounts = ordered.map((entry) => Math.abs(Number(entry.amount || 0)));
    const averageAmount = average(absAmounts);
    const amountSpread = absAmounts.length > 1 ? (Math.max(...absAmounts) - Math.min(...absAmounts)) / Math.max(averageAmount, 1) : 0;
    const dateVariance = diffs.length > 1 ? stddev(diffs, averageDiff) : 0;
    const matchedCounts = new Map();
    for (const entry of ordered) {
      if (!entry.linkedManualType || !entry.linkedManualId) continue;
      const key = `${entry.linkedManualType}|${entry.linkedManualId}|${entry.linkedManualMonthId || ""}`;
      matchedCounts.set(key, (matchedCounts.get(key) || 0) + 1);
    }
    const topMatched = [...matchedCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const [linkedManualType = null, linkedManualId = null, linkedManualMonthId = ""] = topMatched
      ? topMatched[0].split("|")
      : [];

    const lastEntry = ordered[ordered.length - 1];
    const lastSeenDate = new Date(lastEntry.date);
    const nextExpectedDate = nextExpectedFromCadence(lastSeenDate, cadenceGuess);

    let confidence = 0.2;
    confidence += Math.min(0.4, ordered.length * 0.1);
    if (cadenceGuess !== "unknown") confidence += 0.15;
    if (amountSpread <= 0.08) confidence += 0.15;
    else if (amountSpread <= 0.2) confidence += 0.08;
    if (dateVariance <= 2) confidence += 0.1;
    else if (dateVariance <= 5) confidence += 0.05;
    if (topMatched) confidence += 0.15;
    confidence = Math.max(0, Math.min(1, confidence));

    const enoughHistory =
      ordered.length >= 3 ||
      (ordered.length >= 2 && cadenceGuess !== "unknown" && confidence >= 0.45);
    if (!enoughHistory) continue;

    const existing = existingRecurring.get(recurringId);
    const activeWindowDays =
      cadenceGuess === "weekly" ? 21 :
      cadenceGuess === "biweekly" ? 35 :
      cadenceGuess === "semi-monthly" ? 35 :
      cadenceGuess === "monthly" ? 65 :
      45;
    const active =
      (Date.now() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24) <= activeWindowDays;

    const typeGuess = typeGuessFromEntries(ordered, Number(lastEntry.amount || 0), linkedManualType);
    const displayName = lastEntry.merchantName || lastEntry.name || recurringId;
    const ref = userDoc(uid, "recurringPayments", recurringId);
    writer.queueSet(
      ref,
      {
        recurringId,
        normalizedMerchant: merchantIdentity(lastEntry),
        displayName,
        merchantName: displayName,
        transactionIds: ordered.slice(-10).map((entry) => entry.transactionId || entry.id),
        sourceTransactionIds: ordered.slice(-5).map((entry) => entry.transactionId || entry.id),
        cadenceGuess,
        averageAmount: Number(averageAmount.toFixed(2)),
        minAmount: Number(Math.min(...absAmounts).toFixed(2)),
        maxAmount: Number(Math.max(...absAmounts).toFixed(2)),
        lastSeenDate: Timestamp.fromDate(lastSeenDate),
        nextExpectedDate: nextExpectedDate ? Timestamp.fromDate(nextExpectedDate) : null,
        typeGuess,
        confidence: Number(confidence.toFixed(2)),
        active,
        source: "plaid",
        linkedManualType: existing?.linkedManualType || linkedManualType || null,
        linkedManualId: existing?.linkedManualId || linkedManualId || null,
        linkedManualMonthId: existing?.linkedManualMonthId || linkedManualMonthId || null,
        status: existing?.status || (topMatched ? "confirmed" : "suggested"),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        category:
          lastEntry.userCategoryOverride ||
          lastEntry.categoryDetailed ||
          lastEntry.categoryPrimary ||
          "Uncategorized",
      },
      { merge: true }
    );
    detectedIds.add(recurringId);
    ordered.forEach((entry) => recurringTransactionIds.add(entry.id));
  }

  for (const doc of txSnapshot.docs) {
    writer.queueSet(
      doc.ref,
      {
        recurringCandidate: recurringTransactionIds.has(doc.id),
        updatedAt: now,
      },
      { merge: true }
    );
  }

  for (const [recurringId, existing] of existingRecurring.entries()) {
    if (detectedIds.has(recurringId)) continue;
    writer.queueSet(
      userDoc(uid, "recurringPayments", recurringId),
      {
        active: false,
        status: existing.status || "suggested",
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await writer.flush();
  return {
    detectedCount: detectedIds.size,
    recurringTransactionCount: recurringTransactionIds.size,
  };
}

export async function countUserCollection(uid, collectionName) {
  const snapshot = await userCollection(uid, collectionName).get();
  return snapshot.size;
}
