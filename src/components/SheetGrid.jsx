import React, { useMemo, useRef, useState } from "react";
import { FixedSizeGrid as Grid } from "react-window";
import { colToLabel, keyRC, normalizeCellValue } from "../utils";

const COL_WIDTH = 160;
const ROW_HEIGHT = 34;
const ROW_HEADER_WIDTH = 64;
const COL_HEADER_HEIGHT = 34;

export default function SheetGrid({ sheet, onEditCell }) {
  const { bounds, cells } = sheet;
  const min_r = bounds?.min_r ?? 1;
  const max_r = bounds?.max_r ?? 1;
  const min_c = bounds?.min_c ?? 1;
  const max_c = bounds?.max_c ?? 1;

  const rowCount = (max_r - min_r + 1) + 1; // + header row
  const colCount = (max_c - min_c + 1) + 1; // + row header col

  const gridRef = useRef(null);

  const Cell = ({ columnIndex, rowIndex, style }) => {
    // (0,0) corner
    if (rowIndex === 0 && columnIndex === 0) {
      return <div className="cell header" style={{ ...style }} />;
    }
    // Column headers
    if (rowIndex === 0) {
      const col = min_c + (columnIndex - 1);
      return (
        <div className="cell header" style={{ ...style }}>
          {colToLabel(col)}
        </div>
      );
    }
    // Row headers
    if (columnIndex === 0) {
      const row = min_r + (rowIndex - 1);
      return (
        <div className="cell rowHeader" style={{ ...style }}>
          {row}
        </div>
      );
    }

    const r = min_r + (rowIndex - 1);
    const c = min_c + (columnIndex - 1);
    const k = keyRC(r, c);
    const v = cells?.[k] ?? "";

    return (
      <div
        className="cell editable"
        style={{ ...style }}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={(e) => {
          const next = normalizeCellValue(e.currentTarget.textContent ?? "");
          onEditCell(r, c, next);
        }}
      >
        {String(v)}
      </div>
    );
  };

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Grid
        ref={gridRef}
        columnCount={colCount}
        rowCount={rowCount}
        columnWidth={(i) => (i === 0 ? ROW_HEADER_WIDTH : COL_WIDTH)}
        rowHeight={(i) => (i === 0 ? COL_HEADER_HEIGHT : ROW_HEIGHT)}
        width={Math.min(window.innerWidth - 32, 1100)}
        height={Math.min(window.innerHeight - 220, 720)}
      >
        {Cell}
      </Grid>
      <div className="muted" style={{ marginTop: 10 }}>
        Tip: click a cell, edit, then click away to save that cell locally (you still need to press Save to write to Firestore).
      </div>
    </div>
  );
}
