import React from "react";

export default function SurfaceCard({ className = "", children, ...props }) {
  return (
    <section className={`surfaceCard ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
