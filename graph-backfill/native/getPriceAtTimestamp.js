import { CONFIG } from "../config.js";
const UNISWAP_V3_SUBGRAPH = CONFIG.GRAPH.uniswapSubGraphEndpoint;
const UNISWAP_V2_SUBGRAPH =
  "https://gateway.thegraph.com/api/subgraphs/id/A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum";

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

export async function getPoolHourDataRange(poolId, start, end) {
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

