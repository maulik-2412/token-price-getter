import fetch from "node-fetch";
import fs from "fs";
import pLimit from "p-limit";

const OUTPUT_FILE = "top-2500-tokens.json";
const CHECKPOINT_FILE = "checkpoint.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeWrite(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}


async function fetchWithRetry(url, retries = 10, delay = 2000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 Zeru-Finance-Token-Fetcher" },
      });
      if (!res.ok) {
        if (res.status === 429 && i < retries) {
          const wait = delay * Math.pow(2, i);
          console.warn(
            `⏳ Rate-limited (${res.status}), retrying in ${wait / 1000}s...`
          );
          await sleep(wait);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      const wait = delay * Math.pow(2, i);
      console.warn(`⚠️ Error: ${err.message}, retrying in ${wait / 1000}s...`);
      await sleep(wait);
    }
  }
}

async function getTopTokens(count = 2500) {
  const perPage = 250;
  const pages = Math.ceil(count / perPage);
  const tokens = [];

  // resume page checkpoint
  let startPage = 1; 
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const cpRaw = fs.readFileSync(CHECKPOINT_FILE, "utf-8").trim();
      if (cpRaw) {
        const cp = JSON.parse(cpRaw);
        if (cp.page) startPage = cp.page;
      }
    } catch (e) {
      console.warn("⚠️ Corrupted checkpoint.json, starting fresh...");
    }
  }

  for (let page = startPage; page <= pages; page++) {
    console.log(`📄 Fetching page ${page}/${pages}...`);
    const data = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}`
    );
    tokens.push(...data);

    // save checkpoint
    fs.writeFileSync(
      CHECKPOINT_FILE,
      JSON.stringify({ page: page + 1 }, null, 2)
    );

    await sleep(5000);
  }

  return tokens.slice(0, count).map((token) => ({
    id: token.id,
    symbol: token.symbol.toUpperCase(),
    name: token.name,
  }));
}

async function fetchEthereumTokens(tokens) {
  const limit = pLimit(1);

  let existing = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const raw = fs.readFileSync(OUTPUT_FILE, "utf-8").trim();
      if (raw.length > 0) {
        existing = JSON.parse(raw);
      } else {
        console.warn("⚠️ Output file was empty, starting fresh...");
      }
    } catch (e) {
      console.warn("⚠️ Corrupted output file, starting fresh...");
    }
  }
  const existingIds = new Set(existing.map((t) => t.id));
  const remaining = tokens.filter((t) => !existingIds.has(t.id));

  console.log(
    `🔄 Resuming: ${existing.length} already saved, ${remaining.length} left`
  );

  const batchSize = 5;
  let batch = [];

  for (let i = 0; i < remaining.length; i++) {
    const t = remaining[i];
    batch.push(
      limit(async () => {
        console.log(
          `🔎 Resolving ${existing.length + i + 1}/${tokens.length}: ${t.id}`
        );
        try {
          const info = await fetchWithRetry(
            `https://api.coingecko.com/api/v3/coins/${t.id}`
          );
          if (info.platforms && info.platforms.ethereum) {
            const entry = {
              id: t.id,
              symbol: t.symbol,
              name: t.name,
              address: info.platforms.ethereum.toLowerCase(),
            };
            existing.push(entry);
          }
        } catch (err) {
          console.warn(`❌ Failed ${t.id}: ${err.message}`);
        }
      })
    );

    if (batch.length >= batchSize) {
      await Promise.all(batch);
      batch = [];
      safeWrite(OUTPUT_FILE, existing);
      console.log(`💾 Saved progress (${existing.length} tokens so far)`);
      await sleep(2000);
    }
  }

  if (batch.length > 0) {
    await Promise.all(batch);
    safeWrite(OUTPUT_FILE, existing);
  }

  return existing;
}

(async () => {
  const baseList = await getTopTokens(2500);
  const finalList = await fetchEthereumTokens(baseList);

  // cleanup checkpoint once done
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }

  console.log(
    `✅ Finished! Saved ${finalList.length} Ethereum tokens to ${OUTPUT_FILE}`
  );
})();
