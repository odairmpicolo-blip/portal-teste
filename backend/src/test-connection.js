import { query, getPool } from "./db.js";

async function main() {
  const res = await query("SELECT NOW() AS agora, current_database() AS banco");
  console.log("Conexão OK:", res.rows[0]);
  await getPool().end();
}

main().catch((err) => {
  console.error("Falha na conexão:", err.message);
  process.exit(1);
});
