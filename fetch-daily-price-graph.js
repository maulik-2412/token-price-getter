import fetch from "node-fetch";
import { CONFIG } from "./config.js";
import dotenv from "dotenv";
dotenv.config();

const UNISWAP_V3_SUBGRAPH = CONFIG.GRAPH.uniswapSubGraphEndpoint;

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // already lowercase
const WETH = "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2"; // already lowercase
const FEE_TIERS = [100, 500, 3000, 10000];

/**
 * Fetch best pool by liquidity between two tokens
 */
async function fetchBestPool(tokenA, tokenB) {
  tokenA = tokenA.toLowerCase();
  tokenB = tokenB.toLowerCase();

  let bestPool = null;
/*   const MIN_LIQUIDITY = BigInt("100");
  liquidity_gt: "${MIN_LIQUIDITY}" */
  
  for (const fee of FEE_TIERS) {
    const query = `
      {
        pools(
          where: {
            token0_in: ["${tokenA}", "${tokenB}"],
            token1_in: ["${tokenA}", "${tokenB}"],
            feeTier: ${fee},
            
          },
          orderBy: liquidity,
          orderDirection: desc,
          first: 1
        ) {
          id
          token0 { id symbol name decimals }
          token1 { id symbol name decimals }
          token0Price
          token1Price
          liquidity
        }
      }
    `;

    const res = await fetch(UNISWAP_V3_SUBGRAPH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.GRAPH.graphAPIKey}`,
      },
      body: JSON.stringify({ query }),
    });

    const { data } = await res.json();
    const pool = data?.pools?.[0];
    if (pool) {
      if (!bestPool || BigInt(pool.liquidity) > BigInt(bestPool.liquidity)) {
        bestPool = pool;
      }
    }
  }
  
  return bestPool;
}

/**
 * Get price of tokenA in terms of tokenB (via TheGraph pool data)
 */
async function getPriceFromGraph(tokenA, tokenB) {
  tokenA = tokenA.toLowerCase();
  tokenB = tokenB.toLowerCase();

  const pool = await fetchBestPool(tokenA, tokenB);
  if (!pool) return null;

  let price;
  if (pool.token0.id === tokenA) {
    price = parseFloat(pool.token1Price);
  } else {
    price = parseFloat(pool.token0Price);
  }

  return {
    poolId: pool.id,
    price,
    liquidity: pool.liquidity,
    token0: pool.token0,
    token1: pool.token1,
  };
}

/**
 * Main price fetcher
 */
async function getPriceInUSDC(tokenAddr) {
  tokenAddr = tokenAddr.toLowerCase();

  // 1. Direct token/USDC
  const direct = await getPriceFromGraph(tokenAddr, USDC);
  if (direct) {
    const tokenData =
      direct.token0.id === tokenAddr ? direct.token0 : direct.token1;
    return {
      tokenName: tokenData.name || "Unknown",
      tokenSymbol: tokenData.symbol || "UNK",
      tokenAddr,
      priceInUSDC: direct.price,
      via: "direct",
      pool: direct.poolId,
      source:"UNISWAP"
    };
  }

  // 2. Via WETH
  const tokenWeth = await getPriceFromGraph(tokenAddr, WETH);
  const wethUsdc = await getPriceFromGraph(WETH, USDC);

  if (tokenWeth && wethUsdc) {
    const tokenData =
      tokenWeth.token0.id === tokenAddr ? tokenWeth.token0 : tokenWeth.token1;
    return {
      tokenName: tokenData.name || "Unknown",
      tokenSymbol: tokenData.symbol || "UNK",
      tokenAddr,
      priceInUSDC: tokenWeth.price * wethUsdc.price,
      via: "weth",
      pool: `${tokenWeth.poolId} + ${wethUsdc.poolId}`,
      source:"UNISWAP"
    };
  }

  return {
    tokenName: "Unknown",
    tokenSymbol: "UNK",
    tokenAddr,
    priceInUSDC: null,
    via: "not-found",
    pool: null,
    source:"UNISWAP"
  };
}

const bnb = "0xb8c77482e45f1f44de1745f52c74426c631bdd52"; //yes
const lido = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84"; // no wrong value
const tron = "0x50327c6c5a14dcade707abad2e27eb517df87ab5";// yes
const link = "0x514910771af9ca656af840dff83e8264ecf986ca";// yes
const wbtc = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";// yes
const dai = "0x6b175474e89094c44da98b954eedeac495271d0f";//yes
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";//yes

/* (async () => {
  try {
    const data = await getPriceInUSDC(link);
    console.log(JSON.stringify(data));
  } catch (err) {
    console.error("Error fetching prices:", err);
  }
})(); */

// Run test
export default async function getDailyPrice(addr) {
  try {
    const data = await getPriceInUSDC(addr);
    return data;
  } catch (err) {
    console.error("Error fetching prices:", err);
  }

}

