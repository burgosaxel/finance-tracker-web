import React from "react";
import { routeHref } from "../lib/hashRouter";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "budget", label: "Budget" },
  { id: "credit-cards", label: "Credit Cards" },
  { id: "bills-income", label: "Bills & Income" },
  { id: "transactions", label: "Transactions" },
  { id: "settings", label: "Settings" },
];

export default function AppShell({ route, user, status, onSignOut, children }) {
  return (
    <div className="appShell">
      <aside className="sidebar card">
        <div className="sidebarTitle">Finance Tracker</div>
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
        <header className="topbar card">
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
