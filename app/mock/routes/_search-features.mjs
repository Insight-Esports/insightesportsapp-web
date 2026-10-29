// mock/routes/_search-features.mjs — the `features` section of GET /api/search
// (search agent, Oct 28). A copy of backend config/appDestinations.js and
// models/Search.js matchDestinations: word-start matching, name prefix first,
// then a keyword prefix, then a later word of the name, then a later word of
// a keyword; up to 4. Data only (no register()), used by players-teams.mjs.

const DESTINATIONS = [
  { id: "predictions", name: "Predictions", description: "Stat predictor and win probability", link: "insight://predictions",
    keywords: ["predict", "predictor", "prediction", "stat predictor", "odds", "win probability", "analyze", "projections"] },
  { id: "live", name: "Live Matches", description: "Matches on right now", link: "insight://live",
    keywords: ["live", "live match", "live matches", "scores", "scoreboard", "watch", "stream", "streams", "now playing"] },
  { id: "matches", name: "Matches", description: "Schedule and results", link: "insight://matches",
    keywords: ["match", "matches", "schedule", "upcoming", "results", "fixtures", "calendar", "scores", "today"] },
  { id: "teams", name: "Teams", description: "Team rankings and tiers", link: "insight://teams",
    keywords: ["team", "teams", "team rankings", "tiers", "tier 1", "orgs", "rosters"] },
  { id: "players", name: "Players", description: "Player rankings and stats", link: "insight://players",
    keywords: ["player", "players", "player rankings", "ratings", "pros", "roster", "stats"] },
  { id: "leaderboard", name: "Leaderboard", description: "Points, ranks and the Oracle title", link: "insight://leaderboard",
    keywords: ["leaderboard", "leader board", "rank", "my rank", "points", "oracle", "standings", "top users"] },
  { id: "polls", name: "Polls", description: "Vote and earn points", link: "insight://polls",
    keywords: ["poll", "polls", "vote", "voting", "pick", "picks", "earn points"] },
  { id: "alerts", name: "Stat Alerts", description: "Get told when a player reaches a stat", link: "insight://alerts",
    keywords: ["alert", "alerts", "stat alert", "stat alerts", "notify me", "at least", "kills alert", "reminder"] },
  { id: "news", name: "News", description: "Esports news for your games", link: "insight://news",
    keywords: ["news", "articles", "headlines", "roster moves", "transfers"] },
  { id: "archive", name: "Match Archive", description: "Find any match by date, team or player", link: "insight://archive",
    keywords: ["archive", "history", "match history", "past matches", "old matches", "by date", "calendar", "encyclopedia", "records", "all matches", "2020", "2021", "2022", "2023", "2024", "2025"] },
  { id: "messages", name: "Messages", description: "Direct messages", link: "insight://messages",
    keywords: ["message", "messages", "dm", "dms", "inbox", "direct message", "chat"] },
  { id: "notifications", name: "Notifications", description: "Your notification inbox", link: "insight://notifications",
    keywords: ["notification", "notifications", "bell", "inbox", "activity"] },
  { id: "profile", name: "Profile", description: "Your profile and badges", link: "insight://profile",
    keywords: ["profile", "my profile", "badges", "badge", "avatar", "profile picture", "followers", "following"] },
  { id: "reports", name: "Weekly Report", description: "Your personalised weekly report", link: "insight://reports",
    keywords: ["weekly report", "report", "reports", "summary", "my week", "recap"] },
  { id: "premium", name: "Premium", description: "Upgrade and manage your subscription", link: "insight://premium",
    keywords: ["premium", "upgrade", "subscribe", "subscription", "pro", "plan", "billing", "restore purchase"] },
  { id: "settings", name: "Settings", description: "Account, notifications and privacy", link: "insight://settings",
    keywords: ["settings", "setting", "account", "privacy", "quiet hours", "notification settings", "password", "email", "delete account", "sign out", "log out"] },
  { id: "watchlist", name: "Following", description: "Teams and players you follow", link: "insight://following",
    keywords: ["following", "follow", "follows", "watchlist", "favorites", "favourites", "my teams", "my players"] },
  { id: "support", name: "Help and Support", description: "Report a bug or ask for help", link: "insight://support",
    keywords: ["help", "support", "bug", "report a bug", "feedback", "contact", "faq"] },
];

export function mockSearchFeatures(term) {
  const t = String(term || "").toLowerCase().trim();
  if (t.length < 2) return [];
  const wordStart = (s) => s.split(/[\s/&-]+/).some((w) => w.startsWith(t));
  const scored = [];
  for (const d of DESTINATIONS) {
    const name = d.name.toLowerCase();
    let score = 0;
    if (name.startsWith(t)) score = 4;
    else if (d.keywords.some((k) => k.startsWith(t))) score = 3;
    else if (wordStart(name)) score = 2;
    else if (d.keywords.some(wordStart)) score = 1;
    if (score) scored.push({ score, d });
  }
  scored.sort((a, b) => b.score - a.score || a.d.name.localeCompare(b.d.name));
  return scored.slice(0, 4).map(({ d }) => ({ id: d.id, name: d.name, description: d.description, link: d.link }));
}
