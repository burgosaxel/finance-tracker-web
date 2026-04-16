import React from "react";
import SurfaceCard from "./SurfaceCard";
import Icon from "./Icons";

export default function InsightCard({
  icon = "spark",
  eyebrow,
  title,
  body,
  action,
  tone = "default",
  className = "",
}) {
  return (
    <SurfaceCard className={`insightCard ${tone} ${className}`.trim()}>
      <div className="insightIcon">
        <Icon name={icon} size={18} />
      </div>
      <div className="insightContent">
        {eyebrow ? <div className="sectionEyebrow">{eyebrow}</div> : null}
        <div className="insightTitle">{title}</div>
        {body ? <div className="sectionSubtitle">{body}</div> : null}
      </div>
      {action ? <div className="insightAction">{action}</div> : null}
    </SurfaceCard>
  );
}
