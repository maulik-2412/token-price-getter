import fs from "fs/promises";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

async function main() {
  const file = JSON.parse(await fs.readFile("eth-coins-v3-pools.json", "utf8"));

  for (const coin of file) {
    const poolId = coin.poolIdV3 || coin.poolIdV2;
    if (!poolId) continue;

    const pool = new ethers.Contract(poolId, POOL_ABI, provider);

    try {
      const token0 = await pool.token0();
      const token1 = await pool.token1();

      coin.token0 = token0.toLowerCase();
      coin.token1 = token1.toLowerCase();

      console.log(`Pool ${poolId}: token0=${coin.token0}, token1=${coin.token1}`);
    } catch (e) {
      console.log("Error fetching pool tokens for", poolId, e.message);
    }
  }

  await fs.writeFile("eth-coins-v3-pools-with-token0-token1.json", JSON.stringify(file, null, 2));
  console.log("DONE");
}

main();