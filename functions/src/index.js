import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  countUserCollection,
  getAllPrivateItems,
  getPrivateItemByPlaidItemId,
  getUserPrivateItems,
  loadPrivateItem,
  refreshRecurringPayments,
  syncLinkedAccounts,
  syncTransactionsPage,
  updateSyncState,
  writePlaidItemMetadata,
  writePrivateItem,
} from "./firestore.js";
import {
  getPlaidClient,
  getPlaidCountryCodes,
  getPlaidProducts,
  normalizeInstitutionName,
} from "./plaid.js";

initializeApp();

const PLAID_CLIENT_ID = defineSecret("PLAID_CLIENT_ID");
const PLAID_SECRET = defineSecret("PLAID_SECRET");
const ALLOWED_ORIGINS = new Set([
  "https://burgosaxel.github.io",
  "http://localhost:5173",
  "http://localhost:3000",
]);
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to use Plaid features.");
  }
  return uid;
}

async function requireHttpAuth(request) {
  const authHeader = request.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpsError("unauthenticated", "Missing Firebase auth token.");
  }
  const decoded = await getAuth().verifyIdToken(match[1]);
  if (!decoded?.uid) {
    throw new HttpsError("unauthenticated", "Invalid Firebase auth token.");
  }
  return decoded.uid;
}

function sendHttpError(response, error) {
  logger.error("Plaid HTTP function failed", {
    message: error?.message || "Unexpected error.",
    code: error?.code || null,
    stack: error?.stack || null,
    plaidError: error?.response?.data || null,
  });
  const status =
    error?.code === "unauthenticated"
      ? 401
      : error?.code === "invalid-argument"
        ? 400
        : error?.code === "failed-precondition"
          ? 412
          : error?.response?.status || error?.statusCode || error?.status || 500;
  response.status(status).json({
    error:
      error?.response?.data?.error_message ||
      error?.message ||
      "Unexpected error.",
  });
}

function applyCors(request, response) {
  const origin = request.headers.origin || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://burgosaxel.github.io";
  response.set("Access-Control-Allow-Origin", allowOrigin);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => response.set(key, value));
}

function parseBody(request) {
  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }
  return request.body || {};
}

async function getClient() {
  const clientId = PLAID_CLIENT_ID.value();
  const secret = PLAID_SECRET.value();
  if (!clientId || !secret) {
    throw new HttpsError(
      "failed-precondition",
      "Plaid secrets are not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in Functions secrets."
    );
  }
  return getPlaidClient(clientId, secret);
}

async function setPlaidSyncState(uid, payload) {
  await updateSyncState(uid, payload);
  logger.info("Plaid syncState updated", {
    uid,
    syncStatePath: `users/${uid}/syncState/plaid`,
    ...payload,
  });
}

async function fetchInstitutionName(client, institutionId) {
  if (!institutionId) return "Linked institution";
  try {
    const response = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: getPlaidCountryCodes(),
    });
    return normalizeInstitutionName({ institution: response.data.institution });
  } catch (error) {
    logger.warn("Unable to resolve institution name", { institutionId, error: error.message });
    return "Linked institution";
  }
}

async function syncPlaidAccountsForItem({ uid, plaidItemId, accessToken, client }) {
  logger.info("Plaid account fetch started", { uid, plaidItemId });
  const accountsResponse = await client.accountsGet({ access_token: accessToken });
  const itemResponse = await client.itemGet({ access_token: accessToken });
  const institutionName = await fetchInstitutionName(client, itemResponse.data.item.institution_id);

  await syncLinkedAccounts(uid, plaidItemId, { institutionName }, accountsResponse.data.accounts);
  await writePlaidItemMetadata(uid, plaidItemId, {
    institutionId: itemResponse.data.item.institution_id || "",
    institutionName,
    status: "syncing",
    lastSyncAt: new Date().toISOString(),
  });
  await writePrivateItem(uid, plaidItemId, {
    institutionId: itemResponse.data.item.institution_id || "",
    institutionName,
    status: "syncing",
    lastSyncAt: new Date().toISOString(),
  });
  logger.info("Plaid account fetch succeeded", {
    uid,
    plaidItemId,
    institutionName,
    accountCount: accountsResponse.data.accounts.length,
    firestorePath: `users/${uid}/linkedAccounts/{accountId}`,
  });

  return {
    institutionName,
    accountCount: accountsResponse.data.accounts.length,
    accounts: accountsResponse.data.accounts,
  };
}

