# Insight Esports — web

The web version of the Insight Esports iOS app: the same screens, copy and
design system (dark, ledger tables, violet underline tabs), adapted for the
browser. On phones (Android) it replicates the app's layout; iPhone visitors
are sent to the App Store. It talks to the same backend the app uses.

It is served at **insightesportsapp.com/app**; the marketing site stays at
the root of the same host (`public/site`, synced from the repo root).

**Access is limited to the Insight team for now**, in two steps: a Google
sign-in on the team domain, then the app account (see "How sign-in works").

## Stack

- Next.js 16 (App Router, `src/`), React 19, TypeScript, Tailwind v4
- `lucide-react` icons (SF Symbols → closest match), Karlo's PNG marks in `public/icons`
- `socket.io-client` for live match rooms, polls and DM unread counts

## Run it locally

```bash
cd app
npm install
cp .env.example .env.local   # then fill in APP_API_KEY (same key as backend/.env)
npm run dev                  # http://localhost:3000/app, against the Railway backend
```

Without backend access, run everything against the mock backend (seeded,
stable data; any `@insightesportsapp.com` email + password `insight` logs in):

```bash
npm run mock       # terminal 1 → http://localhost:4000
npm run dev:mock   # terminal 2 → http://localhost:3000/app
```

## Environment variables

| Variable | Where | What |
|---|---|---|
| `API_BASE_URL` | server only | Backend REST base, e.g. `https://esports-app-production.up.railway.app/api` |
| `APP_API_KEY` | server only | The backend's `x-api-key`. **Never reaches the browser.** |
| `NEXT_PUBLIC_SOCKET_URL` | public | Backend host (no `/api`) for Socket.IO and the image mirror |
| `PUBLIC_ORIGIN` | server only | `https://insightesportsapp.com` — for Google's redirect URI |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server only | The team-gate OAuth client (empty = gate off) |
| `GOOGLE_ALLOWED_DOMAIN` | server only | `insightesportsapp.com` |
| `GATE_SECRET` | server only | Signs the gate cookie (falls back to `APP_API_KEY`) |
| `ALLOWED_EMAIL_DOMAIN` | server only, optional | Restrict the Insight account too; unset = any app account once the gate is on |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | server only, optional | Only needed for avatar upload (Edit Profile) |

## Deploy (Railway)

One service from this repo with *Root Directory* `app` (the `railway.toml`
here sets the build/start commands). Set the env vars above in the service's
Variables. `npm start` runs `server.mjs`: the marketing site at `/`, the app
under `/app`.

**Domain.** The service must answer for the root domain `insightesportsapp.com`
(not a subdomain), which Railway can only do with CNAME flattening / ALIAS at
the apex — Squarespace DNS does not offer that. Two options:
1. Move the domain's nameservers to Cloudflare (free): add the site in
   Cloudflare, copy the records Squarespace has, switch nameservers at the
   registrar, then add a CNAME `@` → the Railway target (proxied, SSL "Full").
2. Or host the web on Vercel instead (root dir `app`, same env vars), which
   supports apex domains with a plain A record in Squarespace.
Until the apex points at the web server, the app is reachable only on the
Railway-generated domain / `app.` subdomain; `/app` on the apex is still the
GitHub Pages site.

