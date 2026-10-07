# Porting guide — iOS (SwiftUI) → web (Next.js)

This is the contract every screen port follows. Read it fully before writing code.

## What we are building
A web version of the Insight Esports iOS app that looks and behaves like the app
(same screens, copy, hierarchy, design system), adapted to be good on the web
(mouse + keyboard, wide screens, URLs you can share, back/forward works).
Dark theme only, exactly like the app.

Sources of truth (read-only, never edit):
- iOS code: `/home/claude/ios-src/Insight Esports/*.swift`
- Backend (for payload shapes when Swift is ambiguous): `/home/claude/esports-app/backend/{routes,controllers}`

## Stack
Next.js 16 (App Router, `src/` dir, Turbopack), React 19, TypeScript, Tailwind v4,
`lucide-react` for icons (SF Symbols → closest lucide icon), `socket.io-client`.
Everything under `src/app/(app)` is a signed-in screen inside the shell
(`src/components/shell/AppShell.tsx`): sidebar on desktop, iOS-style bottom
tab bar on phones, global profile side panel.

Pages are **client components** (`"use client"`) that fetch at runtime, exactly
like the SwiftUI views do in `.task {}`. No server components fetching data.
No `next/image` (use the `Img` component). No `useSearchParams` without it
being inside a client page under `(app)` or `(auth)` (both layouts are
`force-dynamic`, so that's fine).

## Fixed foundation — use, don't modify
| File | What it gives you |
|---|---|
| `src/lib/types.ts` | TS types + `normalize*` tolerant decoders for Match, Player, Team, PlayerStats, NewsArticle, PlayerComment, Prediction, InsightUser, AppStatus. Game helpers (`GAMES`, `SELECTABLE_GAMES`, `gameLabel`, `gamePillLabel`, `gameTint`), `team1Color/team2Color`, `teamStub`. |
| `src/lib/api.ts` | `api.get/post/put/patch/delete(path)` → calls `/api/backend/<path>` (the server adds x-api-key + JWT, handles refresh). `endpoints.*` = every `APIEndpoint` case as a path builder. `ApiError` (status, code, message identical to iOS copy). `errorMessage(e)`. |
| `src/lib/use-fetch.ts` | `useFetch(fetcher, deps)` → `{data, loading, error, connectionProblem, reload, setData}`; `useInterval(fn, ms)` (pauses when tab hidden). |
| `src/lib/format.ts` | `timeAgo`, `formatTime`, `formatDate`, `relativeDayLabel`, `fmt1/fmt2/fmtInt/fmtPct/toPct`, `compactNumber`, `initials`, `clsx`. |
| `src/lib/socket.ts` | `getSocket()` (shared socket.io client, JWT auth), `rooms.joinMatch/leaveMatch/joinPoll/leavePoll`. |
| `src/store/app-state.tsx` | `useAppState()` → `user, isPremium, tokenBalance, refreshUser, setUser, logout, profilePanelOpen/setProfilePanelOpen, status, connectionTrouble, unreadNotifications, unreadDMs, refreshUnread, pendingScheduleGame/setPendingScheduleGame, predictionsUsedToday, recordPredictionUsed, hasReachedPredictionLimit`. |
| `src/components/ui/index.tsx` | The design system (port of Components.swift) — see list below. |
| `src/components/shell/AppShell.tsx` | `HeaderTools` (search · bell · profile for tab headers), `ProfileToolbarButton`. |
| `src/app/globals.css` | Tokens + utilities (below). |

If you truly need a new **shared** primitive, create it in your own feature
folder and mention it in your final report; do not edit the files above.
If a backend path you need is missing from `endpoints`, build the string
inline with `api.get(\`/path?x=${encodeURIComponent(v)}\`)` and say so.

### UI components (`@/components/ui`)
`TabHeader({title, tools})`, `TabHeaderTitle`, `ToolButton`,
`GameTabBar({selected,onChange,liveGames})`, `FilterChip`, `FilterSegment({options,value,onChange})`,
`FilterRow({title})`, `FilterGroup({title})`, `FlatChip`, `Kicker`,
`Ledger` / `LedgerRow({onClick|href})` / `LedgerHeader`,
`LiveBadge`, `TeamBadge`, `TeamMark({name,logoURL,color,size})`, `Img({src,alt,fallback,fit})`,
`GamePill`, `StagePill`, `TierBadge`, `CrownBadge`, `InitialAvatar({name,imageURL,size})`, `GradientAvatar`,
`AssetIcon({name})` (Karlo's PNG icons: baren, correct, dragon, inhibitor, messages, premium, premiumlocked, streakmilestone, tower2, weeklyreport, wrong, tournament),
`BrandMark`, `StatCard({label,value})`, `SectionHeader({title,trailing})`,
`Spinner`, `EmptyState({icon,title,subtitle,actionTitle,onAction})`, `ErrorView({message,onRetry})`,
`ConnectionErrorView({onRetry})`, `LoadFailure({error,connectionProblem,onRetry})`, `PremiumLockOverlay`,
`SkeletonBar`, `SkeletonLedger({rows,avatar})`, `SkeletonMatchCard`, `SkeletonStatRow({columns})`,
`Field` (InsightTextField), `SearchField`, `PrimaryButton({loading})`, `GhostButton`, `PickDot`, `Checkmark`,
`SidePanel`, `Sheet({open,onClose,title,size})` (bottom sheet on phones / modal on desktop — use for every `.sheet`),
`SearchablePickerSheet`, `ConfirmDialog` (every `.alert`/`.confirmationDialog`), `Toast`, `HScroll`,
`Page` (content column, max 1100px, clears the tab bar), `SplitLayout({main, rail})` (two columns on desktop).

### CSS utilities (globals.css)
Colors: `bg-bg bg-card bg-surface text-primary text-secondary text-muted text-violet text-violet-light text-gold text-live text-success text-warning text-error text-team1 text-team2 border-hairline border-border-subtle border-border-strong border-border-gold bg-violet bg-gold ...`
and the per-game side colors `cs-t cs-ct val-attack val-defense`.
Type: `t-display-lg t-display-md t-headline-lg t-headline-md t-headline-sm t-body-lg t-body-md t-body-sm t-label-lg t-label-md t-label-sm t-mono-lg t-mono-md t-mono-sm t-kicker t-score`.
Containers: `ledger ledger-row ledger-stripe hairline-b hairline-t`.
Misc: `text-brand-gradient bg-violet-gradient bg-gold-gradient violet-rule btn-pill btn-ghost field no-scrollbar live-dot`.

## Design rules (from the team's ways of working)
- **Sharp over decorative.** Ledger-style tables with hairline borders. No floating cards with shadows, no gradients except the three brand ones, no emoji, no pill-shaped filter chips: selection is the **underline tab** (`FilterChip`/`FilterSegment`/`GameTabBar`).
- Every tab root starts with `<TabHeader title="…" tools={<HeaderTools extra={…} />} />` — titles: Insight (Live tab), Schedule, Players, Teams, News, Premium.
- Copy is copied from the Swift files verbatim (titles, empty states, error strings, button labels).
- Loading = skeletons in the content's own silhouette; failure = `LoadFailure`; empty = `EmptyState`.
- Keep the iOS information hierarchy; on wide screens use `SplitLayout` or CSS grid to use the width (e.g. match list + detail rail, stats in 2–3 columns) rather than stretching a phone column.
- Hover states on rows (`LedgerRow` has them). Keyboard: forms submit on Enter, dialogs close on Esc.
- Premium-gated features: check `useAppState().isPremium`; show the same gate copy the app shows and link to `/premium/upgrade`.

## Routes (fixed — other agents link to these)
| iOS | Web route | Owner |
|---|---|---|
| HomeView (Live tab) | `/` | A |
| ScheduleView / CalendarScheduleView | `/schedule` (`?game=&date=`) | A |
| ResultsView | `/results` (`?game=&team=`) | A |
| LiveMatchView / completed / UpcomingMatchDetailView | `/match/[id]` | A |
| MatchCommentsView | inside `/match/[id]` (tab/section) | A |
| PlayersView | `/players` (`?game=&role=&region=`) | B |
| PlayerDetailView (+ PlayerCommentsView, RecentGamesList) | `/players/[id]` | B |
| TeamsView | `/teams` (`?game=&tier=&region=`) | B |
| TeamDetailView | `/teams/[id]` | B |
| NewsView | `/news` (`?game=`) | B |
| SearchView | `/search` (`?q=&game=`) | B |
| PredictionsView (Premium tab) | `/premium` | C |
| PredictionTargetSelect → StatPicker → Result → Breakdown | `/premium/predict` … (sub-routes or in-page steps, C decides, keep URL-addressable where sensible) | C |
| PredictionTeamViews (H2H / team map) | under `/premium/…` | C |
| WeeklyReportView | `/weekly-report` | C |
| PremiumUpsellView (PremiumGate.swift) + plan picker | `/premium/upgrade` | C |
| ProfileView (own / other) | `/profile`, `/profile/[id]` | D |
| EditProfileView | `/profile/edit` | D |
| FollowListView | `/profile/[id]/followers`, `/profile/[id]/following` | D |
| SettingsView (+ Notification settings, Game preferences, blocked users, email/password, delete account) | `/settings`, `/settings/notifications`, `/settings/games`, … | D |
| NotificationsView | `/notifications` | D |
| LeaderboardView | `/leaderboard` | D |
| ForgotPasswordView / ResetPasswordView | `/forgot-password` (multi-step in one page) | D |
| MessagesView (DMs) | `/messages` — placeholder screen only in this pass | D |
| LoginView | `/login` (done) | — |

Linking: `<Link href={`/players/${id}`}>` etc. Match cards anywhere → `/match/[id]`.
Team names on match cards → `/teams/${team1Id ?? encodeURIComponent(name)}` (TeamDetail must tolerate a name as id, like the app).

## Where files go
- Pages: `src/app/(app)/<route>/page.tsx` (thin; export default the page).
- Feature code: `src/features/<area>/…` (components, hooks, local types). Owners: A → `matches`, B → `players`, `teams`, `news`, `search`, C → `predictions`, `premium`, `reports`, D → `profile`, `settings`, `notifications`, `leaderboard`, `auth`, `messages`.
- Extra types for your area: `src/features/<area>/types.ts` with the same tolerant `normalize*` style as `src/lib/types.ts`.

## Mock backend (for local testing + screenshots)
Railway is unreachable from this workspace, so every screen is verified
against `mock/server.mjs` (`npm run mock`, port 4000). Add your endpoints in
`mock/routes/<area>.mjs`:

```js
export function register(app, h) {           // h: { isoAgo, isoIn, pick, rand, me, protect, express }
  app.get("/api/matches/live", h.protect, (req, res) => res.json([...]));
}
export function registerSockets(io, h) { /* optional: emit live events to rooms */ }
```
Shapes must match what the real backend sends (snake_case; look at the Swift
`CodingKeys` and the backend controller when unsure). Use realistic esports
data (real-looking team/player names are fine, e.g. Sentinels, G2, Fnatic,
TenZ, s1mple…) and `h.rand(seed)` so output is stable across reloads.
Dates relative to now (`h.isoAgo`, `h.isoIn`) so "Today/Live" states show.

## Verifying your work (required before you report)
1. `cd /home/claude/esports-app/web && npx tsc --noEmit` → zero errors in your files.
2. `npx eslint src/features/<yours> "src/app/(app)/<yours>"` → zero errors.
3. Do **not** run `next build` or `next dev` (other agents share the folder; the build runs once at the end).
   To test rendering, use the mock + a Playwright script against the already-running server if one is up on
   http://localhost:3100 (it serves the production build from the last `next build`; your new pages will
   not be there until the next build, so rely on tsc/eslint + careful reading).
4. Report: files created, routes, endpoints used, anything you had to guess or stub, and iOS features
   intentionally not ported (platform-specific: push, StoreKit, share extension, Apple sign-in, E2E DMs).
