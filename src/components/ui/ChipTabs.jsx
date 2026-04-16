import React from "react";

export default function ChipTabs({ items, value, onChange, className = "" }) {
  return (
    <div className={`chipTabs ${className}`.trim()} role="tablist" aria-label="Options">
      {items.map((item) => {
        const id = typeof item === "string" ? item : item.id;
        const label = typeof item === "string" ? item : item.label;
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            className={`chipTab ${active ? "active" : ""}`.trim()}
            onClick={() => onChange(id)}
            role="tab"
            aria-selected={active}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
