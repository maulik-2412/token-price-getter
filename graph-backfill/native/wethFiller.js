import sqlite3 from "sqlite3";
import { open } from "sqlite";  // gives promise API wrapper
import { getPoolHourDataRange } from "./getPriceAtTimestamp.js";

(async () => {
  const db = await open({
    filename: "../local.sqlite",
    driver: sqlite3.Database,
  });

  // 1. Fetch all timestamps
  const rows = await db.all("SELECT timestamp FROM weth_prices ORDER BY timestamp");

  if (rows.length === 0) {
    console.log("weth_prices table is empty.");
    process.exit(1);
  }

  const existing = new Set(rows.map((r) => r.timestamp));
  const start = rows[0].timestamp;
  const end = rows[rows.length - 1].timestamp;

  console.log(`Range: ${start} → ${end}`);
  console.log(`Existing rows: ${rows.length}`);

  // 2. Find missing timestamps
  const missing = [];

  for (let ts = start; ts <= end; ts += 3600) {
    if (!existing.has(ts)) missing.push(ts);
  }

  console.log(`Missing hours: ${missing.length}`);
  if (missing.length === 0) {
    console.log("Table is already complete.");
    process.exit(0);
  }

  const insert = `INSERT INTO weth_prices (timestamp, price) VALUES (?, ?)`;

  // 3. Insert missing timestamps
  for (const ts of missing) {
    try {
      const wethIs0 = false;
      const price = await getWethPriceAtTimestamp(ts,"0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",wethIs0);

      if (!price) {
        console.log(`Skipping ${ts} (no price returned)`);
        continue;
      }

      await db.run(insert, [ts, price]);
      console.log(`Inserted: ${ts} => ${price}`);

      // small delay to avoid API stress
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`Failed for ${ts}`, err);
    }
  }

  console.log("🎉 Backfill complete!");

  await db.close();
})();


async function getWethPriceAtTimestamp(ts, poolId="0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8", wethIs0) {
  poolId = poolId.toLowerCase();

  // Fetch only this hour
  const data = await getPoolHourDataRange(poolId, ts, ts);
  if (!data || data.length === 0) return null;

  const h = data[0]; // exact hour match

  // Convert to USD
  return wethIs0
    ? parseFloat(h.token1Price)
    : parseFloat(h.token0Price);
}
