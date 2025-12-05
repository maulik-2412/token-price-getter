import IORedis from "ioredis";
import { CONFIG } from "../config.js";

// Redis connection
export const connection = new IORedis(
  CONFIG.REDIS.redisUrl || "redis://127.0.0.1:6379",
  {
    maxRetriesPerRequest: null,
  }
);