# Finance Tracker (private, Firebase Auth + Firestore)

This is a private web version of your Excel finance tracker.

## Setup
1. Create a Firebase project in Firebase Console.
2. Add a Web App to the Firebase project.
3. Enable Google Sign-In in Authentication:
   Authentication -> Sign-in method -> Google.
4. Create Firestore Database:
   Build -> Firestore Database.
5. Add Firestore rules:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

6. Create `.env.local` from `.env.example`.
7. Add the Firebase `VITE_FIREBASE_*` values from your Firebase Web App config.
8. Set `VITE_ALLOWED_EMAILS=your_email@gmail.com`.
9. Restart the dev server after env changes.
10. Deploy with Firebase Hosting.

## GitHub Pages notes
If you host this app on `https://burgosaxel.github.io/finance-tracker-web/`:
1. Set `VITE_BASE_PATH=/finance-tracker-web/` in `.env.local`.
2. In Firebase Console, add `burgosaxel.github.io` to:
   Authentication -> Settings -> Authorized domains.
3. Rebuild and redeploy after env changes.
4. In GitHub repo settings, set Pages source to `GitHub Actions`.
5. Add these repository secrets so the Pages build has Firebase config:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
   `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_ALLOWED_EMAILS`.

## Local development
```bash
npm install
npm run dev
```

## Deploy (Firebase Hosting)
```bash
npm run build
npm i -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```