No backend change is required for REST (the server adds the api key; CORS
never applies). Two backend notes for Andrew:
- Images: the backend's `helmet()` sends `Cross-Origin-Resource-Policy:
  same-origin` on `/img`, so browsers refuse to render thumbnails on another
  origin. The web mirrors them through `/app/api/img/*` meanwhile; adding
  `res.set("Cross-Origin-Resource-Policy", "cross-origin")` in
  `routes/images.js` (or `helmet({ crossOriginResourcePolicy: { policy:
  "cross-origin" } })`) lets the browser load them straight from Railway.
- Socket.IO already allows any origin and authenticates with the JWT.

## How sign-in works

1. **Team gate (Google).** `/app/gate` → `GET /api/auth/google` sends the
   browser to Google with `hd=insightesportsapp.com`; the callback exchanges
   the code server-side, checks the ID token (audience, verified email,
   team domain) and sets a signed httpOnly `insight_gate` cookie (30 days).
   Needs a Google OAuth client (see `.env.example`); without
   `GOOGLE_CLIENT_ID` the gate is off (local dev).
2. **Insight account.** `/app/login` → `POST /api/auth/login` forwards to the
   backend's `/auth/login` with the secret `x-api-key` and stores the Supabase
   tokens in httpOnly cookies (`insight_at`, `insight_rt`). The login APIs
   refuse requests without the gate cookie.
3. `src/proxy.ts` (middleware): iPhone → App Store (`?web=1` opts out), no
   gate → `/gate`, no session → `/login`. `/api/backend/[...path]` is the
   only way the browser reaches the API: it attaches the api key + JWT and
   refreshes an expired access token once.

To open the web to everyone later: remove `GOOGLE_CLIENT_ID`, set
`ALLOWED_EMAIL_DOMAIN=` (empty) and add the sign-up tab back to `/login`.

## What's where

```
src/app/(auth)/        login, forgot-password, verify-email (no shell)
src/app/(app)/         every signed-in screen, inside the shell
src/app/api/           auth routes (login, Google gate), the backend proxy,
                       /api/img (thumbnail mirror), /api/status, avatar upload
server.mjs             production server: marketing site at /, Next app at /app
public/site/           the marketing site (synced from the repo root at build)
src/components/ui/     the design system — port of Components.swift
src/components/shell/  sidebar / bottom tab bar / profile side panel
src/features/<area>/   screen code (matches, players, teams, news, search,
                       predictions, premium, reports, profile, settings,
                       notifications, leaderboard, auth, messages, follow)
src/lib/               types + tolerant decoders (Models.swift), api client
                       (APIClient.swift), formatters, socket, server helpers
src/store/app-state    AppState.swift
mock/                  seeded mock backend for local work and screenshots
scripts/               Playwright screenshot helpers (shot.mjs, shot-all.mjs)
PORTING.md             the iOS → web porting contract (read before adding screens)
```

## Screens (iOS → web)

| iOS | Web |
|---|---|
| HomeView (Live tab) | `/` |
| ScheduleView / CalendarScheduleView | `/schedule` |
| ResultsView | `/results` |
| LiveMatchView / completed match / UpcomingMatchDetailView (+ comments, chat, polls) | `/match/[id]` |
| PlayersView, PlayerDetailView (+ comments, recent games) | `/players`, `/players/[id]` |
| TeamsView, TeamDetailView | `/teams`, `/teams/[id]` |
| NewsView | `/news` |
| SearchView | `/search` |
| PredictionsView (Premium tab) + predict flow, H2H, team map, live breakdown | `/premium`, `/premium/predict/…` |
| PremiumGate / PremiumUpsellView | `/premium/upgrade` |
| WeeklyReportView | `/weekly-report` |
| ProfileView, EditProfileView, FollowListView | `/profile`, `/profile/[id]`, `/profile/edit`, `/profile/[id]/followers|following` |
| SettingsView (+ notifications, games, blocked, icons, email/password, delete) | `/settings/…` |
| NotificationsView | `/notifications` |
| LeaderboardView | `/leaderboard` |
| LoginView / ForgotPassword / ResetPassword / VerifyEmail | `/login`, `/forgot-password`, `/verify-email` |
| MessagesView (DMs, end-to-end encrypted) | `/messages`, `/messages/[id]`, `/messages/new`, `/messages/link` |

## Direct messages on the web (linked device)

DMs are end-to-end encrypted and the backend encrypts each message to ONE
recipient key version, so a browser must use the *phone's* key rather than
minting its own (that would cut the phone off). The web therefore works like
WhatsApp Web — the browser shows a code, the phone scans it:

1. On the web: Messages → **Link this browser** mints an ephemeral X25519 key,
   opens a relay session (`POST /api/link`, cookie session) and shows a QR
   code: `INSIGHT-LINK:1:<session id>:<web public key>:<user id>`.
2. In the iOS app: Settings → Messages → **Link web** scans it with the camera
   (`ios/LinkWebView.swift` in this folder is that screen — add it to the
   Xcode target, the `NavigationLink` and the `NSCameraUsageDescription` the
   file's header describes). The phone refuses a code for a different
   account; otherwise it seals `INSIGHT-DM:1:<private key>:<version>` to the
   web key (X25519 → HKDF-SHA256 `insight-link-v1` → AES-256-GCM) and POSTs it
   to `/api/link/:id` with its own JWT. The relay (`src/lib/server/link-sessions.ts`,
   an in-memory 5-minute mailbox) checks that JWT resolves to the same user
   (`GET /users/me`) and holds the ciphertext — it can't read it.
3. The browser polls `GET /api/link/:id`, opens the blob with its ephemeral
   key, checks the key against `GET /dm/keys/:me` and stores it in IndexedDB.
   Nothing is published; the server never sees the key in the clear. "Have a
   code? Paste it" is still there for the mock / local flow.
4. From then on `/messages` is the full app experience: inbox with previews
   and unread dots, threads with read receipts and typing, links as cards,
   encrypted photos/videos (upload + decrypt in the browser), block / remove,
   new message with people search. Crypto lives in
   `src/features/messages/crypto.ts` (X25519 + HKDF via `@noble`, AES-GCM via
   WebCrypto) and matches `DirectMessages.swift` byte for byte.

If the phone ever rotates its key, the inbox shows a "relink" banner.

## Intentionally not ported (iOS-only)

- **StoreKit purchases.** On the web, `/premium/upgrade` shows the same
  plans/copy and goes through the backend's Stripe routes instead
  (`POST /payments/checkout` hosted checkout, `POST /payments/portal` to
  manage). Apple subscriptions still show as active via `/payments/status`.
- **Push notifications** (APNs), the **share extension**, **app icon**
  switching (the gallery is shown read-only) and **Sign in with Apple**.
- **Sign-up on the web** — team accounts are created in the iOS app for now.

## Checks

```bash
npx tsc --noEmit
npx eslint src
npm run build
node scripts/shot-all.mjs   # screenshots every route (needs mock + server on :3100)
node scripts/dm-smoke.mjs   # links with the mock key, opens a thread, sends a message
```
