// worker.js
import { Worker,Queue } from "bullmq";
/* import pLimit from "p-limit"; */
import { connection } from "../redis/config.js";
import { getDailyHistoricalPrices,getHourlyHistoricalPrices } from "../historical-price-getter.js";
import { insertRows } from "../db/index.js";
import { CONFIG } from "../config.js";
import { logNoData } from "../utils/noDataLogger.js";

const WORKER_CONCURRENCY = CONFIG.PROCESSING.workerConcurrency;
const BATCH_INSERT_SIZE = CONFIG.PROCESSING.batchInsertSize;

const queueName = "token-backfill";
const queue = new Queue(queueName, { connection });

const worker = new Worker(
  queueName,
  async (job) => {
    const { token, start, end } = job.data;
    console.log(`Worker picked job: ${token.symbol} (${token.contract_addresses.ethereum}) ${start} → ${end}`);


    // fetch data in one shot (uniswap.getDailyHistoricalPrices returns array)
    // limit concurrency to avoid bursts if you want, but worker is single job handler
    const rows = await getHourlyHistoricalPrices(token, start, end);

    if (!rows || rows.length === 0) {
      await job.updateProgress(100);
      console.log(`No rows for ${token.symbol} ${start}→${end}`);
      logNoData({token,start,end});
      return { inserted: 0 };
    }

    // Insert in batches for ClickHouse performance
    for (let i = 0; i < rows.length; i += BATCH_INSERT_SIZE) {
      
      const batch = rows.slice(i, i + BATCH_INSERT_SIZE).map((r) => ({
        coin_id:r.token.coin_id,
        laika_coin_naming:r.token.laika_coin_naming,
        symbol:r.token.symbol,
        contract_addresses:JSON.stringify(r.token.contract_addresses),
        price_datetime:new Date( r.price_datetime * 1000).toISOString(),
        price: r.price,
        data_source: r.data_source,
      }));
      // Insert and mark partial progress
      await insertRows("token_prices", batch);
      const percent = Math.round(((i + batch.length) / rows.length) * 100);
      await job.updateProgress(percent);
    }

    await job.updateProgress(100);
    console.log(`Inserted ${rows.length} rows for ${token.symbol} ${start}→${end}`);
    return { inserted: rows.length, token };
  },
  { connection: connection, concurrency: WORKER_CONCURRENCY }
);

worker.on("failed", (job, err) => {
  console.error("Job failed", job.id, err);
});
worker.on("completed", async (job) => {
  console.log("Job completed", job.id);
  const counts = await queue.getJobCounts();

  if (
    counts.waiting === 0 &&
    counts.active === 0 &&
    counts.delayed === 0 &&
    counts.failed === 0
  ) {
    console.log("🎉 All jobs finished for all tokens. Cleaning up...");

    await worker.close();
    await queue.close();
    process.exit(0);
  }
});

console.log("Worker started");
