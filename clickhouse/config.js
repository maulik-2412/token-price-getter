import { createClient } from "@clickhouse/client";

export const clickhouse = new createClient({
  url: "http://localhost:8123", // or your ClickHouse server
  username: "admin",
  password: "admin123",
  database: "default",
});

async function createTable() {
  const createQuery = `
    CREATE TABLE IF NOT EXISTS token_prices (
      token String,
      price Float64,
      timestamp UInt64,
      source String
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (token, timestamp);
  `;

  try {
    await clickhouse.exec({ query: createQuery });
    console.log("Table created successfully!");
  } catch (err) {
    console.error("Error creating table:", err);
  }
}

createTable();

export async function insertRows(table, rows) {
  if (!rows || rows.length === 0) return;
  // each row must match schema: token String, timestamp UInt32, price Float64, source String
  console.log(rows[0].token);
  const payload = rows.map(r => ({
    token: r.token.toLowerCase(),
    timestamp: parseInt(r.timestamp, 10),
    price: r.price === null ? null : Number(r.price),
    source: r.source || "UNISWAP"
  }));

  await clickhouse.insert({
    table,
    format: "JSONEachRow",
    values: payload
  });
}


