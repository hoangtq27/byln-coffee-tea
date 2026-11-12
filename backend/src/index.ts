import { createApp } from "./app.js";
import { config } from "./config.js";
import { getDb, initSchema } from "./db.js";

async function main() {
  const db = getDb();
  await initSchema(db); // idempotent (CREATE TABLE IF NOT EXISTS)
  createApp().listen(config.port, () => {
    console.log(`API listening on :${config.port} (${config.databaseUrl ? "PostgreSQL" : "PGlite local"})`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
