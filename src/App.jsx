import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { isEmailAllowed, getAllowedEmails } from "./auth";
import { listSeedSheetNames, loadSheet, saveSheet, testFirestore } from "./sheets";
import SheetGrid from "./components/SheetGrid.jsx";
import { keyRC } from "./utils";

function Header({ user, onLogin, onLogout }) {
  return (
    <div className="row" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800 }}>Finance Tracker</div>
      <div className="spacer" />
      {user ? (
        <>
          <div className="muted">{user.email}</div>
          <button type="button" onClick={onLogout}>Sign out</button>
        </>
      ) : (
        <button type="button" className="primary" onClick={onLogin}>Sign in</button>
      )}
    </div>
  );
}

function getErrorHint(errorMessage) {
  if (!errorMessage) return "";
  if (errorMessage.includes("Missing or insufficient permissions")) {
    return "Firestore rules are blocking access. Update Firestore rules to allow request.auth.uid to access /users/{uid}/...";
  }
  if (errorMessage.includes("Cloud Firestore API is not enabled")) {
    return "Create or enable Firestore Database in Firebase Console (Build -> Firestore Database).";
  }
  if (errorMessage.includes("auth/api-key-not-valid")) {
    return "Firebase web config is missing. Verify .env.local is in the project root and restart the dev server.";
  }
  return "";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [sheetName, setSheetName] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");

  const sheetNames = useMemo(() => listSeedSheetNames(), []);
  const errorHint = getErrorHint(authError);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthError("");
      setStatus("");
      if (!u) {
        setUser(null);
        setSheet(null);
        setSheetName(null);
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

  async function handleLogin() {
    setAuthError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setAuthError(e?.message || String(e));
    }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  useEffect(() => {
    if (!user || !sheetName) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await loadSheet(user.uid, sheetName);
        if (cancelled) return;
        setSheet(s);
        setDirty(false);
        setStatus("");
        setAuthError("");
      } catch (error) {
        if (cancelled) return;
        setSheet(null);
        setStatus("");
        setAuthError(error?.message || String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, sheetName]);

  function editCell(r, c, value) {
    if (!sheet) return;
    const k = keyRC(r, c);
    const next = {
      ...sheet,
      cells: { ...(sheet.cells || {}) }
    };
    if (value === "" || value === null || value === undefined) {
      delete next.cells[k];
    } else {
      next.cells[k] = value;
    }
    setSheet(next);
    setDirty(true);
  }

  async function handleSave() {
    if (!user || !sheetName || !sheet) return;
    setStatus("Saving\u2026");
    try {
      await saveSheet(user.uid, sheetName, sheet);
      setDirty(false);
      setStatus("Saved \u2705");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setStatus("");
      setAuthError(e?.message || String(e));
    }
  }

  async function handleTestFirestore() {
    if (!user) return;
    setAuthError("");
    setStatus("Testing\u2026");
    try {
      await testFirestore(user.uid);
      setStatus("Firestore OK \u2705");
      setTimeout(() => setStatus(""), 1500);
    } catch (error) {
      setStatus("");
      setAuthError(error?.message || String(error));
    }
  }

  return (
    <div className="container">
      <Header user={user} onLogin={handleLogin} onLogout={handleLogout} />

      {!user ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Sign in required</div>
          <div className="muted">
            This app uses Firebase Auth. Set VITE_ALLOWED_EMAILS so only your email can access it.
          </div>
          {authError ? <div style={{ color: "crimson", marginTop: 10 }}>{authError}</div> : null}
        </div>
      ) : (
        <div className="row" style={{ alignItems: "stretch" }}>
          <div className="card" style={{ width: 280, padding: 12 }}>
            <button
              type="button"
              className="primary"
              onClick={handleTestFirestore}
              style={{ marginBottom: 10 }}
            >
              Test Firestore
            </button>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Sheets</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Pick a sheet. Your first open will automatically seed Firestore with your current Excel snapshot.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sheetNames.map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => {
                    setSheetName(n);
                    setStatus("Loading\u2026");
                    setAuthError("");
                  }}
                  className={n === sheetName ? "primary" : ""}
                  style={{ textAlign: "left" }}
                >
                  {n}
                </button>
              ))}
            </div>
            {authError ? (
              <div style={{ color: "crimson", marginTop: 10 }}>
                {errorHint ? <div>{errorHint}</div> : null}
                <div>{authError}</div>
              </div>
            ) : null}
          </div>

          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div className="gridHeader">
              <div className="row">
                <div style={{ fontWeight: 700 }}>
                  {sheetName ? sheetName : "Select a sheet"}
                </div>
                <div className="spacer" />
                <div className="muted">{status}</div>
                <button type="button" className="primary" disabled={!dirty || !sheet} onClick={handleSave}>
                  Save
                </button>
              </div>
            </div>
            <div style={{ padding: 12 }}>
              {sheet ? (
                <div className="gridWrap">
                  <SheetGrid sheet={sheet} onEditCell={editCell} />
                </div>
              ) : (
                <div className="muted">Open a sheet to view/edit.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
