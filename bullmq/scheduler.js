import { priceQueue } from './queue.js';

// Tokens to track
const TOKENS = [
  { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
  { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  { symbol: 'BNB', address: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52' },
];

// Cron-style repeat (every 1 minute)
const CRON = '*/1 * * * *';
/* const INTERVAL_MS = 15000; // 5 seconds */

export async function scheduleJobs() {
  try {
    for (const token of TOKENS) {
        await priceQueue.add('fetchPrice', { token },{
            jobId:token.symbol,
            removeOnComplete:true,
            removeOnFail:false,
            attempts:3,
            backoff:{ type:'exponential',delay:5000}
        });
      
        await priceQueue.add(
        'fetchPrice',
        { token },
        {
          jobId: token.symbol + '-repeat',           // unique per token
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          repeat: { /* every: INTERVAL_MS */cron:CRON } // repeat every 5 seconds
        }
      );
      console.log(`🟢 Scheduled repeated price fetch for ${token.symbol}`);
    }
  } catch (err) {
    console.error("❌ Error scheduling jobs:", err);
  }
}


scheduleJobs();
