import React from "react";
import { routeHref } from "../lib/hashRouter";
import Icon from "./ui/Icons";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "bills-income", label: "Recurring", icon: "recurring" },
  { id: "budget", label: "Spending", icon: "spending" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "settings", label: "More", icon: "more" },
];

export default function BottomTabBar({ route }) {
  return (
    <nav className="bottomTabBar" aria-label="Primary">
      {TABS.map((tab) => {
        const active = route === tab.id;
        return (
          <a key={tab.id} href={routeHref(tab.id)} className={`bottomTab ${active ? "active" : ""}`.trim()}>
            <Icon name={tab.icon} size={20} />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
