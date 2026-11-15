import "dotenv/config";
import path from "node:path";

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const jwtSecret = process.env.JWT_SECRET ?? "development-only-change-me";
if (process.env.NODE_ENV === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production.");
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "127.0.0.1",
  port: positiveNumber(process.env.PORT, 3000),
  jwtSecret,
  databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/atdev-cloud.sqlite"),
  storagePath: path.resolve(process.env.STORAGE_PATH ?? "./storage"),
  maxUploadBytes: positiveNumber(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  atdevDbUrl: process.env.ATDEV_DB_URL ?? "http://127.0.0.1:8788"
};
