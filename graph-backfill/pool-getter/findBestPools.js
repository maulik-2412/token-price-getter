import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url"; // <-- update
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getBestPool } from "./poolV3.js";
import { getBestPoolV2 } from "./poolV2.js";

const INPUT_FILE = path.join(__dirname, "eth-coins-v3-pools.json");
// const OUTPUT_FILE = path.join(__dirname, "eth-coins-v3-pools.json");

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

async function ensureFileExists(file) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "[]", "utf8");
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processTokens() {
  //   await ensureFileExists(OUTPUT_FILE);

  const raw = await fs.readFile(INPUT_FILE, "utf8");
  const tokens = JSON.parse(raw);

  const onlyEth = tokens.filter(
    (t) =>
      t.primary_chain &&
      t.primary_chain.toLowerCase() === "ethereum" &&
      t.contract_addresses?.ethereum &&
      (t.poolIdV3 === null || t.poolIdV3 === undefined) &&
      t.poolIdV2 &&
      t.coin === "WETH"
  );

  console.log(`Found ${onlyEth.length} Ethereum tokens to process.`);

  //   const output = [];

  for (let i = 0; i < onlyEth.length; i++) {
    const token = onlyEth[i];
    const addr = token.contract_addresses.ethereum.toLowerCase();

    console.log(
      `\n[${i + 1}/${onlyEth.length}] Token: ${token.symbol} (${addr})`
    );

    let bestPool = null;

    try {
      const pool = await getBestPoolV2(addr, WETH);
      if (pool) {
        bestPool = pool;
        console.log(`   → Found pool: ${pool.id}`);
      }
    } catch (err) {
      console.error(`Error querying candidate WETH:`, err.message);
    }

    token.poolIdV2 = bestPool ? bestPool.id : null;
    token.coin = "WETH";
    if (bestPool) {
      token.token0 = bestPool.token0.id.toLowerCase();
      token.token1 = bestPool.token1.id.toLowerCase();
    } else {
      token.token0 = null;
      token.token1 = null;
    }

    await sleep(300); // avoid rate limits

    // output.push({
    //   ...token,
    //   poolIdV3: bestPool ? bestPool.id : null,
    //   coin:'WETH'
    // });

    // await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));
  }
  await fs.writeFile(INPUT_FILE, JSON.stringify(tokens, null, 2));
  //   console.log(`\n✔ Completed. Output written to ${OUTPUT_FILE}`);
}

processTokens().catch((err) => console.error(err));
