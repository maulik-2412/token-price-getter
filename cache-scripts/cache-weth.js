// cache-weth.js
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { CONFIG } from "../config.js";

let db;
let initialized = false;

/** -----------------------------------------------
 *  Get or create DB instance
 * ----------------------------------------------- */
async function getDB() {
  if (!db) {
    db = await open({
      filename: CONFIG.D1.local.path,
      driver: sqlite3.Database,
    });
  }
  return db;
}

/** -----------------------------------------------
 *  Ensure table exists (runs only once)
 * ----------------------------------------------- */
async function ensureTable() {
  if (initialized) return;

  const db = await getDB();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS weth_prices (
      timestamp INTEGER PRIMARY KEY,
      price REAL NOT NULL
    );
  `);

  initialized = true;
}

/** -----------------------------------------------
 *  Get WETH price for a given timestamp
 *  Returns:
 *     number | null
 * ----------------------------------------------- */
export async function getLocalWethPrice(timestamp) {
  await ensureTable();
  
  const db = await getDB();
  const row = await db.get(
    `SELECT price FROM weth_prices WHERE timestamp = ?`,
    [timestamp]
  );

  return row ? row.price : null;
}

/** -----------------------------------------------
 *  Store (or overwrite) WETH price for a timestamp
 * ----------------------------------------------- */
export async function storeLocalWethPrice(timestamp, price) {
  await ensureTable();

  const db = await getDB();

  await db.run(
    `
    INSERT INTO weth_prices (timestamp, price)
    VALUES (?, ?)
    ON CONFLICT(timestamp) DO UPDATE SET price = excluded.price;
    `,
    [timestamp, price]
  );
}
