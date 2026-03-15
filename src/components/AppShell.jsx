import React, { useEffect, useState } from "react";
import { routeHref } from "../lib/hashRouter";
import { Home, Target, CreditCard, Building2, Receipt, ArrowLeftRight, Settings } from "lucide-react";
import brandLogo from "../assets/budgetcommand-logo.png";

function NavIcon({ kind }) {
  const iconMap = {
    dashboard: Home,
    budget: Target,
    cards: CreditCard,
    loans: Building2,
    bills: Receipt,
    transactions: ArrowLeftRight,
    settings: Settings,
  };
  const IconComponent = iconMap[kind] || Home;
  return (
    <span className="navIcon" aria-hidden="true">
      <IconComponent size={20} />
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
  const shellClassName = `appShell app-shell${route === "dashboard" ? " dashboard-shell" : ""}`;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [route]);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <div className={shellClassName}>
      <aside className="sidebar card desktopOnly">
        <div>
          <div className="sidebarBrand sidebar-brand">
            <img src={brandLogo} alt="BudgetCommand" className="brandLogo sidebar-logo" />
            <div className="sidebarEyebrow sidebar-kicker">Premium Finance Workspace</div>
            <div className="sidebarTitle sidebar-title">BudgetCommand</div>
            <div className="sidebarSubtitle sidebar-subtitle">
              Financial command center for cash, debt, bills, sync, and recurring insight.
            </div>
          </div>

          <nav className="sidebarNav sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                className={`navLink sidebar-link ${route === item.id ? "active" : ""}`}
                href={routeHref(item.id)}
              >
                <NavIcon kind={item.icon} />
                <span className="navTextWrap">
                  <span className="navLabel label">{item.label}</span>
                  <span className="navMeta sublabel">{item.shortLabel}</span>
                </span>
              </a>
            ))}
          </nav>
        </div>

        <div className="sidebarFooter sidebar-user-card">
          <div className="sidebarMetaLabel kicker">Workspace owner</div>
          <div className="sidebarMetaValue email">{user.email}</div>
          <div className="sidebarFooterActions">
            {status ? <div className="statusBadge subtle status-pill">{status}</div> : null}
            <button type="button" className="ghostButton button-secondary secondary" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </aside>

      <div className="mainPanel main-column">
        <header className="mobileHeader workspace-bar card">
          <div className="mobileBrandWrap">
            <img className="brandLogo compact sidebar-logo" src={brandLogo} alt="BudgetCommand" />
            <div className="mobileBrand">
              <div className="sidebarEyebrow sidebar-kicker">Premium Finance Workspace</div>
              <div className="sidebarTitle sidebar-title">BudgetCommand</div>
              <div className="mobileBrandMeta">Cash, debt, bills, sync, and recurring insight.</div>
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
              <div className="sidebarEyebrow sidebar-kicker">Workspace</div>
              <div className="mobileMenuTitle">BudgetCommand</div>
            </div>
            {status ? <div className="statusBadge subtle status-pill">{status}</div> : null}
          </div>
          <nav className="mobileNav">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                className={`navLink sidebar-link ${route === item.id ? "active" : ""}`}
                href={routeHref(item.id)}
                onClick={closeMobileMenu}
              >
                <NavIcon kind={item.icon} />
                <span className="navTextWrap">
                  <span className="navLabel label">{item.label}</span>
                  <span className="navMeta sublabel">{item.shortLabel}</span>
                </span>
              </a>
            ))}
          </nav>
          <div className="mobileMenuFooter sidebar-user-card">
            <div>
              <div className="sidebarMetaLabel kicker">Workspace owner</div>
              <div className="sidebarMetaValue email">{user.email}</div>
            </div>
            <button type="button" className="button-primary primary" onClick={onSignOut}>Sign out</button>
          </div>
        </aside>



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
