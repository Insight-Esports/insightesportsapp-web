// mock/routes/players-teams.mjs — Players · Teams · Search · News · Follow
// (agent B). Shapes mirror backend/controllers/{player,team,search,news,
// follow,comment}Controller.js (snake_case rows, camelCase envelopes where
// the real backend uses them). Deterministic via h.rand(seed).

// ── Seed data ─────────────────────────────────────────────────────────────
const NAT = { NA: ["USA", "Canada"], EMEA: ["Sweden", "Denmark", "Russia", "Turkey", "France", "UK"], Europe: ["Sweden", "Denmark", "France", "Ukraine", "Bosnia"], CIS: ["Russia", "Kazakhstan", "Ukraine"], APAC: ["Japan", "Korea", "Philippines", "Thailand"], Asia: ["Mongolia", "China", "Australia"], Brazil: ["Brazil"], LCK: ["Korea"], LEC: ["Germany", "Spain", "Slovenia", "Denmark"], LCS: ["USA", "Canada"], LPL: ["China"] };

const TEAMS = {
  VALORANT: [
    ["Sentinels", "SEN", "NA", 1, "#C8102E"], ["G2 Esports", "G2", "EMEA", 1, "#D11A2A"], ["Fnatic", "FNC", "EMEA", 1, "#FF5900"], ["Paper Rex", "PRX", "APAC", 1, "#C72C41"],
    ["LOUD", "LLL", "Brazil", 1, "#19E65C"], ["Team Heretics", "TH", "EMEA", 1, "#2E2E2E"], ["Gen.G", "GEN", "APAC", 1, "#AA8B56"], ["DRX", "DRX", "APAC", 1, "#1E5BFF"],
    ["NRG", "NRG", "NA", 1, "#0D0D0D"], ["100 Thieves", "100T", "NA", 1, "#E51C1C"], ["Team Liquid", "TL", "EMEA", 1, "#0A2A5E"], ["Cloud9", "C9", "NA", 1, "#00AEEF"],
    ["T1", "T1", "APAC", 1, "#E2012D"], ["FURIA", "FUR", "Brazil", 1, "#111111"], ["KRÜ Esports", "KRU", "Brazil", 2, "#FF2E7E"], ["Karmine Corp", "KC", "EMEA", 2, "#0C3DBE"],
  ],
  CS2: [
    ["Team Vitality", "VIT", "Europe", 1, "#F7E700"], ["Natus Vincere", "NAVI", "CIS", 1, "#F5C518"], ["Team Spirit", "SPIRIT", "CIS", 1, "#1F1F1F"], ["FaZe Clan", "FAZE", "Europe", 1, "#E43D30"],
    ["G2 Esports", "G2", "Europe", 1, "#D11A2A"], ["MOUZ", "MOUZ", "Europe", 1, "#D7001E"], ["Astralis", "AST", "Europe", 1, "#E31B23"], ["Team Liquid", "TL", "NA", 1, "#0A2A5E"],
    ["Heroic", "HER", "Europe", 1, "#1B1B1B"], ["Virtus.pro", "VP", "CIS", 1, "#F58220"], ["Complexity", "COL", "NA", 1, "#1F4FCA"], ["The MongolZ", "MGZ", "Asia", 1, "#003DA5"],
    ["FURIA", "FUR", "NA", 1, "#111111"], ["Eternal Fire", "EF", "Europe", 2, "#FF4C00"], ["3DMAX", "3DMAX", "Europe", 2, "#E4002B"], ["BIG", "BIG", "Europe", 2, "#0A0A0A"],
  ],
  League: [
    ["T1", "T1", "LCK", 1, "#E2012D"], ["Gen.G", "GEN", "LCK", 1, "#AA8B56"], ["Hanwha Life Esports", "HLE", "LCK", 1, "#F47920"], ["Dplus KIA", "DK", "LCK", 1, "#0B5ED7"],
    ["Bilibili Gaming", "BLG", "LPL", 1, "#00A1D6"], ["JD Gaming", "JDG", "LPL", 1, "#D4121B"], ["Top Esports", "TES", "LPL", 1, "#FF4500"], ["Weibo Gaming", "WBG", "LPL", 1, "#E6162D"],
    ["G2 Esports", "G2", "LEC", 1, "#D11A2A"], ["Fnatic", "FNC", "LEC", 1, "#FF5900"], ["Karmine Corp", "KC", "LEC", 1, "#0C3DBE"], ["MAD Lions KOI", "MDK", "LEC", 1, "#F2C94C"],
    ["Team Liquid", "TL", "LCS", 1, "#0A2A5E"], ["FlyQuest", "FLY", "LCS", 1, "#00A651"], ["Cloud9", "C9", "LCS", 1, "#00AEEF"], ["100 Thieves", "100T", "LCS", 2, "#E51C1C"],
  ],
};

