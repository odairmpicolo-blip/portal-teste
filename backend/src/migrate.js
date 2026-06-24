import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, getPool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");

async function main() {
  const sql = fs.readFileSync(schemaPath, "utf8");
  await query(sql);
  console.log("Schema aplicado:", schemaPath);
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
