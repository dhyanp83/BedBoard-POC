const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SOURCE_SITES_FILE = path.join(DATA_DIR, "sourceSites.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const SOURCE_DIR = path.join(ROOT, "source-data");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const APP_ENV = process.env.APP_ENV || "development";

const roles = ["SITE_USER", "SDO_USER", "PROVINCIAL_USER", "ADMIN"];
const statusValues = ["OPEN", "OCCUPIED"];

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
    });
  });
}

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function parseExpiry(value) {
  const match = String(value).match(/^(\d+)([mhd])$/);
  if (!match) return 8 * 60 * 60;
  const amount = Number(match[1]);
  return amount * ({ m: 60, h: 3600, d: 86400 }[match[2]]);
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signToken(user) {
  const exp = Math.floor(Date.now() / 1000) + parseExpiry(JWT_EXPIRES_IN);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ sub: user.id, role: user.role, exp }));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split("$");
  const attempt = hashPassword(password, salt).split("$")[2];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(attempt));
}

function loadDb() {
  ensureSeeded();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function inferSdoName(code) {
  return {
    IERHA: "Interlake-Eastern Regional Health Authority",
    NRHA: "Northern Regional Health Authority",
    PMH: "Prairie Mountain Health",
    "SH-SS": "Southern Health-Sante Sud",
    WRHA: "Winnipeg Regional Health Authority"
  }[code] || code;
}

function readSourceSites() {
  if (fs.existsSync(SOURCE_SITES_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SOURCE_SITES_FILE, "utf8").replace(/^\uFEFF/, ""));
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // Fall through to the workbook extractor or embedded sample.
    }
  }
  if (!fs.existsSync(SOURCE_DIR)) return fallbackSites();
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(ROOT, "scripts", "extract-xlsx.ps1"),
    "-SourceDir", SOURCE_DIR
  ], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) return fallbackSites();
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return fallbackSites();
  }
}

function fallbackSites() {
  return [
    { sdoCode: "IERHA", name: "Ashern Personal Care Home", address: "1 Steenson Drive", totalBeds: 20 },
    { sdoCode: "IERHA", name: "Betel Home Gimli", address: "96 1st Avenue", totalBeds: 80 },
    { sdoCode: "NRHA", name: "Flin Flon Personal Care Home", address: "50 Church Street", totalBeds: 30 },
    { sdoCode: "PMH", name: "Dauphin Personal Care Home", address: "625 3rd Street South West", totalBeds: 90 },
    { sdoCode: "SH-SS", name: "Bethesda Place", address: "399 Hospital Street", totalBeds: 60 },
    { sdoCode: "WRHA", name: "Misericordia Place", address: "44 Furby Street", totalBeds: 100 }
  ];
}

