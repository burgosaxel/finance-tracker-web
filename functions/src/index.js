import { initializeApp } from "firebase-admin/app";
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

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to use Plaid features.");
  }
  return uid;
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
  const accountsResponse = await client.accountsGet({ access_token: accessToken });
  const itemResponse = await client.itemGet({ access_token: accessToken });
  const institutionName = await fetchInstitutionName(client, itemResponse.data.item.institution_id);

  await syncLinkedAccounts(uid, plaidItemId, { institutionName }, accountsResponse.data.accounts);
  await writePlaidItemMetadata(uid, plaidItemId, {
    institutionId: itemResponse.data.item.institution_id || "",
    institutionName,
    status: "linked",
    lastSyncAt: new Date().toISOString(),
  });
  await writePrivateItem(uid, plaidItemId, {
    institutionId: itemResponse.data.item.institution_id || "",
    institutionName,
    status: "linked",
    lastSyncAt: new Date().toISOString(),
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

    totals = {
      added: totals.added + (page.added?.length || 0),
      modified: totals.modified + (page.modified?.length || 0),
      removed: totals.removed + (page.removed?.length || 0),
    };
    cursor = page.next_cursor;
    hasMore = Boolean(page.has_more);
  }

  await writePlaidItemMetadata(uid, plaidItemId, {
    status: "linked",
    lastCursor: cursor || "",
    lastSyncAt: new Date().toISOString(),
  });
  await writePrivateItem(uid, plaidItemId, {
    lastCursor: cursor || "",
    lastSyncAt: new Date().toISOString(),
    status: "linked",
  });

  await refreshRecurringPayments(uid);
  await updateSyncState(uid, {
    lastGlobalSyncAt: new Date().toISOString(),
    syncStatus: "ok",
    lastError: "",
    itemCount: (await getUserPrivateItems(uid)).length,
    accountCount: await countUserCollection(uid, "linkedAccounts"),
    transactionCount: await countUserCollection(uid, "transactions"),
  });

  return totals;
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

  return { linkToken: response.data.link_token, expiration: response.data.expiration };
}

async function exchangePublicTokenHandler(request) {
  const uid = requireAuth(request);
  const publicToken = request.data?.publicToken;
  if (!publicToken) {
    throw new HttpsError("invalid-argument", "Missing Plaid public token.");
  }

  const client = await getClient();
  const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
  const plaidItemId = exchange.data.item_id;
  const accessToken = exchange.data.access_token;
  const institutionName = request.data?.metadata?.institution?.name || null;
  const linkedAt = new Date().toISOString();

  // Access tokens stay in a backend-only collection outside /users/{uid}/...
  // so the frontend can never read or leak them through Firestore rules.
  await writePrivateItem(uid, plaidItemId, {
    uid,
    accessToken,
    plaidItemId,
    status: "linked",
    institutionName,
    lastSyncAt: null,
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

  return {
    plaidItemId,
    institutionName,
    connected: true,
  };
}

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
    const result = await syncPlaidAccountsForItem({
      uid,
      plaidItemId,
      accessToken: privateItem.accessToken,
      client,
    });

    return {
      plaidItemId,
      institutionName: result.institutionName,
      accountCount: result.accountCount,
    };
  }
);

export const syncPlaidTransactions = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET],
  },
  async (request) => {
    const uid = requireAuth(request);
    const plaidItemId = request.data?.plaidItemId;
    const client = await getClient();

    if (!plaidItemId) {
      const summaries = await syncAllItemsForUser(uid);
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
    return { syncedAll: false, plaidItemId, ...result };
  }
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
