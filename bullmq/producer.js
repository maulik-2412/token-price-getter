// producer.js
import { Queue } from "bullmq";
import { connection } from "../redis/config.js";
import { CONFIG } from "../config.js";
import { getTokenCreationTimestamp } from "../historical-price-getter.js";
const CHUNK_DAYS = CONFIG.PROCESSING.chunkDays;
const DAY=24*60*60;

const backfillQueue = new Queue("token-backfill", { connection: connection });

export async function enqueueTokenBackfill(token) {
  token=token.toLowerCase();
  const creationTs = await getTokenCreationTimestamp(token);
  if (!creationTs) {
    console.warn(`No pools found for token ${token}`);
    return;
  }

  // normalize day aligned start & end
  const today = Math.floor(Date.now() / 1000);
  const todayMidnight = Math.floor(today / 86400) * 86400;

  const alignedStart = Math.floor(creationTs / DAY) * DAY; // change this to creation date

  for (let start = alignedStart; start < todayMidnight; start += CHUNK_DAYS*DAY) {
    const end = Math.min(start + CHUNK_DAYS*DAY - 1, todayMidnight);
    await backfillQueue.add("backfill-chunk", { token, start, end });
    console.log(`Enqueued ${token} backfill from ${start} → ${end}`);
  }
}
