import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { config } from "./config.js";

export interface Executor {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Executor {
  tx<T>(fn: (e: Executor) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// Chuẩn hóa kiểu: NUMERIC/BIGINT -> number, DATE/TIMESTAMP/TIME -> string thô
const PG_NUMERIC = 1700, PG_INT8 = 20, PG_TS = 1114, PG_DATE = 1082, PG_TIME = 1083;

function createPg(url: string): Database {
  const types = pg.types;
  types.setTypeParser(PG_NUMERIC, (v) => Number(v));
  types.setTypeParser(PG_INT8, (v) => Number(v));
  types.setTypeParser(PG_TS, (v) => v);
  types.setTypeParser(PG_DATE, (v) => v);
  types.setTypeParser(PG_TIME, (v) => v);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 5,
    // Giữ kết nối lâu hơn để tránh bắt tay TLS lại với Neon ở mỗi lần đăng nhập sau thời gian rảnh
    idleTimeoutMillis: 5 * 60 * 1000,
    keepAlive: true,
    connectionTimeoutMillis: 15000,
  });
  pool.on("error", (e) => console.error("pg pool error:", e.message));
  return {
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const r = await fn({ query: (s, p) => client.query(s, p as any[]) as any });
        await client.query("COMMIT");
        return r;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

function createPglite(dir?: string): Database {
  if (dir) mkdirSync(path.dirname(dir), { recursive: true });
  const db = new PGlite(dir);
  // Với PGlite, parser kiểu dữ liệu được truyền theo từng câu truy vấn
  const opts = {
    parsers: {
      [PG_NUMERIC]: (v: string) => Number(v),
      [PG_INT8]: (v: string) => Number(v),
      [PG_TS]: (v: string) => v,
      [PG_DATE]: (v: string) => v,
      [PG_TIME]: (v: string) => v,
    },
  };
  let chain: Promise<unknown> = Promise.resolve();
  return {
    query: (sql, params) => db.query(sql, params as any[], opts) as any,
    // PGlite là single-connection: tuần tự hóa các transaction
    tx(fn) {
      const run = chain.then(() =>
        db.transaction((t) => fn({ query: (s, p) => t.query(s, p as any[], opts) as any })),
      );
      chain = run.catch(() => undefined);
      return run as Promise<any>;
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}

let instance: Database | null = null;

export function getDb(): Database {
  if (!instance) {
    instance = config.databaseUrl
      ? createPg(config.databaseUrl)
      : createPglite(process.env.PGLITE_DIR === "memory" ? undefined : process.env.PGLITE_DIR ?? ".data/pglite");
  }
  return instance;
}

export function setDb(db: Database) {
  instance = db;
}

export function newMemoryDb(): Database {
  return createPglite(undefined);
}

export async function initSchema(db: Database) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(path.join(dir, "..", "db", "schema.sql"), "utf8");
  await db.exec(sql);
}
