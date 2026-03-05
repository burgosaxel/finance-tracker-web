import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import AppShell from "./components/AppShell";
import Toast from "./components/Toast";
import DashboardPage from "./pages/DashboardPage";
import BudgetPage from "./pages/BudgetPage";
import CreditCardsPage from "./pages/CreditCardsPage";
import BillsIncomePage from "./pages/BillsIncomePage";
import TransactionsPage from "./pages/TransactionsPage";
import SettingsPage from "./pages/SettingsPage";
import { getAllowedEmails, isEmailAllowed } from "./lib/auth";
import { subscribeCollection, subscribeSettings } from "./lib/db";
import { auth, googleProvider } from "./lib/firebase";
import { DEFAULT_SETTINGS } from "./lib/finance";
import { getRouteFromHash } from "./lib/hashRouter";

const EMPTY_DATA = {
  accounts: [],
  creditCards: [],
  bills: [],
  income: [],
  transactions: [],
  budgets: [],
};

export default function App() {
  const [route, setRoute] = useState(getRouteFromHash());
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState({ message: "", type: "info" });
  const [data, setData] = useState(EMPTY_DATA);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

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
    bind("creditCards", "creditCards", "name");
    bind("bills", "bills", "dueDay");
    bind("income", "income", "nextPayDate");
    bind("transactions", "transactions", "date");
    bind("budgets", "budgets", "month");
    unsubs.push(subscribeSettings(user.uid, setSettings, onErr));

    return () => unsubs.forEach((u) => u?.());
  }, [user]);

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

  const page = useMemo(() => {
    if (!user) return null;
    const shared = {
      uid: user.uid,
      settings,
      onToast: showToast,
    };
    if (route === "dashboard") return <DashboardPage data={data} settings={settings} />;
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
    if (route === "bills-income")
      return <BillsIncomePage {...shared} bills={data.bills} income={data.income} accounts={data.accounts} />;
    if (route === "transactions")
      return <TransactionsPage {...shared} transactions={data.transactions} accounts={data.accounts} />;
    if (route === "settings")
      return <SettingsPage {...shared} settings={settings} accounts={data.accounts} />;
    return <DashboardPage data={data} settings={settings} />;
  }, [data, route, settings, user]);

  if (!user) {
    return (
      <div className="container">
        <div className="card signInCard">
          <h1>Finance Tracker</h1>
          <p className="muted">Private budgeting app with Firebase Auth + Firestore.</p>
          <button type="button" className="primary" onClick={handleLogin}>Sign in with Google</button>
          {authError ? <div className="errorText">{authError}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <AppShell route={route} user={user} status={status} onSignOut={handleLogout}>
        {authError ? <div className="errorText">{authError}</div> : null}
        {page}
      </AppShell>
      <Toast message={toast.message} type={toast.type} />
    </div>
  );
}
