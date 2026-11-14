import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { HttpError } from "./lib/http.js";
import { getDb } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { dishesRouter } from "./routes/dishes.js";
import { ordersRouter } from "./routes/orders.js";
import { employeesRouter } from "./routes/employees.js";
import { accountsRouter } from "./routes/accounts.js";
import { shiftsRouter } from "./routes/shifts.js";
import { revenueRouter } from "./routes/revenue.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  // Màn hình đăng nhập gọi endpoint này khi vừa mở để "đánh thức" server (Render Free) và CSDL (Neon)
  // trước khi người dùng bấm "Đăng nhập".
  app.get("/api/health", async (_req, res) => {
    try {
      await getDb().query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === "test" ? 10000 : 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Quá nhiều lần thử. Vui lòng thử lại sau!" },
  });
  app.use("/api/auth/login", loginLimiter);

  app.use("/api/auth", authRouter);
  app.use("/api/dishes", dishesRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/shifts", shiftsRouter);
  app.use("/api/revenue", revenueRouter);

  app.use((_req, res) => res.status(404).json({ message: "Không tìm thấy tài nguyên" }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ message: err.message, fields: err.fields });
    }
    if ((err as any)?.type === "entity.parse.failed")
      return res.status(400).json({ message: "Dữ liệu gửi lên không hợp lệ!" });
    console.error(err);
    res.status(500).json({ message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!" });
  });

  return app;
}
