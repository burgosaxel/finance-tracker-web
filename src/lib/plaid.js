import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

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

async function callFunction(name, payload = {}) {
  const callable = httpsCallable(functions, name);
  const response = await callable(payload);
  return response.data;
}

export function createPlaidLinkToken() {
  return callFunction("createPlaidLinkToken");
}

export function exchangePlaidPublicToken(publicToken, metadata) {
  return callFunction("exchangePlaidPublicToken", { publicToken, metadata });
}

export function syncPlaidAccounts(plaidItemId) {
  return callFunction("syncPlaidAccounts", { plaidItemId });
}

export function syncPlaidTransactions(plaidItemId) {
  return callFunction("syncPlaidTransactions", plaidItemId ? { plaidItemId } : {});
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
