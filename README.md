# Finance Tracker (YNAB-style, Firebase + Plaid + GitHub Pages)

This app is a client-only React + Firestore finance tracker with:
- Google Auth (private access)
- Dashboard summary + alerts
- Budget month planning (YNAB-lite)
- Credit card tracking (limits, utilization, APR, min payment)
- Bills & Income planning
- Transactions register + filters
- Plaid-linked accounts, balances, and transaction sync via Firebase Functions
- Settings, data export/import, and legacy spreadsheet import

## Tech
- Vite + React
- Firebase Auth + Firestore
- Firebase Functions (for Plaid token exchange and sync)
- Hash-based navigation (`#/...`) for GitHub Pages compatibility

## Firestore Rules
Use the repo file [firestore.rules](./firestore.rules), or paste:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Setup
1. Create Firebase project.
2. Add Firebase Web App.
3. Enable Authentication -> Google provider.
4. Create Firestore database.
5. Apply Firestore rules from `firestore.rules`.
6. Add `burgosaxel.github.io` to Auth authorized domains for GitHub Pages use.
7. Copy `.env.example` to `.env.local`.
8. Fill all `VITE_FIREBASE_*` values and set:
   - `VITE_ALLOWED_EMAILS=your_email@gmail.com`
   - `VITE_BASE_PATH=/finance-tracker-web/`
   - optionally `VITE_FIREBASE_FUNCTIONS_REGION=us-central1`
9. Run local dev:

```bash
npm install
npm run dev
```

## Plaid Setup
Plaid secrets stay backend-only in Firebase Functions.

1. Create a Plaid account and an app in Sandbox/Development.
2. In `functions/.env`, set non-secret Plaid config values:

```bash
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=
PLAID_WEBHOOK_URL=
```

3. Set sensitive Functions secrets:

```bash
firebase functions:secrets:set PLAID_CLIENT_ID
firebase functions:secrets:set PLAID_SECRET
```

4. Install Functions dependencies:

```bash
cd functions
npm install
cd ..
```

5. Optional local emulator frontend config in `.env.local`:

```bash
VITE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001
VITE_FIREBASE_FUNCTIONS_REGION=us-central1
```

6. Start local Functions emulator in one terminal:

```bash
firebase emulators:start --only functions
```

7. Start the frontend in another terminal:

```bash
npm run dev
```

8. In the app, go to `Settings -> Linked Bank Accounts -> Link Bank Account`.
9. Complete Plaid Link, then verify:
   - `plaidItems` docs appear under `/users/{uid}/plaidItems`
   - `linkedAccounts` docs appear under `/users/{uid}/linkedAccounts`
   - Plaid transactions appear under `/users/{uid}/transactions` with `source: "plaid"`
   - `syncState/plaid` updates with counts and timestamps

## Deploy (GitHub Pages)
This repo uses GitHub Actions workflow: `.github/workflows/deploy-pages.yml`

1. In GitHub `Settings -> Pages`, set Source to `GitHub Actions`.
2. Add Actions repository secrets:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_ALLOWED_EMAILS`
3. Push to `main` and wait for `Deploy GitHub Pages` action.

Plaid Functions are deployed separately:

```bash
firebase deploy --only functions
```

## Data Model
See [docs/data-model.md](./docs/data-model.md).

Collections under `/users/{uid}/`:
- `accounts`
- `linkedAccounts`
- `plaidItems`
- `recurringPayments`
- `creditCards`
- `bills`
- `income`
- `transactions`
- `budgets`
- `settings` (`preferences` document)

Backend-only sensitive storage:
- `/plaidPrivateItems/{uid}_{plaidItemId}` for Plaid access tokens and sync cursors

## Legacy Spreadsheet Import
Settings page includes `Import legacy snapshot`:
- Reads `src/seed/seedSheets.json`
- Maps legacy `Credit Cards` and `Monthly Bills` sheets into new collections
- Uses deterministic IDs to avoid duplicates when run multiple times

## Build
```bash
npm run build
```

## MVP Notes
- Plaid sync writes into the existing `transactions` collection with `source: "plaid"` so manual workflows remain intact.
- Category overrides are stored in `userCategoryOverride`.
- Recurring payments are heuristic candidates generated from synced transactions; they do not overwrite manual recurring templates.
- GitHub Pages deploys the frontend only. Plaid requires Firebase Functions to be deployed separately.
