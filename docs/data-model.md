# Firestore Data Model

All user data lives under:

`/users/{uid}/...`

## Collections

### `/users/{uid}/accounts/{accountId}`
- `id: string`
- `name: string`
- `type: "checking" | "savings" | "cash" | "other"`
- `balance: number`
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/linkedAccounts/{accountId}`
- `accountId: string`
- `plaidAccountId: string`
- `itemId: string`
- `institutionName: string`
- `name: string`
- `officialName: string`
- `mask: string`
- `type: string`
- `subtype: string`
- `currentBalance: number`
- `availableBalance: number | null`
- `isoCurrencyCode: string`
- `lastBalanceSyncAt: timestamp`
- `source: "plaid"`
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/creditCards/{cardId}`
- `id: string`
- `name: string`
- `issuer: string`
- `limit: number`
- `balance: number`
- `apr: number` (percent value, example `24.99`)
- `minimumPayment: number`
- `dueDay: number | null`
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/bills/{billId}`
- `id: string`
- `name: string`
- `amount: number`
- `dueDay: number` (1-31)
- `category: string`
- `autopay: boolean`
- `accountId: string`
- `notes: string`
- `lastPaidDate: string` (ISO date `YYYY-MM-DD`)
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/income/{incomeId}`
- `id: string`
- `name: string`
- `expectedAmount: number`
- `paySchedule: "weekly" | "biweekly" | "monthly" | "custom"`
- `nextPayDate: string` (ISO date `YYYY-MM-DD`)
- `depositAccountId: string`
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/transactions/{transactionId}`
- `id: string`
- `date: string` (ISO date `YYYY-MM-DD`)
- `payee: string`
- `category: string`
- `amount: number` (positive inflow, negative outflow)
- `accountId: string`
- `notes: string`
- `billId: string` (optional linkage from mark-paid action)
- `source: "manual" | "plaid"`
- `plaidTransactionId: string`
- `merchantName: string`
- `categoryPrimary: string`
- `categoryDetailed: string`
- `categorySource: string`
- `personalFinanceCategory: object | null`
- `userCategoryOverride: string`
- `recurringCandidate: boolean`
- `removed: boolean`
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/budgets/{monthId}`
- `id: string` (same as `month`, format `YYYY-MM`)
- `month: string` (`YYYY-MM`)
- `categories: Record<string, number>` (assigned amount by category)
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/settings/preferences`
- `utilizationThreshold: number` (default `30`)
- `currency: string` (default `USD`)
- `monthStartDay: number` (default `1`)
- `recommendedPaymentRate: number` (default `0.03`)
- `updatedAt: timestamp`

### `/users/{uid}/plaidItems/{itemId}`
- `itemId: string`
- `plaidItemId: string`
- `institutionId: string`
- `institutionName: string`
- `status: string`
- `lastSyncAt: string`
- `lastCursor: string`
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/recurringPayments/{recurringId}`
- `recurringId: string`
- `sourceTransactionIds: string[]`
- `merchantName: string`
- `normalizedMerchant: string`
- `averageAmount: number`
- `cadenceGuess: string`
- `nextExpectedDate: timestamp | null`
- `confidence: number`
- `category: string`
- `active: boolean`
- `createdAt: timestamp`
- `updatedAt: timestamp`

### `/users/{uid}/syncState/plaid`
- `lastGlobalSyncAt: string`
- `syncStatus: string`
- `lastError: string`
- `itemCount: number`
- `accountCount: number`
- `transactionCount: number`
- `updatedAt: timestamp`

## Backend-only storage

Sensitive Plaid access tokens are **not** stored under `/users/{uid}/...`.

They live in a server-only top-level collection:

`/plaidPrivateItems/{uid}_{plaidItemId}`

That collection is written and read only by Firebase Functions via the Admin SDK. The existing Firestore rules already deny client access outside `/users/{uid}/...`.
