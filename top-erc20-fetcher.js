/* import fetch from "node-fetch";
import fs from "fs";
import pLimit from "p-limit";

const OUTPUT_FILE = "top-2500-erc20.json";
const CHECKPOINT_FILE = "checkpoint.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Safe write to avoid corrupted JSON
function safeWrite(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Fetch with retries and exponential backoff
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

// Step 1: Fetch top ERC20 tokens (Ethereum ecosystem only)
async function getTopErc20BaseList(count = 2500) {
  const perPage = 250;
  const pages = Math.ceil(count / perPage);
  const tokens = [];

  let startPage = 1;
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const cpRaw = fs.readFileSync(CHECKPOINT_FILE, "utf-8").trim();
      if (cpRaw) {
        const cp = JSON.parse(cpRaw);
        if (cp.page) startPage = cp.page;
      }
    } catch {
      console.warn("⚠️ Corrupted checkpoint.json, starting fresh...");
    }
  }

  for (let page = startPage; page <= pages; page++) {
    console.log(`📄 Fetching page ${page}/${pages} (ERC-20 ecosystem)...`);
    const data = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=ethereum-ecosystem&order=market_cap_desc&per_page=${perPage}&page=${page}`
    );
    tokens.push(...data);

    // Save checkpoint
    fs.writeFileSync(
      CHECKPOINT_FILE,
      JSON.stringify({ page: page + 1 }, null, 2)
    );
    await sleep(3000); // avoid rate limits
  }

  return tokens.slice(0, count).map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
  }));
}

// Step 2: For each token, fetch contract address
async function fetchTopErc20Tokens(count = 2500) {
  let existing = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const raw = fs.readFileSync(OUTPUT_FILE, "utf-8").trim();
      if (raw.length > 0) existing = JSON.parse(raw);
    } catch {
      console.warn("⚠️ Corrupted output file, starting fresh...");
    }
  }

  console.log(`🔄 Resuming: ${existing.length} already saved`);

  const baseList = await getTopErc20BaseList(count);
  const existingIds = new Set(existing.map((t) => t.id));
  const limit = pLimit(5);

  for (let i = 0; i < baseList.length; i++) {
    const t = baseList[i];
    if (!t || !t.id) continue;
    if (existingIds.has(t.id)) continue; // skip already saved

    await limit(async () => {
      try {
        const info = await fetchWithRetry(
          `https://api.coingecko.com/api/v3/coins/${t.id}`
        );
        if (info.platforms && info.platforms.ethereum) {
          const entry = {
            id: t.id,
            symbol: t.symbol.toUpperCase(),
            name: t.name,
            address: info.platforms.ethereum.toLowerCase(),
          };
          existing.push(entry);
          existingIds.add(entry.id);

          // Save immediately per token
          safeWrite(OUTPUT_FILE, existing);
          console.log(`💾 Saved ${entry.symbol} (${existing.length}/${count})`);
        }
      } catch (err) {
        console.warn(`❌ Failed ${t.id}: ${err.message}`);
      }
      await sleep(500); // small delay
    });
  }

  // Final save and cleanup
  safeWrite(OUTPUT_FILE, existing);
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);

  return existing;
}

// Run script
(async () => {
  const finalList = await fetchTopErc20Tokens(2500);
  console.log(
    `✅ Finished! Saved ${finalList.length} ERC-20 tokens to ${OUTPUT_FILE}`
  );
})();
 */

import fetch from "node-fetch";
import fs from "fs";

const OUTPUT_FILE = "top-2500-erc20.json";
const CHECKPOINT_FILE = "checkpoint.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeWrite(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

async function fetchWithThrottle(url) {
  while (true) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 Zeru-Finance-Token-Fetcher" },
      });
      if (res.status === 429) {
        console.warn("⏳ Hit 429, waiting 6s...");
        await sleep(6000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`⚠️ Error: ${err.message}, retrying in 6s...`);
      await sleep(6000);
    }
  }
}

// Step 1: Get top ERC20 list
async function getTopErc20BaseList(count = 2500) {
  const perPage = 250;
  const pages = Math.ceil(count / perPage);
  const tokens = [];

/*   for (let page = 1; page <= pages; page++) {
    // chnage page=1 and page<=pages
    console.log(`📄 Fetching page ${page}/${pages} (ERC-20 ecosystem)...`);
    const data = await fetchWithThrottle(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=ethereum-ecosystem&order=market_cap_desc&per_page=${perPage}&page=${page}`
    );
    tokens.push(...data);
    await sleep(2000);
  }
 */
  console.log(`📄 Fetching page 11 (ERC-20 ecosystem)...`);
  const data = await fetchWithThrottle(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=ethereum-ecosystem&order=market_cap_desc&per_page=250&page=11`
  );
  tokens.push(...data);
  
  return tokens.slice(11, 14).map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
  }));
}

// Step 2: Resume-safe fetching
async function fetchTopErc20Tokens(count = 2500) {
  let existing = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const raw = fs.readFileSync(OUTPUT_FILE, "utf-8").trim();
      if (raw.length > 0) existing = JSON.parse(raw);
    } catch {
      console.warn("⚠️ Corrupted output file, starting fresh...");
    }
  }

  console.log(`🔄 Resuming: ${existing.length} already saved`);

  const baseList = await getTopErc20BaseList(count);
  const existingIds = new Set(existing.map((t) => t.id));

  // Figure out start index:
  let startIndex = existing.length; // default
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
      if (typeof cp.index === "number")
        startIndex = Math.max(cp.index, existing.length);
    } catch {
      console.warn("⚠️ Corrupted checkpoint.json, ignoring it...");
    }
  }
  console.log(baseList.length);
  for (let i = 0; i < baseList.length; i++) { // chnage i=startIndex
    const t = baseList[i];
    if (!t?.id || existingIds.has(t.id)) continue;

    try {
      const info = await fetchWithThrottle(
        `https://api.coingecko.com/api/v3/coins/${t.id}` // change reddio to ${t.id}
      );
      if (info.platforms?.ethereum) {
        const entry = {
          id: t.id,
          symbol: t.symbol.toUpperCase(),
          name: t.name,
          address: info.platforms.ethereum.toLowerCase(),
        };
        existing.push(entry);
        existingIds.add(entry.id);

        safeWrite(OUTPUT_FILE, existing);
        console.log(`💾 Saved ${entry.symbol} (${existing.length}/${count})`);
      }
    } catch (err) {
      console.warn(`❌ Failed ${t.id}: ${err.message}`);
    }

    fs.writeFileSync(
      CHECKPOINT_FILE,
      JSON.stringify({ index: i + 1 }, null, 2)
    );
    await sleep(2000);
  }

  safeWrite(OUTPUT_FILE, existing);
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);

  return existing;
}

// Run
(async () => {
  const finalList = await fetchTopErc20Tokens(2500);
  console.log(
    `✅ Finished! Saved ${finalList.length} ERC-20 tokens to ${OUTPUT_FILE}`
  );
})();
