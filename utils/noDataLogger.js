import fs from "fs";
import path from "path";

const LOG_DIR = "./logs";
const LOG_FILE = "missing_pool_data.jsonl"; // JSON lines

// Ensure directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function logNoData({ token, start, end }) {
  const entry = {
    token: token?.coin_id || token, // store minimal unique ID
    contract_addresses: token?.contract_addresses,
    start,
    end,
    logged_at: Math.floor(Date.now() / 1000),
  };

  const line = JSON.stringify(entry) + "\n";

  fs.appendFileSync(path.join(LOG_DIR, LOG_FILE), line);
}
