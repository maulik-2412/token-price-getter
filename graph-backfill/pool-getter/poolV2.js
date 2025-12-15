import { CONFIG } from "../config.js";
const UNISWAP_V3_SUBGRAPH = CONFIG.GRAPH.uniswapSubGraphEndpoint;
const UNISWAP_V2_SUBGRAPH =
  "https://gateway.thegraph.com/api/subgraphs/id/A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum";


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

export async function getBestPoolV2(token, candidate) {
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