async function syncPlaidTransactionsForItem({ uid, plaidItemId, accessToken, client }) {
  // The transaction cursor is stored server-side and mirrored to public item metadata so
  // future syncs can stay incremental without exposing the Plaid access token to the client.
  logger.info("Plaid transaction sync started", { uid, plaidItemId });
  const privateItem = await loadPrivateItem(uid, plaidItemId);
  const linkedAccountDocs = await syncPlaidAccountsForItem({ uid, plaidItemId, accessToken, client });
  const accountMap = new Map(
    linkedAccountDocs.accounts.map((account) => [
      account.account_id,
      {
        institutionName: linkedAccountDocs.institutionName,
      },
    ])
  );

  let cursor = privateItem?.lastCursor || null;
  let hasMore = true;
  let totals = { added: 0, modified: 0, removed: 0 };

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor,
    });
    const page = response.data;
    await syncTransactionsPage(uid, plaidItemId, accountMap, page);
    logger.info("Plaid transaction page synced", {
      uid,
      plaidItemId,
      added: page.added?.length || 0,
      modified: page.modified?.length || 0,
      removed: page.removed?.length || 0,
      nextCursor: page.next_cursor || "",
      hasMore: Boolean(page.has_more),
    });

    totals = {
      added: totals.added + (page.added?.length || 0),
      modified: totals.modified + (page.modified?.length || 0),
      removed: totals.removed + (page.removed?.length || 0),
    };
    cursor = page.next_cursor;
    hasMore = Boolean(page.has_more);
  }

  await writePlaidItemMetadata(uid, plaidItemId, {
    status: "synced",
    lastCursor: cursor || "",
    lastSyncAt: new Date().toISOString(),
  });
  await writePrivateItem(uid, plaidItemId, {
    lastCursor: cursor || "",
    lastSyncAt: new Date().toISOString(),
    status: "synced",
  });

  await refreshRecurringPayments(uid);
  await setPlaidSyncState(uid, {
    lastGlobalSyncAt: new Date().toISOString(),
    syncStatus: "synced",
    lastError: "",
    itemCount: (await getUserPrivateItems(uid)).length,
    accountCount: await countUserCollection(uid, "linkedAccounts"),
    transactionCount: await countUserCollection(uid, "transactions"),
  });
  logger.info("Plaid transaction sync succeeded", {
    uid,
    plaidItemId,
    added: totals.added,
    modified: totals.modified,
    removed: totals.removed,
    lastCursor: cursor || "",
    transactionPath: `users/${uid}/transactions/{transactionId}`,
    syncStatePath: `users/${uid}/syncState/plaid`,
  });

  return {
    institutionName: linkedAccountDocs.institutionName,
    accountCount: linkedAccountDocs.accountCount,
    ...totals,
  };
}

async function recordSyncFailure(uid, plaidItemId, error, stage = "sync") {
  const message =
    error?.response?.data?.error_message ||
    error?.message ||
    "Plaid sync failed.";

  await writePlaidItemMetadata(uid, plaidItemId, {
    status: "error",
    lastError: message,
    lastSyncAt: new Date().toISOString(),
  });
  await writePrivateItem(uid, plaidItemId, {
    status: "error",
    lastError: message,
    lastSyncAt: new Date().toISOString(),
  });
  await setPlaidSyncState(uid, {
    syncStatus: "error",
    lastError: message,
    itemCount: (await getUserPrivateItems(uid)).length,
    accountCount: await countUserCollection(uid, "linkedAccounts"),
    transactionCount: await countUserCollection(uid, "transactions"),
  });
  logger.error("Plaid sync failed", {
    uid,
    plaidItemId,
    stage,
    message,
    code: error?.code || null,
    plaidError: error?.response?.data || null,
  });
  return message;
}

