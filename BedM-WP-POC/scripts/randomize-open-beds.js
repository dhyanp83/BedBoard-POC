const fs = require("fs");
const path = require("path");

const dbFile = path.join(__dirname, "..", "data", "db.json");
const db = JSON.parse(fs.readFileSync(dbFile, "utf8"));
const targetRate = Number(process.argv[2] || 0.1);
const targetOpen = Math.round(db.beds.length * targetRate);
const admin = db.users.find(user => user.role === "ADMIN") || db.users[0];

let seed = 20260429;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const shuffledIds = [...db.beds]
  .map(bed => ({ id: bed.id, score: random() }))
  .sort((a, b) => a.score - b.score)
  .slice(0, targetOpen)
  .map(item => item.id);
const openIds = new Set(shuffledIds);
const now = Date.now();

db.beds = db.beds.map((bed, index) => {
  const isOpen = openIds.has(bed.id);
  const minutesAgo = 20 + Math.floor(random() * 540);
  return {
    ...bed,
    status: isOpen ? "OPEN" : "OCCUPIED",
    updatedAt: new Date(now - minutesAgo * 60 * 1000).toISOString(),
    lastUpdatedByUserId: isOpen ? admin.id : bed.lastUpdatedByUserId,
    lastStatusUpdatedAt: isOpen ? new Date(now - minutesAgo * 60 * 1000).toISOString() : bed.lastStatusUpdatedAt
  };
});

db.meta = {
  ...(db.meta || {}),
  demoOpenRate: targetRate,
  demoOpenBeds: targetOpen,
  demoRandomizedAt: new Date(now).toISOString()
};

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
console.log(`Set ${targetOpen} of ${db.beds.length} beds to OPEN (${Math.round(targetRate * 100)}%).`);
