import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { db } from "./db.js";
import { authenticate, createToken, register, requireAuth } from "./auth.js";

const app = express();
fs.mkdirSync(config.storagePath, { recursive: true });
app.disable("x-powered-by");
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve("public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, config.storagePath),
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
      callback(null, randomUUID() + ext);
    }
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 }
});

const safeName = (value: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const routeParam = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";
const records = {
  list: db.prepare("SELECT id, data, created_at, updated_at FROM records WHERE owner_id=? AND project=? AND collection=? ORDER BY created_at DESC LIMIT 500"),
  get: db.prepare("SELECT id, data, created_at, updated_at FROM records WHERE owner_id=? AND project=? AND collection=? AND id=?"),
  insert: db.prepare("INSERT INTO records (id, project, collection, owner_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  update: db.prepare("UPDATE records SET data=?, updated_at=? WHERE owner_id=? AND project=? AND collection=? AND id=?"),
  delete: db.prepare("DELETE FROM records WHERE owner_id=? AND project=? AND collection=? AND id=?")
};

app.get("/health", (_req, res) => res.json({ status: "ok", service: "atdev-cloud", version: "0.1.0-alpha" }));

app.post("/v1/auth/register", async (req, res, next) => {
  try {
    const user = await register(req.body?.email, req.body?.password);
    res.status(201).json({ user, token: createToken(user) });
  } catch (error) { next(error); }
});

app.post("/v1/auth/login", async (req, res, next) => {
  try {
    const user = await authenticate(req.body?.email, req.body?.password);
    res.json({ user, token: createToken(user) });
  } catch (error) { next(error); }
});

app.get("/v1/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.get("/v1/projects/:project/records/:collection", requireAuth, (req, res) => {
  const project = routeParam(req.params.project);
  const collection = routeParam(req.params.collection);
  if (!safeName(project) || !safeName(collection)) return res.status(400).json({ error: "Invalid project or collection name." });
  const rows = records.list.all(req.user!.id, project, collection) as Array<{id:string;data:string;created_at:string;updated_at:string}>;
  res.json({ data: rows.map(row => ({ id: row.id, ...JSON.parse(row.data), created_at: row.created_at, updated_at: row.updated_at })) });
});

app.post("/v1/projects/:project/records/:collection", requireAuth, (req, res) => {
  const project = routeParam(req.params.project);
  const collection = routeParam(req.params.collection);
  if (!safeName(project) || !safeName(collection)) return res.status(400).json({ error: "Invalid project or collection name." });
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ error: "A JSON object is required." });
  const now = new Date().toISOString();
  const id = randomUUID();
  records.insert.run(id, project, collection, req.user!.id, JSON.stringify(req.body), now, now);
  res.status(201).json({ data: { id, ...req.body, created_at: now, updated_at: now } });
});

app.get("/v1/projects/:project/records/:collection/:id", requireAuth, (req, res) => {
  const project = routeParam(req.params.project);
  const collection = routeParam(req.params.collection);
  const id = routeParam(req.params.id);
  if (!safeName(project) || !safeName(collection)) return res.status(400).json({ error: "Invalid project or collection name." });
  const row = records.get.get(req.user!.id, project, collection, id) as {id:string;data:string;created_at:string;updated_at:string} | undefined;
  if (!row) return res.status(404).json({ error: "Record not found." });
  res.json({ data: { id: row.id, ...JSON.parse(row.data), created_at: row.created_at, updated_at: row.updated_at } });
});

app.patch("/v1/projects/:project/records/:collection/:id", requireAuth, (req, res) => {
  const project = routeParam(req.params.project);
  const collection = routeParam(req.params.collection);
  const id = routeParam(req.params.id);
  if (!safeName(project) || !safeName(collection)) return res.status(400).json({ error: "Invalid project or collection name." });
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ error: "A JSON object is required." });
  const old = records.get.get(req.user!.id, project, collection, id) as {data:string} | undefined;
  if (!old) return res.status(404).json({ error: "Record not found." });
  const merged = { ...JSON.parse(old.data), ...req.body };
  records.update.run(JSON.stringify(merged), new Date().toISOString(), req.user!.id, project, collection, id);
  res.json({ data: { id, ...merged } });
});

app.delete("/v1/projects/:project/records/:collection/:id", requireAuth, (req, res) => {
  const project = routeParam(req.params.project);
  const collection = routeParam(req.params.collection);
  const id = routeParam(req.params.id);
  if (!safeName(project) || !safeName(collection)) return res.status(400).json({ error: "Invalid project or collection name." });
  const result = records.delete.run(req.user!.id, project, collection, id);
  if (!result.changes) return res.status(404).json({ error: "Record not found." });
  res.status(204).end();
});


app.get("/v1/database/status", requireAuth, async (_req, res) => {
  try {
    const response = await fetch(`${config.atdevDbUrl}/health`, {
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return res.json({ connected: false, service: "atdev-db" });
    const health = await response.json() as { status?: string; service?: string };
    return res.json({ connected: health.status === "ok", service: health.service ?? "atdev-db" });
  } catch {
    return res.json({ connected: false, service: "atdev-db" });
  }
});

app.post("/v1/database/query", requireAuth, async (req, res) => {
  const project = req.body?.project;
  const sql = req.body?.sql;
  if (typeof project !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(project)) {
    return res.status(400).json({ error: "Invalid project name." });
  }
  if (typeof sql !== "string" || sql.trim().length === 0 || sql.length > 10000) {
    return res.status(400).json({ error: "SQL must contain between 1 and 10000 characters." });
  }
  try {
    const response = await fetch(`${config.atdevDbUrl}/v1/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ database: `${req.user!.id}_${project}`, sql })
    });
    if (!response.ok) return res.status(502).json({ error: "AtDev DB service unavailable." });
    const result = await response.json() as { ok: boolean; result?: string; error?: string };
    if (!result.ok) return res.status(400).json({ error: result.error ?? "Database query failed." });
    return res.json({ result: result.result ?? "" });
  } catch {
    return res.status(503).json({ error: "AtDev DB is not running. Start it with: cargo run -- --server" });
  }
});

app.post("/v1/storage/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Multipart field 'file' is required." });
  res.status(201).json({ file: { name: req.file.filename, size: req.file.size, url: `/v1/storage/${req.file.filename}` } });
});

app.get("/v1/storage/:filename", (req, res) => {
  const filename = routeParam(req.params.filename);
  if (!/^[a-f0-9-]{36}(\.[a-zA-Z0-9]{1,12})?$/.test(filename)) return res.status(400).json({ error: "Invalid filename." });
  const filePath = path.join(config.storagePath, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found." });
  res.sendFile(filePath);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const err = error as Error & { status?: number; code?: string };
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File exceeds the configured upload limit." });
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Internal server error." : err.message });
});

app.listen(config.port, config.host, () => {
  console.log(`AtDev Cloud listening on http://${config.host}:${config.port}`);
});