async function syncAllItemsForUser(uid) {
  const client = await getClient();
  const items = await getUserPrivateItems(uid);
  const summaries = [];
  for (const item of items) {
    if (!item.accessToken || item.status === "error") continue;
    const result = await syncPlaidTransactionsForItem({
      uid,
      plaidItemId: item.plaidItemId,
      accessToken: item.accessToken,
      client,
    });
    summaries.push({ plaidItemId: item.plaidItemId, ...result });
  }
  return summaries;
}

async function createLinkTokenHandler(request) {
  const uid = requireAuth(request);
  const client = await getClient();
  logger.info("Plaid link token create started", { uid });

  const response = await client.linkTokenCreate({
    user: {
      client_user_id: uid,
    },
    client_name: "BudgetCommand",
    language: "en",
    products: getPlaidProducts(),
    country_codes: getPlaidCountryCodes(),
    redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    webhook: process.env.PLAID_WEBHOOK_URL || undefined,
  });
  logger.info("Plaid link token create succeeded", { uid, expiration: response.data.expiration });

  return { linkToken: response.data.link_token, expiration: response.data.expiration };
}

async function exchangePublicTokenHandler(request) {
  const uid = requireAuth(request);
  const publicToken = request.data?.publicToken;
  if (!publicToken) {
    throw new HttpsError("invalid-argument", "Missing Plaid public token.");
  }

  logger.info("Plaid public token exchange started", { uid });
  const client = await getClient();
  const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
  const plaidItemId = exchange.data.item_id;
  const accessToken = exchange.data.access_token;
  const institutionName = request.data?.metadata?.institution?.name || null;
  const linkedAt = new Date().toISOString();
  logger.info("Plaid public token exchange succeeded", {
    uid,
    plaidItemId,
    institutionName,
  });
  await setPlaidSyncState(uid, {
    syncStatus: "linking",
    lastError: "",
    itemCount: (await getUserPrivateItems(uid)).length,
    accountCount: await countUserCollection(uid, "linkedAccounts"),
    transactionCount: await countUserCollection(uid, "transactions"),
  });

  // Access tokens stay in a backend-only collection outside /users/{uid}/...
  // so the frontend can never read or leak them through Firestore rules.
  await writePrivateItem(uid, plaidItemId, {
    uid,
    accessToken,
    plaidItemId,
    status: "linking",
    institutionName,
    lastSyncAt: null,
  });
  logger.info("Plaid private item stored", {
    uid,
    plaidItemId,
    firestorePath: `plaidPrivateItems/${uid}_${plaidItemId}`,
  });
  await writePlaidItemMetadata(uid, plaidItemId, {
    itemId: plaidItemId,
    plaidItemId,
    institutionId: "",
    institutionName,
    institution: institutionName,
    status: "linked",
    lastCursor: "",
    lastSyncAt: null,
    linkedAt,
  });
  logger.info("Plaid public item stored", {
    uid,
    plaidItemId,
    firestorePath: `users/${uid}/plaidItems/${plaidItemId}`,
  });
  await setPlaidSyncState(uid, {
    syncStatus: "linked",
    lastError: "",
    itemCount: (await getUserPrivateItems(uid)).length,
    accountCount: await countUserCollection(uid, "linkedAccounts"),
    transactionCount: await countUserCollection(uid, "transactions"),
  });

  const result = {
    plaidItemId,
    institutionName,
    connected: true,
    accountSync: {
      success: false,
      accountCount: 0,
      error: "",
    },
    transactionSync: {
      success: false,
      added: 0,
      modified: 0,
      removed: 0,
      error: "",
    },
  };

  try {
    await setPlaidSyncState(uid, {
      syncStatus: "syncing",
      lastError: "",
      itemCount: (await getUserPrivateItems(uid)).length,
      accountCount: await countUserCollection(uid, "linkedAccounts"),
      transactionCount: await countUserCollection(uid, "transactions"),
    });
    const accountSummary = await syncPlaidAccountsForItem({
      uid,
      plaidItemId,
      accessToken,
      client,
    });
    result.accountSync = {
      success: true,
      accountCount: accountSummary.accountCount,
      error: "",
    };
  } catch (error) {
    result.accountSync.error = await recordSyncFailure(uid, plaidItemId, error, "accounts");
    return result;
  }

  try {
    const syncSummary = await syncPlaidTransactionsForItem({
      uid,
      plaidItemId,
      accessToken,
      client,
    });
    result.transactionSync = {
      success: true,
      added: syncSummary.added || 0,
      modified: syncSummary.modified || 0,
      removed: syncSummary.removed || 0,
      error: "",
    };
  } catch (error) {
    result.transactionSync.error = await recordSyncFailure(uid, plaidItemId, error, "transactions");
    return result;
  }

  return result;
}

