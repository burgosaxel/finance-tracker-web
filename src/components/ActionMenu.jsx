import React, { useEffect, useRef, useState } from "react";

export default function ActionMenu({ label = "Actions", items = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const visibleItems = items.filter((item) => !item.hidden);
  if (!visibleItems.length) return null;

  return (
    <div className="actionMenu" ref={rootRef}>
      <button
        type="button"
        className="actionMenuButton secondary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <div className="actionMenuList">
          {visibleItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`actionMenuItem ${item.tone || ""}`.trim()}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
