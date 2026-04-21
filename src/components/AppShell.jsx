import React, { useEffect, useState } from "react";
import { routeHref } from "../lib/hashRouter";

const NAV_ITEMS = [
  { id: "planner", label: "Planner" },
  { id: "bills", label: "Bill Templates" },
  { id: "income", label: "Income" },
  { id: "accounts", label: "Accounts" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

export default function AppShell({ route, user, status, onSignOut, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [route]);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <div className="appShell">
      <aside className="sidebar card desktopOnly">
        <div className="sidebarTitle">BudgetCommand</div>
        <div className="muted pageIntro">Money operations and paycheck planning.</div>
        <nav className="sidebarNav">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              className={`navLink ${route === item.id ? "active" : ""}`}
              href={routeHref(item.id)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="mainPanel">
        <header className="mobileHeader card">
          <div className="sidebarTitle">BudgetCommand</div>
          <button
            type="button"
            className="menuButton"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <span className={`menuIcon ${mobileMenuOpen ? "open" : ""}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </header>

        {mobileMenuOpen ? <button type="button" className="menuBackdrop" aria-label="Close menu" onClick={closeMobileMenu} /> : null}

        <aside id="mobile-nav-menu" className={`mobileMenu card ${mobileMenuOpen ? "open" : ""}`}>
          <nav className="mobileNav">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                className={`navLink ${route === item.id ? "active" : ""}`}
                href={routeHref(item.id)}
                onClick={closeMobileMenu}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mobileMenuFooter">
            <div className="muted">{user.email}</div>
            <button type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </aside>

        <header className="topbar card desktopOnly">
          <div className="muted">{status || ""}</div>
          <div className="row">
            <div className="muted">{user.email}</div>
            <button type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </header>
        <main className="pageContent">{children}</main>
      </div>
    </div>
  );
}
