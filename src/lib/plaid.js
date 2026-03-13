import { auth } from "./firebase";

let plaidLoader = null;

function loadPlaidScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plaid Link is only available in the browser."));
  }
  if (window.Plaid) return Promise.resolve(window.Plaid);
  if (plaidLoader) return plaidLoader;

  plaidLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-plaid-link="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Plaid), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Plaid Link.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaidLink = "true";
    script.onload = () => resolve(window.Plaid);
    script.onerror = () => reject(new Error("Failed to load Plaid Link."));
    document.head.appendChild(script);
  });

  return plaidLoader;
}

async function callHttpFunction(name, payload = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to connect a bank account.");
  }

  const idToken = await currentUser.getIdToken();
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const emulatorHost = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST;
  const url = emulatorHost
    ? `http://${emulatorHost}/${projectId}/${region}/${name}`
    : `https://${region}-${projectId}.cloudfunctions.net/${name}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

export function createLinkToken() {
  return callHttpFunction("createLinkTokenHttp");
}

export function exchangePublicToken(publicToken, metadata) {
  return callHttpFunction("exchangePublicTokenHttp", { publicToken, metadata });
}

export function syncPlaidAccounts(plaidItemId) {
  return callHttpFunction("syncPlaidAccountsHttp", { plaidItemId });
}

export function syncPlaidTransactions(plaidItemId) {
  return callHttpFunction("syncPlaidTransactionsHttp", plaidItemId ? { plaidItemId } : {});
}

export async function openPlaidLink(linkToken) {
  // Plaid Link is loaded on demand so the rest of the app stays client-only until
  // the user explicitly chooses to connect an institution.
  const Plaid = await loadPlaidScript();
  return new Promise((resolve, reject) => {
    let settled = false;

    const handler = Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        settled = true;
        resolve({ publicToken, metadata });
      },
      onExit: (error) => {
        if (settled) return;
        if (error) {
          reject(new Error(error.display_message || error.error_message || "Plaid Link was closed."));
          return;
        }
        reject(new Error("Plaid Link was closed before completion."));
      },
    });

    handler.open();
  });
}

// Backward-compatible aliases while the app transitions to the MVP naming.
export const createPlaidLinkToken = createLinkToken;
export const exchangePlaidPublicToken = exchangePublicToken;
