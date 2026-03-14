import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import AppShell from "./components/AppShell";
import Toast from "./components/Toast";
import brandLogo from "../BudgetCommand Logo.png";
import DashboardPage from "./pages/DashboardPage";
import BudgetPage from "./pages/BudgetPage";
import CreditCardsPage from "./pages/CreditCardsPage";
import LoansPage from "./pages/LoansPage";
import BillsIncomePage from "./pages/BillsIncomePage";
import TransactionsPage from "./pages/TransactionsPage";
import SettingsPage from "./pages/SettingsPage";
import { getAllowedEmails, isEmailAllowed } from "./lib/auth";
import {
  ensureMonthInitializedAndSynced,
  importExistingBillsAsRecurringTemplates,
  subscribeCollection,
  subscribeSettings,
  subscribeStatementItems,
  subscribeTemplates,
  subscribeUserDoc,
} from "./lib/db";
import { auth, googleProvider } from "./lib/firebase";
import { DEFAULT_SETTINGS, monthKey } from "./lib/finance";
import { getRouteFromHash } from "./lib/hashRouter";

const EMPTY_DATA = {
  accounts: [],
  linkedAccounts: [],
  plaidItems: [],
  matchingRules: [],
  recurringPayments: [],
  creditCards: [],
  loans: [],
  bills: [],
  income: [],
  transactions: [],
  budgets: [],
  statementBills: [],
  statementIncomes: [],
  currentStatementBills: [],
  currentStatementIncomes: [],
  billTemplates: [],
  incomeTemplates: [],
  plaidSyncState: null,
};

