import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL não configurada em backend/.env");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes("sslmode=require") || process.env.PGSSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}
