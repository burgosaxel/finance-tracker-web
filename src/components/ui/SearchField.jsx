import React from "react";
import Icon from "./Icons";

export default function SearchField({
  value,
  onChange,
  placeholder = "Search",
  action,
  className = "",
}) {
  return (
    <div className={`searchField ${className}`.trim()}>
      <Icon name="search" size={18} className="searchFieldIcon" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {action ? <div className="searchFieldAction">{action}</div> : null}
    </div>
  );
}
