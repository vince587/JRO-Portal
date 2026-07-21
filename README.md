# JMCS Portal

## One-command setup

```sh
cd jmcs
npm install    # installs root + portal + api-server deps
npm run dev    # runs both backend and frontend
```

- Portal: http://localhost:5173
- API: http://localhost:5000

## First User

1. Go to Firebase Console > Authentication > Add User
2. Log into the portal with that email/password
3. First login auto-creates a user doc with `role: "staff"`
4. To promote to admin, update `role` to `"admin"` in Firestore

## Required for API Server

The backend needs a Firebase service account JSON. Download it from:
https://console.firebase.google.com/project/software-jmcs/settings/serviceaccounts/adminsdk

Then set it before running:

```sh
export FIREBASE_SERVICE_ACCOUNT_KEY=$(cat api-server/service-account.json)
export FIREBASE_PROJECT_ID=software-jmcs
npm run dev
```

A template is at `api-server/service-account.example.json` — rename to `service-account.json` and fill in your credentials.
