import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fetch from "node-fetch";

const GRAPH_URL = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";

// Hardcoded global timestamp range
const GLOBAL_START = 1710892800;
const GLOBAL_END = 1764975600;
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
import { CONFIG } from "../config.js";
const UNISWAP_V3_SUBGRAPH = CONFIG.GRAPH.uniswapSubGraphEndpoint;
const UNISWAP_V2_SUBGRAPH =
  "https://gateway.thegraph.com/api/subgraphs/id/A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum";

/**
 * Run GraphQL query against Uniswap V3 subgraph
 */
async function querySubgraph(query) {
  const res = await fetch(UNISWAP_V3_SUBGRAPH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.GRAPH.graphAPIKey}`,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function getPoolHourDataRange(poolId, start, end) {
  let all = [];
  let lastDate = start;
  const batchSize = 1000;
  poolId = poolId.toLowerCase();

  while (true) {
    const query = `
    {
      poolHourDatas(
        first: ${batchSize}
        orderBy: periodStartUnix
        orderDirection: asc
        where: {
          pool: "${poolId}",
          periodStartUnix_gte: ${lastDate},
          periodStartUnix_lte: ${end}
        }
      ) {
        periodStartUnix
        token0Price
        token1Price
      }
    }`;

    const data = await retry(() => querySubgraph(query));
    const batch = data.poolHourDatas;

    if (!batch.length) break;

    all = all.concat(batch);

    lastDate = batch[batch.length - 1].periodStartUnix+1;

    if (batch.length < batchSize) break;
  }

  return all;
}

// Get nearest WETH price <= timestamp
async function getNearestWethPrice(db, ts) {
  // exact match?
  let row = await db.get(
    `SELECT price FROM weth_prices WHERE timestamp = ? LIMIT 1`,
    ts
  );
  if (row) return row.price;

  // nearest <=
  row = await db.get(
    `SELECT price FROM weth_prices WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1`,
    ts
  );
  if (row) return row.price;

  // fallback: nearest >=
  row = await db.get(
    `SELECT price FROM weth_prices WHERE timestamp >= ? ORDER BY timestamp ASC LIMIT 1`,
    ts
  );
  if (row) return row.price;

  return null;
}

async function ensureHourly(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS hourly_prices (
      coin_id TEXT NOT NULL,
      laika_coin_naming TEXT,
      symbol TEXT,
      contract_addresses TEXT,
      price REAL,
      price_timestamp TEXT,
      data_source TEXT,
      created_at TEXT,
      PRIMARY KEY (coin_id, price_timestamp)
    );
  `);
}

(async () => {
  const db = await open({
    filename: "../local.sqlite",
    driver: sqlite3.Database,
  });
  await ensureHourly(db);

  const coins = JSON.parse(
    await fs.readFile("./eth-coins-v3-pools.json", "utf8")
  );

  const filtered = coins.filter((c) => c.coin === "WETH" && c.poolIdV3);

  console.log(`Processing ${filtered.length} coins...`);

  await runWithConcurrency(filtered, 5, async (coin) => {
    await processCoin(db,coin);
  });

  console.log("\nDONE.");
  await db.close();
})();

async function processCoin(db,c) {
  console.log(`\n=== ${c.symbol} / ${c.laika_coin_naming} ===`);
  const poolId = c.poolIdV3.toLowerCase();

  const token0 = (c.token0 || "").toLowerCase();
  const token1 = (c.token1 || "").toLowerCase();
  const WETH_ADDR = WETH;

  const rows = await getPoolHourDataRange(poolId, GLOBAL_START, GLOBAL_END);

  console.log(`→ fetched ${rows.length} poolHourData rows`);

  for (const h of rows) {
    const ts = h.periodStartUnix;

    let priceInWeth = null;

    // Determine which side is WETH
    if (token0 === WETH_ADDR) {
      priceInWeth = parseFloat(h.token1Price);
    } else if (token1 === WETH_ADDR) {
      priceInWeth = parseFloat(h.token0Price);
    } else {
      console.log("Skipping hour because WETH side not identifiable.");
      continue;
    }

    if (!priceInWeth || priceInWeth <= 0) continue;

    const wethUsd = await getNearestWethPrice(db, ts);
    if (!wethUsd) {
      console.log(`No WETH USD price for ts=${ts}, skip.`);
      continue;
    }

    const priceUsd = priceInWeth * wethUsd;

    const createdAt = new Date().toISOString();
    const isoTimestamp = new Date(ts * 1000).toISOString();
    try {
      await db.run(
        `
          INSERT OR IGNORE INTO hourly_prices 
          (coin_id, laika_coin_naming, symbol, contract_addresses, price, price_timestamp, data_source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        c.coin_id,
        c.laika_coin_naming,
        c.symbol,
        JSON.stringify(c.contract_addresses || {}),
        priceUsd,
        isoTimestamp,
        "UNISWAP_GRAPH_V3",
        createdAt
      );
    } catch (e) {
      console.log("Insert error:", e.message);
    }
  }
}
async function runWithConcurrency(items, limit, workerFn) {
  const queue = [...items];
  let active = 0;

  return new Promise((resolve, reject) => {
    let results = [];
    let finished = 0;

    const next = () => {
      if (queue.length === 0 && active === 0) {
        return resolve(results);
      }

      while (active < limit && queue.length > 0) {
        const item = queue.shift();
        active++;

        Promise.resolve(workerFn(item))
          .then((res) => {
            results.push(res);
          })
          .catch((err) => {
            console.error("Worker error:", err);
            // continue even if one fails
          })
          .finally(() => {
            active--;
            finished++;
            next();
          });
      }
    };

    next();
  });
}
async function retry(fn, times = 5, delay = 500) {
  let attempt = 0;
  while (attempt < times) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt === times) throw e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