function ensureSeeded() {
  if (fs.existsSync(DB_FILE)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const timestamp = now();
  const sourceSites = readSourceSites().filter(site => site.name && Number(site.totalBeds) > 0);
  const sdoCodes = [...new Set(sourceSites.map(site => site.sdoCode))].sort();
  const sdos = sdoCodes.map(code => ({
    id: id("sdo"),
    code,
    name: inferSdoName(code),
    createdAt: timestamp,
    updatedAt: timestamp
  }));

  const sites = sourceSites.map((site, index) => {
    const sdo = sdos.find(item => item.code === site.sdoCode);
    return {
      id: id("site"),
      sdoId: sdo.id,
      code: `${site.sdoCode}-${String(index + 1).padStart(3, "0")}`,
      name: site.name,
      address: site.address || "",
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: site.source || "fallback"
    };
  });

  const beds = [];
  for (const site of sites) {
    const source = sourceSites.find(item => item.name === site.name && item.sdoCode === sdos.find(s => s.id === site.sdoId).code);
    const total = Math.min(Number(source.totalBeds), 350);
    for (let i = 1; i <= total; i += 1) {
      beds.push({
        id: id("bed"),
        siteId: site.id,
        bedLabel: `${site.code}-B${String(i).padStart(3, "0")}`,
        unit: i % 10 === 0 ? "Respite" : i % 7 === 0 ? "Special Care" : "General",
        bedType: i % 10 === 0 ? "Respite PCH" : "Licensed PCH",
        status: "OCCUPIED",
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUpdatedByUserId: null,
        lastStatusUpdatedAt: null
      });
    }
  }
  if (APP_ENV === "demo") randomizeOpenBeds(beds, 0.4, timestamp);

  const firstSite = sites[0];
  const firstSdo = sdos.find(sdo => sdo.id === firstSite.sdoId);
  const users = [
    makeUser("site.user@example.com", "Site", "User", "SITE_USER"),
    makeUser("sdo.user@example.com", "SDO", "User", "SDO_USER"),
    makeUser("provincial.user@example.com", "Provincial", "User", "PROVINCIAL_USER"),
    makeUser("admin.user@example.com", "Admin", "User", "ADMIN")
  ];
  const siteUser = users.find(user => user.role === "SITE_USER");
  const sdoUser = users.find(user => user.role === "SDO_USER");

  saveDb({
    sdos,
    sites,
    beds,
    users,
    userSiteAccess: [{ id: id("usa"), userId: siteUser.id, siteId: firstSite.id, createdAt: timestamp }],
    userSdoAccess: [{ id: id("usd"), userId: sdoUser.id, sdoId: firstSdo.id, createdAt: timestamp }],
    auditLogs: [],
    meta: { seededAt: timestamp, sourceFiles: fs.existsSync(SOURCE_DIR) ? fs.readdirSync(SOURCE_DIR) : [] }
  });
}

function randomizeOpenBeds(beds, targetRate, timestamp) {
  let seed = 20260429;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const openIds = new Set([...beds]
    .map(bed => ({ id: bed.id, score: random() }))
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.round(beds.length * targetRate))
    .map(item => item.id));
  for (const bed of beds) {
    if (openIds.has(bed.id)) {
      bed.status = "OPEN";
      bed.updatedAt = timestamp;
      bed.lastStatusUpdatedAt = timestamp;
    }
  }
}

function makeUser(email, firstName, lastName, role) {
  const timestamp = now();
  return {
    id: id("user"),
    email,
    passwordHash: hashPassword("Password123!"),
    firstName,
    lastName,
    role,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role
  };
}

function userFromRequest(req, db) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = db.users.find(item => item.id === payload.sub && item.isActive);
  return user || null;
}

function allowedSiteIds(user, db, write = false) {
  if (user.role === "ADMIN") return db.sites.map(site => site.id);
  const direct = db.userSiteAccess.filter(item => item.userId === user.id).map(item => item.siteId);
  if (write) return direct;
  if (user.role === "PROVINCIAL_USER") return db.sites.map(site => site.id);
  if (user.role === "SDO_USER") {
    const sdoIds = db.userSdoAccess.filter(item => item.userId === user.id).map(item => item.sdoId);
    return db.sites.filter(site => sdoIds.includes(site.sdoId)).map(site => site.id);
  }
  return direct;
}

function matchesBedFilters(bed, filters = {}) {
  return (!filters.unit || bed.unit === filters.unit) &&
    (!filters.bedType || bed.bedType === filters.bedType);
}

function siteSummary(db, site, filters = {}) {
  const scoped = db.beds.filter(bed => bed.siteId === site.id && bed.isActive && matchesBedFilters(bed, filters));
  const openBeds = scoped.filter(bed => bed.status === "OPEN").length;
  const lastUpdated = scoped.map(bed => bed.lastStatusUpdatedAt).filter(Boolean).sort().pop() || null;
  const sdo = db.sdos.find(item => item.id === site.sdoId);
  return {
    siteId: site.id,
    sdoId: site.sdoId,
    sdoName: sdo ? sdo.name : "",
    siteName: site.name,
    totalBeds: scoped.length,
    openBeds,
    occupiedBeds: scoped.length - openBeds,
    openPercentage: scoped.length ? Math.round((openBeds / scoped.length) * 100) : 0,
    lastUpdatedAt: lastUpdated
  };
}