// name, real name, team index, role
const PLAYERS = {
  VALORANT: [
    ["TenZ", "Tyson Ngo", 0, "Duelist"], ["zekken", "Zachary Patrone", 0, "Duelist"], ["Sacy", "Gustavo Rossi", 0, "Initiator"], ["johnqt", "Mohamed Ouarid", 0, "Sentinel"], ["Zellsis", "Jordan Montemurro", 0, "Controller"],
    ["Derke", "Nikita Sirmitev", 2, "Duelist"], ["Boaster", "Jake Howlett", 2, "Initiator"], ["Alfajer", "Emir Beder", 2, "Sentinel"], ["Leo", "Leo Jannesson", 2, "Initiator"], ["chronicle", "Timofey Khromov", 2, "Controller"],
    ["aspas", "Erick Santos", 4, "Duelist"], ["Less", "Felipe Basso", 4, "Sentinel"], ["cauanzin", "Cauan Pereira", 4, "Initiator"], ["tuyz", "Arthur Vieira", 4, "Controller"],
    ["something", "Ilya Petrov", 3, "Duelist"], ["f0rsakeN", "Jason Susanto", 3, "Initiator"], ["Jinggg", "Wang Jing Jie", 3, "Duelist"], ["d4v41", "Khalish Rusyaidee", 3, "Initiator"], ["mindfreak", "Aaron Leonhart", 3, "Controller"],
    ["Demon1", "Max Mazanov", 8, "Duelist"], ["Ethan", "Ethan Arnold", 8, "Initiator"], ["Victor", "Victor Wong", 8, "Duelist"], ["leaf", "Nathan Orf", 1, "Duelist"], ["valyn", "Jacob Batio", 1, "Initiator"], ["trent", "Trent Cairns", 1, "Initiator"],
    ["MaKo", "Kim Myeong-kwan", 7, "Controller"], ["BuZz", "Yu Byung-chul", 7, "Duelist"], ["t3xture", "Kim Na-ra", 6, "Duelist"], ["Meteor", "Kim Tae-O", 6, "Initiator"], ["Cryocells", "Matthew Panganiban", 9, "Duelist"], ["Boostio", "Kelden Pupello", 9, "Initiator"],
  ],
  CS2: [
    ["ZywOo", "Mathieu Herbaut", 0, "AWPer"], ["apEX", "Dan Madesclaire", 0, "IGL"], ["flameZ", "Shahar Shushan", 0, "Entry"], ["mezii", "William Merriman", 0, "Rifler"], ["ropz", "Robin Kool", 0, "Rifler"],
    ["s1mple", "Oleksandr Kostyliev", 1, "AWPer"], ["b1t", "Valerii Vakhovskyi", 1, "Rifler"], ["Aleksib", "Aleksi Virolainen", 1, "IGL"], ["iM", "Mihai Ivan", 1, "Rifler"], ["w0nderful", "Ihor Zhdanov", 1, "AWPer"],
    ["donk", "Danil Kryshkovets", 2, "Entry"], ["sh1ro", "Dmitry Sokolov", 2, "AWPer"], ["chopper", "Leonid Vishnyakov", 2, "IGL"], ["magixx", "Boris Vorobiev", 2, "Support"], ["zont1x", "Myroslav Plakhotia", 2, "Rifler"],
    ["karrigan", "Finn Andersen", 3, "IGL"], ["frozen", "David Čerňanský", 3, "Rifler"], ["broky", "Helvijs Saukants", 3, "AWPer"], ["rain", "Håvard Nygaard", 3, "Entry"], ["EliGE", "Jonathan Jablonowski", 3, "Rifler"],
    ["NiKo", "Nikola Kovač", 4, "Rifler"], ["m0NESY", "Ilya Osipov", 4, "AWPer"], ["huNter-", "Nemanja Kovač", 4, "Rifler"], ["malbsMd", "Mario Samayoa", 4, "Entry"], ["Snax", "Janusz Pogorzelski", 4, "IGL"],
    ["torzsi", "Ádám Torzsás", 5, "AWPer"], ["Brollan", "Ludvig Brolin", 5, "Entry"], ["device", "Nicolai Reedtz", 6, "AWPer"], ["Twistzz", "Russel Van Dulken", 7, "Rifler"], ["NAF", "Keith Markovic", 7, "Support"], ["910", "Ayush Batbold", 11, "Rifler"],
  ],
  League: [
    ["Faker", "Lee Sang-hyeok", 0, "Mid"], ["Zeus", "Choi Woo-je", 0, "Top"], ["Oner", "Moon Hyeon-jun", 0, "Jungle"], ["Gumayusi", "Lee Min-hyeong", 0, "Bot"], ["Keria", "Ryu Min-seok", 0, "Support"],
    ["Chovy", "Jeong Ji-hoon", 1, "Mid"], ["Kiin", "Kim Gi-in", 1, "Top"], ["Canyon", "Kim Geon-bu", 1, "Jungle"], ["Peyz", "Kim Su-hwan", 1, "Bot"], ["Lehends", "Son Si-woo", 1, "Support"],
    ["Zeka", "Kim Geon-woo", 2, "Mid"], ["Viper", "Park Do-hyeon", 2, "Bot"], ["Peanut", "Han Wang-ho", 2, "Jungle"], ["Doran", "Choi Hyeon-joon", 2, "Top"], ["Delight", "Yoo Hwan-joong", 2, "Support"],
    ["Knight", "Zhuo Ding", 4, "Mid"], ["Bin", "Chen Ze-Bin", 4, "Top"], ["Elk", "Zhao Jia-Hao", 4, "Bot"], ["ON", "Luo Wen-Jun", 4, "Support"], ["Xun", "Peng Li-Xun", 4, "Jungle"],
    ["Ruler", "Park Jae-hyuk", 5, "Bot"], ["Kanavi", "Seo Jin-hyeok", 5, "Jungle"], ["369", "Bai Jia-Hao", 6, "Top"], ["Creme", "Zhao Zi-Yi", 6, "Mid"], ["JackeyLove", "Yu Wen-Bo", 6, "Bot"],
    ["Caps", "Rasmus Winther", 8, "Mid"], ["BrokenBlade", "Sergen Çelik", 8, "Top"], ["Yike", "Martin Sundelin", 8, "Jungle"], ["Hans Sama", "Steven Liv", 8, "Bot"], ["Mikyx", "Mihael Mehle", 8, "Support"], ["Razork", "Iván Martín", 9, "Jungle"],
  ],
};

