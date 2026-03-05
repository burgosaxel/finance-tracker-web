import React, { useEffect, useMemo, useRef, useState } from "react";
import { VariableSizeGrid as Grid } from "react-window";
import { colToLabel, keyRC, normalizeCellValue } from "../utils";

const COL_WIDTH = 170;
const ROW_HEIGHT = 34;
const ROW_HEADER_WIDTH = 64;
const COL_HEADER_HEIGHT = 36;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value, headerText) {
  const header = String(headerText || "").toLowerCase();
  const looksPercent =
    header.includes("%") ||
    header.includes("apr") ||
    header.includes("rate") ||
    header.includes("usage");
  const looksMoney =
    header.includes("amount") ||
    header.includes("credit") ||
    header.includes("payment") ||
    header.includes("balance") ||
    header.includes("owed") ||
    header.includes("max");

  if (looksPercent && Math.abs(value) <= 1.5) {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (looksMoney) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function cellToString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default function SheetGrid({ sheet, onEditCell }) {
  const { bounds, cells } = sheet;
  const gridRef = useRef(null);
  const [selected, setSelected] = useState(() => ({
    r: bounds?.min_r ?? 1,
    c: bounds?.min_c ?? 1,
  }));
  const [editing, setEditing] = useState(null);
  const [formulaDraft, setFormulaDraft] = useState("");

  const safe = useMemo(() => {
    const parseIntSafe = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    };

    let min_r = parseIntSafe(bounds?.min_r, 1);
    let max_r = parseIntSafe(bounds?.max_r, min_r);
    let min_c = parseIntSafe(bounds?.min_c, 1);
    let max_c = parseIntSafe(bounds?.max_c, min_c);

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
      rowCount: Math.max(2, max_r - min_r + 2),
      colCount: Math.max(2, max_c - min_c + 2),
    };
  }, [bounds, cells]);

  const { min_r, max_r, min_c, max_c, rowCount, colCount } = safe;
  const headerRow = min_r;

  const selectedR = clamp(selected.r, min_r, max_r);
  const selectedC = clamp(selected.c, min_c, max_c);

  const getCellRaw = (r, c) => cells?.[keyRC(r, c)] ?? "";
  const selectedRawValue = getCellRaw(selectedR, selectedC);

  useEffect(() => {
    setFormulaDraft(cellToString(selectedRawValue));
  }, [selectedR, selectedC, selectedRawValue]);

  const moveSelection = (dr, dc) => {
    const nextR = clamp(selectedR + dr, min_r, max_r);
    const nextC = clamp(selectedC + dc, min_c, max_c);
    setSelected({ r: nextR, c: nextC });
    gridRef.current?.scrollToItem({
      rowIndex: nextR - min_r + 1,
      columnIndex: nextC - min_c + 1,
      align: "smart",
    });
  };

  const commitEdit = (r, c, rawValue) => {
    const next = normalizeCellValue(rawValue ?? "");
    onEditCell(r, c, next);
  };

  const Cell = ({ columnIndex, rowIndex, style }) => {
    if (rowIndex === 0 && columnIndex === 0) {
      return <div className="cell header corner" style={style} />;
    }
    if (rowIndex === 0) {
      const col = min_c + (columnIndex - 1);
      return (
        <div className="cell header colHeader" style={style}>
          {colToLabel(col)}
        </div>
      );
    }
    if (columnIndex === 0) {
      const row = min_r + (rowIndex - 1);
      return (
        <div className="cell rowHeader" style={style}>
          {row}
        </div>
      );
    }

    const r = min_r + (rowIndex - 1);
    const c = min_c + (columnIndex - 1);
    const raw = getCellRaw(r, c);
    const headerText = getCellRaw(headerRow, c);
    const isSelected = r === selectedR && c === selectedC;
    const isEditing = editing?.r === r && editing?.c === c;
    const isNumber = typeof raw === "number";
    const displayValue = isNumber ? formatNumber(raw, headerText) : cellToString(raw);

    return (
      <div
        className={`cell editable ${isSelected ? "selected" : ""} ${isNumber ? "num" : ""}`}
        style={style}
        tabIndex={0}
        onClick={() => setSelected({ r, c })}
        onDoubleClick={() => {
          setSelected({ r, c });
          setEditing({ r, c });
        }}
        onKeyDown={(e) => {
          if (isEditing) return;
          if (e.key === "ArrowUp") {
            e.preventDefault();
            moveSelection(-1, 0);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            moveSelection(1, 0);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            moveSelection(0, -1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            moveSelection(0, 1);
          } else if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            setEditing({ r, c });
          }
        }}
      >
        {isEditing ? (
          <input
            className="cellInput"
            autoFocus
            defaultValue={cellToString(raw)}
            onBlur={(e) => {
              commitEdit(r, c, e.currentTarget.value);
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitEdit(r, c, e.currentTarget.value);
                setEditing(null);
                moveSelection(1, 0);
              } else if (e.key === "Escape") {
                setEditing(null);
              }
            }}
          />
        ) : (
          displayValue
        )}
      </div>
    );
  };

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <div className="formulaBar">
        <div className="nameBox">{`${colToLabel(selectedC)}${selectedR}`}</div>
        <input
          className="formulaInput"
          value={formulaDraft}
          onChange={(e) => setFormulaDraft(e.currentTarget.value)}
          onFocus={() => setEditing({ r: selectedR, c: selectedC })}
          onBlur={() => {
            commitEdit(selectedR, selectedC, formulaDraft);
            setEditing(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitEdit(selectedR, selectedC, formulaDraft);
              setEditing(null);
            }
          }}
        />
      </div>
      <Grid
        ref={gridRef}
        columnCount={colCount}
        rowCount={rowCount}
        columnWidth={(i) => (i === 0 ? ROW_HEADER_WIDTH : COL_WIDTH)}
        rowHeight={(i) => (i === 0 ? COL_HEADER_HEIGHT : ROW_HEIGHT)}
        width={Math.min(window.innerWidth - 32, 1100)}
        height={Math.min(window.innerHeight - 250, 680)}
      >
        {Cell}
      </Grid>
      <div className="muted" style={{ marginTop: 10 }}>
        Use arrow keys to move, Enter or double-click to edit, and Save to persist changes.
      </div>
    </div>
  );
}
