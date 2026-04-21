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
import { createId, DEFAULT_SETTINGS, monthKey, parseMonthKey, safeNumber } from "./finance";
import { parseLegacySnapshot } from "./legacyImport";
import {
  getDefaultPaychecks,
  getMonthDate,
  getPaycheckSlotFromDueDay,
  isStructuralTemplateName,
  normalizeBillInstance,
  normalizeBillTemplate,
  normalizeIncomeInstance,
  normalizeIncomeTemplate,
} from "./planner";

function userCollection(uid, name) {
  return collection(db, "users", uid, name);
}

function userDoc(uid, collectionName, id) {
  return doc(db, "users", uid, collectionName, id);
}

function withId(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
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

function templateCollection(uid, kind) {
  return userCollection(uid, kind === "bills" ? "billTemplates" : "incomeTemplates");
}

function statementCollection(uid, monthId, kind) {
  return collection(db, "users", uid, "statements", monthId, kind);
}

function toMonthRange(monthId) {
  const parsed = parseMonthKey(monthId);
  if (!parsed) return null;
  const start = new Date(parsed.y, parsed.m - 1, 1);
  const end = new Date(parsed.y, parsed.m, 0, 23, 59, 59, 999);
  return { start, end, year: parsed.y, month: parsed.m };
}

function sanitizeTemplateForWrite(payload = {}) {
  const normalized = normalizeBillTemplate(payload);
  return {
    id: payload.id || normalized.id,
    name: normalized.name,
    merchant: normalized.name,
    category: normalized.category,
    defaultAccountId: normalized.defaultAccountId,
    dueDay: normalized.dueDay,
    paycheckSlot: normalized.paycheckSlot,
    amountType: normalized.amountType,
    defaultAmount: normalized.defaultAmount,
    autopay: normalized.autopay,
    plaidMatchEnabled: normalized.plaidMatchEnabled,
    plaidMatchRules: normalized.plaidMatchRules,
    notes: normalized.notes,
    active: normalized.active,
    hidden: normalized.hidden,
    system: normalized.system,
    isActive: normalized.active,
  };
}

function sanitizeBillInstanceForWrite(payload = {}, monthId) {
  const normalized = normalizeBillInstance(payload, null, monthId);
  return {
    id: payload.id || normalized.id,
    templateId: normalized.templateId,
    monthKey: monthId,
    name: normalized.name,
    merchant: normalized.name,
    category: normalized.category,
    dueDay: normalized.dueDay,
    dueDate: Timestamp.fromDate(normalized.dueDate),
    paycheckSlot: normalized.paycheckSlot,
    plannedAccountId: normalized.plannedAccountId,
    accountId: normalized.plannedAccountId,
    plannedAmount: normalized.plannedAmount,
    suggestedAmount: normalized.suggestedAmount,
    amount: normalized.plannedAmount ?? normalized.suggestedAmount ?? 0,
    actualAmount: normalized.actualAmount,
    amountType: normalized.amountType,
    status: normalized.status,
    paidDate: normalized.paidDate || null,
    paidAt: normalized.paidDate || null,
    linkedTransactionId: normalized.linkedTransactionId,
    manuallyConfirmed: normalized.manuallyConfirmed,
    verificationStatus: normalized.verificationStatus,
    autopay: normalized.autopay,
    plaidMatchEnabled: normalized.plaidMatchEnabled,
    plaidMatchRules: normalized.plaidMatchRules,
    notes: normalized.notes,
    hidden: normalized.hidden,
    system: normalized.system,
    active: !normalized.inactive,
  };
}

function buildBillInstanceFromTemplate(template, monthId, existing = null) {
  const normalizedTemplate = normalizeBillTemplate(template);
  const normalizedExisting = existing
    ? normalizeBillInstance(existing, normalizedTemplate, monthId)
    : null;
  const dueDate = getMonthDate(monthId, normalizedTemplate.dueDay);
  const suggestedAmount = normalizedTemplate.defaultAmount;
  const plannedAmount =
    normalizedTemplate.amountType === "variable"
      ? (suggestedAmount > 0 ? suggestedAmount : null)
      : normalizedTemplate.defaultAmount;
  return sanitizeBillInstanceForWrite(
    {
      id: normalizedExisting?.id || (normalizedTemplate.id ? `tpl-${normalizedTemplate.id}` : createId("bill-statement")),
      templateId: normalizedTemplate.id,
      name: normalizedTemplate.name,
      category: normalizedTemplate.category,
      dueDay: normalizedTemplate.dueDay,
      dueDate,
      paycheckSlot: normalizedTemplate.paycheckSlot || getPaycheckSlotFromDueDay(normalizedTemplate.dueDay),
      plannedAccountId: normalizedTemplate.defaultAccountId,
      plannedAmount,
      suggestedAmount,
      actualAmount: normalizedExisting?.actualAmount ?? null,
      amountType: normalizedTemplate.amountType,
      status: normalizedExisting?.status || "planned",
      paidDate: normalizedExisting?.paidDate || null,
      linkedTransactionId: normalizedExisting?.linkedTransactionId || "",
      manuallyConfirmed: normalizedExisting?.manuallyConfirmed || false,
      verificationStatus: normalizedExisting?.verificationStatus || "unverified",
        autopay: normalizedTemplate.autopay,
        plaidMatchEnabled: normalizedTemplate.plaidMatchEnabled,
        plaidMatchRules: normalizedTemplate.plaidMatchRules,
        notes: normalizedTemplate.notes,
        hidden: normalizedTemplate.hidden,
        system: normalizedTemplate.system,
      },
      monthId
    );
}

function sanitizeIncomeTemplateForWrite(payload = {}) {
  const normalized = normalizeIncomeTemplate(payload);
  return {
    id: payload.id || normalized.id,
    source: normalized.source,
    name: normalized.source,
    depositAccountId: normalized.depositAccountId,
    accountId: normalized.depositAccountId,
    payDay: normalized.payDay,
    paycheckSlot: normalized.paycheckSlot,
    defaultAmount: normalized.defaultAmount,
    notes: normalized.notes,
    matchPattern: normalized.matchPattern,
    active: normalized.active,
    isActive: normalized.active,
  };
}

function sanitizeIncomeInstanceForWrite(payload = {}, monthId) {
  const normalized = normalizeIncomeInstance(payload, null, monthId);
  return {
    id: payload.id || normalized.id,
    templateId: normalized.templateId,
    monthKey: monthId,
    source: normalized.source,
    name: normalized.source,
    depositAccountId: normalized.depositAccountId,
    accountId: normalized.depositAccountId,
    payDay: normalized.payDay,
    payDate: Timestamp.fromDate(normalized.payDate),
    paycheckSlot: normalized.paycheckSlot,
    amount: normalized.amount,
    expectedAmount: normalized.expectedAmount,
    status: normalized.status,
    receivedAt: normalized.receivedAt || null,
    linkedTransactionId: normalized.linkedTransactionId,
    notes: normalized.notes,
    active: normalized.active,
  };
}

function buildIncomeInstanceFromTemplate(template, monthId, existing = null) {
  const normalizedTemplate = normalizeIncomeTemplate(template);
  const normalizedExisting = existing
    ? normalizeIncomeInstance(existing, normalizedTemplate, monthId)
    : null;
  return sanitizeIncomeInstanceForWrite(
    {
      id: normalizedExisting?.id || (normalizedTemplate.id ? `tpl-${normalizedTemplate.id}` : createId("income-statement")),
      templateId: normalizedTemplate.id,
      source: normalizedTemplate.source,
      depositAccountId: normalizedTemplate.depositAccountId,
      payDay: normalizedTemplate.payDay,
      payDate: getMonthDate(monthId, normalizedTemplate.payDay),
      paycheckSlot: normalizedTemplate.paycheckSlot || getPaycheckSlotFromDueDay(normalizedTemplate.payDay),
      amount: normalizedTemplate.defaultAmount,
      expectedAmount: normalizedTemplate.defaultAmount,
      status: normalizedExisting?.status || "expected",
      receivedAt: normalizedExisting?.receivedAt || null,
      linkedTransactionId: normalizedExisting?.linkedTransactionId || "",
      notes: normalizedTemplate.notes,
      active: normalizedTemplate.active,
    },
    monthId
  );
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
  return onSnapshot(
    userDoc(uid, "settings", "preferences"),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      const merged = {
        ...DEFAULT_SETTINGS,
        ...data,
        paychecks: getDefaultPaychecks(data),
      };
      onData(merged);
    },
    (error) => onError?.(error)
  );
}

