import React from "react";

export default function Modal({ title, open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row modalHeader">
          <div>
            <div className="modalEyebrow">Edit details</div>
            <strong className="modalTitle">{title}</strong>
          </div>
          <div className="spacer" />
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
