import dotenv from 'dotenv';
dotenv.config();

console.log("config api key",process.env.GRAPH_API_KEY)

export const CONFIG={
    GRAPH:{
        graphAPIKey:process.env.GRAPH_API_KEY,
  
        uniswapSubGraphEndpoint:"https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV"
    },
    NETWORK:{
        ethereum:`https://eth-mainnet.g.alchemy.com/v2/`
    },
    REDIS:{
        redisUrl:process.env.REDIS_URL
    },
    PROCESSING:{
        chunkDays:parseInt(process.env.CHUNK_DAYS || "90", 10),
        batchInsertSize:parseInt(process.env.BATCH_INSERT_SIZE || "200", 10),
        workerConcurrency:parseInt(process.env.WORKER_CONCURRENCY || "4", 10),
    },
    DB :{
        target:process.env.DB_TARGET
    },
    D1:{
        local:{
            path:'./local.sqlite'
        },
        remote:{
            accountId:process.env.LOUDFLARE_ACCOUNT_ID,
            databaseId:process.env.CF_D1_ID,
            token:process.env.CLOUDFLARE_API_TOKEN
        }
    }
}