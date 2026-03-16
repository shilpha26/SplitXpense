# SplitXpense – Expense Splitting App

Split expenses with friends, roommates, or travel buddies. Create groups, add expenses, and see who owes what. Data syncs across devices and works offline (PWA).

---

## How the project is connected

SplitXpense uses two main services:

| Service  | Role |
|----------|------|
| **Vercel**   | Hosts the app. The site runs at `https://splitxpense.vercel.app`. Pushing to GitHub triggers a deploy. |
| **Supabase** | Database and real-time sync. Stores users, groups, expenses, and keeps all devices in sync. |

```
┌─────────────┐      push       ┌─────────────┐      deploy      ┌─────────────┐
│   GitHub    │ ──────────────► │   Vercel    │ ──────────────►  │   Live app  │
│ (repository)│                 │  (hosting)  │                  │ splitxpense │
└─────────────┘                 └──────┬──────┘                  │ .vercel.app │
                                       │                         └──────┬──────┘
                                       │                                │
                                       │     reads/writes               │
                                       │         (API)                  │
                                       ▼                                ▼
                                ┌─────────────┐                 ┌─────────────┐
                                │  Supabase   │ ◄───────────────│   Browser   │
                                │ (database,  │   config in     │  (your app  │
                                │  realtime)  │   js/config.js  │   in use)   │
                                └─────────────┘                 └─────────────┘
```

- **Code** lives in **GitHub**. You edit and push from your machine.
- **Vercel** builds and serves the app from that repo. No separate “backend server” to run.
- **Supabase** is the backend: it holds all data and handles real-time updates. The app talks to it from the browser using the URL and anon key in `js/config.js`.

---

## What is SplitXpense?

- Create groups and add members  
- Add expenses (who paid, who’s in the split)  
- See balances and who owes whom  
- Sync across devices via Supabase  
- Works offline (Progressive Web App)  
- Share group links so others can join  

---

## Project structure (what lives where)

```
SplitXpense/
├── index.html           # Home: list of groups, create group, sign in
├── group-detail.html    # Single group: expenses, balances, share
├── admin.html           # Admin panel: who joined, total groups/expenses (optional)
├── 404.html             # Redirect to Vercel (for GitHub Pages)
├── vercel.json          # Vercel: rewrites (/ → index.html, /group-detail → group-detail.html)
├── manifest.json        # PWA name, icons
├── sw.js                # Service worker (offline, cache)
├── css/
│   └── style.css
├── js/
│   ├── config.js        # Supabase URL + anon key (you create this, not in git)
│   ├── shared-supabase.js   # Connects to Supabase, init, helpers
│   ├── shared-sync.js       # Sync groups/expenses + realtime
│   ├── shared-utils.js     # Common helpers, localStorage
│   ├── logger.js, error-handler.js, dom-utils.js, app-state.js, modal-utils.js
│   └── ...
└── README.md            # This file
```

- **Vercel** serves the files above. `vercel.json` makes `/` and `/group-detail` point to the right HTML.
- **Supabase** is used only from the browser via `shared-supabase.js` and `shared-sync.js`; no Node server in the middle.

---

## Quick start (local)

### 1. Get Supabase credentials

1. Go to [supabase.com](https://supabase.com) and create a project.  
2. **Settings** → **API**: copy **Project URL** and **anon public** key.

### 2. Add config (so the app can talk to Supabase)

Create `js/config.js`:

```javascript
window.SUPABASECONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_ANON_KEY'
};
```

(Do not commit this file; it’s in `.gitignore`.)

### 3. Run the app locally

```bash
python -m http.server 8000
```

Open **http://localhost:8000**.  
Use a local server (not opening `index.html` as a file) so Supabase and the service worker work.

### 4. Set up the database in Supabase

In Supabase **SQL Editor**, run the SQL from `supabase-migration.sql` (or your schema file), then set up RLS as in `supabase-rls-policies.sql` (or your RLS docs).

---

## Deployment (Vercel + Supabase)

- **Vercel**: Connect this GitHub repo to a Vercel project. Production URL will be something like `https://splitxpense.vercel.app`. Each push to the linked branch deploys the app.
- **Supabase**: Same project for local and production. Put the same Supabase URL and anon key in `js/config.js` when building, or use Vercel environment variables and a build step that writes `js/config.js` from them.
- **Domains**: In Vercel you can add your custom domain and redirects (e.g. old domain → new one).

No separate “backend” deploy: the backend is Supabase; the front end is static files on Vercel.

---

## Admin panel

Open `/admin` (or `admin.html`) to see **who joined**, **total groups**, **total expenses**, **new users/expenses this week**, and a table of users with expandable rows (groups list and Delete).Sign in on the admin page with the email; anyone else “Access denied”.

If RLS blocks reads on `users`/`groups`/`expenses`, add policies that allow the anon (or authenticated) role to select.

### Delete user (simple, no backend)

Clicking **Delete** in the admin panel removes the user from **app data** (public `users`, their groups, expenses, and membership in other groups). This uses only the browser and Supabase RLS—no Edge Function or CLI.

1. **One-time setup**: In Supabase **SQL Editor**, run the statements in `supabase-admin-rls.sql`.  This lets the admin account delete/update rows when signed in.
2. **Admin must be signed in** with that email in the app so Supabase sends their JWT; then Delete works from the admin page.
3. **Auth**: The user is removed from app data but **not** from Supabase Authentication. To stop them logging in, delete them in **Supabase Dashboard → Authentication → Users** (manual step).

---

## Security

- `js/config.js` and `.env` are gitignored.  
- Only the Supabase **anon** (public) key is in the front end; it’s safe for browser use with RLS.  
- Never commit secret keys or service-role keys.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| “Supabase not configured” | `js/config.js` exists and has correct `url` and `anonKey`. |
| Can’t connect to Supabase | Internet, Supabase project status, and CORS (use a real origin, e.g. localhost or Vercel URL). |
| 404 on Vercel | `vercel.json` rewrites: `/` → `/index.html`, `/group-detail` → `/group-detail.html`. |
| Data not syncing | Supabase tables and RLS set up; realtime enabled if you use it; same Supabase project in config. |

---

## License

Open source for personal and commercial use.
