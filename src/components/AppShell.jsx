import React, { useEffect, useState } from "react";
import { routeHref } from "../lib/hashRouter";
import { Home, Target, CreditCard, Building2, Receipt, ArrowLeftRight, Settings } from "lucide-react";
import brandLogo from "../../BudgetCommand Logo.png";

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
          <img className="brandLogo" src={brandLogo} alt="BudgetCommand" />
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
            <img className="brandLogo compact" src={brandLogo} alt="BudgetCommand" />
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
