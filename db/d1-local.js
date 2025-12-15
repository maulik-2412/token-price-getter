import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { CONFIG } from "../config.js";

let db;

async function getDB() {
  if (!db) {
    db = await open({
      filename: CONFIG.D1.local.path,
      driver: sqlite3.Database,
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS coin_price_data_hourly_extended (
        coin_id TEXT ,
        laika_coin_naming TEXT,
        symbol TEXT,
        contract_addresses TEXT,
        price_datetime TEXT,
        price REAL,
        data_source TEXT,
        PRIMARY KEY(coin_id, price_datetime)
      );
    `);
  }
  return db;
}

export async function insertRowsD1Local(table, rows) {
  const db = await getDB();

  const stmt = await db.prepare(
    `INSERT OR IGNORE INTO coin_price_data_hourly_extended (coin_id, laika_coin_naming, symbol, 
    contract_addresses, price_datetime, price, data_source)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  try {
    await db.exec("BEGIN");
    for (const r of rows) {
      await stmt.run([
        r.coin_id,
        r.laika_coin_naming,
        r.symbol,
        r.contract_addresses,
        r.price_datetime,
        r.price,
        r.data_source,
      ]);
    }
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  } finally {
    await stmt.finalize();
  }
}
