import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_SETTINGS, monthKey, safeNumber } from "./finance";
import { parseLegacySnapshot } from "./legacyImport";

/**
 * Firestore model under /users/{uid}
 *
 * /accounts/{accountId}
 * { id, name, type, balance, createdAt, updatedAt }
 *
 * /creditCards/{cardId}
 * { id, name, issuer, limit, balance, apr, minimumPayment, dueDay, createdAt, updatedAt }
 *
 * /bills/{billId}
 * { id, name, amount, dueDay, category, autopay, accountId, notes, lastPaidDate, createdAt, updatedAt }
 *
 * /income/{incomeId}
 * { id, name, expectedAmount, paySchedule, nextPayDate, depositAccountId, createdAt, updatedAt }
 *
 * /transactions/{transactionId}
 * { id, date, payee, category, amount, accountId, notes, billId, createdAt, updatedAt }
 *
 * /budgets/{monthId}
 * { id, month, categories: { [categoryName]: assignedNumber }, createdAt, updatedAt }
 *
 * /settings/preferences
 * { utilizationThreshold, currency, monthStartDay, recommendedPaymentRate, updatedAt }
 */

function userCollection(uid, name) {
  return collection(db, "users", uid, name);
}

function userDoc(uid, collectionName, id) {
  return doc(db, "users", uid, collectionName, id);
}

function withId(snap) {
  return { id: snap.id, ...snap.data() };
}

export function subscribeCollection(uid, collectionName, onData, onError, orderField = "name") {
  const col = userCollection(uid, collectionName);
  const q = orderField ? query(col, orderBy(orderField)) : col;
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map(withId)),
    (error) => onError?.(error)
  );
}

export function subscribeSettings(uid, onData, onError) {
  const ref = userDoc(uid, "settings", "preferences");
  return onSnapshot(
    ref,
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      onData({ ...DEFAULT_SETTINGS, ...data });
    },
    (error) => onError?.(error)
  );
}

export async function upsertEntity(uid, collectionName, payload, id = payload?.id) {
  const nextId = id || crypto.randomUUID();
  const ref = userDoc(uid, collectionName, nextId);
  await setDoc(
    ref,
    {
      ...payload,
      id: nextId,
      updatedAt: serverTimestamp(),
      createdAt: payload?.createdAt || serverTimestamp(),
    },
    { merge: true }
  );
  return nextId;
}

export async function deleteEntity(uid, collectionName, id) {
  const ref = userDoc(uid, collectionName, id);
  await deleteDoc(ref);
}

export async function saveSettings(uid, settings) {
  const ref = userDoc(uid, "settings", "preferences");
  await setDoc(ref, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

export async function markBillPaid(uid, bill) {
  const today = new Date().toISOString().slice(0, 10);
  const txId = `bill-${bill.id}-${today}`;

  await upsertEntity(
    uid,
    "transactions",
    {
      date: today,
      payee: bill.name,
      category: bill.category || "Bills",
      amount: -Math.abs(safeNumber(bill.amount, 0)),
      accountId: bill.accountId || "",
      notes: `Bill payment: ${bill.name}`,
      billId: bill.id,
    },
    txId
  );

  await upsertEntity(
    uid,
    "bills",
    {
      ...bill,
      lastPaidDate: today,
    },
    bill.id
  );
}

export async function exportAllUserData(uid) {
  const collections = ["accounts", "creditCards", "bills", "income", "transactions", "budgets"];
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    collections: {},
    settings: {},
  };

  for (const c of collections) {
    const snaps = await getDocs(userCollection(uid, c));
    payload.collections[c] = snaps.docs.map(withId);
  }
  const settingsSnap = await getDoc(userDoc(uid, "settings", "preferences"));
  payload.settings = settingsSnap.exists() ? settingsSnap.data() : { ...DEFAULT_SETTINGS };
  return payload;
}

export async function importAllUserData(uid, payload) {
  const cols = payload?.collections || {};
  const allowed = ["accounts", "creditCards", "bills", "income", "transactions", "budgets"];
  for (const collectionName of allowed) {
    const entries = Array.isArray(cols[collectionName]) ? cols[collectionName] : [];
    for (const entry of entries) {
      if (!entry?.id) continue;
      await upsertEntity(uid, collectionName, entry, entry.id);
    }
  }
  if (payload?.settings) {
    await saveSettings(uid, payload.settings);
  }
}

export async function importLegacySnapshot(uid) {
  const { creditCards, bills, income } = parseLegacySnapshot();
  for (const card of creditCards) {
    await upsertEntity(uid, "creditCards", card, card.id);
  }
  for (const bill of bills) {
    await upsertEntity(uid, "bills", bill, bill.id);
  }
  for (const inc of income) {
    await upsertEntity(uid, "income", inc, inc.id);
  }

  // Ensure at least one default account exists for references.
  await upsertEntity(
    uid,
    "accounts",
    {
      name: "Checking",
      type: "checking",
      balance: 0,
      source: "system-default",
    },
    "default-checking"
  );
}

export function getBudgetDocIdForMonth(month = monthKey()) {
  return month;
}
