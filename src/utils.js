export function colToLabel(colNumber1Based) {
  // 1 -> A, 26 -> Z, 27 -> AA
  let n = colNumber1Based;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function normalizeCellValue(v) {
  // Keep numbers as numbers when possible
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return "";
  const str = String(v);
  // If user types a number, store as number
  const num = Number(str);
  if (str.trim() !== "" && !Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(str.trim())) return num;
  return str;
}

export function keyRC(r, c) {
  return `${r},${c}`;
}