const MAPS = { VALORANT: ["Ascent", "Bind", "Haven", "Lotus", "Sunset", "Abyss", "Split"], CS2: ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Vertigo"], League: ["Summoner's Rift"] };
const AGENTS = { VALORANT: { Duelist: ["Jett", "Raze", "Neon", "Yoru"], Initiator: ["Sova", "Fade", "Gekko", "Breach"], Controller: ["Omen", "Viper", "Astra", "Clove"], Sentinel: ["Cypher", "Killjoy", "Vyse"] }, League: { Mid: ["Ahri", "Azir", "Orianna", "Sylas"], Top: ["Aatrox", "K'Sante", "Rumble"], Jungle: ["Lee Sin", "Viego", "Xin Zhao"], Bot: ["Kai'Sa", "Jinx", "Varus", "Ezreal"], Support: ["Rakan", "Nautilus", "Renata Glasc"] } };
const TOURNAMENTS = { VALORANT: ["VCT Masters Toronto", "VCT Champions 2026", "VCT Americas Stage 2"], CS2: ["IEM Cologne 2026", "BLAST Austin Major", "PGL Bucharest"], League: ["LCK Summer 2026", "Worlds 2026", "MSI 2026"] };

const uuid = (seed) => {
  const hex = (n, len) => Math.floor(n * 16 ** len).toString(16).padStart(len, "0");
  const r = (k) => (Math.sin(seed * 7919 + k * 104729) * 10007) % 1;
  return `${hex(Math.abs(r(1)), 8)}-${hex(Math.abs(r(2)), 4)}-4${hex(Math.abs(r(3)), 3)}-a${hex(Math.abs(r(4)), 3)}-${hex(Math.abs(r(5)), 12)}`;
};

export function register(app, h) {
  const { rand, isoAgo, isoIn, protect, pick } = h;
  const GAMES = ["VALORANT", "CS2", "League"];
  const REGIONS = { VALORANT: ["NA", "EMEA", "APAC", "Brazil"], CS2: ["NA", "Europe", "CIS", "Asia"], League: ["LCK", "LEC", "LCS", "LPL"] };
  const ROLES = { VALORANT: ["Duelist", "Controller", "Initiator", "Sentinel"], CS2: ["AWPer", "Rifler", "Entry", "Support", "IGL"], League: ["Top", "Jungle", "Mid", "Bot", "Support"] };

  // Build teams + players once.
  const teams = [];
  const players = [];
  GAMES.forEach((game, gi) => {
    TEAMS[game].forEach(([name, abbr, region, tier, color], ti) => {
      const seed = gi * 100 + ti;
      const wins = 18 + Math.floor(rand(seed) * 20);
      const losses = 6 + Math.floor(rand(seed + 1) * 14);
      const sw = Math.floor(wins * 0.4), sl = Math.floor(losses * 0.4);
      // Ids follow agent A's match universe ("team-" + slug) so match rows
      // link to these pages and /matches/completed?team= finds their games;
      // an org on a second game gets a game suffix.
      const slug = "team-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const id = teams.some((t) => t.id === slug) ? `${slug}-${game.toLowerCase()}` : slug;
      teams.push({
        id, name, abbreviation: abbr, game, region, tier,
        wins, losses, win_rate: wins / (wins + losses),
        logo_url: null, rating: Math.round((1150 + rand(seed + 2) * 350) * 100) / 100,
        ranking: ti + 1, color,
        season_wins: sw, season_losses: sl,
        coach: ti < 6 ? { id: uuid(seed + 5000), name: pick(["kaplan", "zonic", "Potter", "XTQZZZ", "Ruben", "kkOma"], seed), role: "Head Coach", image_url: null, since: String(2022 + (seed % 4)), nationality: pick(NAT[region], seed) } : null,
      });
    });
    PLAYERS[game].forEach(([name, real, ti, role], pi) => {
      const seed = gi * 1000 + pi;
      const team = teams.find((t) => t.game === game && t.name === TEAMS[game][ti][0]);
      const rating = game === "League" ? 2.4 + rand(seed) * 3.8 : game === "CS2" ? 0.92 + rand(seed) * 0.5 : 190 + rand(seed) * 90;
      players.push({
        id: uuid(seed + 20000), name, real_name: real, team_name: team.name, team_id: team.id, team_logo_url: null,
        role, game, nationality: pick(NAT[team.region], seed), rating: Math.round(rating * 100) / 100,
        image_url: null, roster_status: pi % 11 === 10 ? "substitute" : "starter", total_games: 40 + Math.floor(rand(seed + 3) * 80),
        region: team.region,
      });
    });
  });
  // A few former players so "Show former players" has something to show.
  const formerSeed = 777;
  players.push({ id: uuid(formerSeed), name: "ShahZaM", real_name: "Shahzeb Khan", team_name: "Sentinels", team_id: teams.find((t) => t.name === "Sentinels" && t.game === "VALORANT").id, team_logo_url: null, role: "Initiator", game: "VALORANT", nationality: "USA", rating: 201.5, image_url: null, roster_status: "inactive", total_games: 60, region: "NA" });

  const publicPlayer = (p) => { const { region, ...rest } = p; void region; return rest; };
  const gameOk = (res, game) => { if (!game || !GAMES.includes(game)) { res.status(400).json({ error: `Invalid game. Must be one of: ${GAMES.join(", ")}` }); return false; } return true; };
  const byRating = (a, b) => b.rating - a.rating;

  // Recent completed games for a player: ids match agent A2's "m-done-N" matches.
  const playerGames = (p, count = 60) => {
    const game = p.game;
    const opponents = teams.filter((t) => t.game === game && t.id !== p.team_id);
    const seedBase = parseInt(p.id.slice(0, 6), 16);
    return Array.from({ length: count }).map((_, i) => {
      const s = seedBase + i * 13;
      const opp = pick(opponents, Math.floor(rand(s) * opponents.length));
      const kills = 8 + Math.floor(rand(s + 1) * 22);
      const deaths = 6 + Math.floor(rand(s + 2) * 16);
      const assists = 2 + Math.floor(rand(s + 3) * 10);
      const completed = isoAgo((i + 1) * 36e5 * 26 + Math.floor(rand(s + 4) * 36e5 * 6));
      const won = rand(s + 5) > 0.42;
      return {
        match_id: `m-done-${i + 1}`,
        game,
        start_time: new Date(new Date(completed).getTime() - 2 * 36e5).toISOString(),
        completed_at: completed,
        map_name: pick(MAPS[game], Math.floor(rand(s + 6) * MAPS[game].length)),
        team1_id: p.team_id, team2_id: opp.id, team1_score: won ? 13 : 9 + Math.floor(rand(s + 7) * 3), team2_score: won ? 7 + Math.floor(rand(s + 8) * 5) : 13,
        team1_name: p.team_name, team2_name: opp.name, team1_logo_url: null, team2_logo_url: null,
        winner_id: won ? p.team_id : opp.id, winner_name: won ? p.team_name : opp.name,
        opponent_name: opp.name, opponent_logo_url: null, won,
        kills, deaths, assists,
        acs: game === "VALORANT" ? Math.round((150 + rand(s + 9) * 150) * 10) / 10 : null,
        adr: game === "League" ? null : Math.round((110 + rand(s + 10) * 80) * 10) / 10,
        rating: game === "CS2" ? Math.round((0.7 + rand(s + 11) * 0.9) * 100) / 100 : null,
        kast: game === "CS2" ? Math.round((60 + rand(s + 12) * 25) * 10) / 10 : null,
        kda: game === "League" ? Math.round(((kills + assists) / Math.max(deaths, 1)) * 100) / 100 : null,
        side: game === "League" ? (rand(s + 13) > 0.5 ? "Blue" : "Red") : null,
        character_name: game === "VALORANT" ? pick(AGENTS.VALORANT[p.role] ?? ["Jett"], i) : game === "League" ? pick(AGENTS.League[p.role] ?? ["Ahri"], i) : null,
        position: game === "League" ? p.role : null,
        plus_minus: kills - deaths, gold_earned: game === "League" ? 11000 + Math.floor(rand(s + 14) * 6000) : null,
        cs_per_min: game === "League" ? Math.round((6 + rand(s + 15) * 4) * 10) / 10 : null,
        vision_score: game === "League" ? 20 + Math.floor(rand(s + 16) * 60) : null,
      };
    });
  };

  // ── Players ─────────────────────────────────────────────────────────────
  app.get("/api/players/top", (req, res) => {
    const { game, region, role, teamId } = req.query;
    const q = (req.query.q || "").trim().toLowerCase();
    if (!gameOk(res, game)) return;
    if (region && !REGIONS[game].includes(region)) return res.status(400).json({ error: `Invalid region for ${game}. Must be one of: ${REGIONS[game].join(", ")}` });
    if (role && !ROLES[game].includes(role)) return res.status(400).json({ error: `Invalid role for ${game}. Must be one of: ${ROLES[game].join(", ")}` });
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const rows = players.filter((p) => p.game === game)
      .filter((p) => p.roster_status !== "inactive")
      .filter((p) => !region || p.region === region)
      .filter((p) => !role || p.role === role)
      .filter((p) => !teamId || p.team_id === teamId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.real_name || "").toLowerCase().includes(q) || (p.team_name || "").toLowerCase().includes(q))
      .sort(byRating);
    res.set("X-Cache", "mock");
    res.json(rows.slice(offset, offset + limit).map(publicPlayer));
  });

  app.get("/api/players/filters", (req, res) => {
    const { game } = req.query;
    if (!gameOk(res, game)) return;
    res.json({ game, regions: REGIONS[game], roles: ROLES[game] });
  });

  app.get("/api/players/search", (req, res) => {
    const { game } = req.query;
    const q = (req.query.q || "").trim().toLowerCase();
    if (!gameOk(res, game)) return;
    if (!q) return res.status(400).json({ error: "Search term (q) is required" });
    res.json(players.filter((p) => p.game === game && p.name.toLowerCase().includes(q)).map(publicPlayer));
  });

  app.get("/api/players/popular", (req, res) => {
    const { game } = req.query;
    if (!gameOk(res, game)) return;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    // "Popularity" = a stable shuffle of the top list.
    const rows = players.filter((p) => p.game === game && p.roster_status === "starter").sort((a, b) => rand(parseInt(a.id.slice(0, 4), 16)) - rand(parseInt(b.id.slice(0, 4), 16)));
    res.json(rows.slice(0, limit).map(publicPlayer));
  });

  const findPlayer = (res, id) => {
    const p = players.find((x) => x.id === id);
    if (!p) { res.status(404).json({ error: "Player not found" }); return null; }
    return p;
  };

  app.get("/api/players/:id", (req, res) => {
    const p = findPlayer(res, req.params.id);
    if (!p) return;
    const games = playerGames(p, 100);
    const n = games.length;
    const avg = (k) => Math.round((games.reduce((s, g) => s + (g[k] ?? 0), 0) / n) * 100) / 100;
    const acs = games.map((g) => g.acs).filter((v) => v != null);
    const rtg = games.map((g) => g.rating).filter((v) => v != null);
    const kda = games.map((g) => g.kda).filter((v) => v != null);
    const max = (arr) => (arr.length ? Math.max(...arr) : null);
    const mean = (arr) => (arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100 : null);
    res.json({
      ...publicPlayer(p),
      career_stats: {
        games_played: n, avg_kills: avg("kills"), avg_deaths: avg("deaths"), avg_assists: avg("assists"),
        avg_acs: mean(acs), avg_rating: mean(rtg), avg_kda: mean(kda),
        best_acs: max(acs), best_rating: max(rtg), best_kda: max(kda), max_kills: max(games.map((g) => g.kills)),
      },
    });
  });

  app.get("/api/players/:id/stats", (req, res) => {
    const p = findPlayer(res, req.params.id);
    if (!p) return;
    res.json(playerGames(p, 10).map((g, i) => ({
      id: uuid(i + 90000), player_id: p.id, player_name: p.name, match_id: g.match_id,
      kills: g.kills, deaths: g.deaths, assists: g.assists, acs: g.acs, adr: g.adr, headshot_pct: g.acs ? Math.round(20 + rand(i) * 20) : null,
      rating: g.rating, kda: g.kda, cs_per_min: g.cs_per_min, agent: g.character_name, map_name: g.map_name, plus_minus: g.plus_minus,
    })));
  });

  // Keyset paging: before = last row's completed_at, before_id = its match_id.
  app.get("/api/players/:id/matches", (req, res) => {
    const p = findPlayer(res, req.params.id);
    if (!p) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 500);
    let rows = playerGames(p, 60);
    const before = req.query.before ? new Date(req.query.before) : null;
    const beforeId = req.query.before_id || null;
    if (before && !Number.isNaN(before.getTime())) {
      rows = rows.filter((r) => new Date(r.completed_at) < before || (r.completed_at === before.toISOString() && beforeId && r.match_id < beforeId));
    }
    if (req.query.from) rows = rows.filter((r) => new Date(r.completed_at) >= new Date(req.query.from));
    if (req.query.to) rows = rows.filter((r) => new Date(r.completed_at) < new Date(req.query.to));
    res.json(rows.slice(0, limit));
  });

  // ── Comments + moderation ─────────────────────────────────────────────────
  const commentStore = new Map();   // playerId → [{...}]
  const blocked = new Set();
  const seedComments = (p) => {
    if (commentStore.has(p.id)) return commentStore.get(p.id);
    const seed = parseInt(p.id.slice(0, 5), 16);
    const authors = [["user-1", "ivan"], ["user-2", "andrew"], ["user-3", "gavin"], ["user-4", "karlo"], ["user-5", "esports_fan99"]];
    const bodies = [`${p.name} has been on fire this split.`, "Clutch after clutch. Unreal.", `Honestly the best ${p.role ?? "player"} in the region right now.`, "That last map was rough but he'll bounce back.", "Signed the deal. Let's go!", "Underrated. People sleep on him."];
    const rows = Array.from({ length: 3 + Math.floor(rand(seed) * 4) }).map((_, i) => {
      const [uid, uname] = pick(authors, seed + i);
      return { id: uuid(seed * 10 + i), player_id: p.id, body: pick(bodies, seed + i * 3), created_at: isoAgo((i + 1) * 36e5 * 7 + Math.floor(rand(seed + i) * 36e5)), user_id: uid, username: uname, avatar_url: null };
    });
    commentStore.set(p.id, rows);
    return rows;
  };
  const serializeComment = (c, viewerId) => ({ id: c.id, body: c.body, created_at: c.created_at, author: { id: c.user_id, username: c.username, avatar_url: c.avatar_url }, can_delete: c.user_id === viewerId });

  app.get("/api/players/:id/comments", protect, (req, res) => {
    const p = findPlayer(res, req.params.id);
    if (!p) return;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const rows = seedComments(p).filter((c) => !blocked.has(c.user_id)).slice(offset, offset + limit);
    res.json({ comments: rows.map((c) => serializeComment(c, req.user.sub)), limit, offset, count: rows.length });
  });
  app.post("/api/players/:id/comments", protect, (req, res) => {
    const p = findPlayer(res, req.params.id);
    if (!p) return;
    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "Comment body is required" });
    if (body.length > 500) return res.status(400).json({ error: "Comment must be 500 characters or less" });
    const c = { id: uuid(Date.now() % 100000), player_id: p.id, body, created_at: new Date().toISOString(), user_id: req.user.sub, username: req.user.email.split("@")[0], avatar_url: null };
    seedComments(p).unshift(c);
    res.status(201).json(serializeComment(c, req.user.sub));
  });
  app.delete("/api/comments/:id", protect, (req, res) => {
    for (const rows of commentStore.values()) {
      const i = rows.findIndex((c) => c.id === req.params.id);
      if (i >= 0) {
        if (rows[i].user_id !== req.user.sub) return res.status(403).json({ error: "You can only delete your own comments" });
        rows.splice(i, 1);
        return res.json({ message: "Comment deleted" });
      }
    }
    res.status(404).json({ error: "Comment not found" });
  });
  app.post("/api/comments/:id/report", protect, (_req, res) => res.json({ message: "Report submitted" }));
  app.post("/api/users/:id/block", protect, (req, res) => { blocked.add(req.params.id); res.json({ message: "User blocked" }); });
  app.delete("/api/users/:id/block", protect, (req, res) => { blocked.delete(req.params.id); res.json({ message: "User unblocked" }); });

  // ── Teams ─────────────────────────────────────────────────────────────────
  const publicTeam = (t) => { const { color, ...rest } = t; void color; return rest; };
  const hash = (str) => [...String(str)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100003, 7);
  app.get("/api/teams", (req, res) => {
    const { game } = req.query;
    const q = (req.query.q || "").trim().toLowerCase();
    if (!gameOk(res, game)) return;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const tier = req.query.tier ? parseInt(req.query.tier) : null;
    const rows = teams.filter((t) => t.game === game)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.abbreviation.toLowerCase().includes(q))
      .filter((t) => tier == null || t.tier === tier)
      .sort((a, b) => (a.ranking ?? 1e9) - (b.ranking ?? 1e9));
    res.json(rows.slice(offset, offset + limit).map(publicTeam));
  });
  app.get("/api/teams/popular", (req, res) => {
    const game = req.query.game ? String(req.query.game) : null;
    if (game && !GAMES.includes(game)) return res.status(400).json({ error: `Invalid game. Must be one of: ${GAMES.join(", ")}` });
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const rows = teams.filter((t) => !game || t.game === game).sort((a, b) => (a.ranking ?? 1e9) - (b.ranking ?? 1e9));
    res.json(rows.slice(0, limit).map(publicTeam));
  });
  const findTeam = (res, id) => {
    const t = teams.find((x) => x.id === id);
    if (!t) { res.status(404).json({ error: "Team not found" }); return null; }
    return t;
  };
  app.get("/api/teams/:id/map-pool", (req, res) => {
    const t = findTeam(res, req.params.id);
    if (!t) return;
    const { game } = req.query;
    if (!gameOk(res, game)) return;
    const seed = hash(t.id);
    if (game === "League") {
      const bg = 10 + Math.floor(rand(seed) * 10), rg = 8 + Math.floor(rand(seed + 1) * 10);
      const bw = Math.floor(bg * (0.45 + rand(seed + 2) * 0.3)), rw = Math.floor(rg * (0.4 + rand(seed + 3) * 0.3));
      return res.json({ teamId: t.id, game, maps: [], sides: { blue: { games: bg, wins: bw, losses: bg - bw }, red: { games: rg, wins: rw, losses: rg - rw } } });
    }
    const maps = MAPS[game].slice(0, 5 + (seed % 3)).map((map, i) => {
      const games = 4 + Math.floor(rand(seed + i * 7) * 16);
      const wins = Math.floor(games * (0.3 + rand(seed + i * 11) * 0.5));
      return { map, games, wins, losses: games - wins };
    });
    res.json({ teamId: t.id, game, maps, sides: null });
  });
  app.get("/api/teams/:id/players", (req, res) => {
    const t = findTeam(res, req.params.id);
    if (!t) return;
    res.json(players.filter((p) => p.team_id === t.id).sort(byRating).map(publicPlayer));
  });
  app.get("/api/teams/:id/titles", (req, res) => {
    const t = findTeam(res, req.params.id);
    if (!t) return;
    const seed = hash(t.id);
    const n = t.tier === 1 ? Math.floor(rand(seed) * 4) : 0;
    const rows = Array.from({ length: n }).map((_, i) => ({
      id: uuid(seed + i + 3), team_id: t.id, tournament: pick(TOURNAMENTS[t.game], seed + i), title: pick(TOURNAMENTS[t.game], seed + i), game: t.game, year: 2026 - i, is_major: i === 0 && rand(seed + 9) > 0.5, placement: 1,
    }));
    const majors = rows.filter((r) => r.is_major), other = rows.filter((r) => !r.is_major);
    res.json({ teamId: t.id, totalTitles: rows.length, majorTitles: majors.length, titles: rows, majors, other });
  });
  app.get("/api/teams/:id/sides", (req, res) => {
    const t = findTeam(res, req.params.id);
    if (!t) return;
    const { game } = req.query;
    if (!game) return res.status(400).json({ error: "game query parameter is required" });
    if (!["VALORANT", "CS2"].includes(game)) return res.status(400).json({ error: "Side stats are only available for VALORANT and CS2" });
    const seed = hash(t.id);
    const sides = (game === "VALORANT" ? [["attacker", "Attack"], ["defender", "Defense"]] : [["T", "T Side"], ["CT", "CT Side"]]).map(([side, label], i) => ({
      side, label, matchesPlayed: 20 + Math.floor(rand(seed + i) * 20),
      avgKills: Math.round((14 + rand(seed + i + 1) * 6) * 100) / 100, avgDeaths: Math.round((12 + rand(seed + i + 2) * 6) * 100) / 100,
      avgAdr: Math.round((130 + rand(seed + i + 3) * 40) * 100) / 100, avgPlusMinus: Math.round((rand(seed + i + 4) * 6 - 2) * 100) / 100,
    }));
    res.json({ teamId: t.id, game, sides });
  });
  app.get("/api/teams/:id/stats", (req, res) => {
    const t = findTeam(res, req.params.id);
    if (!t) return;
    const { game } = req.query;
    if (!gameOk(res, game)) return;
    const seed = hash(t.id);
    const avgStats = { kills: Math.round((70 + rand(seed) * 20) * 100) / 100, deaths: Math.round((60 + rand(seed + 1) * 20) * 100) / 100, assists: Math.round((25 + rand(seed + 2) * 20) * 100) / 100, plusMinus: Math.round((rand(seed + 3) * 20 - 5) * 100) / 100 };
    if (game === "VALORANT" || game === "CS2") { avgStats.avgTeamAcs = Math.round((200 + rand(seed + 4) * 40) * 100) / 100; avgStats.avgTeamAdr = Math.round((140 + rand(seed + 5) * 30) * 100) / 100; avgStats.avgTeamHeadshots = 40; }
    if (game === "CS2") { avgStats.hltvRanking = t.ranking; avgStats.hltvRating = Math.round((1 + rand(seed + 6) * 0.2) * 100) / 100; }
    if (game === "League") { avgStats.avgGoldDiffAt15 = Math.round((rand(seed + 7) * 2400 - 800) * 100) / 100; avgStats.avgKda = Math.round((2.5 + rand(seed + 8) * 2) * 100) / 100; avgStats.worldsAppearances = Math.floor(rand(seed + 9) * 6); avgStats.worldsTitles = Math.floor(rand(seed + 10) * 2); }
    res.json({ teamId: t.id, game, totalMatches: t.wins + t.losses, avgStats });
  });
  app.get("/api/teams/:id", (req, res) => {
    const t = findTeam(res, req.params.id);
    if (!t) return;
    res.json(publicTeam(t));
  });

  app.get("/api/coaches/:id", (req, res) => {
    const t = teams.find((x) => x.coach?.id === req.params.id);
    if (!t) return res.status(404).json({ error: "Coach not found" });
    const others = teams.filter((x) => x.game === t.game && x.id !== t.id);
    res.json({
      ...t.coach,
      team_id: t.id, team_name: t.name,
      history: [
        { team_name: t.name, team_logo_url: null, role: t.coach.role, from: t.coach.since, to: null },
        { team_name: pick(others, hash(t.id)).name, team_logo_url: null, role: "Assistant Coach", from: String(Number(t.coach.since) - 2), to: t.coach.since },
      ],
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────
  app.get("/api/search", protect, (req, res) => {
    const q = String(req.query.query ?? req.query.q ?? "").trim().toLowerCase();
    const game = req.query.game ? String(req.query.game) : null;
    if (!q) return res.json({ players: [], teams: [], tournaments: [], users: [] });
    const users = [["user-2", "andrew"], ["user-3", "gavin"], ["user-4", "karlo"], ["user-6", "tenz_fan"], ["user-7", "faker_goat"]].map(([id, username]) => ({ id, username, avatar_url: null }));
    res.json({
      players: players.filter((p) => (!game || p.game === game) && (p.name.toLowerCase().includes(q) || (p.real_name || "").toLowerCase().includes(q))).slice(0, 10).map(publicPlayer),
      teams: teams.filter((t) => (!game || t.game === game) && (t.name.toLowerCase().includes(q) || t.abbreviation.toLowerCase().includes(q))).slice(0, 10).map(publicTeam),
      tournaments: GAMES.flatMap((g) => (!game || g === game ? TOURNAMENTS[g].filter((t) => t.toLowerCase().includes(q)).map((name) => ({ name, game: g })) : [])),
      users: users.filter((u) => u.username.includes(q)),
    });
  });

  // ── News ──────────────────────────────────────────────────────────────────
  const NEWS = [
    ["VALORANT", "Sentinels complete roster with former Fnatic star ahead of Champions", "Sentinels have confirmed the signing, rounding out a five that already topped the Americas regular season.", "VLR.gg"],
    ["CS2", "Vitality win IEM Cologne as ZywOo claims record ninth MVP medal", "The French side swept the grand final 3-0 in front of a sold-out Lanxess Arena.", "HLTV"],
    ["League", "T1 lock in Worlds seed after dramatic five-game series against Gen.G", "Faker's late-game Azir sealed a comeback that keeps the dynasty on track for a fourth title.", "Dot Esports"],
    ["VALORANT", "Masters Toronto: Paper Rex eliminate G2 in lower-bracket thriller", "Something's 41-kill Lotus broke the series open.", "Dexerto"],
    ["CS2", "Team Spirit's donk becomes youngest player to reach 1.30 yearly rating", null, "HLTV"],
    ["League", "LCK Summer playoffs set: Hanwha Life and Dplus KIA round out the top four", "The format expands to six teams this year, with double elimination from the quarterfinals.", "Inven Global"],
    ["CS2", "Valve regional standings: FaZe climb to third after Austin Major run", null, "Dust2.us"],
    ["VALORANT", "LOUD's aspas: 'We are not done yet' after Champions group draw", "Brazil's star duelist spoke to press after the group stage draw placed LOUD alongside DRX.", "The Esports Advocate"],
    ["League", "Bilibili Gaming confirm Knight's contract extension through 2028", null, "Sheep Esports"],
    ["CS2", "MOUZ and torzsi: inside the AWP role that rebuilt a dynasty", "A long read on how a 22-year-old reshaped the European giant's playbook.", "HLTV"],
    ["VALORANT", "Fnatic unveil new jersey for Champions 2026", null, "Fnatic.com"],
    ["League", "G2 Esports sweep Fnatic to claim LEC Summer title", "Caps collected his fifteenth domestic trophy.", "Dot Esports"],
  ];
  app.get("/api/news", (req, res) => {
    const game = String(req.query.game ?? "all");
    if (!["all", ...GAMES].includes(game)) return res.status(400).json({ error: `Invalid game. Must be one of: all, ${GAMES.join(", ")}` });
    const rows = NEWS.filter(([g]) => game === "all" || g === game).map(([g, title, description, source], i) => ({
      id: `news-${i + 1}`, title, description, url: `https://example.com/news/${i + 1}`, image_url: null, source, game: g,
      published_at: isoAgo((i + 1) * 36e5 * 5 + Math.floor(rand(i) * 36e5)), is_premium: false,
    }));
    res.json(rows);
  });

  // ── Follow (shared by profile / players / teams) ──────────────────────────
  const follows = new Map();   // "type:id" → true
  const VALID_TARGET_TYPES = ["user", "player", "team"];
  app.post("/api/follow", protect, (req, res) => {
    const { targetType, targetId } = req.body ?? {};
    if (!VALID_TARGET_TYPES.includes(targetType)) return res.status(400).json({ error: `targetType must be one of: ${VALID_TARGET_TYPES.join(", ")}` });
    if (!targetId) return res.status(400).json({ error: "Invalid targetId format" });
    follows.set(`${targetType}:${targetId}`, true);
    res.json({});
  });
  app.post("/api/unfollow", protect, (req, res) => {
    const { targetType, targetId } = req.body ?? {};
    if (!VALID_TARGET_TYPES.includes(targetType)) return res.status(400).json({ error: `targetType must be one of: ${VALID_TARGET_TYPES.join(", ")}` });
    follows.delete(`${targetType}:${targetId}`);
    res.json({});
  });
  // Membership for the follow store (GET /users/me/following?type=player|team).
  // Registered on the exact "me" path so it answers for the follow buttons;
  // agent D's /api/users/:id/following keeps serving the Following lists
  // (user type) for everyone else.
  app.get("/api/users/me/following", protect, (req, res, next) => {
    const type = String(req.query.type ?? "user").toLowerCase();
    if (type === "user") return next();
    const rows = [...follows.keys()].filter((k) => k.startsWith(`${type}:`)).map((k) => {
      const id = k.slice(type.length + 1);
      const p = type === "player" ? players.find((x) => x.id === id) : teams.find((x) => x.id === id);
      return { id, target_id: id, target_type: type, name: p?.name ?? null, game: p?.game ?? null, image_url: null, logo_url: null, followed_at: isoAgo(36e5) };
    });
    res.json(rows);
  });

  // ── Predictions player overview (premium; the player page's Top Agents) ──
  // Agent C owns /predictions; this registers only when C's module hasn't.
  const stack = app.router?.stack ?? app._router?.stack ?? [];
  const hasOverview = stack.some((l) => l.route?.path === "/api/predictions/player-overview/:playerId" || l.route?.path === "/api/predictions/player-overview/:id");
  if (!hasOverview) {
    app.get("/api/predictions/player-overview/:playerId", protect, (req, res) => {
      const p = findPlayer(res, req.params.playerId);
      if (!p) return;
      if (!h.me.is_premium) return res.status(403).json({ error: "This feature requires Insight Pro.", code: "PREMIUM_REQUIRED" });
      const games = playerGames(p, 40);
      const byAgent = new Map();
      for (const g of games) {
        if (!g.character_name) continue;
        const a = byAgent.get(g.character_name) ?? { agent: g.character_name, gamesPlayed: 0, wins: 0, k: 0, acs: 0, kda: 0 };
        a.gamesPlayed++; if (g.won) a.wins++; a.k += g.kills; a.acs += g.acs ?? 0; a.kda += g.kda ?? (g.kills + g.assists) / Math.max(g.deaths, 1);
        byAgent.set(g.character_name, a);
      }
      const agentBreakdown = [...byAgent.values()].map((a) => ({
        agent: a.agent, gamesPlayed: a.gamesPlayed, wins: a.wins, winRate: `${Math.round((a.wins / a.gamesPlayed) * 100)}%`,
        avgStat: Math.round((p.game === "League" ? a.kda / a.gamesPlayed : a.k / a.gamesPlayed) * 100) / 100,
        avgKDA: Math.round((a.kda / a.gamesPlayed) * 100) / 100,
        avgACS: p.game === "VALORANT" ? Math.round(a.acs / a.gamesPlayed) : null, avgRating: null,
      })).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
      res.json({ playerId: p.id, game: p.game, agentBreakdown, season: { gamesPlayed: games.length, winRate: `${Math.round((games.filter((g) => g.won).length / games.length) * 100)}%` }, cached: false });
    });
  }

  // Expose the seed for other mock modules (match rows can reuse real team ids/names).
  h.mockTeams = teams;
  h.mockPlayers = players;
  void isoIn;
}