export const createLinkTokenHttp = onRequest(
  {
    region: "us-central1",
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request, response) => {
    applyCors(request, response);
    logger.info("Plaid HTTP request received", {
      handler: "createLinkTokenHttp",
      origin: request.headers.origin || "",
      method: request.method,
    });
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    try {
      const uid = await requireHttpAuth(request);
      logger.info("Plaid HTTP auth resolved", {
        handler: "createLinkTokenHttp",
        uid,
        origin: request.headers.origin || "",
      });
      const result = await createLinkTokenHandler({ auth: { uid } });
      response.status(200).json(result);
    } catch (error) {
      sendHttpError(response, error);
    }
  }
);

export const createLinkToken = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  createLinkTokenHandler
);

export const createPlaidLinkToken = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  createLinkTokenHandler
);

export const exchangePublicTokenHttp = onRequest(
  {
    region: "us-central1",
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request, response) => {
    applyCors(request, response);
    logger.info("Plaid HTTP request received", {
      handler: "exchangePublicTokenHttp",
      origin: request.headers.origin || "",
      method: request.method,
    });
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    try {
      const uid = await requireHttpAuth(request);
      logger.info("Plaid HTTP auth resolved", {
        handler: "exchangePublicTokenHttp",
        uid,
        origin: request.headers.origin || "",
      });
      const data = parseBody(request);
      const result = await exchangePublicTokenHandler({
        auth: { uid },
        data,
      });
      response.status(200).json(result);
    } catch (error) {
      sendHttpError(response, error);
    }
  }
);

async function syncPlaidTransactionsHandler(request) {
  const uid = requireAuth(request);
  const plaidItemId = request.data?.plaidItemId;
  const client = await getClient();

  logger.info("Plaid sync handler started", {
    uid,
    plaidItemId: plaidItemId || "all",
  });

  try {
    if (!plaidItemId) {
      const summaries = await syncAllItemsForUser(uid);
      logger.info("Plaid sync handler succeeded", {
        uid,
        plaidItemId: "all",
        itemCount: summaries.length,
      });
      return { syncedAll: true, items: summaries };
    }

    const privateItem = await loadPrivateItem(uid, plaidItemId);
    if (!privateItem?.accessToken) {
      throw new HttpsError("not-found", "Linked Plaid item not found.");
    }

    const result = await syncPlaidTransactionsForItem({
      uid,
      plaidItemId,
      accessToken: privateItem.accessToken,
      client,
    });
    logger.info("Plaid sync handler succeeded", {
      uid,
      plaidItemId,
      added: result.added || 0,
      modified: result.modified || 0,
      removed: result.removed || 0,
    });
    return { syncedAll: false, plaidItemId, ...result };
  } catch (error) {
    if (plaidItemId) {
      await recordSyncFailure(uid, plaidItemId, error, "transactions");
    } else {
      await setPlaidSyncState(uid, {
        syncStatus: "error",
        lastError:
          error?.response?.data?.error_message ||
          error?.message ||
          "Plaid sync failed.",
        itemCount: (await getUserPrivateItems(uid)).length,
        accountCount: await countUserCollection(uid, "linkedAccounts"),
        transactionCount: await countUserCollection(uid, "transactions"),
      });
    }
    throw error;
  }
}

