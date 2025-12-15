import sqlite3 from "sqlite3";
import { open } from "sqlite";

(async () => {
  const db = await open({
    filename: "../local.sqlite", // change if needed
    driver: sqlite3.Database,
  });

  console.log("🔌 Connected to SQLite");

  // 1. Ensure table + source column exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS weth_prices (
      timestamp INTEGER PRIMARY KEY,
      price REAL NOT NULL,
      source TEXT
    );
  `);

  try {
    await db.exec(`ALTER TABLE weth_prices ADD COLUMN source TEXT;`);
    console.log("🆕 Added column 'source'");
  } catch (e) {
    if (e.message.includes("duplicate column name")) {
      console.log("ℹ️ Column 'source' already exists");
    } else throw e;
  }

  // 2. Load all timestamps
  const rows = await db.all(
    "SELECT timestamp, price FROM weth_prices ORDER BY timestamp ASC"
  );

  if (rows.length < 2) {
    console.log("Not enough data for interpolation.");
    process.exit(1);
  }

  const existing = new Set(rows.map((r) => r.timestamp));
  const start = rows[0].timestamp;
  const end = rows[rows.length - 1].timestamp;

  console.log(`📅 Range: ${start} → ${end}`);
  console.log(`📌 Existing rows: ${rows.length}`);

  // Build a map for quick lookup
  const priceMap = new Map(rows.map((r) => [r.timestamp, r.price]));

  // 3. Determine missing timestamps
  const missing = [];
  for (let ts = start; ts <= end; ts += 3600) {
    if (!existing.has(ts)) missing.push(ts);
  }

  console.log(`⛔ Missing hours: ${missing.length}`);
  if (missing.length === 0) {
    console.log("🎉 No missing data.");
    process.exit(0);
  }

  const insert = `INSERT INTO weth_prices (timestamp, price, source) VALUES (?, ?, ?)`;

  // Helper: find nearest previous + next timestamps
  function findPrev(ts) {
    let walk = ts - 3600;
    while (walk >= start) {
      if (priceMap.has(walk)) return walk;
      walk -= 3600;
    }
    return null;
  }
  function findNext(ts) {
    let walk = ts + 3600;
    while (walk <= end) {
      if (priceMap.has(walk)) return walk;
      walk += 3600;
    }
    return null;
  }

  // 4. Interpolate & insert
  for (const ts of missing) {
    const prevTs = findPrev(ts);
    const nextTs = findNext(ts);

    if (!prevTs || !nextTs) {
      console.log(`⚠️ Cannot interpolate ${ts} (missing prev/next)`);
      continue;
    }

    const prevPrice = priceMap.get(prevTs);
    const nextPrice = priceMap.get(nextTs);

    // Fraction into the interval
    const fraction = (ts - prevTs) / (nextTs - prevTs);

    const interpolated =
      prevPrice + (nextPrice - prevPrice) * fraction;

    // Insert
    await db.run(insert, [ts, interpolated, "INTERPOLATION"]);
    priceMap.set(ts, interpolated); // update map so chained interpolation is possible

    console.log(
      `➕ ${ts}: ${interpolated} (prev=${prevPrice}, next=${nextPrice})`
    );
  }

  await db.close();
  console.log("🎉 Interpolation fill complete!");
})();
