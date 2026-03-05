import seedSheets from "./seed/seedSheets.json";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export function listSeedSheetNames() {
  return seedSheets.map(s => s.name);
}

export function getSeedSheetByName(name) {
  return seedSheets.find(s => s.name === name) || null;
}

export async function loadSheet(uid, name) {
  const ref = doc(db, "users", uid, "sheets", name);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  // Not found: seed it from bundled JSON (your current Excel snapshot)
  const seed = getSeedSheetByName(name);
  if (!seed) throw new Error(`Seed sheet not found: ${name}`);

  const payload = {
    name: seed.name,
    bounds: seed.bounds,
    cells: seed.cells,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  return payload;
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
