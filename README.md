# Chess Quest 🎮♟️

A kids chess learning app with puzzles, adventure map, profiles and Firebase cloud sync.

## 🚀 Deploy to Cloudflare Pages

### Step 1 — Push to GitHub
Upload this folder to a new GitHub repository.

### Step 2 — Connect to Cloudflare Pages
1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Click **Create a project** → Connect to Git → select your repo
3. Build settings:
   - **Build command:** (leave empty)
   - **Build output directory:** `/` (root)
4. Click **Save and Deploy**

### Step 3 — Add Environment Variables
In Cloudflare Pages → **Settings → Environment Variables** → add these:

| Variable | Value |
|---|---|
| `CHESS_QUEST_API_KEY` | Your Firebase API key |
| `CHESS_QUEST_AUTH_DOMAIN` | `yourproject.firebaseapp.com` |
| `CHESS_QUEST_PROJECT_ID` | `yourproject` |
| `CHESS_QUEST_STORAGE_BUCKET` | `yourproject.firebasestorage.app` |
| `CHESS_QUEST_SENDER_ID` | Your sender ID |
| `CHESS_QUEST_APP_ID` | Your app ID |

Then **redeploy** for the variables to take effect.

### Step 4 — Firebase Setup

**Firestore Security Rules** (Firestore → Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Authorized Domains** (Authentication → Settings → Authorized domains):
- Add your `your-app.pages.dev` domain

## 🔒 Security Notes
- Firebase API keys are **not** stored in the code
- They are injected at runtime via Cloudflare Pages Functions
- Firestore rules ensure users can only access their own data
- The `functions/index.js` handles server-side injection

## ✉️ Enable Google Sign-In (optional)
1. Firebase → Authentication → Sign-in method → Google → Enable
2. In `chess-quest.jsx`, find the disabled Google button and remove `disabled`
3. Redeploy

## 📱 Install as App
Once deployed, visit the URL on iPhone → Share → Add to Home Screen
