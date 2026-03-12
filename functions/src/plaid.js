import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";

function parseCsv(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getPlaidEnvironment(envName) {
  const key = String(envName || "sandbox").toLowerCase();
  return PlaidEnvironments[key] || PlaidEnvironments.sandbox;
}

export function getPlaidProducts() {
  return parseCsv(process.env.PLAID_PRODUCTS, ["transactions"]).map((product) => {
    const normalized = product.toUpperCase();
    return Products[normalized] || product;
  });
}

export function getPlaidCountryCodes() {
  return parseCsv(process.env.PLAID_COUNTRY_CODES, ["US"]).map((code) => {
    const normalized = code.toUpperCase();
    return CountryCode[normalized] || normalized;
  });
}

export function getPlaidClient(clientId, secret) {
  const configuration = new Configuration({
    basePath: getPlaidEnvironment(process.env.PLAID_ENV),
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(configuration);
}

export function normalizeInstitutionName(metadata = {}, fallback = "Linked institution") {
  return metadata.institutionName || metadata.institution?.name || fallback;
}

export function normalizeMerchantName(transaction) {
  return (
    transaction.merchant_name ||
    transaction.name ||
    transaction.original_description ||
    "Unknown merchant"
  );
}

export function normalizeMerchantKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function plaidAmountToSignedAmount(transaction) {
  return -Number(transaction.amount || 0);
}

export function pickCategoryFields(transaction) {
  const categoryPrimary =
    transaction.personal_finance_category?.primary ||
    transaction.category?.[0] ||
    null;
  const categoryDetailed =
    transaction.personal_finance_category?.detailed ||
    transaction.category?.[transaction.category?.length - 1] ||
    null;

  return {
    categoryPrimary,
    categoryDetailed,
    categorySource: transaction.personal_finance_category
      ? "plaid_personal_finance_category"
      : transaction.category?.length
        ? "plaid_category"
        : null,
    personalFinanceCategory: transaction.personal_finance_category || null,
  };
}

export function guessCadence(daysApart) {
  if (!Number.isFinite(daysApart)) return "unknown";
  if (daysApart >= 26 && daysApart <= 33) return "monthly";
  if (daysApart >= 12 && daysApart <= 17) return "semi-monthly";
  if (daysApart >= 6 && daysApart <= 9) return "weekly";
  if (daysApart >= 13 && daysApart <= 15) return "biweekly";
  return "irregular";
}
