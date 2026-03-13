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
  const candidates = new Map();

  for (const doc of txSnapshot.docs) {
    const tx = doc.data();
    if (tx.removed || tx.pending || Number(tx.amount) >= 0) continue;
    const merchantKey = normalizeMerchantKey(tx.merchantName || tx.name);
    if (!merchantKey) continue;
    const existing = candidates.get(merchantKey) || [];
    existing.push({ id: doc.id, ...tx });
    candidates.set(merchantKey, existing);
  }

  const batch = db().batch();
  const now = FieldValue.serverTimestamp();

  for (const [merchantKey, entries] of candidates.entries()) {
    const ordered = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (ordered.length < 2) continue;

    const diffs = [];
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = new Date(ordered[i - 1].date);
      const current = new Date(ordered[i].date);
      diffs.push(Math.round((current - previous) / (1000 * 60 * 60 * 24)));
    }

    const avgAmount =
      ordered.reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0) / ordered.length;
    const averageDiff = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
    const cadenceGuess = guessCadence(averageDiff);
    const lastDate = new Date(ordered[ordered.length - 1].date);
    const nextExpectedDate = Number.isFinite(averageDiff)
      ? new Date(lastDate.getTime() + averageDiff * 24 * 60 * 60 * 1000)
      : null;

    const ref = userDoc(uid, "recurringPayments", merchantKey);
    batch.set(
      ref,
      {
        recurringId: merchantKey,
        sourceTransactionIds: ordered.slice(-5).map((entry) => entry.transactionId || entry.id),
        merchantName: ordered[ordered.length - 1].merchantName || ordered[ordered.length - 1].name || merchantKey,
        normalizedMerchant: merchantKey,
        averageAmount: Number(avgAmount.toFixed(2)),
        cadenceGuess,
        nextExpectedDate: nextExpectedDate ? Timestamp.fromDate(nextExpectedDate) : null,
        confidence: Math.min(1, ordered.length / 4),
        category:
          ordered[ordered.length - 1].userCategoryOverride ||
          ordered[ordered.length - 1].categoryDetailed ||
          ordered[ordered.length - 1].categoryPrimary ||
          "Uncategorized",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

export async function countUserCollection(uid, collectionName) {
  const snapshot = await userCollection(uid, collectionName).get();
  return snapshot.size;
}