function dashboardForSites(db, sites, filters = {}) {
  const summaries = sites.map(site => siteSummary(db, site, filters)).filter(item => item.totalBeds > 0);
  const totalBeds = summaries.reduce((sum, item) => sum + item.totalBeds, 0);
  const openBeds = summaries.reduce((sum, item) => sum + item.openBeds, 0);
  const scopedBeds = db.beds.filter(bed => sites.some(site => site.id === bed.siteId) && bed.isActive && matchesBedFilters(bed, filters));
  const groupBy = key => Object.values(scopedBeds.reduce((acc, bed) => {
    const name = bed[key] || "Unspecified";
    if (!acc[name]) acc[name] = { name, totalBeds: 0, openBeds: 0, occupiedBeds: 0, openPercentage: 0 };
    acc[name].totalBeds += 1;
    if (bed.status === "OPEN") acc[name].openBeds += 1;
    else acc[name].occupiedBeds += 1;
    acc[name].openPercentage = Math.round((acc[name].openBeds / acc[name].totalBeds) * 100);
    return acc;
  }, {})).sort((a, b) => b.totalBeds - a.totalBeds);
  return {
    totalSites: sites.length,
    totalBeds,
    openBeds,
    occupiedBeds: totalBeds - openBeds,
    openPercentage: totalBeds ? Math.round((openBeds / totalBeds) * 100) : 0,
    sites: summaries,
    units: groupBy("unit"),
    bedTypes: groupBy("bedType")
  };
}

function dashboardFiltersFromUrl(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return {
    sdoId: url.searchParams.get("sdoId") || "",
    siteId: url.searchParams.get("siteId") || "",
    unit: url.searchParams.get("unit") || "",
    bedType: url.searchParams.get("bedType") || ""
  };
}

function filterDashboardSites(sites, filters) {
  return sites.filter(site =>
    (!filters.sdoId || site.sdoId === filters.sdoId) &&
    (!filters.siteId || site.id === filters.siteId)
  );
}

