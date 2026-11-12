import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret-change-me",
  jwtExpires: process.env.JWT_EXPIRES ?? "12h",
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  isProd: process.env.NODE_ENV === "production",
};

if (config.isProd && config.jwtSecret === "dev-only-secret-change-me") {
  throw new Error("JWT_SECRET phải được cấu hình ở môi trường production");
}
