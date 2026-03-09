import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { getFirestore } from "firebase/firestore";

const requiredEnvVars = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

const missingRequired = requiredEnvVars.filter((key) => !import.meta.env[key]);
if (missingRequired.length > 0) {
  throw new Error("Missing Firebase env vars. Check .env.local in the project root and restart the dev server.");
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1");
export const googleProvider = new GoogleAuthProvider();

if (import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST) {
  const [host, rawPort] = String(import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST).split(":");
  connectFunctionsEmulator(functions, host, Number(rawPort || 5001));
}
