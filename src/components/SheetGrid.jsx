import React, { useMemo, useRef } from "react";
import { VariableSizeGrid as Grid } from "react-window";
import { colToLabel, keyRC, normalizeCellValue } from "../utils";

const COL_WIDTH = 160;
const ROW_HEIGHT = 34;
const ROW_HEADER_WIDTH = 64;
const COL_HEADER_HEIGHT = 34;

export default function SheetGrid({ sheet, onEditCell }) {
  const { bounds, cells } = sheet;
  const safe = useMemo(() => {
    const parseIntSafe = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    };

    let min_r = parseIntSafe(bounds?.min_r, 1);
    let max_r = parseIntSafe(bounds?.max_r, min_r);
    let min_c = parseIntSafe(bounds?.min_c, 1);
    let max_c = parseIntSafe(bounds?.max_c, min_c);

    // If bounds are broken in Firestore, infer a fallback range from existing cell keys.
    if (!(max_r >= min_r) || !(max_c >= min_c)) {
      const keys = Object.keys(cells || {});
      const parsed = keys
        .map((k) => k.split(",").map(Number))
        .filter(([r, c]) => Number.isFinite(r) && Number.isFinite(c));
      if (parsed.length > 0) {
        const rows = parsed.map(([r]) => r);
        const cols = parsed.map(([, c]) => c);
        min_r = Math.min(...rows);
        max_r = Math.max(...rows);
        min_c = Math.min(...cols);
        max_c = Math.max(...cols);
      } else {
        min_r = 1;
        max_r = 1;
        min_c = 1;
        max_c = 1;
      }
    }

    return {
      min_r,
      max_r,
      min_c,
      max_c,
      rowCount: Math.max(2, max_r - min_r + 2), // + header row
      colCount: Math.max(2, max_c - min_c + 2), // + row header col
    };
  }, [bounds, cells]);

  const { min_r, min_c, rowCount, colCount } = safe;

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
