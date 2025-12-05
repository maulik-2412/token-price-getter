import { ethers } from "ethers";
import { CONFIG } from "./config.js";
import dotenv from "dotenv";
dotenv.config();

const RPC_URL = CONFIG.NETWORK.ethereum + process.env.ALCHEMY_API_KEY;
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Contracts
const FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984"; // Uniswap V3 Factory
const USDC = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

const FEES = [100, 500, 3000, 10000]; // 0.05%, 0.3%, 1%

const IFactory = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address)",
];
const IPool = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick, uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)",
];

const IERC20 = [
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

// Helpers
function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

async function bestPool(tokenA, tokenB) {
  const factory = new ethers.Contract(FACTORY, IFactory, provider);
  const pools = await Promise.all(
    FEES.map((f) => factory.getPool(tokenA, tokenB, f))
  );
  const valid = pools.filter((addr) => addr !== ethers.ZeroAddress);

  if (valid.length === 0) return null;

  const infos = await Promise.all(
    valid.map(async (p) => {
      const c = new ethers.Contract(p, IPool, provider);
      const liq = await c.liquidity();
      return { addr: p, liquidity: BigInt(liq) };
    })
  );

  infos.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1));
  return infos[0]; // { addr, liquidity }
}

async function getPriceFromPool(tokenIn, tokenOut, minLiquidity = 10_000n) {
  const best = await bestPool(tokenIn, tokenOut);
  if (!best || best.liquidity < minLiquidity) return null;

  const pool = new ethers.Contract(best.addr, IPool, provider);
  const { tick } = await pool.slot0();

  const tokenInContract = new ethers.Contract(tokenIn, IERC20, provider);
  const tokenOutContract = new ethers.Contract(tokenOut, IERC20, provider);

  const [decIn, decOut] = await Promise.all([
    tokenInContract.decimals().then(Number),
    tokenOutContract.decimals().then(Number),
  ]);

  const token0 = tokenIn < tokenOut ? tokenIn : tokenOut;
  const priceRatio = tickToPrice(Number(tick));

  let price;
  if (token0 === tokenIn) {
    price = priceRatio * Math.pow(10, decIn - decOut);
  } else {
    price = (1 / priceRatio) * Math.pow(10, decIn - decOut);
  }
  return price;
}

async function getPrice(tokenAddr) {
  const tokenContract = new ethers.Contract(tokenAddr, IERC20, provider);
 let tokenName, tokenSymbol ;
  try {
    tokenName = await tokenContract.name();
  } catch {
    tokenName = "Unknown";
  }
  try {
    tokenSymbol = await tokenContract.symbol();
  } catch {
    tokenSymbol = "UNK";
  }

  // 1. Try direct token/USDC
  let price = await getPriceFromPool(tokenAddr, USDC);
  if (price) {
    return { tokenName, tokenSymbol, tokenAddr, priceInUSDC: price };
  }

  // 2. Try token/WETH and WETH/USDC
  const priceTokenWETH = await getPriceFromPool(tokenAddr, WETH);
  const priceWETHUSDC = await getPriceFromPool(WETH, USDC);

  if (priceTokenWETH && priceWETHUSDC) {
    return {
      tokenName,
      tokenSymbol,
      tokenAddr,
      priceInUSDC: priceTokenWETH * priceWETHUSDC,
    };
  }

  // 3. No reliable data
  throw new Error("Not reliable data (low liquidity)");
}

const bnb = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52"
const lido="0xae7ab96520de3a18e5e111b5eaab095312d7fe84"
const tron="0x50327c6c5a14DCaDE707ABad2E27eB517df87AB5"
const link="0x514910771af9ca656af840dff83e8264ecf986ca"
const wbtc="0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"

// Run
getPrice(wbtc)
  .then(({ tokenName, tokenAddr, priceInUSDC }) => {
    console.log(`Price of ${tokenName} (${tokenAddr}) in USDC: ${priceInUSDC}`);
  })
  .catch(console.error);
