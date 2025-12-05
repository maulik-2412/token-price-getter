// worker.js
import { Worker,Queue } from "bullmq";
/* import pLimit from "p-limit"; */
import { connection } from "../redis/config.js";
import { getDailyHistoricalPrices } from "../historical-price-getter.js";
import { insertRows,clickhouse } from "../clickhouse/config.js";
import { CONFIG } from "../config.js";

const WORKER_CONCURRENCY = CONFIG.PROCESSING.workerConcurrency;
const BATCH_INSERT_SIZE = CONFIG.PROCESSING.batchInsertSize;

const queueName = "token-backfill";
const queue = new Queue(queueName, { connection });

const worker = new Worker(
  queueName,
  async (job) => {
    const { token, start, end } = job.data;
    console.log(`Worker picked job: ${token} ${start} → ${end}`);

    // fetch data in one shot (uniswap.getDailyHistoricalPrices returns array)
    // limit concurrency to avoid bursts if you want, but worker is single job handler
    const rows = await getDailyHistoricalPrices(token, start, end);

    if (!rows || rows.length === 0) {
      await job.updateProgress(100);
      console.log(`No rows for ${token} ${start}→${end}`);
      return { inserted: 0 };
    }

    // Insert in batches for ClickHouse performance
    for (let i = 0; i < rows.length; i += BATCH_INSERT_SIZE) {
      
      const batch = rows.slice(i, i + BATCH_INSERT_SIZE).map((r) => ({
        token: r.token,
        timestamp: r.timestamp,
        price: r.price,
        source: r.source,
      }));
      // Insert and mark partial progress
      await insertRows("token_prices", batch);
      const percent = Math.round(((i + batch.length) / rows.length) * 100);
      await job.updateProgress(percent);
    }

    await job.updateProgress(100);
    console.log(`Inserted ${rows.length} rows for ${token} ${start}→${end}`);
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
    await clickhouse.close();

    process.exit(0);
  }
});

console.log("Worker started");