export const syncPlaidTransactionsHttp = onRequest(
  {
    region: "us-central1",
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request, response) => {
    applyCors(request, response);
    logger.info("Plaid HTTP request received", {
      handler: "syncPlaidTransactionsHttp",
      origin: request.headers.origin || "",
      method: request.method,
    });
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    try {
      const uid = await requireHttpAuth(request);
      logger.info("Plaid HTTP auth resolved", {
        handler: "syncPlaidTransactionsHttp",
        uid,
        origin: request.headers.origin || "",
      });
      const data = parseBody(request);
      const result = await syncPlaidTransactionsHandler({
        auth: { uid },
        data,
      });
      response.status(200).json(result);
    } catch (error) {
      sendHttpError(response, error);
    }
  }
);

async function analyzeRecurringPaymentsHandler(request) {
  const uid = requireAuth(request);
  logger.info("Recurring analysis requested", { uid });
  const result = await refreshRecurringPayments(uid);
  logger.info("Recurring analysis completed", { uid, ...result });
  return result;
}

export const analyzeRecurringPaymentsHttp = onRequest(
  {
    region: "us-central1",
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request, response) => {
    applyCors(request, response);
    logger.info("Plaid HTTP request received", {
      handler: "analyzeRecurringPaymentsHttp",
      origin: request.headers.origin || "",
      method: request.method,
    });
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    try {
      const uid = await requireHttpAuth(request);
      logger.info("Plaid HTTP auth resolved", {
        handler: "analyzeRecurringPaymentsHttp",
        uid,
        origin: request.headers.origin || "",
      });
      const result = await analyzeRecurringPaymentsHandler({ auth: { uid } });
      response.status(200).json(result);
    } catch (error) {
      sendHttpError(response, error);
    }
  }
);

export const analyzeRecurringPayments = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  analyzeRecurringPaymentsHandler
);

export const exchangePublicToken = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  exchangePublicTokenHandler
);

export const exchangePlaidPublicToken = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  exchangePublicTokenHandler
);

export const syncPlaidAccounts = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request) => {
    const uid = requireAuth(request);
    const plaidItemId = request.data?.plaidItemId;
    if (!plaidItemId) {
      throw new HttpsError("invalid-argument", "Missing plaidItemId.");
    }

    const privateItem = await loadPrivateItem(uid, plaidItemId);
    if (!privateItem?.accessToken) {
      throw new HttpsError("not-found", "Linked Plaid item not found.");
    }

    const client = await getClient();
    try {
      logger.info("Manual Plaid account sync requested", { uid, plaidItemId });
      await setPlaidSyncState(uid, {
        syncStatus: "syncing",
        lastError: "",
        itemCount: (await getUserPrivateItems(uid)).length,
        accountCount: await countUserCollection(uid, "linkedAccounts"),
        transactionCount: await countUserCollection(uid, "transactions"),
      });
      const result = await syncPlaidAccountsForItem({
        uid,
        plaidItemId,
        accessToken: privateItem.accessToken,
        client,
      });

      await setPlaidSyncState(uid, {
        lastGlobalSyncAt: new Date().toISOString(),
        syncStatus: "synced",
        lastError: "",
        itemCount: (await getUserPrivateItems(uid)).length,
        accountCount: await countUserCollection(uid, "linkedAccounts"),
        transactionCount: await countUserCollection(uid, "transactions"),
      });

      return {
        plaidItemId,
        institutionName: result.institutionName,
        accountCount: result.accountCount,
      };
    } catch (error) {
      await recordSyncFailure(uid, plaidItemId, error, "accounts");
      throw error;
    }
  }
);

