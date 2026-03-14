import React, { useEffect, useState } from "react";
import { routeHref } from "../lib/hashRouter";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "budget", label: "Budget" },
  { id: "credit-cards", label: "Credit Cards" },
  { id: "loans", label: "Loans" },
  { id: "bills-income", label: "Bills & Income" },
  { id: "transactions", label: "Transactions" },
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
        <div className="sidebarBrand">
          <div className="sidebarEyebrow">Personal Finance Command Center</div>
          <div className="sidebarTitle">BudgetCommand</div>
        </div>
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
        <div className="sidebarFooter">
          <div className="sidebarMetaLabel">Signed in</div>
          <div className="sidebarMetaValue">{user.email}</div>
          {status ? <div className="statusBadge subtle">{status}</div> : null}
        </div>
      </aside>
      <div className="mainPanel">
        <header className="mobileHeader card">
          <div className="mobileBrand">
            <div className="sidebarTitle">BudgetCommand</div>
            <div className="mobileBrandMeta">Personal finance command center</div>
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
            <div>
              <div className="sidebarMetaLabel">Signed in</div>
              <div className="sidebarMetaValue">{user.email}</div>
            </div>
            {status ? <div className="statusBadge subtle">{status}</div> : null}
            <button type="button" onClick={onSignOut}>Sign out</button>
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
              <div className="sidebarMetaLabel">Signed in</div>
              <div className="sidebarMetaValue">{user.email}</div>
            </div>
            <button type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </header>
        <main className="pageContent">{children}</main>
      </div>
    </div>
  );
}
