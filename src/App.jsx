import React, { useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import AppShell from "./components/AppShell";
import OnboardingSetupModal from "./components/OnboardingSetupModal";
import Toast from "./components/Toast";
import PlannerPage from "./pages/PlannerPage";
import BillsPage from "./pages/BillsPage";
import IncomePage from "./pages/IncomePage";
import AccountsPage from "./pages/AccountsPage";
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
  transactions: [],
  billTemplates: [],
  incomeTemplates: [],
  statementBills: [],
  statementIncomes: [],
  statementMeta: null,
  plaidSyncState: null,
};

function getFriendlyAuthError(error, mode = "signin") {
  const code = error?.code || "";
  if (code === "auth/email-already-in-use") {
    return "That email already has an account. Use Sign In instead.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return mode === "signup"
      ? "We couldn't create that account with the provided credentials."
      : "That email or password didn't match an existing account.";
  }
  if (code === "auth/invalid-email") {
    return "Enter a valid email address.";
  }
  if (code === "auth/weak-password") {
    return "Choose a stronger password. Firebase requires at least 6 characters.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many sign-in attempts. Please wait a bit and try again.";
  }
  return error?.message || String(error);
}

export default function App() {
  const [route, setRoute] = useState(getRouteFromHash());
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [emailAuthMode, setEmailAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authHint, setAuthHint] = useState("");
  const [status, setStatus] = useState("");
  const [pendingWrites, setPendingWrites] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [toast, setToast] = useState({ message: "", type: "info" });
  const [data, setData] = useState(EMPTY_DATA);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [showOnboarding, setShowOnboarding] = useState(false);

  function isOnboardingForced() {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ft_force_onboarding") === "true";
  }

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
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setAuthError("");
      if (!nextUser) {
        setUser(null);
        setData(EMPTY_DATA);
        return;
      }
      if (!isEmailAllowed(nextUser.email)) {
        setAuthError(
          `This account (${nextUser.email}) is not allowed. Allowed: ${getAllowedEmails().join(", ") || "(none set)"}`
        );
        signOut(auth);
        return;
      }
      setUser(nextUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubs = [];
    const onErr = (error) => setAuthError(error?.message || String(error));
    const bind = (collectionName, stateKey, orderField = "name") => {
      unsubs.push(
        subscribeCollection(
          user.uid,
          collectionName,
          (rows) => setData((prev) => ({ ...prev, [stateKey]: rows })),
          onErr,
          orderField
        )
      );
    };

    bind("accounts", "accounts", "name");
    bind("linkedAccounts", "linkedAccounts", "name");
    bind("plaidItems", "plaidItems", "institutionName");
    bind("transactions", "transactions", "date");
    unsubs.push(subscribeSettings(user.uid, setSettings, onErr));
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
    unsubs.push(
      subscribeUserDoc(
        user.uid,
        "syncState",
        "plaid",
        (doc) => setData((prev) => ({ ...prev, plaidSyncState: doc })),
        onErr
      )
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe?.());
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        await importExistingBillsAsRecurringTemplates(user.uid, selectedMonth);
        await ensureMonthInitializedAndSynced(user.uid, selectedMonth);
        if (cancelled) return;
      } catch (error) {
        if (cancelled) return;
        setAuthError(error?.message || String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, user, data.billTemplates, data.incomeTemplates]);

  useEffect(() => {
    if (!user) return;
    const onErr = (error) => setAuthError(error?.message || String(error));
    const unsubs = [];
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
    unsubs.push(
      subscribeUserDoc(
        user.uid,
        "statements",
        selectedMonth,
        (doc) => setData((prev) => ({ ...prev, statementMeta: doc })),
        onErr
      )
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe?.());
  }, [selectedMonth, user]);

  useEffect(() => {
    const onMutation = (event) => {
      const { phase, message } = event.detail || {};
      if (phase === "start") {
        setPendingWrites((count) => count + 1);
      } else if (phase === "success") {
        setPendingWrites((count) => Math.max(0, count - 1));
        setLastSavedAt(new Date());
      } else if (phase === "error") {
        setPendingWrites((count) => Math.max(0, count - 1));
        setAuthError(message || "Failed to save data.");
      }
    };
    window.addEventListener("ft-mutation", onMutation);
    return () => window.removeEventListener("ft-mutation", onMutation);
  }, []);

  useEffect(() => {
    if (!user) {
      setShowOnboarding(false);
      return;
    }
    if (isOnboardingForced()) {
      setShowOnboarding(true);
      return;
    }
    const hasOnboardingFlag = Boolean(settings?.onboardingCompletedAt || settings?.onboardingDismissedAt);
    const hasUserData =
      (data.accounts?.length || 0) > 0 ||
      (data.linkedAccounts?.length || 0) > 0 ||
      (data.plaidItems?.length || 0) > 0 ||
      (data.billTemplates?.length || 0) > 0 ||
      (data.incomeTemplates?.length || 0) > 0;
    setShowOnboarding(!hasOnboardingFlag && !hasUserData);
  }, [data.accounts, data.billTemplates, data.incomeTemplates, data.linkedAccounts, data.plaidItems, settings, user]);

  async function handleLogin() {
    setAuthError("");
    setAuthHint("");
    setStatus("Signing in...");
    try {
      await signInWithPopup(auth, googleProvider);
      setStatus("");
    } catch (error) {
      setStatus("");
      setAuthError(getFriendlyAuthError(error, "google"));
    }
  }

  async function handleEmailLogin(event) {
    event.preventDefault();
    setAuthError("");
    setAuthHint("");
    if (!email.trim() || !password) {
      setAuthError("Enter your email and password.");
      return;
    }
    if (emailAuthMode === "signup" && password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    setStatus("Signing in...");
    try {
      if (emailAuthMode === "signup") {
        setStatus("Creating account...");
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      setStatus("");
    } catch (error) {
      setStatus("");
      if (error?.code === "auth/email-already-in-use" && emailAuthMode === "signup") {
        setEmailAuthMode("signin");
        setAuthHint("That email already has an account. We switched you to Sign In.");
      }
      setAuthError(getFriendlyAuthError(error, emailAuthMode));
    }
  }

  async function handlePasswordReset() {
    setAuthError("");
    setAuthHint("");
    if (!email.trim()) {
      setAuthError("Enter your email first, then use Forgot Password.");
      return;
    }
    setStatus("Sending reset email...");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus("");
      setAuthHint(`Password reset email sent to ${email.trim()}.`);
    } catch (error) {
      setStatus("");
      setAuthError(getFriendlyAuthError(error, "signin"));
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setRoute("planner");
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

    if (route === "planner") {
      return (
        <PlannerPage
          {...shared}
          bills={data.statementBills}
          incomes={data.statementIncomes}
          billTemplates={data.billTemplates}
          incomeTemplates={data.incomeTemplates}
          accounts={data.accounts}
          linkedAccounts={data.linkedAccounts}
          transactions={data.transactions}
          statementMeta={data.statementMeta}
        />
      );
    }

    if (route === "bills") {
      return (
        <BillsPage
          {...shared}
          billTemplates={data.billTemplates}
          accounts={data.accounts}
          linkedAccounts={data.linkedAccounts}
        />
      );
    }

    if (route === "accounts") {
      return (
        <AccountsPage
          {...shared}
          accounts={data.accounts}
          linkedAccounts={data.linkedAccounts}
        />
      );
    }

    if (route === "income") {
      return (
        <IncomePage
          {...shared}
          incomeTemplates={data.incomeTemplates}
          accounts={data.accounts}
          linkedAccounts={data.linkedAccounts}
        />
      );
    }

    if (route === "activity") {
      return (
        <TransactionsPage
          {...shared}
          transactions={data.transactions}
          accounts={[...(data.accounts || []), ...(data.linkedAccounts || [])]}
        />
      );
    }

    return (
      <SettingsPage
        {...shared}
        accounts={data.accounts}
        linkedAccounts={data.linkedAccounts}
        plaidItems={data.plaidItems}
        plaidSyncState={data.plaidSyncState}
        onOpenOnboarding={() => setShowOnboarding(true)}
      />
    );
  }, [data, route, selectedMonth, settings, user]);

  if (!user) {
    return (
      <div className="container">
        <div className="authShell">
          <div className="card signInCard">
            <div className="authBrand">
              <div className="authBrandMark">BC</div>
              <div className="authBrandCopy">
                <h1>BudgetCommand</h1>
                <p className="muted">Private paycheck planner</p>
              </div>
            </div>

            <div className="authPanel">
              <form className="authForm" onSubmit={handleEmailLogin}>
                <div className="authSubmodeTabs" role="tablist" aria-label="Account access mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={emailAuthMode === "signin"}
                    className={emailAuthMode === "signin" ? "authTabButton active" : "authTabButton"}
                    onClick={() => setEmailAuthMode("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={emailAuthMode === "signup"}
                    className={emailAuthMode === "signup" ? "authTabButton active" : "authTabButton"}
                    onClick={() => setEmailAuthMode("signup")}
                  >
                    New account
                  </button>
                </div>
                <div className="authPanelIntro">
                  <h2>{emailAuthMode === "signup" ? "Create your account" : "Welcome back"}</h2>
                  <p className="muted">
                    {emailAuthMode === "signup"
                      ? "Set up your private planner access."
                      : "Sign in with your approved email and password."}
                  </p>
                </div>
                {authHint ? <div className="authHint">{authHint}</div> : null}
                <label className="authField">
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter email"
                  />
                </label>
                <label className="authField">
                  <span>Password</span>
                  <input
                    type="password"
                    autoComplete={emailAuthMode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter password"
                  />
                </label>
                {emailAuthMode === "signup" ? (
                  <label className="authField">
                    <span>Confirm Password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm password"
                    />
                  </label>
                ) : null}
                <button type="submit" className="primary authSubmitButton">
                  {status || (emailAuthMode === "signup" ? "Create account" : "Sign in")}
                </button>
                {emailAuthMode === "signin" ? (
                  <button type="button" className="authLinkButton authLinkButtonCentered" onClick={handlePasswordReset} disabled={Boolean(status)}>
                    Forgot your password?
                  </button>
                ) : (
                  <div className="authInlineNote muted">Use the same email you want approved.</div>
                )}
              </form>

              <div className="authDivider"><span>Or connect with:</span></div>

              <div className="authConnectList">
                <button type="button" className="authProviderButton" onClick={handleLogin} disabled={Boolean(status)}>
                  <span className="authProviderIcon" aria-hidden="true">G</span>
                  <span>{status || "Continue with Google"}</span>
                </button>
              </div>

              {status ? <div className="authStatus">{status}</div> : null}
              {authError ? <div className="errorText">{authError}</div> : null}
            </div>
          </div>
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
      {user ? (
        <OnboardingSetupModal
          open={showOnboarding}
          uid={user.uid}
          settings={settings}
          selectedMonth={selectedMonth}
          accounts={data.accounts}
          linkedAccounts={data.linkedAccounts}
          plaidItems={data.plaidItems}
          onToast={showToast}
          onError={(message) => setAuthError(message)}
          onClose={() => setShowOnboarding(false)}
        />
      ) : null}
      <Toast message={toast.message} type={toast.type} />
    </div>
  );
}
