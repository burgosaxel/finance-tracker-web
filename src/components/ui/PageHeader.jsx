import React from "react";

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  left,
  right,
  children,
  className = "",
}) {
  return (
    <header className={`pageHeader ${className}`.trim()}>
      <div className="pageHeaderTop">
        <div className="pageHeaderSlot">{left}</div>
        <div className="pageHeaderTitleWrap">
          {eyebrow ? <div className="pageEyebrow">{eyebrow}</div> : null}
          <h1>{title}</h1>
          {subtitle ? <p className="pageSubtitle">{subtitle}</p> : null}
        </div>
        <div className="pageHeaderSlot pageHeaderSlotRight">{right}</div>
      </div>
      {children ? <div className="pageHeaderBody">{children}</div> : null}
    </header>
  );
}
