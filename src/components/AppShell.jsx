import React from "react";
import { routeHref } from "../lib/hashRouter";
import BottomTabBar from "./BottomTabBar";
import Icon from "./ui/Icons";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", subtitle: "Today and cash pulse", icon: "dashboard" },
  { id: "bills-income", label: "Recurring", subtitle: "Bills, income, due soon", icon: "recurring" },
  { id: "budget", label: "Spending", subtitle: "Budget health and breakdown", icon: "spending" },
  { id: "transactions", label: "Transactions", subtitle: "Search and review activity", icon: "transactions" },
  { id: "settings", label: "More", subtitle: "Accounts, sync, controls", icon: "more" },
];

const SECONDARY_ITEMS = [
  { id: "credit-cards", label: "Credit Cards", icon: "card" },
  { id: "loans", label: "Loans", icon: "budget" },
];

export default function AppShell({ route, user, status, onSignOut, children }) {
  return (
    <div className="appShell">
      <aside className="desktopRail">
        <div className="railBrand surfaceCard">
          <div className="railBrandMark">BC</div>
          <div>
            <div className="sectionEyebrow">BudgetCommand</div>
            <div className="railBrandTitle">Command Center</div>
            <div className="sectionSubtitle">Premium cashflow workspace</div>
          </div>
        </div>

        <nav className="railNav surfaceCard" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={routeHref(item.id)}
              className={`railLink ${route === item.id ? "active" : ""}`.trim()}
            >
              <Icon name={item.icon} size={18} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.subtitle}</small>
              </span>
            </a>
          ))}
        </nav>

        <div className="surfaceCard railSection">
          <div className="sectionEyebrow">Workspace</div>
          {SECONDARY_ITEMS.map((item) => (
            <a key={item.id} href={routeHref(item.id)} className={`railLink secondary ${route === item.id ? "active" : ""}`.trim()}>
              <Icon name={item.icon} size={18} />
              <span>
                <strong>{item.label}</strong>
              </span>
            </a>
          ))}
        </div>

        <div className="surfaceCard railFooter">
          <div className="metricRowLabel">{user.email}</div>
          <div className="metricRowDetail">{status || "Synced and ready"}</div>
          <button type="button" className="ghostButton" onClick={onSignOut}>
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="shellViewport">
        <main className="shellContent">{children}</main>
      </div>

      <BottomTabBar route={route} />
    </div>
  );
}
