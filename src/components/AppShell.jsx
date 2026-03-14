import React, { useEffect, useState } from "react";
import { routeHref } from "../lib/hashRouter";

function NavIcon({ kind }) {
  const paths = {
    dashboard: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.75v-5.5h-4.5V21H5a1 1 0 0 1-1-1z",
    budget: "M5 6.5h14M5 12h14M5 17.5h8M17 16.5l2 2 3-4",
    cards: "M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5zm0 3h16",
    loans: "M4.5 9.5 12 5l7.5 4.5v8.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1zm4 8v-4h7v4",
    bills: "M7 4.75h10A1.25 1.25 0 0 1 18.25 6v12A1.25 1.25 0 0 1 17 19.25H7A1.25 1.25 0 0 1 5.75 18V6A1.25 1.25 0 0 1 7 4.75m2.25 4h5.5m-5.5 4h5.5m-5.5 4h3.5",
    transactions: "M6 7.25h12M6 12h8m-8 4.75h12M16.5 9l2.5-1.75L16.5 5M7.5 19 5 17.25 7.5 15.5",
    settings: "M12 8.25A3.75 3.75 0 1 1 8.25 12 3.75 3.75 0 0 1 12 8.25m0-4.5 1.05 2.2 2.43.35-.92 2.25 1.58 1.87-1.96 1.47.23 2.45L12 15.9l-2.41 1.44.23-2.45-1.96-1.47 1.58-1.87-.92-2.25 2.43-.35z",
  };
  return (
    <span className="navIcon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[kind] || paths.dashboard} />
      </svg>
    </span>
  );
}

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Home", icon: "dashboard" },
  { id: "budget", label: "Budget", shortLabel: "Plan", icon: "budget" },
  { id: "credit-cards", label: "Credit Cards", shortLabel: "Cards", icon: "cards" },
  { id: "loans", label: "Loans", shortLabel: "Loans", icon: "loans" },
  { id: "bills-income", label: "Bills & Income", shortLabel: "Bills", icon: "bills" },
  { id: "transactions", label: "Transactions", shortLabel: "Activity", icon: "transactions" },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: "settings" },
];

const MOBILE_PRIMARY_NAV = NAV_ITEMS.filter((item) =>
  ["dashboard", "budget", "bills-income", "transactions", "settings"].includes(item.id)
);

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
        <div className="sidebarBrand">
          <div className="brandMark" aria-hidden="true">
            <span className="brandMarkOrb brandMarkOrbPrimary" />
            <span className="brandMarkOrb brandMarkOrbSecondary" />
            <span className="brandMarkGlyph">B</span>
          </div>
          <div>
            <div className="sidebarEyebrow">Premium finance workspace</div>
            <div className="sidebarTitle">BudgetCommand</div>
          </div>
        </div>
        <div className="sidebarPanel">
          <div className="sidebarPanelLabel">Financial command center</div>
          <div className="sidebarPanelValue">Track cash, debt, bills, sync health, and recurring patterns in one flow.</div>
        </div>
        <nav className="sidebarNav">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              className={`navLink ${route === item.id ? "active" : ""}`}
              href={routeHref(item.id)}
            >
              <NavIcon kind={item.icon} />
              <span className="navTextWrap">
                <span className="navLabel">{item.label}</span>
                <span className="navMeta">{item.shortLabel}</span>
              </span>
            </a>
          ))}
        </nav>
        <div className="sidebarFooter">
          <div className="sidebarMetaLabel">Workspace owner</div>
          <div className="sidebarMetaValue">{user.email}</div>
          <div className="sidebarFooterActions">
            {status ? <div className="statusBadge subtle">{status}</div> : null}
            <button type="button" className="ghostButton" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </aside>
      <div className="mainPanel">
        <header className="mobileHeader card">
          <div className="mobileBrandWrap">
            <div className="brandMark compact" aria-hidden="true">
              <span className="brandMarkOrb brandMarkOrbPrimary" />
              <span className="brandMarkOrb brandMarkOrbSecondary" />
              <span className="brandMarkGlyph">B</span>
            </div>
            <div className="mobileBrand">
              <div className="sidebarTitle">BudgetCommand</div>
              <div className="mobileBrandMeta">Personal finance command center</div>
            </div>
          </div>
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
          <div className="mobileMenuHeader">
            <div>
              <div className="sidebarEyebrow">Workspace</div>
              <div className="mobileMenuTitle">BudgetCommand</div>
            </div>
            {status ? <div className="statusBadge subtle">{status}</div> : null}
          </div>
          <nav className="mobileNav">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                className={`navLink ${route === item.id ? "active" : ""}`}
                href={routeHref(item.id)}
                onClick={closeMobileMenu}
              >
                <NavIcon kind={item.icon} />
                <span className="navTextWrap">
                  <span className="navLabel">{item.label}</span>
                  <span className="navMeta">{item.shortLabel}</span>
                </span>
              </a>
            ))}
          </nav>
          <div className="mobileMenuFooter">
            <div>
              <div className="sidebarMetaLabel">Signed in</div>
              <div className="sidebarMetaValue">{user.email}</div>
            </div>
            <button type="button" className="primary" onClick={onSignOut}>Sign out</button>
          </div>
        </aside>

        <header className="topbar card desktopOnly">
          <div className="row topbarRow">
            <div>
              <div className="topbarLabel">Workspace</div>
              <div className="topbarTitle">BudgetCommand</div>
            </div>
            <div className="spacer" />
            {status ? <div className="statusBadge subtle">{status}</div> : null}
            <div className="topbarAccount">
              <div className="sidebarMetaLabel">Workspace owner</div>
              <div className="sidebarMetaValue">{user.email}</div>
            </div>
            <button type="button" className="ghostButton" onClick={onSignOut}>Sign out</button>
          </div>
        </header>
        <main className="pageContent">{children}</main>
        <nav className="mobileBottomNav card" aria-label="Primary">
          {MOBILE_PRIMARY_NAV.map((item) => (
            <a
              key={item.id}
              className={`bottomNavLink ${route === item.id ? "active" : ""}`}
              href={routeHref(item.id)}
            >
              <NavIcon kind={item.icon} />
              <span>{item.shortLabel}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
