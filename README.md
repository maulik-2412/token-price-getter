**Token Price Getter — README2 (Hourly Historical Pipeline)**

**Overview**
- **Purpose:**: This document describes the hourly historical-price pipeline only (the intended pipeline). It explains how tokens move from the token lists into hourly price snapshots stored in D1. The daily scripts exist in the repo but are not part of the intended hourly pipeline.

**High-level Data Flow (hourly pipeline)**
- **Token sources:** `coin-json-scripts/` or the pre-split files in `splitter/` provide the tokens to process.
- **Orchestration:** `index.js` loads the token list, tracks progress in `progress.json`, imports the producer to enqueue backfill jobs, and imports the worker so processing starts in the same process.
- **Producer:** `bullmq/producer.js` slices a token's entire history into hourly/daily chunks and enqueues `backfill-chunk` jobs on the `token-backfill` queue.
- **Worker:** `bullmq/worker.js` consumes queued chunks, calls `getHourlyHistoricalPrices` from `historical-price-getter.js`, and writes batches into the DB via `db/index.js`.
- **Price extraction:** `historical-price-getter.js` finds the best pool (V3 or V2), pulls hourly pool snapshots from the subgraphs, converts them into normalized token price rows, and returns those rows to the worker for insertion.

**Design Notes / Intentions**
- The intended pipeline is the hourly backfill via `historical-price-getter.js` invoked by the BullMQ producer/worker pair. The repo contains daily fetch scripts (`fetch-daily-price.js`, `fetch-daily-price-graph.js`) but these are separate and not part of the hourly backfill run.
- `bullmq/queue.js` and `bullmq/scheduler.js` exist in the codebase for advanced scheduling but are not required by the intended hourly backfill and can be ignored unless you plan to add delayed/recurring jobs.

**Important Files (brief explanation)**
- **`coin-json-scripts/`**: Token list builders and per-chain JSON token lists (e.g. `eth_coin.json`). Edit or regenerate these to change tokens processed.
- **`splitter/`**: Precomputed per-chain token JSON files used by the producer when you prefer chain-split inputs.
- **`index.js`**: Entry point. Loads `TOKENS_FILE` (defaults to `ethereum.json`), resumes via `progress.json`, imports `bullmq/worker.js` and calls `enqueueTokenBackfill` for each token.
- **`bullmq/producer.js`**: Exposes `enqueueTokenBackfill(token)`. It breaks a token's history into chunks (based on `CONFIG.PROCESSING.chunkDays` and `CHUNK_HOURS`) and enqueues jobs to the `token-backfill` queue. Note: the current implementation has commented-out creation timestamp logic and uses hardcoded `alignedStart`/`todayMidnight` placeholders — update if you want dynamic ranges.
- **`bullmq/worker.js`**: BullMQ `Worker` that receives each `backfill-chunk` job, calls `getHourlyHistoricalPrices(token,start,end)`, and inserts rows into the DB in batches (`CONFIG.PROCESSING.batchInsertSize`). It logs progress and writes no-data cases to `logs/missing_pool_data.jsonl` via `utils/noDataLogger.js`.
- **`historical-price-getter.js`**: Core price logic. Responsibilities:
  - Query Uniswap V3 (primary) and V2 subgraphs for pools and `poolHourData`.
  - Score/select the best pool between token and stablecoins/WETH.
  - Fetch hourly pool data via `getPoolHourDataRange` or V2 equivalent, assemble normalized price rows.
  - Provide `getHourlyHistoricalPrices(token,start,end)` used by the worker.
- **`cache-scripts/cache-weth.js`**: WETH caching helper used to avoid repeated WETH ↔ USD lookups when deriving prices via WETH pairings.
- **`db/index.js`**: Exposes `insertRows(table, rows)` and selects the D1 implementation based on `CONFIG.DB.target`. It delegates to `d1-local.js` or `d1-remote.js`.
- **`db/d1-local.js` / `db/d1-remote.js`**: Local (sqlite) and remote (Cloudflare D1) implementations for persisting rows.
- **`config.js`**: Environment-driven configuration for Graph endpoints, RPCs, Redis, processing parameters (`chunkDays`, `batchInsertSize`, `workerConcurrency`), and D1 settings.
- **`utils/noDataLogger.js`**: Writes missing-pool/no-data events to `logs/missing_pool_data.jsonl` for later inspection.
- **`fetch-daily-price.js` & `fetch-daily-price-graph.js`**: Daily-aggregation scripts. They remain in the repo for one-off or alternate workflows but are not used by the hourly backfill producer/worker flow.
- **`progress.json`**: Local file used by `index.js` to record which token addresses have been enqueued so the run can resume.
- **`logs/missing_pool_data.jsonl`**: Append-only log of tokens/chunks where no pool data was found.

**How to Run (hourly pipeline)**
- Install dependencies:
```bash
npm install
```
- Set environment variables used by `config.js` (examples: `GRAPH_API_KEY`, `REDIS_URL`, `CLOUDFLARE_API_TOKEN`, `CF_D1_ID`, `LOUDFLARE_ACCOUNT_ID`). You can place them in a `.env` file consumed by `config.js`.
- Start the full pipeline (producer + worker in the same process):
```bash
node index.js
```
- Start a worker-only process for development (consumes queue jobs):
```bash
node bullmq/worker.js
```

**Quick Notes & Troubleshooting**
- If `worker` logs `No rows` for a token, check `logs/missing_pool_data.jsonl` for details.
- The Graph endpoints can be rate limited; tune concurrency (`CONFIG.PROCESSING.workerConcurrency`) and chunk sizing (`CONFIG.PROCESSING.chunkDays`) to avoid throttling.
- `bullmq/queue.js` and `bullmq/scheduler.js` are available but not required — ignore them unless you need delayed scheduling.
- `producer.js` currently contains placeholder timestamps (`alignedStart`, `todayMidnight`) and commented-out `getTokenCreationTimestamp` logic; update those values to use dynamic creation timestamps if you want precise historical coverage.

**Next steps I can do for you**
- Add `npm` scripts to `package.json` for starting producer/worker.
- Create a `.env.example` showing the required environment variables.
- Replace the hardcoded date ranges in `bullmq/producer.js` with dynamic `getTokenCreationTimestamp` logic.

--
This `README2.md` focuses on the hourly `historical-price-getter` pipeline and gives a concise, file-level map for maintainers. If you want, I can also produce a short runbook for debugging failed jobs.
