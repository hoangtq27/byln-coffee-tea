
import { getDb } from "./src/db.js";

const db = getDb();

try {
  const result = await db.query(
    `SELECT
      current_database() AS database,
      current_user AS username,
      NOW() AS server_time`
  );

  console.log("NEON CONNECTION SUCCESS!");
  console.log(result.rows[0]);
} catch (error) {
  console.error("NEON CONNECTION FAILED!");
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
