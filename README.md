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
