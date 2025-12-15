import fs from "fs";
import { execSync } from "child_process";

const DB_BINDING = "DB"; // Use your binding name in wrangler.toml
const PAGE_SIZE = 1000;

function fetchPage(offset) {
  const QUERY = `
    SELECT coin_id, laika_coin_naming, symbol, contract_addresses, primary_chain
    FROM coin_static_data
    ORDER BY coin_id
    LIMIT ${PAGE_SIZE} OFFSET ${offset};
  `;

  const cmd = `npx wrangler d1 execute ${DB_BINDING} --remote --command "${QUERY}" --json`;
  const output = execSync(cmd, { encoding: "utf-8" });
  const json = JSON.parse(output);

  if (!json[0]?.success) {
    console.error("❌ Query failed:", JSON.stringify(json, null, 2));
    process.exit(1);
  }

  return json[0]?.results || [];
}


async function exportAllCoins() {
  let all = [];
  let offset = 0;

  while (true) {
    console.log(`📥 Fetching rows offset ${offset}...`);
    const rows = fetchPage(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      all.push({
        coin_id: row.coin_id,
        laika_coin_naming: row.laika_coin_naming,
        symbol: row.symbol,
        contract_addresses: (() => {
          try {
            return JSON.parse(row.contract_addresses || "{}");
          } catch {
            return {};
          }
        })(),
        primary_chain:row.primary_chain
      });
    }

    offset += PAGE_SIZE;
  }

  fs.writeFileSync("all_coins.json", JSON.stringify(all, null, 2));
  console.log(`\n✅ Export complete → all_coins.json saved`);
  console.log(`📦 Total coins exported: ${all.length}`);
}

exportAllCoins().catch(err => console.error("❌ Error:", err));
