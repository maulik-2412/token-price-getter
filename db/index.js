import { CONFIG } from "../config.js";
import { insertRowsD1Local } from "./d1-local.js";
import { insertRowsD1Remote } from "./d1-remote.js";

export async function insertRows(table, rows) {
  const mode = CONFIG.DB.target;

  if (mode === "D1_LOCAL") {
    return insertRowsD1Local(table, rows);
  }

  if (mode === "D1_REMOTE") {
    return insertRowsD1Remote(table, rows);
  }
}