export const syncPlaidAccountsHttp = onRequest(
  {
    region: "us-central1",
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request, response) => {
    applyCors(request, response);
    logger.info("Plaid HTTP request received", {
      handler: "syncPlaidAccountsHttp",
      origin: request.headers.origin || "",
      method: request.method,
    });
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    try {
      const uid = await requireHttpAuth(request);
      logger.info("Plaid HTTP auth resolved", {
        handler: "syncPlaidAccountsHttp",
        uid,
        origin: request.headers.origin || "",
      });
      const result = await (async () => {
        const plaidItemId = parseBody(request)?.plaidItemId;
        if (!plaidItemId) {
          throw new HttpsError("invalid-argument", "Missing plaidItemId.");
        }

        const privateItem = await loadPrivateItem(uid, plaidItemId);
        if (!privateItem?.accessToken) {
          throw new HttpsError("not-found", "Linked Plaid item not found.");
        }

        const client = await getClient();
        logger.info("Manual Plaid account sync requested", { uid, plaidItemId });
        await setPlaidSyncState(uid, {
          syncStatus: "syncing",
          lastError: "",
          itemCount: (await getUserPrivateItems(uid)).length,
          accountCount: await countUserCollection(uid, "linkedAccounts"),
          transactionCount: await countUserCollection(uid, "transactions"),
        });
        const summary = await syncPlaidAccountsForItem({
          uid,
          plaidItemId,
          accessToken: privateItem.accessToken,
          client,
        });
        await setPlaidSyncState(uid, {
          lastGlobalSyncAt: new Date().toISOString(),
          syncStatus: "synced",
          lastError: "",
          itemCount: (await getUserPrivateItems(uid)).length,
          accountCount: await countUserCollection(uid, "linkedAccounts"),
          transactionCount: await countUserCollection(uid, "transactions"),
        });
        return {
          plaidItemId,
          institutionName: summary.institutionName,
          accountCount: summary.accountCount,
        };
      })();
      response.status(200).json(result);
    } catch (error) {
      sendHttpError(response, error);
    }
  }
);

export const syncPlaidTransactions = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  syncPlaidTransactionsHandler
);

export const plaidWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request, response) => {
    try {
      const plaidItemId = request.body?.item_id;
      if (!plaidItemId) {
        response.status(200).send("ignored");
        return;
      }

      const privateItem = await getPrivateItemByPlaidItemId(plaidItemId);
      if (!privateItem?.uid || !privateItem?.accessToken) {
        response.status(200).send("missing-item");
        return;
      }

      const webhookCode = request.body?.webhook_code || "";
      const webhookType = request.body?.webhook_type || "";
      logger.info("Plaid webhook received", { webhookType, webhookCode, plaidItemId });

      if (
        webhookType === "TRANSACTIONS" &&
        ["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"].includes(
          webhookCode
        )
      ) {
        const client = await getClient();
        await syncPlaidTransactionsForItem({
          uid: privateItem.uid,
          plaidItemId,
          accessToken: privateItem.accessToken,
          client,
        });
      }

      response.status(200).send("ok");
    } catch (error) {
      logger.error("Plaid webhook failed", error);
      response.status(500).send("error");
    }
  }
);

export const scheduledPlaidSync = onSchedule(
  {
    region: "us-central1",
    schedule: "every 6 hours",
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async () => {
    const client = await getClient();
    const items = await getAllPrivateItems();
    for (const item of items) {
      if (!item.uid || !item.accessToken) continue;
      try {
        await syncPlaidTransactionsForItem({
          uid: item.uid,
          plaidItemId: item.plaidItemId,
          accessToken: item.accessToken,
          client,
        });
      } catch (error) {
        logger.error("Scheduled Plaid sync failed", {
          uid: item.uid,
          plaidItemId: item.plaidItemId,
          error: error.message,
        });
        await updateSyncState(item.uid, {
          syncStatus: "error",
          lastError: error.message || String(error),
        });
      }
    }
  }
);
