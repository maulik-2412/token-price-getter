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

/**
 * Get best pool between token and a candidate (USDC/DAI/USDT/WETH)
 */
export async function getBestPool(token, candidate) {
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