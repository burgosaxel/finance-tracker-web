import seedSheets from "./seed/seedSheets.json";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export function listSeedSheetNames() {
  return seedSheets.map(s => s.name);
}

export function getSeedSheetByName(name) {
  return seedSheets.find(s => s.name === name) || null;
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeSheet(name, raw, seed) {
  const cells = raw?.cells && typeof raw.cells === "object" ? raw.cells : (seed?.cells || {});
  const seedBounds = seed?.bounds || {};
  const rawBounds = raw?.bounds || {};

  const min_r = toInt(rawBounds.min_r, toInt(seedBounds.min_r, 1));
  const max_r = toInt(rawBounds.max_r, toInt(seedBounds.max_r, min_r));
  const min_c = toInt(rawBounds.min_c, toInt(seedBounds.min_c, 1));
  const max_c = toInt(rawBounds.max_c, toInt(seedBounds.max_c, min_c));

  return {
    ...raw,
    name: raw?.name || name,
    bounds: {
      min_r: Math.min(min_r, max_r),
      max_r: Math.max(min_r, max_r),
      min_c: Math.min(min_c, max_c),
      max_c: Math.max(min_c, max_c),
    },
    cells,
  };
}

export async function loadSheet(uid, name) {
  const ref = doc(db, "users", uid, "sheets", name);
  const snap = await getDoc(ref);
  const seed = getSeedSheetByName(name);
  if (snap.exists()) return normalizeSheet(name, snap.data(), seed);

  // Not found: seed it from bundled JSON (your current Excel snapshot)
  if (!seed) throw new Error(`Seed sheet not found: ${name}`);

  const payload = {
    name: seed.name,
    bounds: seed.bounds,
    cells: seed.cells,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  return normalizeSheet(name, payload, seed);
}

export async function saveSheet(uid, name, sheetData) {
  const ref = doc(db, "users", uid, "sheets", name);
  await setDoc(ref, { ...sheetData, name, updatedAt: serverTimestamp() }, { merge: true });
}

export async function testFirestore(uid) {
  const ref = doc(db, "users", uid, "meta", "healthcheck");
  await setDoc(ref, { ok: true, ts: serverTimestamp() }, { merge: true });
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
