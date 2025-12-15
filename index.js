/* import './bullmq/queue.js';
import './bullmq/scheduler.js'; */
// index.js
import { enqueueTokenBackfill } from "./bullmq/producer.js";
import "./bullmq/worker.js";
import fs from "fs";

console.log("🚀 BullMQ worker + scheduler running...");

const TOKENS_FILE = "ethereum.json";
const PROGRESS_FILE = "progress.json";

// Batch control
const BATCH_SIZE = 25;     // how many tokens to enqueue per wave
const BATCH_DELAY = 5000;  // wait 5s between waves

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE)));
  } catch {
    return new Set();
  }
}

function saveProgress(doneSet) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet], null, 2));
}

async function enqueueAllTokens() {
  if (!fs.existsSync(TOKENS_FILE)) {
    console.error(`❌ Token file ${TOKENS_FILE} not found`);
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE));
  const total = tokens.length 
  console.log(`📄 Loaded ${total} tokens from ${TOKENS_FILE}`);

  const doneSet = loadProgress();
  console.log(`🔄 Resuming, already completed ${doneSet.size}/${total}`);

  let count = doneSet.size;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE).filter(t => !doneSet.has(t.contract_addresses["ethereum"]));
    if (batch.length === 0) continue;

    await Promise.all(
      batch.map(async (t) => {
        try {
          await enqueueTokenBackfill(t);
          count++;
          doneSet.add(t.contract_addresses["ethereum"]);
          console.log(`✅ Enqueued ${t.symbol} (${t.contract_addresses["ethereum"]}) [${count}/${total}]`);
        } catch (err) {
          console.warn(`❌ Failed to enqueue ${t.symbol}: ${err.message}`);
        }
      })
    );

    saveProgress(doneSet);

    // Delay between waves to avoid API bursts
    if (i + BATCH_SIZE < total) {
      console.log(`⏳ Waiting ${BATCH_DELAY / 1000}s before next batch...`);
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  console.log("🎉 Finished enqueuing all tokens");
}

await enqueueAllTokens();

