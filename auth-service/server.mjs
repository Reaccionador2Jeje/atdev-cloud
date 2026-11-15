import express from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import pg from "pg";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const { Pool } = pg;
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
const port = Number(process.env.PORT || 8080);
const internalToken = process.env.AUTH_SERVICE_TOKEN || "";
if (internalToken.length < 32) throw new Error("AUTH_SERVICE_TOKEN must contain at least 32 characters.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : (process.env.PGSSLMODE === "require" || process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined),
  max: Number(process.env.PG_POOL_MAX || 10), idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000
});
await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
function authorized(req) {
  const value = req.get("authorization") || "";
  if (!value.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(value.slice(7)), expected = Buffer.from(internalToken);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function requireInternal(req, res, next) {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  next();
}
function validate(email, password) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "A valid email is required.";
  if (typeof password !== "string" || password.length < 10 || Buffer.byteLength(password, "utf8") > 72) return "Password must contain at least 10 characters and no more than 72 UTF-8 bytes.";
  return null;
}
async function createAccount({ id, email, password }) {
  const invalid = validate(email, password);
  if (invalid) return { error: invalid, status: 400 };
  const normalized = email.trim().toLowerCase(), userId = id || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return { error: "Invalid user identifier.", status: 400 };
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email", [userId, normalized, passwordHash]);
    return { user: result.rows[0], status: 201 };
  } catch (error) {
    if (error?.code === "23505") return { error: "Email is already registered.", status: 409 };
    throw error;
  }
}
app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", service: "atdev-cloud-auth", database: "postgresql" }); }
  catch { res.status(503).json({ status: "error", service: "atdev-cloud-auth", database: "unavailable" }); }
});
app.use("/internal", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }), requireInternal);
app.post("/internal/register", async (req, res, next) => {
  try {
    const result = await createAccount(req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ user: result.user });
  } catch (error) { next(error); }
});
app.post("/internal/login", async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body?.password;
    if (!email || typeof password !== "string") return res.status(400).json({ error: "Email and password are required." });
    const result = await pool.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: "Invalid email or password." });
    res.json({ user: { id: row.id, email: row.email } });
  } catch (error) { next(error); }
});
app.post("/internal/migrate", async (req, res, next) => {
  try {
    const result = await createAccount(req.body || {});
    if (result.error && result.status === 409) {
      const existing = await pool.query("SELECT id, email FROM users WHERE email = $1", [String(req.body?.email || "").trim().toLowerCase()]);
      if (existing.rows[0]?.id === req.body?.id) return res.json({ user: existing.rows[0] });
    }
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ user: result.user, migrated: true });
  } catch (error) { next(error); }
});
app.use((error, _req, res, _next) => {
  console.error("auth-service error:", error?.message || error);
  res.status(500).json({ error: "Account service internal error." });
});
const server = app.listen(port, "0.0.0.0", () => console.log(`AtDev Cloud Auth listening on port ${port}`));
async function shutdown() { server.close(); await pool.end(); process.exit(0); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
