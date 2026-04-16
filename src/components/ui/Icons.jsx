import React from "react";

const PATHS = {
  dashboard: (
    <>
      <path d="M4 12.5h6.5V4H4v8.5Z" />
      <path d="M13.5 20h6.5V10h-6.5V20Z" />
      <path d="M13.5 7.5h6.5V4h-6.5v3.5Z" />
      <path d="M4 20h6.5v-4.5H4V20Z" />
    </>
  ),
  recurring: (
    <>
      <path d="M19 8a7 7 0 0 0-12-2" />
      <path d="M5 4v4h4" />
      <path d="M5 16a7 7 0 0 0 12 2" />
      <path d="M19 20v-4h-4" />
    </>
  ),
  spending: (
    <>
      <path d="M12 4v8l5 3" />
      <path d="M4.9 7.2A8 8 0 1 0 12 4" />
    </>
  ),
  transactions: (
    <>
      <path d="M7 7h13" />
      <path d="m14 4 3 3-3 3" />
      <path d="M17 17H4" />
      <path d="m10 14-3 3 3 3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  bell: (
    <>
      <path d="M15 17H5.5c1.1-1.1 1.8-2.8 1.8-4.7V10a4.7 4.7 0 1 1 9.4 0v2.3c0 1.9.7 3.6 1.8 4.7H15" />
      <path d="M10.2 20a2 2 0 0 0 3.6 0" />
    </>
  ),
  settings: (
    <>
      <path d="m12 8.8 1.3-2.6 2.9.4.6 2.8 2.4 1.6-1.2 2.7 1.2 2.7-2.4 1.6-.6 2.8-2.9.4L12 15.2l-1.3 2.6-2.9-.4-.6-2.8-2.4-1.6 1.2-2.7-1.2-2.7 2.4-1.6.6-2.8 2.9-.4L12 8.8Z" />
      <circle cx="12" cy="12" r="2.3" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4.5 4.5" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </>
  ),
  calendar: (
    <>
      <path d="M6 4v3" />
      <path d="M18 4v3" />
      <rect x="4" y="6.5" width="16" height="13.5" rx="3" />
      <path d="M4 10h16" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z" />
      <path d="M16 13h4" />
      <circle cx="16" cy="13" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="3" />
      <circle cx="12" cy="12" r="2.7" />
      <path d="M7 9.5h.01" />
      <path d="M17 14.5h.01" />
    </>
  ),
  savings: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5-6 10.5-6 10.5S6 14.5 6 9.5Z" />
      <path d="M12 7.8v3.4" />
      <path d="M10.4 9.5H13.6" />
    </>
  ),
  investment: (
    <>
      <path d="M5 17 10 12l3 3 6-7" />
      <path d="M15 8h4v4" />
    </>
  ),
  card: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="3" />
      <path d="M3.5 10.5h17" />
    </>
  ),
  income: (
    <>
      <path d="M12 20V4" />
      <path d="m6 10 6-6 6 6" />
    </>
  ),
  expense: (
    <>
      <path d="M12 4v16" />
      <path d="m6 14 6 6 6-6" />
    </>
  ),
  sync: (
    <>
      <path d="M18 8a6 6 0 0 0-10-2" />
      <path d="M8 6H4V2" />
      <path d="M6 16a6 6 0 0 0 10 2" />
      <path d="M16 18h4v4" />
    </>
  ),
  link: (
    <>
      <path d="M10.2 13.8 13.8 10.2" />
      <path d="M7.9 14.9 6.5 16.3a3.2 3.2 0 1 1-4.5-4.5l2.9-2.9a3.2 3.2 0 0 1 4.5 0" />
      <path d="m16.1 9.1 1.4-1.4a3.2 3.2 0 1 1 4.5 4.5l-2.9 2.9a3.2 3.2 0 0 1-4.5 0" />
    </>
  ),
  crown: (
    <>
      <path d="m4 17 2-9 6 4 6-4 2 9H4Z" />
      <path d="M7 17h10" />
      <circle cx="6" cy="8" r="1.2" />
      <circle cx="12" cy="6" r="1.2" />
      <circle cx="18" cy="8" r="1.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  budget: (
    <>
      <path d="M5 5h14" />
      <path d="M5 12h14" />
      <path d="M5 19h9" />
    </>
  ),
  tag: (
    <>
      <path d="m11 4 8 8-7 7-8-8V4h7Z" />
      <circle cx="8" cy="8" r="1.1" />
    </>
  ),
  palette: (
    <>
      <path d="M12 4a8 8 0 1 0 0 16c1 0 1.8-.8 1.8-1.8 0-.5-.2-1-.6-1.4a1.9 1.9 0 0 1 1.4-3.2H16a4 4 0 0 0 0-8h-4Z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="7.7" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="8.2" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.6 2.6 0 1 1 4.2 2.1c-.9.7-1.7 1.2-1.7 2.4" />
      <path d="M12 17h.01" />
    </>
  ),
  logout: (
    <>
      <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
      <path d="M13 16l4-4-4-4" />
      <path d="M17 12H9" />
    </>
  ),
  dots: (
    <>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17h.01" />
    </>
  ),
  check: (
    <>
      <path d="m5 12 4.2 4.2L19 6.5" />
    </>
  ),
};

export default function Icon({ name, size = 20, className = "", strokeWidth = 1.9, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {PATHS[name] || PATHS.spark}
    </svg>
  );
}
