# Insight Esports — web

The web version of the Insight Esports iOS app: the same screens, copy and
design system (dark, ledger tables, violet underline tabs), adapted for the
browser (sidebar on desktop, iOS-style bottom tab bar on phones, shareable
URLs, back/forward). It talks to the same backend the app uses.

**Access is limited to `@insightesportsapp.com` accounts for now.** The gate is
enforced server-side (see "How the gate works"), not in the browser.

## Stack

- Next.js 16 (App Router, `src/`), React 19, TypeScript, Tailwind v4
- `lucide-react` icons (SF Symbols → closest match), Karlo's PNG marks in `public/icons`
- `socket.io-client` for live match rooms, polls and DM unread counts

## Run it locally

```bash
cd app
npm install
cp .env.example .env.local   # then fill in APP_API_KEY (same key as backend/.env)
npm run dev                  # http://localhost:3000, against the Railway backend
```

Without backend access, run everything against the mock backend (seeded,
stable data; any `@insightesportsapp.com` email + password `insight` logs in):

```bash
npm run mock       # terminal 1 → http://localhost:4000
npm run dev:mock   # terminal 2 → http://localhost:3000
```

## Environment variables

| Variable | Where | What |
|---|---|---|
| `API_BASE_URL` | server only | Backend REST base, e.g. `https://esports-app-production.up.railway.app/api` |
| `APP_API_KEY` | server only | The backend's `x-api-key`. **Never reaches the browser.** |
| `ALLOWED_EMAIL_DOMAIN` | server only | `insightesportsapp.com` — only these accounts can sign in |
| `NEXT_PUBLIC_SOCKET_URL` | public | Backend host (no `/api`) for Socket.IO, e.g. `https://esports-app-production.up.railway.app` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | server only, optional | Only needed for avatar upload (Edit Profile) |

## Deploy

Either host works; the app is a standard Next.js build (`npm run build` → `npm start`).

**Vercel (simplest):** import the repo, set *Root Directory* to `app`, add the
env vars above, deploy. Point `app.insightesportsapp.com` (or whichever
subdomain) at it in Squarespace DNS.

**Railway (same place as the backend):** new service from the repo, root
directory `app`, build `npm run build`, start `npm start`, same env vars.

No backend change is required: all REST calls go browser → this server →
backend, so the backend sees no browser `Origin` and CORS never applies. The
only direct browser → backend connection is Socket.IO, which already allows
any origin and authenticates with the user's JWT.

## How the gate works

1. `POST /api/auth/login` forwards to the backend `/auth/login` with the secret
   `x-api-key`, then checks the **email claim inside the JWT the backend
   issued** against `ALLOWED_EMAIL_DOMAIN`. Anything else gets a 403 and no
   cookie. (`/api/auth/verify-otp` does the same for freshly verified accounts.)
2. Tokens are stored in `httpOnly` cookies (`insight_at`, `insight_rt`), never
   in JavaScript-readable storage.
3. `src/proxy.ts` (Next's middleware) redirects any page request without a
   gated session to `/login`.
4. `/api/backend/[...path]` is the only way the browser reaches the API. It
   re-checks the domain on **every** call, attaches the api key + JWT, and
   silently refreshes an expired access token once (single-flight, like
   `APIClient.swift`).

To open the web app to everyone later, change `ALLOWED_EMAIL_DOMAIN` handling
in `src/lib/server/session.ts` (`isAllowedEmail`) and add the sign-up tab back
to `/login` (the iOS `LoginView` register flow + `/verify-email` page are
already ported server-side).

## What's where

```
src/app/(auth)/        login, forgot-password, verify-email (no shell)
src/app/(app)/         every signed-in screen, inside the shell
src/app/api/           auth routes, the backend proxy, /api/status, avatar upload
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
| MessagesView (DMs) | `/messages` — placeholder (see below) |

## Intentionally not ported (iOS-only)

- **Direct messages.** The app's DMs are end-to-end encrypted with keys that
  live in the iPhone's Keychain; a browser has no access to them. `/messages`
  explains this and shows the unread count. Porting would need a web key
  pair per browser plus multi-device key support on the backend.
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
```
