import { CONFIG } from "../config.js";

export async function insertRowsD1Remote(table, rows) {
  const body = {
    sql: `
      INSERT INTO coin_price_data_hourly_extended (coin_id, laika_coin_naming, symbol, 
    contract_addresses, price_datetime, price, data_source)
      VALUES
      ${rows.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",")}
    `,
    params: rows.flatMap(r => [r.coin_id, r.laika_coin_naming, r.symbol, r.contract_addresses, r.price_timestamp, r.price, r.data_source])
  };

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CONFIG.D1.remote.accountId}/d1/database/${CONFIG.D1.remote.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONFIG.D1.remote.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await res.json();

  if (!data.success) {
    throw new Error(JSON.stringify(data.errors));
  }

  return data.result;
}
