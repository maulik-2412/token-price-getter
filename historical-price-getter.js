import fetch from "node-fetch";
import { CONFIG } from "./config.js";
import { getLocalWethPrice, storeLocalWethPrice } from "./cache-weth.js";

const UNISWAP_V3_SUBGRAPH = CONFIG.GRAPH.uniswapSubGraphEndpoint;
const UNISWAP_V2_SUBGRAPH =
  "https://gateway.thegraph.com/api/subgraphs/id/A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum";
// Common stablecoins
const STABLECOINS = {
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  /*   DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
  USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7", */
};

// WETH address
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

/**
 * Run GraphQL query against Uniswap V3 subgraph
 */
async function querySubgraph(query) {
  const res = await fetch(UNISWAP_V3_SUBGRAPH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.GRAPH.graphAPIKey}`,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function queryV2Subgraph(query) {
  const res = await fetch(UNISWAP_V2_SUBGRAPH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.GRAPH.graphAPIKey}`,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

/**
 * Get token creation timestamp from Uniswap v3 subgraph
 */
// export async function getTokenCreationTimestamp(token) {
//   token = token.toLowerCase();
//   const query = `
//   {
//     asToken0: pools(
//       first: 1
//       orderBy: createdAtTimestamp
//       orderDirection: asc
//       where: { token0: "${token}" }
//     ) {
//       createdAtTimestamp
//     }
//     asToken1: pools(
//       first: 1
//       orderBy: createdAtTimestamp
//       orderDirection: asc
//       where: { token1: "${token}" }
//     ) {
//       createdAtTimestamp
//     }
//   }`;
//   const data = await querySubgraph(query);
//   const ts0 = data.asToken0.length
//     ? parseInt(data.asToken0[0].createdAtTimestamp, 10)
//     : null;
//   const ts1 = data.asToken1.length
//     ? parseInt(data.asToken1[0].createdAtTimestamp, 10)
//     : null;

//   // Pick the earliest non-null timestamp
//   if (ts0 && ts1) return Math.min(ts0, ts1);
//   return ts0 || ts1 || null;
// }

/**
 * Get best pool between token and a candidate (USDC/DAI/USDT/WETH)
 */
async function getBestPool(token, candidate) {
  const query = `
  {
    pools(
      first: 1
      orderBy: liquidity
      orderDirection: desc
      where: {
        token0_in: ["${token}", "${candidate}"],
        token1_in: ["${token}", "${candidate}"]
      }
    ) {
      id
      token0 { id symbol }
      token1 { id symbol }
    }
  }`;
  const data = await querySubgraph(query);
  return data.pools && data.pools.length ? data.pools[0] : null;
}

async function getBestPoolV2(token, candidate) {
  const query = `
    {
      pairs(
        first: 1
        orderBy: reserveUSD
        orderDirection: desc
        where: {
          token0_in: ["${token}", "${candidate}"],
          token1_in: ["${token}", "${candidate}"]
        }
      ) {
        id
        token0 { id symbol }
        token1 { id symbol }
      }
    }
  `;

  const data = await queryV2Subgraph(query);
  return data.pairs?.length ? data.pairs[0] : null;
}

async function getPoolHourDataRange(poolId, start, end) {
  let all = [];
  let lastDate = start;
  const batchSize = 1000;
  poolId = poolId.toLowerCase();
  while (true) {
    const query = `
    {
      poolHourDatas(
        first: ${batchSize}
        orderBy: periodStartUnix
        orderDirection: asc
        where: {
          pool: "${poolId}",
          periodStartUnix_gte: ${lastDate},
          periodStartUnix_lte: ${end}
        }
      ) {
        periodStartUnix
        token0Price
        token1Price
      }
    }`;

    const data = await querySubgraph(query);
    const batch = data.poolHourDatas;

    if (!batch.length) break;

    all = all.concat(batch);

    lastDate = batch[batch.length - 1].periodStartUnix;

    if (batch.length < batchSize) break;
  }

  return all;
}

async function getPoolHourDataRangeV2(poolId, start, end) {
  let all = [];
  let lastDate = start;
  const batchSize = 1000;
  poolId = poolId.toLowerCase();

  while (true) {
    const query = `
      {
        pairHourDatas(
          first: ${batchSize}
          orderBy: hourStartUnix
          orderDirection: asc
          where: {
            pair: "${poolId}"
            hourStartUnix_gte: ${lastDate}
            hourStartUnix_lte: ${end}
          }
        ) {
          hourStartUnix
          reserve0
          reserve1
        }
      }
    `;

    const data = await queryV2Subgraph(query);
    const batch = data.pairHourDatas;

    if (!batch.length) break;

    all = all.concat(batch);
    lastDate = batch[batch.length - 1].hourStartUnix; // Increment to avoid duplicates

    if (batch.length < batchSize) break;
  }
  return all;
}

// async function getPoolDayDataRange(poolId, start, end) {
//   let all = [];
//   let lastDate = start;
//   let batchSize = 1000;

//   while (true) {
//     const query = `
//     {
//       poolDayDatas(
//         first: ${batchSize}
//         orderBy: date
//         orderDirection: asc
//         where: {
//           pool: "${poolId}",
//           date_gte: ${lastDate},
//           date_lte: ${end}
//         }
//       ) {
//         date
//         token0Price
//         token1Price
//       }
//     }`;

//     const data = await querySubgraph(query);
//     const batch = data.poolDayDatas;

//     if (!batch.length) break;

//     all = all.concat(batch);

//     // move cursor forward
//     lastDate = batch[batch.length - 1].date;

//     // if fewer than batchSize returned → no more data
//     if (batch.length < batchSize) break;
//   }

//   return all;
// }

export async function getHourlyHistoricalPrices(token, start, end) {
  token.contract_addresses["ethereum"] =
    token.contract_addresses["ethereum"].toLowerCase();
  const t = token.contract_addresses["ethereum"];
  const results = [];

  // 2. Fallback: token/WETH then WETH/USDC
  let tokenWethPool = await getBestPool(t, WETH);
  let isV2 = false;
  if (!tokenWethPool) {
    console.log("V3: No token/WETH pool found. Trying V2...");
    tokenWethPool = await getBestPoolV2(t, WETH);
    if (!tokenWethPool) {
      console.log("V2: No token/WETH pool found either.");
      return results; // Nothing available
    }
    isV2 = true;
    console.log("V2: Found token/WETH pool:", tokenWethPool.id);
  } else {
    console.log("V3: Found token/WETH pool:", tokenWethPool.id);
  }

  const tokenPoolData = isV2
    ? await getPoolHourDataRangeV2(tokenWethPool.id, start, end)
    : await getPoolHourDataRange(tokenWethPool.id, start, end);

  if (!tokenPoolData.length) return results;

  const tokenIs0 = tokenWethPool.token0.id.toLowerCase() === t;

  const allHours = tokenPoolData.map((d) =>
    isV2 ? d.hourStartUnix : d.periodStartUnix
  );

  const wethPrices = {};

  for (const ts of allHours) {
    // CACHE: check local DB first
    const cached = await getLocalWethPrice(ts);
    if (cached != null) {
      wethPrices[ts] = cached;
    }
  }

  const missingTimestamps = allHours.filter((ts) => wethPrices[ts] == null);

  if (missingTimestamps.length > 0) {
    const wethUsdPool = await getBestPool(WETH, STABLECOINS.USDC);
    if (!wethUsdPool) return results;

    const wethPoolData = await getPoolHourDataRange(wethUsdPool.id, start, end);
    if (!wethPoolData.length) return results;

    const wethByHour = Object.fromEntries(
      wethPoolData.map((d) => [d.periodStartUnix, d])
    );

    const wethIs0 = wethUsdPool.token0.id.toLowerCase() === WETH.toLowerCase();

    for (const ts of missingTimestamps) {
      const wethHour = wethByHour[ts];
      if (!wethHour) continue;

      const wethInUsd = wethIs0
        ? parseFloat(wethHour.token1Price)
        : parseFloat(wethHour.token0Price);

      await storeLocalWethPrice(ts, wethInUsd);

      wethPrices[ts] = wethInUsd;
    }
  }

  for (const hour of tokenPoolData) {
    const ts = isV2 ? hour.hourStartUnix : hour.periodStartUnix;
    const wethPrice = wethPrices[ts];
    if (!wethPrice) continue; // missing hour

    let tokenInWeth;
    if (isV2) {
      const reserve0 = parseFloat(hour.reserve0);
      const reserve1 = parseFloat(hour.reserve1);
      tokenInWeth = tokenIs0 ? reserve1 / reserve0 : reserve0 / reserve1;
    } else {
      tokenInWeth = tokenIs0
        ? parseFloat(hour.token1Price)
        : parseFloat(hour.token0Price);
    }
    const finalPrice = tokenInWeth * wethPrice;

    results.push({
      token: token,
      price_datetime: ts,
      price: finalPrice,
      data_source: isV2 ? "THE_GRAPH_UNISWAP_V2" : "THE_GRAPH_UNISWAP_V3",
    });
  }

  return results;
}

// export async function getDailyHistoricalPrices(token, start, end) {
//   token = token.toLowerCase();
//   const results = [];

//   for (const [name, stableAddr] of Object.entries(STABLECOINS)) {
//     const pool = await getBestPool(token, stableAddr);
//     if (!pool) continue;
//     const poolData = await getPoolDayDataRange(pool.id, start, end);
//     if (!poolData.length) continue;

//     // determine which side is token
//     const tokenIs0 = pool.token0.id.toLowerCase() === token;
//     for (const day of poolData) {
//       const price = tokenIs0
//         ? parseFloat(day.token1Price)
//         : parseFloat(day.token0Price);
//       results.push({
//         token,
//         timestamp: day.date,
//         price,
//         source: "UNISWAP",
//       });
//     }
//     return results;
//   }

//   const tokenWethPool = await getBestPool(token, WETH);
//   if (!tokenWethPool) return results; // empty

//   const tokenPoolData = await getPoolDayDataRange(tokenWethPool.id, start, end);
//   if (!tokenPoolData.length) return results;

//   const wethUsdPool = await getBestPool(WETH, STABLECOINS.USDC);
//   if (!wethUsdPool) return results;

//   const wethPoolData = await getPoolDayDataRange(wethUsdPool.id, start, end);
//   if (!wethPoolData.length) return results;

//   // index weth data by date for lookup
//   const wethByDate = Object.fromEntries(wethPoolData.map((d) => [d.date, d]));
//   const tokenIs0 = tokenWethPool.token0.id.toLowerCase() === token;
//   const wethIs0 = wethUsdPool.token0.id.toLowerCase() === WETH.toLowerCase();

//   for (const day of tokenPoolData) {
//     const w = wethByDate[day.date];
//     if (!w) continue; // skip days where one side missing
//     const tokenInWETH = tokenIs0
//       ? parseFloat(day.token1Price)
//       : parseFloat(day.token0Price);
//     const wethInUSD = wethIs0
//       ? parseFloat(w.token1Price)
//       : parseFloat(w.token0Price);
//     results.push({
//       token,
//       timestamp: day.date,
//       price: tokenInWETH * wethInUSD,
//       source: "UNISWAP",
//     });
//   }

//   return results;
// }

/**
 * Get historical close price from poolDayDatas
 */
// async function getHistoricalClose(poolId, timestamp) {
//   const dayStart = Math.floor(timestamp / 86400) * 86400;
//   const query = `
//   {
//     poolDayDatas(
//       where: { pool: "${poolId}", date_lte: ${dayStart} }
//       first: 1
//       orderBy: date
//       orderDirection: desc
//     ) {
//       date
//       token0Price
//       token1Price
//       close
//     }
//   }`;
//   const data = await querySubgraph(query);
//   return data.poolDayDatas.length ? data.poolDayDatas[0] : null;
// }

/**
 * Main function: get token price in USD at given timestamp
 */
// async function getHistoricalTokenPriceUSD(token, timestamp) {
//   // 1. Try stablecoin pairs first
//   token = token.toLowerCase();
//   for (const [name, stable] of Object.entries(STABLECOINS)) {
//     const pool = await getBestPool(token, stable);
//     if (pool) {
//       const data = await getHistoricalClose(pool.id, timestamp);
//       if (!data) continue;

//       // Determine which side is the token
//       if (pool.token0.id.toLowerCase() === token.toLowerCase()) {
//         return {
//           priceInUSDC: parseFloat(data.token1Price),
//           tokenAddr: token,
//           via: "direct",
//           source: "UNISWAP",
//           timestamp,
//         }; // token0 priced in token1 (USD stablecoin)
//       } else {
//         return {
//           priceInUSDC: parseFloat(data.token0Price),
//           tokenAddr: token,
//           via: "direct",
//           source: "UNISWAP",
//           timestamp,
//         }; // token1 priced in token0 (USD stablecoin)
//       }
//     }
//   }

//   // 2. Fallback to WETH
//   const wethPool = await getBestPool(token, WETH);
//   if (!wethPool) {
//     return {
//       tokenAddr: token,
//       priceInUSDC: null,
//       via: "not-found",
//       source: "UNISWAP",
//       timestamp,
//     };
//   }

//   const tokenData = await getHistoricalClose(wethPool.id, timestamp);
//   if (!tokenData) {
//     return {
//       tokenAddr: token,
//       priceInUSDC: null,
//       via: "not-found",
//       source: "UNISWAP",
//       timestamp,
//     };
//   }

//   const wethUSDPool = await getBestPool(WETH, STABLECOINS.USDC);
//   if (!wethUSDPool) {
//     return {
//       tokenAddr: token,
//       priceInUSDC: null,
//       via: "not-found",
//       source: "UNISWAP",
//       timestamp,
//     };
//   }

//   const wethData = await getHistoricalClose(wethUSDPool.id, timestamp);
//   if (!wethData) {
//     return {
//       tokenAddr: token,
//       priceInUSDC: null,
//       via: "not-found",
//       source: "UNISWAP",
//       timestamp,
//     };
//   }

//   // figure out token price in WETH
//   const tokenInWETH =
//     wethPool.token0.id.toLowerCase() === token.toLowerCase()
//       ? parseFloat(tokenData.token1Price)
//       : parseFloat(tokenData.token0Price);

//   // figure out WETH price in USD
//   const wethInUSD =
//     wethUSDPool.token0.id.toLowerCase() === WETH.toLowerCase()
//       ? parseFloat(wethData.token1Price)
//       : parseFloat(wethData.token0Price);

//   return {
//     priceInUSDC: tokenInWETH * wethInUSD,
//     tokenAddr: token,
//     via: "WETH",
//     source: "UNISWAP",
//     timestamp,
//   };
// }

// const bnb = "0xb8c77482e45f1f44de1745f52c74426c631bdd52"; //yes
// const lido = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84"; // yes
// const tron = "0x50327c6c5a14dcade707abad2e27eb517df87ab5"; // yes
// const link = "0x514910771af9ca656af840dff83e8264ecf986ca"; // yes
// const wbtc = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"; // yes
// const dai = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; //yes
// const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; //yes

// // Example usage
// /* (async () => {
//   const ts = 1693526400; // sample day start
//   const data = await getDailyHistoricalPrices(weth);
//   console.log("weth price at", ts, "=", JSON.stringify(data), "USD");
// })(); */

// export async function getHistoricalPrices(token, startTs, endTs) {
//   const data = await getDailyHistoricalPrices(token);
// }
