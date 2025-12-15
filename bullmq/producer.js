// producer.js
import { Queue } from "bullmq";
import { connection } from "../redis/config.js";
import { CONFIG } from "../config.js";
import { getTokenCreationTimestamp } from "../historical-price-getter.js";
const CHUNK_DAYS = CONFIG.PROCESSING.chunkDays;
const CHUNK_HOURS = 24;
const DAY = 24 * 60 * 60;
const HOUR = 3600;

const backfillQueue = new Queue("token-backfill", { connection: connection });

export async function enqueueTokenBackfill(token) {
  token.contract_addresses["ethereum"] = token.contract_addresses["ethereum"].toLowerCase();
  console.log(token.contract_addresses["ethereum"])
  // const creationTs = await getTokenCreationTimestamp(token);
  // if (!creationTs) {
  //   console.warn(`No pools found for token ${token}`);
  //   return;
  // }

  // normalize day aligned start & end
  // const today = Math.floor(Date.now() / 1000);
  // const todayMidnight = Math.floor(today / 86400) * 86400;

  // const alignedStart = Math.floor(creationTs / DAY) * DAY; // change this to creation date
  const alignedStart = 1710892800; // 20 march 2024 00;00;00
  const todayMidnight = 1764975600; // 5 december 2025 23;00;00

  for (
    let start = alignedStart;
    start < todayMidnight;
    start += CHUNK_HOURS * HOUR
  ) {
    const end = Math.min(start + CHUNK_HOURS * HOUR - 1, todayMidnight);
    await backfillQueue.add("backfill-chunk", { token:{
      coin_id: token.coin_id,
      laika_coin_naming:token.laika_coin_naming,
      symbol:token.symbol,
      contract_addresses:{...token.contract_addresses}
    }, start, end });
    console.log(`Enqueued ${token.coin_id} backfill from ${start} → ${end}`);
  }
}
