# insightesportsapp-web
Code for our websites

## Layout

- `/` (index.html, privacy, terms, support, premium-checkout) — the marketing
  site, served by GitHub Pages at insightesportsapp.com.
- `app/` — the web version of the Insight app (Next.js). It needs a Node host
  (Vercel or Railway, root directory `app`), not GitHub Pages; point
  `app.insightesportsapp.com` at that deployment. See `app/README.md`.