async function handleApi(req, res, pathname) {
  const db = loadDb();
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    const user = db.users.find(item => item.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!user || !user.isActive || !verifyPassword(String(body.password || ""), user.passwordHash)) {
      return send(res, 401, { error: "Invalid credentials." });
    }
    return send(res, 200, { token: signToken(user), user: publicUser(user) });
  }

  const user = userFromRequest(req, db);
  if (!user) return send(res, 401, { error: "Authentication required." });

  if (pathname === "/api/auth/me" && req.method === "GET") {
    return send(res, 200, { user: publicUser(user) });
  }

  if (pathname === "/api/beds" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let siteIds = allowedSiteIds(user, db, false);
    const siteId = url.searchParams.get("siteId");
    if (siteId) siteIds = siteIds.includes(siteId) ? [siteId] : [];
    const status = url.searchParams.get("status");
    const unit = url.searchParams.get("unit");
    const bedType = url.searchParams.get("bedType");
    const beds = db.beds.filter(bed =>
      bed.isActive &&
      siteIds.includes(bed.siteId) &&
      (!status || bed.status === status) &&
      (!unit || bed.unit === unit) &&
      (!bedType || bed.bedType === bedType)
    ).map(bed => enrichBed(db, bed));
    const visibleSites = db.sites.filter(site => siteIds.includes(site.id));
    const visibleSdoIds = [...new Set(visibleSites.map(site => site.sdoId))];
    return send(res, 200, {
      beds,
      sites: visibleSites,
      sdos: db.sdos.filter(sdo => visibleSdoIds.includes(sdo.id))
    });
  }

  const statusMatch = pathname.match(/^\/api\/beds\/([^/]+)\/status$/);
  if (statusMatch && req.method === "PATCH") {
    const body = await readJson(req);
    if (!statusValues.includes(body.status)) return send(res, 400, { error: "Status must be OPEN or OCCUPIED." });
    const bed = db.beds.find(item => item.id === statusMatch[1] && item.isActive);
    if (!bed) return send(res, 404, { error: "Bed not found." });
    if (!allowedSiteIds(user, db, true).includes(bed.siteId)) return send(res, 403, { error: "You are not authorized to update this bed." });
    const previous = bed.status;
    if (previous !== body.status) {
      bed.status = body.status;
      bed.updatedAt = now();
      bed.lastUpdatedByUserId = user.id;
      bed.lastStatusUpdatedAt = now();
      db.auditLogs.unshift({
        id: id("audit"),
        bedId: bed.id,
        previousStatus: previous,
        newStatus: body.status,
        changedByUserId: user.id,
        changedAt: bed.lastStatusUpdatedAt,
        source: "WEB_PORTAL"
      });
      saveDb(db);
    }
    return send(res, 200, enrichBed(db, bed));
  }

  if (pathname === "/api/dashboard/site" && req.method === "GET") {
    const sites = db.sites.filter(site => allowedSiteIds(user, db, false).includes(site.id));
    return send(res, 200, dashboardForSites(db, sites, dashboardFiltersFromUrl(req)));
  }

  if (pathname === "/api/dashboard/sdo" && req.method === "GET") {
    const filters = dashboardFiltersFromUrl(req);
    const sdoIds = user.role === "ADMIN" || user.role === "PROVINCIAL_USER"
      ? db.sdos.map(sdo => sdo.id)
      : db.userSdoAccess.filter(item => item.userId === user.id).map(item => item.sdoId);
    if (filters.sdoId && !sdoIds.includes(filters.sdoId)) return send(res, 403, { error: "You are not authorized for that SDO." });
    const availableSites = db.sites.filter(site => sdoIds.includes(site.sdoId));
    const sites = filterDashboardSites(availableSites, filters);
    const base = dashboardForSites(db, sites, filters);
    return send(res, 200, {
      ...base,
      sdos: db.sdos.filter(sdo => sdoIds.includes(sdo.id)),
      availableSites,
      availableUnits: [...new Set(db.beds.filter(bed => availableSites.some(site => site.id === bed.siteId)).map(bed => bed.unit))].sort(),
      availableBedTypes: [...new Set(db.beds.filter(bed => availableSites.some(site => site.id === bed.siteId)).map(bed => bed.bedType))].sort()
    });
  }

  if (pathname === "/api/dashboard/provincial" && req.method === "GET") {
    if (!["PROVINCIAL_USER", "ADMIN"].includes(user.role)) return send(res, 403, { error: "Provincial access required." });
    const filters = dashboardFiltersFromUrl(req);
    const filteredSites = filterDashboardSites(db.sites, filters);
    const visibleSdoIds = [...new Set(filteredSites.map(site => site.sdoId))];
    const sdoRows = db.sdos.filter(sdo => visibleSdoIds.includes(sdo.id)).map(sdo => {
      const sites = filteredSites.filter(site => site.sdoId === sdo.id);
      return { sdoId: sdo.id, sdoName: sdo.name, ...dashboardForSites(db, sites, filters) };
    });
    const base = dashboardForSites(db, filteredSites, filters);
    return send(res, 200, {
      ...base,
      totalSdos: visibleSdoIds.length,
      sdos: sdoRows,
      allSdos: db.sdos,
      availableSites: db.sites,
      availableUnits: [...new Set(db.beds.map(bed => bed.unit))].sort(),
      availableBedTypes: [...new Set(db.beds.map(bed => bed.bedType))].sort()
    });
  }

  if (pathname === "/api/admin/overview" && req.method === "GET") {
    if (user.role !== "ADMIN") return send(res, 403, { error: "Admin access required." });
    return send(res, 200, {
      users: db.users.map(publicUser),
      sdos: db.sdos,
      sites: db.sites,
      beds: db.beds.map(bed => enrichBed(db, bed)).slice(0, 500),
      auditLogs: db.auditLogs.slice(0, 200).map(log => ({
        ...log,
        bed: enrichBed(db, db.beds.find(bed => bed.id === log.bedId)),
        changedBy: publicUser(db.users.find(item => item.id === log.changedByUserId))
      }))
    });
  }

  send(res, 404, { error: "Not found." });
}

function enrichBed(db, bed) {
  if (!bed) return null;
  const site = db.sites.find(item => item.id === bed.siteId);
  const sdo = site ? db.sdos.find(item => item.id === site.sdoId) : null;
  const updatedBy = db.users.find(item => item.id === bed.lastUpdatedByUserId);
  return {
    ...bed,
    siteName: site ? site.name : "",
    siteCode: site ? site.code : "",
    sdoName: sdo ? sdo.name : "",
    updatedBy: updatedBy ? `${updatedBy.firstName} ${updatedBy.lastName}` : ""
  };
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
    const ext = path.extname(normalized);
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    return fs.createReadStream(normalized).pipe(res);
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  fs.createReadStream(path.join(PUBLIC_DIR, "index.html")).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url.pathname).catch(() => send(res, 500, { error: "Unexpected server error." }));
  } else {
    serveStatic(req, res, url.pathname);
  }
});

ensureSeeded();
if (process.argv.includes("--seed-only")) {
  console.log(`Seeded ${DB_FILE}`);
} else {
  server.listen(PORT, HOST, () => {
    console.log(`Bed Management Portal running at http://${HOST}:${PORT}`);
  });
}
