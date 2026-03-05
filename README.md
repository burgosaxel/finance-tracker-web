# Finance Tracker (YNAB-style, Firebase + GitHub Pages)

This app is a client-only React + Firestore finance tracker with:
- Google Auth (private access)
- Dashboard summary + alerts
- Budget month planning (YNAB-lite)
- Credit card tracking (limits, utilization, APR, min payment)
- Bills & Income planning
- Transactions register + filters
- Settings, data export/import, and legacy spreadsheet import

## Tech
- Vite + React
- Firebase Auth + Firestore
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
9. Run local dev:

```bash
npm install
npm run dev
```

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

## Data Model
See [docs/data-model.md](./docs/data-model.md).

Collections under `/users/{uid}/`:
- `accounts`
- `creditCards`
- `bills`
- `income`
- `transactions`
- `budgets`
- `settings` (`preferences` document)

## Legacy Spreadsheet Import
Settings page includes `Import legacy snapshot`:
- Reads `src/seed/seedSheets.json`
- Maps legacy `Credit Cards` and `Monthly Bills` sheets into new collections
- Uses deterministic IDs to avoid duplicates when run multiple times

## Build
```bash
npm run build
```