export default function App() {
  const [route, setRoute] = useState(getRouteFromHash());
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingWrites, setPendingWrites] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [toast, setToast] = useState({ message: "", type: "info" });
  const [data, setData] = useState(EMPTY_DATA);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedMonth, setSelectedMonth] = useState(monthKey());

  function showToast(message, type = "info") {
    setToast({ message, type });
    setTimeout(() => setToast({ message: "", type: "info" }), 2200);
  }

  useEffect(() => {
    const onHash = () => setRoute(getRouteFromHash());
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      root.setAttribute("data-theme", media.matches ? "dark" : "light");
    };

    applyTheme();
    const onThemeChange = () => applyTheme();
    if (media.addEventListener) {
      media.addEventListener("change", onThemeChange);
      return () => media.removeEventListener("change", onThemeChange);
    }
    media.addListener(onThemeChange);
    return () => media.removeListener(onThemeChange);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthError("");
      if (!u) {
        setUser(null);
        setData(EMPTY_DATA);
        return;
      }
      if (!isEmailAllowed(u.email)) {
        setAuthError(
          `This account (${u.email}) is not allowed. Allowed: ${
            getAllowedEmails().join(", ") || "(none set)"
          }`
        );
        signOut(auth);
        return;
      }
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubs = [];
    const onErr = (error) => setAuthError(error?.message || String(error));
    const bind = (collectionName, stateKey, orderField = "name") => {
      const unsub = subscribeCollection(
        user.uid,
        collectionName,
        (rows) => setData((prev) => ({ ...prev, [stateKey]: rows })),
        onErr,
        orderField
      );
      unsubs.push(unsub);
    };

    bind("accounts", "accounts", "name");
    bind("linkedAccounts", "linkedAccounts", "name");
    bind("plaidItems", "plaidItems", "institutionName");
    bind("matchingRules", "matchingRules", "createdAt");
    bind("recurringPayments", "recurringPayments", "merchantName");
    bind("creditCards", "creditCards", "name");
    bind("loans", "loans", "lender");
    bind("bills", "bills", "dueDay");
    bind("income", "income", "nextPayDate");
    bind("transactions", "transactions", "date");
    bind("budgets", "budgets", "month");
    unsubs.push(subscribeSettings(user.uid, setSettings, onErr));
    unsubs.push(
      subscribeUserDoc(
        user.uid,
        "syncState",
        "plaid",
        (doc) => setData((prev) => ({ ...prev, plaidSyncState: doc })),
        onErr
      )
    );
    unsubs.push(
      subscribeTemplates(
        user.uid,
        "bills",
        (rows) => setData((prev) => ({ ...prev, billTemplates: rows })),
        onErr
      )
    );
    unsubs.push(
      subscribeTemplates(
        user.uid,
        "incomes",
        (rows) => setData((prev) => ({ ...prev, incomeTemplates: rows })),
        onErr
      )
    );

    return () => unsubs.forEach((u) => u?.());
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const currentMonth = monthKey();
        await importExistingBillsAsRecurringTemplates(user.uid, currentMonth);
        await ensureMonthInitializedAndSynced(user.uid, currentMonth);
        if (selectedMonth !== currentMonth) {
          await ensureMonthInitializedAndSynced(user.uid, selectedMonth);
        }
        if (cancelled) return;
      } catch (error) {
        if (cancelled) return;
        setAuthError(error?.message || String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, user]);

  useEffect(() => {
    if (!user) return;
    const currentMonth = monthKey();
    const unsubs = [];
    const onErr = (error) => setAuthError(error?.message || String(error));
    unsubs.push(
      subscribeStatementItems(
        user.uid,
        currentMonth,
        "bills",
        (rows) => setData((prev) => ({ ...prev, currentStatementBills: rows })),
        onErr
      )
    );
    unsubs.push(
      subscribeStatementItems(
        user.uid,
        currentMonth,
        "incomes",
        (rows) => setData((prev) => ({ ...prev, currentStatementIncomes: rows })),
        onErr
      )
    );
    return () => unsubs.forEach((u) => u?.());
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [];
    const onErr = (error) => setAuthError(error?.message || String(error));
    unsubs.push(
      subscribeStatementItems(
        user.uid,
        selectedMonth,
        "bills",
        (rows) => setData((prev) => ({ ...prev, statementBills: rows })),
        onErr
      )
    );
    unsubs.push(
      subscribeStatementItems(
        user.uid,
        selectedMonth,
        "incomes",
        (rows) => setData((prev) => ({ ...prev, statementIncomes: rows })),
        onErr
      )
    );
    return () => unsubs.forEach((u) => u?.());
  }, [selectedMonth, user]);

  useEffect(() => {
    const onMutation = (event) => {
      const { phase, message } = event.detail || {};
      if (phase === "start") {
        setPendingWrites((n) => n + 1);
      } else if (phase === "success") {
        setPendingWrites((n) => Math.max(0, n - 1));
        setLastSavedAt(new Date());
      } else if (phase === "error") {
        setPendingWrites((n) => Math.max(0, n - 1));
        setAuthError(message || "Failed to save data.");
      }
    };
    window.addEventListener("ft-mutation", onMutation);
    return () => window.removeEventListener("ft-mutation", onMutation);
  }, []);

  async function handleLogin() {
    setAuthError("");
    setStatus("Signing in...");
    try {
      await signInWithPopup(auth, googleProvider);
      setStatus("");
    } catch (e) {
      setStatus("");
      setAuthError(e?.message || String(e));
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setRoute("dashboard");
  }

  const topStatus =
    pendingWrites > 0
      ? "Saving..."
      : lastSavedAt
        ? `Last saved ${lastSavedAt.toLocaleTimeString()}`
        : status;

  const page = useMemo(() => {
    if (!user) return null;
    const shared = {
      uid: user.uid,
      settings,
      onToast: showToast,
      onError: (message) => setAuthError(message),
      selectedMonth,
      setSelectedMonth,
    };
    if (route === "dashboard")
      return (
        <DashboardPage
          data={data}
          settings={settings}
          bills={data.currentStatementBills}
          incomes={data.currentStatementIncomes}
          transactions={data.transactions}
          recurringPayments={data.recurringPayments}
          loadError={authError}
        />
      );
    if (route === "budget")
      return (
        <BudgetPage
          {...shared}
          budgets={data.budgets}
          bills={data.bills}
          income={data.income}
          transactions={data.transactions}
        />
      );
    if (route === "credit-cards")
      return <CreditCardsPage {...shared} cards={data.creditCards} />;
    if (route === "loans")
      return <LoansPage {...shared} loans={data.loans} />;
    if (route === "bills-income")
      return (
        <BillsIncomePage
          {...shared}
          bills={data.statementBills}
          income={data.statementIncomes}
          billTemplates={data.billTemplates}
          incomeTemplates={data.incomeTemplates}
          accounts={data.accounts}
        />
      );
    if (route === "transactions")
      return (
        <TransactionsPage
          {...shared}
          transactions={data.transactions}
          accounts={[...(data.accounts || []), ...(data.linkedAccounts || [])]}
          bills={data.statementBills}
          income={data.statementIncomes}
          loans={data.loans}
          creditCards={data.creditCards}
          matchingRules={data.matchingRules}
        />
      );
    if (route === "settings")
      return (
        <SettingsPage
          {...shared}
          settings={settings}
          accounts={data.accounts}
          linkedAccounts={data.linkedAccounts}
          plaidItems={data.plaidItems}
          plaidSyncState={data.plaidSyncState}
          recurringPayments={data.recurringPayments}
          bills={data.statementBills}
          income={data.statementIncomes}
          loans={data.loans}
          creditCards={data.creditCards}
        />
      );
    return <DashboardPage data={data} settings={settings} />;
  }, [data, route, selectedMonth, settings, user]);

  if (!user) {
    return (
      <div className="container">
        <div className="card signInCard">
          <img className="signInLogo" src={brandLogo} alt="BudgetCommand" />
          <h1>BudgetCommand</h1>
          <p className="muted">Private budgeting app with Firebase Auth + Firestore.</p>
          <button type="button" className="primary" onClick={handleLogin}>Sign in with Google</button>
          {authError ? <div className="errorText">{authError}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <AppShell route={route} user={user} status={topStatus} onSignOut={handleLogout}>
        {authError ? <div className="errorText">{authError}</div> : null}
        {page}
      </AppShell>
      <Toast message={toast.message} type={toast.type} />
    </div>
  );
}
