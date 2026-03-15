import React from "react";

export default function SortHeader({ label, column, sortBy, sortDirection, onSort }) {
  const active = sortBy === column;
  const arrow = !active ? "" : sortDirection === "asc" ? "^" : "v";

  return (
    <button type="button" className="sortableHeaderButton" onClick={() => onSort(column)}>
      <span>{label}</span>
      <span className="sortIndicator" aria-hidden="true">{arrow}</span>
    </button>
  );
}
