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

const missingRequired = requiredEnvVars.filter((key) => {
  const value = String(import.meta.env[key] || "").trim();
  return !value || value === "...";
});

export const firebaseInitError = missingRequired.length
  ? `Missing Firebase env vars: ${missingRequired.join(", ")}. Update .env.local in the project root and restart the dev server.`
  : "";

let app = null;
let auth = null;
let db = null;
let functions = null;
let googleProvider = null;

if (!firebaseInitError) {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1");
  googleProvider = new GoogleAuthProvider();

  if (import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST) {
    const [host, rawPort] = String(import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST).split(":");
    connectFunctionsEmulator(functions, host, Number(rawPort || 5001));
  }
}

export { app, auth, db, functions, googleProvider };