export function subscribeUserDoc(uid, collectionName, id, onData, onError) {
  if (!uid) {
    onData?.(null);
    return () => {};
  }
  return onSnapshot(
    userDoc(uid, collectionName, id),
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
    (error) => onError?.(error)
  );
}

export function subscribeTemplates(uid, kind, onData, onError) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }
  return onSnapshot(
    query(templateCollection(uid, kind), orderBy("createdAt")),
    (snapshot) => onData(snapshot.docs.map(withId)),
    (error) => onError?.(error)
  );
}

export function subscribeStatementItems(uid, monthId, kind, onData, onError) {
  if (!uid || !monthId) {
    onData?.([]);
    return () => {};
  }
  const orderField = kind === "bills" ? "dueDate" : "payDate";
  return onSnapshot(
    query(statementCollection(uid, monthId, kind), orderBy(orderField)),
    (snapshot) => onData(snapshot.docs.map(withId)),
    (error) => onError?.(error)
  );
}

export async function upsertEntity(uid, collectionName, payload, id = payload?.id) {
  requireUid(uid);
  emitMutation("start");
  try {
    const nextId = id || createId(collectionName);
    await setDoc(
      userDoc(uid, collectionName, nextId),
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
    await deleteDoc(userDoc(uid, collectionName, id));
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
    const next = {
      ...settings,
      paychecks: getDefaultPaychecks(settings),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userDoc(uid, "settings", "preferences"), next, { merge: true });
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function upsertTemplate(uid, kind, payload, id = payload?.id || createId(kind === "bills" ? "bill-template" : "income-template")) {
  requireUid(uid);
  emitMutation("start");
  try {
    const collectionName = kind === "bills" ? "billTemplates" : "incomeTemplates";
    const sanitized =
      kind === "bills"
        ? sanitizeTemplateForWrite({ ...payload, id })
        : sanitizeIncomeTemplateForWrite({ ...payload, id });
    await setDoc(
      doc(db, "users", uid, collectionName, id),
      {
        ...sanitized,
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
    await deleteDoc(doc(db, "users", uid, kind === "bills" ? "billTemplates" : "incomeTemplates", id));
    if (kind === "bills" || kind === "incomes") {
      const statementMonths = await getDocs(collection(db, "users", uid, "statements"));
      for (const monthDoc of statementMonths.docs) {
        const collectionName = kind === "bills" ? "bills" : "incomes";
        const staleStatementRef = doc(db, "users", uid, "statements", monthDoc.id, collectionName, `tpl-${id}`);
        await deleteDoc(staleStatementRef);
      }
    }
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function bulkUpdateBillTemplates(uid, templates = [], patchOrUpdater) {
  requireUid(uid);
  emitMutation("start");
  try {
    for (const template of templates) {
      const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(template) : patchOrUpdater;
      if (!template?.id || !patch) continue;
      await setDoc(
        doc(db, "users", uid, "billTemplates", template.id),
        {
          ...sanitizeTemplateForWrite({ ...template, ...patch, id: template.id }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function bulkUpdateStatementBills(uid, monthId, bills = [], patchOrUpdater) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  emitMutation("start");
  try {
    for (const bill of bills) {
      const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(bill) : patchOrUpdater;
      if (!bill?.id || !patch) continue;
      await setDoc(
        doc(db, "users", uid, "statements", monthId, "bills", bill.id),
        {
          ...sanitizeBillInstanceForWrite({ ...bill, ...patch, id: bill.id }, monthId),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function upsertStatementItem(uid, monthId, kind, payload, id = payload?.id || createId(`${kind}-statement`)) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  emitMutation("start");
  try {
    const sanitized =
      kind === "bills"
        ? sanitizeBillInstanceForWrite({ ...payload, id }, monthId)
        : sanitizeIncomeInstanceForWrite({ ...payload, id }, monthId);
    await setDoc(
      doc(db, "users", uid, "statements", monthId, kind, id),
      {
        ...sanitized,
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
  emitMutation("start");
  try {
    await deleteDoc(doc(db, "users", uid, "statements", monthId, kind, id));
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function markStatementBillPaid(uid, monthId, billId, isPaid, overrides = {}) {
  requireUid(uid);
  emitMutation("start");
  try {
    const payload = {
      status: isPaid ? "paid" : "planned",
      paidDate: isPaid ? (overrides.paidDate || new Date().toISOString().slice(0, 10)) : null,
      paidAt: isPaid ? (overrides.paidDate || new Date().toISOString().slice(0, 10)) : null,
      actualAmount:
        overrides.actualAmount === undefined || overrides.actualAmount === null || overrides.actualAmount === ""
          ? null
          : Math.abs(safeNumber(overrides.actualAmount, 0)),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, "users", uid, "statements", monthId, "bills", billId), payload);
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function saveBillInstance(uid, monthId, payload, id = payload?.id) {
  return upsertStatementItem(uid, monthId, "bills", payload, id);
}

export async function saveBillVerification(uid, monthId, billId, payload) {
  requireUid(uid);
  emitMutation("start");
  try {
    const next = {
      status: payload.status || "paid",
      actualAmount:
        payload.actualAmount === undefined || payload.actualAmount === null || payload.actualAmount === ""
          ? null
          : Math.abs(safeNumber(payload.actualAmount, 0)),
      paidDate: payload.paidDate || new Date().toISOString().slice(0, 10),
      paidAt: payload.paidDate || new Date().toISOString().slice(0, 10),
      linkedTransactionId: payload.linkedTransactionId || "",
      manuallyConfirmed: Boolean(payload.manuallyConfirmed),
      verificationStatus: payload.verificationStatus || (payload.linkedTransactionId ? "matched" : "manual"),
      notes: payload.notes ?? "",
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, "users", uid, "statements", monthId, "bills", billId), next);
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function linkTransactionToBillInstance(uid, monthId, billId, transactionId) {
  requireUid(uid);
  emitMutation("start");
  try {
    await updateDoc(doc(db, "users", uid, "statements", monthId, "bills", billId), {
      linkedTransactionId: transactionId || "",
      verificationStatus: transactionId ? "matched" : "unverified",
      manuallyConfirmed: false,
      updatedAt: serverTimestamp(),
    });
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function saveMonthlySetupState(uid, monthId, payload = {}) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  emitMutation("start");
  try {
    await setDoc(
      doc(db, "users", uid, "statements", monthId),
      {
        monthlySetupCompletedAt: payload.completed ? serverTimestamp() : null,
        monthlySetupStatus: payload.completed ? "completed" : "incomplete",
        monthlySetupUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function exportAllUserData(uid) {
  requireUid(uid);
  const collections = [
    "accounts",
    "linkedAccounts",
    "plaidItems",
    "recurringPayments",
    "creditCards",
    "bills",
    "income",
    "transactions",
    "budgets",
    "billTemplates",
    "incomeTemplates",
  ];
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 2,
    collections: {},
    settings: {},
  };
  for (const collectionName of collections) {
    const snapshots = await getDocs(userCollection(uid, collectionName));
    payload.collections[collectionName] = snapshots.docs.map(withId);
  }
  const statementMonths = await getDocs(collection(db, "users", uid, "statements"));
  payload.statements = {};
  for (const monthDoc of statementMonths.docs) {
    const monthId = monthDoc.id;
    const bills = await getDocs(statementCollection(uid, monthId, "bills"));
    const incomes = await getDocs(statementCollection(uid, monthId, "incomes"));
    payload.statements[monthId] = {
      meta: monthDoc.data(),
      bills: bills.docs.map(withId),
      incomes: incomes.docs.map(withId),
    };
  }
  const settingsSnap = await getDoc(userDoc(uid, "settings", "preferences"));
  payload.settings = settingsSnap.exists() ? settingsSnap.data() : { ...DEFAULT_SETTINGS };
  return payload;
}

export async function importAllUserData(uid, payload) {
  requireUid(uid);
  const collections = payload?.collections || {};
  for (const [collectionName, rows] of Object.entries(collections)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id) continue;
      await upsertEntity(uid, collectionName, row, row.id);
    }
  }
  if (payload?.statements) {
    for (const [monthId, statement] of Object.entries(payload.statements)) {
      const bills = Array.isArray(statement?.bills) ? statement.bills : [];
      const incomes = Array.isArray(statement?.incomes) ? statement.incomes : [];
      for (const bill of bills) {
        await upsertStatementItem(uid, monthId, "bills", bill, bill.id);
      }
      for (const income of incomes) {
        await upsertStatementItem(uid, monthId, "incomes", income, income.id);
      }
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
  for (const legacyBill of bills) {
    await upsertEntity(uid, "bills", legacyBill, legacyBill.id);
  }
  for (const item of income) {
    await upsertEntity(uid, "income", item, item.id);
  }
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

export async function ensureMonthInitialized(uid, monthId) {
  requireUid(uid);
  if (!monthId) throw new Error("Month is required.");
  const range = toMonthRange(monthId);
  if (!range) throw new Error(`Invalid monthId: ${monthId}`);

  await setDoc(
    doc(db, "users", uid, "statements", monthId),
    {
      monthId,
      monthStart: Timestamp.fromDate(range.start),
      monthEnd: Timestamp.fromDate(range.end),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  const existingBillSnapshots = await getDocs(statementCollection(uid, monthId, "bills"));
  const existingByTemplate = new Map(
    existingBillSnapshots.docs
      .map(withId)
      .filter((row) => row.templateId)
      .map((row) => [row.templateId, row])
  );

  const activeTemplates = await getDocs(query(templateCollection(uid, "bills"), where("isActive", "==", true)));
  const activeTemplateIds = new Set();
  for (const templateSnap of activeTemplates.docs) {
    const template = withId(templateSnap);
    activeTemplateIds.add(template.id);
    const instance = buildBillInstanceFromTemplate(template, monthId, existingByTemplate.get(template.id));
    await setDoc(
      doc(db, "users", uid, "statements", monthId, "bills", instance.id),
      {
        ...instance,
        updatedAt: serverTimestamp(),
        createdAt: existingByTemplate.get(template.id)?.createdAt || serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const existingBill of existingBillSnapshots.docs.map(withId)) {
    if (!existingBill.templateId) continue;
    if (activeTemplateIds.has(existingBill.templateId)) continue;
    await deleteDoc(doc(db, "users", uid, "statements", monthId, "bills", existingBill.id));
  }

  const existingIncomeSnapshots = await getDocs(statementCollection(uid, monthId, "incomes"));
  const existingIncomeByTemplate = new Map(
    existingIncomeSnapshots.docs
      .map(withId)
      .filter((row) => row.templateId)
      .map((row) => [row.templateId, row])
  );

  const activeIncomeTemplates = await getDocs(query(templateCollection(uid, "incomes"), where("isActive", "==", true)));
  const activeIncomeTemplateIds = new Set();
  for (const templateSnap of activeIncomeTemplates.docs) {
    const template = withId(templateSnap);
    activeIncomeTemplateIds.add(template.id);
    const instance = buildIncomeInstanceFromTemplate(template, monthId, existingIncomeByTemplate.get(template.id));
    await setDoc(
      doc(db, "users", uid, "statements", monthId, "incomes", instance.id),
      {
        ...instance,
        updatedAt: serverTimestamp(),
        createdAt: existingIncomeByTemplate.get(template.id)?.createdAt || serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const existingIncome of existingIncomeSnapshots.docs.map(withId)) {
    if (!existingIncome.templateId) continue;
    if (activeIncomeTemplateIds.has(existingIncome.templateId)) continue;
    await deleteDoc(doc(db, "users", uid, "statements", monthId, "incomes", existingIncome.id));
  }
}

export async function syncRecurringItemsForMonth(uid, monthId) {
  await ensureMonthInitialized(uid, monthId);
}

export async function ensureMonthInitializedAndSynced(uid, monthId) {
  await syncRecurringItemsForMonth(uid, monthId);
}

export async function importExistingBillsAsRecurringTemplates(uid, monthId = monthKey()) {
  requireUid(uid);
  const migrationRef = userDoc(uid, "settings", "migrations");
  const migrationSnap = await getDoc(migrationRef);
  if (migrationSnap.exists() && migrationSnap.data()?.plannerRebuildMigrated) return;

  const legacyBills = await getDocs(userCollection(uid, "bills"));
  for (const legacyBill of legacyBills.docs.map(withId)) {
    const structural = isStructuralTemplateName(legacyBill.name || "Bill");
    const normalizedId = `legacy-bill-${(legacyBill.name || "bill").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${legacyBill.dueDay || 1}`;
    await upsertTemplate(
      uid,
      "bills",
      {
        id: normalizedId,
        name: legacyBill.name || "Bill",
        category: legacyBill.category || "",
        defaultAccountId: legacyBill.accountId || "",
        dueDay: Math.max(1, Math.min(31, Number(legacyBill.dueDay) || 1)),
        paycheckSlot: getPaycheckSlotFromDueDay(legacyBill.dueDay),
        amountType: "fixed",
        defaultAmount: Math.abs(safeNumber(legacyBill.amount, 0)),
        autopay: Boolean(legacyBill.autopay),
        plaidMatchEnabled: true,
        notes: legacyBill.notes || "",
        active: !structural,
        hidden: structural,
        system: structural,
      },
      normalizedId
    );
  }

  const settingsSnap = await getDoc(userDoc(uid, "settings", "preferences"));
  const currentSettings = settingsSnap.exists() ? settingsSnap.data() : {};
  const paychecks = getDefaultPaychecks(currentSettings);
  if (!currentSettings?.paychecks) {
    await saveSettings(uid, {
      ...currentSettings,
      paychecks,
    });
  }

  await ensureMonthInitialized(uid, monthId);
  await setDoc(
    migrationRef,
    {
      plannerRebuildMigrated: true,
      plannerRebuildMigratedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markBillPaid(uid, bill) {
  requireUid(uid);
  return markStatementBillPaid(uid, bill.monthKey || monthKey(), bill.id, true, {
    actualAmount: bill.actualAmount ?? bill.plannedAmount,
    paidDate: bill.paidDate || new Date().toISOString().slice(0, 10),
  });
}

export async function markStatementIncomeReceived(uid, monthId, incomeId, isReceived) {
  requireUid(uid);
  emitMutation("start");
  try {
    const next = {
      status: isReceived ? "received" : "expected",
      receivedAt: isReceived ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    };
    if (!isReceived) {
      next.linkedTransactionId = "";
    }
    await updateDoc(doc(db, "users", uid, "statements", monthId, "incomes", incomeId), next);
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function saveIncomeVerification(uid, monthId, incomeId, payload) {
  requireUid(uid);
  emitMutation("start");
  try {
    const next = {
      status: payload.status || "received",
      amount:
        payload.amount === undefined || payload.amount === null || payload.amount === ""
          ? null
          : Math.abs(safeNumber(payload.amount, 0)),
      expectedAmount:
        payload.amount === undefined || payload.amount === null || payload.amount === ""
          ? null
          : Math.abs(safeNumber(payload.amount, 0)),
      receivedAt: payload.receivedAt || serverTimestamp(),
      linkedTransactionId: payload.linkedTransactionId || "",
      verificationStatus: payload.verificationStatus || (payload.linkedTransactionId ? "matched" : "manual"),
      manuallyConfirmed: Boolean(payload.manuallyConfirmed),
      notes: payload.notes ?? "",
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, "users", uid, "statements", monthId, "incomes", incomeId), next);
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function linkTransactionToIncomeInstance(uid, monthId, incomeId, transactionId) {
  requireUid(uid);
  emitMutation("start");
  try {
    await updateDoc(doc(db, "users", uid, "statements", monthId, "incomes", incomeId), {
      linkedTransactionId: transactionId || "",
      verificationStatus: transactionId ? "matched" : "unverified",
      manuallyConfirmed: false,
      updatedAt: serverTimestamp(),
    });
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}

export async function saveIncomeTemplateLearning(uid, incomeTemplateId, transaction) {
  requireUid(uid);
  if (!incomeTemplateId || !transaction) return;
  const learnedPattern = String(transaction.merchantName || transaction.payee || "").trim();
  if (!learnedPattern) return;
  emitMutation("start");
  try {
    await setDoc(
      doc(db, "users", uid, "incomeTemplates", incomeTemplateId),
      {
        matchPattern: learnedPattern,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    emitMutation("success");
  } catch (error) {
    emitMutation("error", error);
    throw error;
  }
}
