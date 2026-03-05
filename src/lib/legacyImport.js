import seedSheets from "../seed/seedSheets.json";
import { safeNumber } from "./finance";

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function readCellMap(sheet) {
  return sheet?.cells || {};
}

function getCell(cells, r, c) {
  return cells?.[`${r},${c}`];
}

function findSheet(name) {
  return seedSheets.find((s) => String(s.name || "").toLowerCase() === name.toLowerCase()) || null;
}

function parseCreditCards() {
  const sheet = findSheet("Credit Cards");
  if (!sheet) return [];
  const cells = readCellMap(sheet);
  const out = [];

  for (let r = (sheet.bounds?.min_r || 1) + 1; r <= (sheet.bounds?.max_r || 1); r += 1) {
    const name = getCell(cells, r, 2);
    if (!name || typeof name !== "string") continue;
    const limit = safeNumber(getCell(cells, r, 3), 0);
    const balanceRaw = safeNumber(getCell(cells, r, 5), 0);
    const aprRaw = safeNumber(getCell(cells, r, 6), 0);
    const minimum = Math.abs(safeNumber(getCell(cells, r, 8), 0));

    out.push({
      id: `legacy-card-${slugify(name)}`,
      name: String(name),
      issuer: "",
      limit: Math.abs(limit),
      balance: Math.abs(balanceRaw),
      apr: aprRaw <= 1 ? aprRaw * 100 : aprRaw,
      minimumPayment: minimum || 0,
      dueDay: null,
      source: "legacy",
    });
  }
  return dedupeById(out);
}

function parseMonthlyBills() {
  const sheet = findSheet("Monthly Bills");
  if (!sheet) return { bills: [], income: [] };
  const cells = readCellMap(sheet);
  const minR = sheet.bounds?.min_r || 1;
  const maxR = sheet.bounds?.max_r || minR;
  const minC = sheet.bounds?.min_c || 1;
  const maxC = sheet.bounds?.max_c || minC;

  let headerRow = minR;
  let nameCol = 2;
  let amountCol = 3;
  let dueDayCol = 4;
  let categoryCol = 5;

  for (let r = minR; r <= Math.min(minR + 8, maxR); r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      const v = String(getCell(cells, r, c) || "").toLowerCase();
      if (v.includes("bill") || v.includes("name")) {
        headerRow = r;
        nameCol = c;
      }
      if (v.includes("amount")) amountCol = c;
      if (v.includes("due")) dueDayCol = c;
      if (v.includes("category")) categoryCol = c;
    }
  }

  const bills = [];
  const income = [];

  for (let r = headerRow + 1; r <= maxR; r += 1) {
    const name = getCell(cells, r, nameCol);
    if (!name || typeof name !== "string") continue;
    const amount = safeNumber(getCell(cells, r, amountCol), 0);
    const dueRaw = safeNumber(getCell(cells, r, dueDayCol), 1);
    const category = String(getCell(cells, r, categoryCol) || "").trim();
    const lower = name.toLowerCase();

    if (
      lower.includes("paycheck") ||
      lower.includes("income") ||
      lower.includes("salary") ||
      lower.includes("bah")
    ) {
      income.push({
        id: `legacy-income-${slugify(name)}`,
        name: String(name),
        expectedAmount: Math.abs(amount),
        paySchedule: "monthly",
        nextPayDate: new Date(new Date().getFullYear(), new Date().getMonth(), Math.max(1, Math.min(28, dueRaw)))
          .toISOString()
          .slice(0, 10),
        depositAccountId: "",
        source: "legacy",
      });
    } else {
      bills.push({
        id: `legacy-bill-${slugify(name)}`,
        name: String(name),
        amount: Math.abs(amount),
        dueDay: Math.max(1, Math.min(31, dueRaw)),
        category: category || "General",
        autopay: false,
        accountId: "",
        notes: "Imported from legacy spreadsheet snapshot",
        source: "legacy",
      });
    }
  }

  return { bills: dedupeById(bills), income: dedupeById(income) };
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function parseLegacySnapshot() {
  const creditCards = parseCreditCards();
  const { bills, income } = parseMonthlyBills();
  return { creditCards, bills, income };
}
