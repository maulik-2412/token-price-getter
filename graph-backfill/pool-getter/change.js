import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- CONFIG ----
const FILE = path.join(__dirname, "eth-coins-v3-pools.json"); // <-- change your file name here

async function run() {
  try {
    let raw;

    // If file missing → create it as empty array
    try {
      raw = await fs.readFile(FILE, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        console.log("File not found. Creating empty file...");
        await fs.writeFile(FILE, "[]", "utf8");
        raw = "[]";
      } else {
        throw err;
      }
    }

    let data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      console.error("File is not an array. Aborting.");
      return;
    }

    // ---- Modify objects ----
    let changed = 0;

    data = data.map((obj) => {
      if (obj.poolIdV3 && obj.poolIdV2) {
        delete obj.poolIdV2;
        changed++;
      }
      return obj;
    });

    // ---- Write file back ----
    await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");

    console.log(`Done. Removed poolIdV2 from ${changed} objects.`);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
