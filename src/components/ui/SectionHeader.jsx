import React from "react";

export default function SectionHeader({ eyebrow, title, subtitle, action }) {
  return (
    <div className="sectionHeader">
      <div>
        {eyebrow ? <div className="sectionEyebrow">{eyebrow}</div> : null}
        <div className="sectionTitle">{title}</div>
        {subtitle ? <div className="sectionSubtitle">{subtitle}</div> : null}
      </div>
      {action ? <div className="sectionAction">{action}</div> : null}
    </div>
  );
}
