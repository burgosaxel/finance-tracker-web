import {
  Timestamp,
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
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  DEFAULT_SETTINGS,
  monthFromMonthId,
  monthKey,
  parseMonthKey,
  safeNumber,
} from "./finance";
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
  if (!uid) return null;
  return collection(db, "users", uid, name);
}

function userDoc(uid, collectionName, id) {
  if (!uid) return null;
  return doc(db, "users", uid, collectionName, id);
}

function withId(snap) {
  return { id: snap.id, ...snap.data() };
}

function emitMutation(phase, error) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ft-mutation", {
      detail: {
        phase,
        message: error?.message || String(error || ""),
      },
    })
  );
}

function requireUid(uid) {
  if (!uid) throw new Error("User not signed in.");
}

export function subscribeCollection(uid, collectionName, onData, onError, orderField = "name") {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  const col = userCollection(uid, collectionName);
  const q = orderField ? query(col, orderBy(orderField)) : col;
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map(withId)),
    (error) => onError?.(error)
  );
}

export function subscribeSettings(uid, onData, onError) {
  if (!uid) {
    onData?.({ ...DEFAULT_SETTINGS });
    return () => {};
  }
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
  requireUid(uid);
  emitMutation("start");
  try {
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
    emitMutation("success");
    return nextId;
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function deleteEntity(uid, collectionName, id) {
  requireUid(uid);
  emitMutation("start");
  try {
    const ref = userDoc(uid, collectionName, id);
    await deleteDoc(ref);
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function saveSettings(uid, settings) {
  requireUid(uid);
  emitMutation("start");
  try {
    const ref = userDoc(uid, "settings", "preferences");
    await setDoc(ref, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function markBillPaid(uid, bill) {
  requireUid(uid);
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
  requireUid(uid);
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
  requireUid(uid);
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
  requireUid(uid);
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

function templateCollection(uid, kind) {
  if (!uid) return null;
  const collectionName = kind === "bills" ? "billTemplates" : "incomeTemplates";
  return collection(db, "users", uid, collectionName);
}

function statementDoc(uid, monthId) {
  if (!uid || !monthId) return null;
  return doc(db, "users", uid, "statements", monthId);
}

function statementCollection(uid, monthId, kind) {
  if (!uid || !monthId) return null;
  return collection(db, "users", uid, "statements", monthId, kind);
}

function daysInMonth(year, month1Based) {
  return new Date(year, month1Based, 0).getDate();
}

function clampDayForMonth(year, month1Based, day) {
  const max = daysInMonth(year, month1Based);
  return Math.min(Math.max(1, Number(day) || 1), max);
}

function toMonthRange(monthId) {
  const parsed = parseMonthKey(monthId);
  if (!parsed) return null;
  const start = new Date(parsed.y, parsed.m - 1, 1);
  const end = new Date(parsed.y, parsed.m, 0, 23, 59, 59, 999);
  return { start, end, year: parsed.y, month: parsed.m };
}

export function subscribeStatementItems(uid, monthId, kind, onData, onError) {
  if (!uid || !monthId) {
    onData?.([]);
    return () => {};
  }
  const field = kind === "bills" ? "dueDate" : "payDate";
  const q = query(statementCollection(uid, monthId, kind), orderBy(field));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map(withId)),
    (error) => onError?.(error)
  );
}

export function subscribeTemplates(uid, kind, onData, onError) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  const q = query(templateCollection(uid, kind), orderBy("createdAt"));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map(withId)),
    (error) => onError?.(error)
  );
}

export async function upsertTemplate(uid, kind, payload, id = payload?.id || crypto.randomUUID()) {
  requireUid(uid);
  emitMutation("start");
  try {
    const collectionName = kind === "bills" ? "billTemplates" : "incomeTemplates";
    const ref = doc(db, "users", uid, collectionName, id);
    await setDoc(
      ref,
      {
        ...payload,
        id,
        updatedAt: serverTimestamp(),
        createdAt: payload?.createdAt || serverTimestamp(),
      },
      { merge: true }
    );
    emitMutation("success");
    return id;
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function deleteTemplate(uid, kind, id) {
  requireUid(uid);
  emitMutation("start");
  try {
    const collectionName = kind === "bills" ? "billTemplates" : "incomeTemplates";
    await deleteDoc(doc(db, "users", uid, collectionName, id));
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function upsertStatementItem(uid, monthId, kind, payload, id = payload?.id || crypto.randomUUID()) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  emitMutation("start");
  try {
    const ref = doc(db, "users", uid, "statements", monthId, kind, id);
    await setDoc(
      ref,
      {
        ...payload,
        id,
        updatedAt: serverTimestamp(),
        createdAt: payload?.createdAt || serverTimestamp(),
      },
      { merge: true }
    );
    emitMutation("success");
    return id;
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function deleteStatementItem(uid, monthId, kind, id) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  emitMutation("start");
  try {
    await deleteDoc(doc(db, "users", uid, "statements", monthId, kind, id));
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function markStatementBillPaid(uid, monthId, billId, isPaid) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  emitMutation("start");
  try {
    const ref = doc(db, "users", uid, "statements", monthId, "bills", billId);
    await updateDoc(ref, {
      status: isPaid ? "paid" : "unpaid",
      paidAt: isPaid ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function markStatementIncomeReceived(uid, monthId, incomeId, isReceived) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  emitMutation("start");
  try {
    const ref = doc(db, "users", uid, "statements", monthId, "incomes", incomeId);
    await updateDoc(ref, {
      status: isReceived ? "received" : "expected",
      receivedAt: isReceived ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

function templateToBillInstance(template, monthId) {
  const range = toMonthRange(monthId);
  const day = clampDayForMonth(range.year, range.month, template.dueDay);
  const dueDate = new Date(range.year, range.month - 1, day);
  const id = template.id ? `tpl-${template.id}` : crypto.randomUUID();
  return {
    id,
    templateId: template.id || null,
    merchant: template.merchant || "Bill",
    name: template.merchant || "Bill",
    dueDate: Timestamp.fromDate(dueDate),
    dueDay: day,
    amount: safeNumber(template.defaultAmount, 0),
    paidFrom: template.defaultPaidFrom || "",
    accountId: template.defaultPaidFrom || "",
    status: "unpaid",
    paidAt: null,
  };
}

function templateToIncomeInstance(template, monthId) {
  const range = toMonthRange(monthId);
  const day = clampDayForMonth(range.year, range.month, template.payDay);
  const payDate = new Date(range.year, range.month - 1, day);
  const id = template.id ? `tpl-${template.id}` : crypto.randomUUID();
  return {
    id,
    templateId: template.id || null,
    source: template.source || "Income",
    name: template.source || "Income",
    payDate: Timestamp.fromDate(payDate),
    payDay: day,
    amount: safeNumber(template.defaultAmount, 0),
    expectedAmount: safeNumber(template.defaultAmount, 0),
    status: "expected",
    receivedAt: null,
  };
}

export async function ensureMonthInitialized(uid, monthId) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  const range = toMonthRange(monthId);
  if (!range) throw new Error(`Invalid monthId: ${monthId}`);
  const ref = statementDoc(uid, monthId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(
    ref,
    {
      monthId,
      monthStart: Timestamp.fromDate(range.start),
      monthEnd: Timestamp.fromDate(range.end),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const billTemplatesSnap = await getDocs(
    query(templateCollection(uid, "bills"), where("isActive", "==", true))
  );
  const incomeTemplatesSnap = await getDocs(
    query(templateCollection(uid, "incomes"), where("isActive", "==", true))
  );

  for (const docSnap of billTemplatesSnap.docs) {
    const template = withId(docSnap);
    const instance = templateToBillInstance(template, monthId);
    await setDoc(doc(db, "users", uid, "statements", monthId, "bills", instance.id), {
      ...instance,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  for (const docSnap of incomeTemplatesSnap.docs) {
    const template = withId(docSnap);
    const instance = templateToIncomeInstance(template, monthId);
    await setDoc(doc(db, "users", uid, "statements", monthId, "incomes", instance.id), {
      ...instance,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export async function syncRecurringItemsForMonth(uid, monthId) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  await ensureMonthInitialized(uid, monthId);
  const existingBills = await getDocs(statementCollection(uid, monthId, "bills"));
  const existingIncomes = await getDocs(statementCollection(uid, monthId, "incomes"));
  const existingBillTemplateIds = new Set(existingBills.docs.map((d) => d.data().templateId).filter(Boolean));
  const existingIncomeTemplateIds = new Set(existingIncomes.docs.map((d) => d.data().templateId).filter(Boolean));

  const billTemplates = await getDocs(query(templateCollection(uid, "bills"), where("isActive", "==", true)));
  const incomeTemplates = await getDocs(query(templateCollection(uid, "incomes"), where("isActive", "==", true)));

  for (const d of billTemplates.docs) {
    const template = withId(d);
    if (existingBillTemplateIds.has(template.id)) continue;
    const instance = templateToBillInstance(template, monthId);
    await setDoc(doc(db, "users", uid, "statements", monthId, "bills", instance.id), {
      ...instance,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  for (const d of incomeTemplates.docs) {
    const template = withId(d);
    if (existingIncomeTemplateIds.has(template.id)) continue;
    const instance = templateToIncomeInstance(template, monthId);
    await setDoc(doc(db, "users", uid, "statements", monthId, "incomes", instance.id), {
      ...instance,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export async function importExistingBillsAsRecurringTemplates(uid, monthId = monthKey()) {
  requireUid(uid);
  const migrationRef = doc(db, "users", uid, "settings", "migrations");
  const migrationSnap = await getDoc(migrationRef);
  if (migrationSnap.exists() && migrationSnap.data()?.statementsV1Migrated) return;

  const legacyBills = await getDocs(userCollection(uid, "bills"));
  const legacyIncome = await getDocs(userCollection(uid, "income"));
  const billTemplateIds = [];

  for (const legacy of legacyBills.docs.map(withId)) {
    const templateId = `legacy-bill-${(legacy.name || "bill").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${legacy.dueDay || 1}`;
    billTemplateIds.push(templateId);
    await upsertTemplate(uid, "bills", {
      merchant: legacy.name || "Bill",
      dueDay: Math.max(1, Math.min(31, Number(legacy.dueDay) || 1)),
      defaultAmount: Math.abs(safeNumber(legacy.amount, 0)),
      defaultPaidFrom: legacy.accountId || "",
      isActive: true,
      source: "legacy",
    }, templateId);
  }

  for (const legacy of legacyIncome.docs.map(withId)) {
    const payDate = legacy.nextPayDate ? new Date(legacy.nextPayDate) : null;
    const payDay = payDate && !Number.isNaN(payDate.getTime()) ? payDate.getDate() : 1;
    const templateId = `legacy-income-${(legacy.name || "income").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${payDay}`;
    await upsertTemplate(uid, "incomes", {
      source: legacy.name || "Income",
      payDay,
      defaultAmount: Math.abs(safeNumber(legacy.expectedAmount, 0)),
      isActive: true,
      sourceType: legacy.paySchedule || "monthly",
      legacySource: "legacy",
    }, templateId);
  }

  await ensureMonthInitialized(uid, monthId);

  // Preserve paid status into current month instances when possible.
  const monthBillsSnap = await getDocs(statementCollection(uid, monthId, "bills"));
  const monthBillsByTemplate = new Map(
    monthBillsSnap.docs.map((d) => {
      const data = d.data();
      return [data.templateId, { id: d.id, ...data }];
    })
  );
  for (const legacy of legacyBills.docs.map(withId)) {
    if (!legacy.lastPaidDate) continue;
    const templateId = `legacy-bill-${(legacy.name || "bill").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${legacy.dueDay || 1}`;
    const instance = monthBillsByTemplate.get(templateId);
    if (!instance) continue;
    const paidDate = new Date(legacy.lastPaidDate);
    if (monthKey(paidDate) !== monthId) continue;
    await setDoc(
      doc(db, "users", uid, "statements", monthId, "bills", instance.id),
      {
        status: "paid",
        paidAt: Timestamp.fromDate(paidDate),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  await setDoc(
    migrationRef,
    {
      statementsV1Migrated: true,
      statementsV1MigratedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
