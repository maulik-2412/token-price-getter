import { isEmpty } from "bullmq";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Required because __dirname doesn't exist in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function splitByChain(inputFile, chainKey) {
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputFile, "utf8");
  const data = JSON.parse(raw);

  const chainTokens = [];
  const nonChainTokens = [];

  for (const token of data) {
    const contracts = token.contracts ?? token.contract_addresses ?? {};
    if (contracts[chainKey]) {
      chainTokens.push(token);
    } else {
      nonChainTokens.push(token);
    }

  }

  

  const chainFile = `${chainKey}.json`;
  const nonChainFile = `non_${chainKey}.json`;

  // Always create files — even if empty
  fs.writeFileSync(chainFile, JSON.stringify(chainTokens, null, 2));
  fs.writeFileSync(nonChainFile, JSON.stringify(nonChainTokens, null, 2));

  console.log(`✅ Created: ${chainFile} (${chainTokens.length} tokens)`);
  console.log(`✅ Created: ${nonChainFile} (${nonChainTokens.length} tokens)`);
}

// CLI entry
if (process.argv[1] === __filename) {
  if (process.argv.length < 4) {
    console.log("Usage: node split.js <input_file.json> <chain_key>");
    process.exit(1);
  }

  const inputFile = process.argv[2];
  const chainKey = process.argv[3];

  splitByChain(inputFile, chainKey);
}

export default splitByChain;
