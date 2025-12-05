import BullMQ from "bullmq";
const Queue = BullMQ.Queue;
const Worker = BullMQ.Worker;

import getDailyPrice from "../fetch-daily-price-graph.js";
import  {connection} from '../redis/config.js';
import { clickhouse } from "../clickhouse/config.js";



// Queue + Scheduler
const queueName = "price-fetch";
const priceQueue = new Queue(queueName, { connection });

function getTodayUnix() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(now.getTime() / 1000);
}

async function retryInsert(batch, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await clickhouse.insert({ table: "token_prices", values: batch,format:'JSONEachRow' });
      console.log(
        `✅ Inserted batch of ${batch.length} prices into ClickHouse`
      );
      return;
    } catch (err) {
      console.error(`ClickHouse insert failed (attempt ${attempt}):`, err);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error("⚠️ Failed to insert batch after retries:", batch);
        // Optional: store batch to file / push back to Redis queue for later recovery
      }
    }
  }
}

const BATCH_SIZE = 10; // Number of jobs to batch
let batch = []; // Array to store pending jobs

// Worker: consumes jobs
const worker = new Worker(
  queueName,
  async (job) => {
    const { token } = job.data;
    console.log(
      `⏳ Fetching price for ${token.symbol} (${
        token.address
      }) at ${new Date().toISOString()}`
    );

    // Simulate fetch price (later plug getPriceInUSDC)
    const data = await getDailyPrice(token.address);

    const row = {
      token: token.address,
      price: data.priceInUSDC,
      timestamp: getTodayUnix(),
      source: data.source || "default",
    };

    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      const currentBatch = batch;
      batch = [];
      await retryInsert(currentBatch);
    }

    return data;
  },
  { connection, concurrency: 5 }
);

// remaining batch
setInterval(async () => {
  if (batch.length > 0) {
    const currentBatch = batch;
    batch = [];
    await retryInsert(currentBatch);
  }
}, 5000);

worker.on("completed", (job, result) => {
  console.log(`🎉 Job ${job.id} completed, result = ${JSON.stringify(result)}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed: ${err.message}`);
});

export { priceQueue };
