import { getDb, initSchema } from "../src/db.js";

const db = getDb();
initSchema(db)
  .then(async () => {
    console.log("Schema đã được khởi tạo.");
    await db.close();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
