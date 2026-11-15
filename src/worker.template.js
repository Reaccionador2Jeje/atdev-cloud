const INDEX_HTML = __ATDEV_INDEX_HTML__;

const encoder = new TextEncoder();
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const safeName = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromBase64url = value => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const safeFileName = value => String(value || "file").normalize("NFKC")
  .replace(/[\/\\]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "")
  .replace(/[^a-zA-Z0-9._ -]/g, "_").trim().slice(0, 120) || "file";
const storagePrefix = (userId, project) => "users/" + userId + "/projects/" + project + "/";
async function deleteStoragePrefix(bucket, prefix) {
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) await bucket.delete(page.objects.map(object => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

const constantTimeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
};

async function readJson(request) {
  const text = await request.text();
  if (text.length > 1_000_000) throw Object.assign(new Error("Request body is too large."), { status: 413 });
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error("Invalid JSON body."), { status: 400 }); }
}

async function passwordHash(password) {
  const iterations = 210000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return "pbkdf2$" + iterations + "$" + base64url(salt) + "$" + base64url(bits);
}

async function verifyPassword(password, stored) {
  try {
    const [algorithm, iterationText, saltText, expectedText] = stored.split("$");
    const iterations = Number(iterationText);
    if (algorithm !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const salt = fromBase64url(saltText);
    const expected = fromBase64url(expectedText);
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, expected.length * 8);
    return constantTimeEqual(new Uint8Array(bits), expected);
  } catch { return false; }
}

async function signToken(user, secret) {
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET is not configured.");
  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(encoder.encode(JSON.stringify({
    sub: user.id, email: user.email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 43200
  })));
  const unsigned = header + "." + payload;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned));
  return unsigned + "." + base64url(signature);
}

async function readUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const parts = auth.slice(7).split(".");
  if (parts.length !== 3 || !env.JWT_SECRET || env.JWT_SECRET.length < 32) return null;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64url(parts[2]), encoder.encode(parts[0] + "." + parts[1]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[1])));
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    const user = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(payload.sub).first();
    return user || null;
  } catch { return null; }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/health" && method === "GET") return json({ status: "ok", service: "atdev-cloud", runtime: "cloudflare-workers" });

  if (path === "/v1/auth/register" && method === "POST") {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) return json({ error: "Authentication is not configured. Set the JWT_SECRET Worker secret." }, 503);
    const body = await readJson(request);
    if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254) {
      return json({ error: "A valid email is required." }, 400);
    }
    if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 72) {
      return json({ error: "Password must contain between 10 and 72 characters." }, 400);
    }
    const email = body.email.trim().toLowerCase();
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) return json({ error: "Email is already registered." }, 409);
    const user = { id: crypto.randomUUID(), email };
    const hash = await passwordHash(body.password);
    try {
      await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .bind(user.id, user.email, hash, new Date().toISOString()).run();
    } catch (error) {
      if (String(error).includes("UNIQUE")) return json({ error: "Email is already registered." }, 409);
      throw error;
    }
    return json({ user, token: await signToken(user, env.JWT_SECRET) }, 201);
  }

  if (path === "/v1/auth/login" && method === "POST") {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) return json({ error: "Authentication is not configured. Set the JWT_SECRET Worker secret." }, 503);
    const body = await readJson(request);
    if (typeof body.email !== "string" || typeof body.password !== "string") {
      return json({ error: "Email and password are required." }, 400);
    }
    const row = await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
      .bind(body.email.trim().toLowerCase()).first();
    if (!row || !(await verifyPassword(body.password, row.password_hash))) {
      return json({ error: "Invalid email or password." }, 401);
    }
    const user = { id: row.id, email: row.email };
    return json({ user, token: await signToken(user, env.JWT_SECRET) });
  }

  if (path.startsWith("/v1/")) {
    const user = await readUser(request, env);
    if (!user) return json({ error: "Authentication required or token expired." }, 401);

    if (path === "/v1/auth/me" && method === "GET") return json({ user });

    if (path === "/v1/projects" && method === "GET") {
      const result = await env.DB.prepare(
        "SELECT id, slug, name, description, created_at, updated_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC"
      ).bind(user.id).all();
      return json({ projects: result.results });
    }

    if (path === "/v1/projects" && method === "POST") {
      const body = await readJson(request);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() :
        name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
      if (name.length < 2 || name.length > 80) return json({ error: "Project name must contain 2 to 80 characters." }, 400);
      if (!safeName(slug)) return json({ error: "Project slug may contain only letters, numbers, underscores and hyphens (max 64)." }, 400);
      if (description.length > 300) return json({ error: "Description must be 300 characters or fewer." }, 400);
      const now = new Date().toISOString();
      const project = { id: crypto.randomUUID(), slug, name, description, created_at: now, updated_at: now };
      try {
        await env.DB.prepare("INSERT INTO projects (id, owner_id, slug, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(project.id, user.id, slug, name, description, now, now).run();
      } catch (error) {
        if (String(error).includes("UNIQUE")) return json({ error: "A project with this slug already exists." }, 409);
        throw error;
      }
      return json({ project }, 201);
    }

    const projectMatch = path.match(/^\/v1\/projects\/([a-zA-Z0-9_-]{1,64})$/);
    if (projectMatch) {
      const slug = projectMatch[1];
      if (method === "GET") {
        const project = await env.DB.prepare("SELECT id, slug, name, description, created_at, updated_at FROM projects WHERE owner_id = ? AND slug = ?")
          .bind(user.id, slug).first();
        return project ? json({ project }) : json({ error: "Project not found." }, 404);
      }
      if (method === "PATCH") {
        const body = await readJson(request);
        const current = await env.DB.prepare("SELECT id, name, description FROM projects WHERE owner_id = ? AND slug = ?")
          .bind(user.id, slug).first();
        if (!current) return json({ error: "Project not found." }, 404);
        const name = body.name === undefined ? current.name : (typeof body.name === "string" ? body.name.trim() : "");
        const description = body.description === undefined ? current.description : (typeof body.description === "string" ? body.description.trim() : "");
        if (name.length < 2 || name.length > 80) return json({ error: "Project name must contain 2 to 80 characters." }, 400);
        if (description.length > 300) return json({ error: "Description must be 300 characters or fewer." }, 400);
        const now = new Date().toISOString();
        await env.DB.prepare("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE owner_id = ? AND slug = ?")
          .bind(name, description, now, user.id, slug).run();
        return json({ project: { id: current.id, slug, name, description, updated_at: now } });
      }
      if (method === "DELETE") {
        const current = await env.DB.prepare("SELECT id FROM projects WHERE owner_id = ? AND slug = ?")
          .bind(user.id, slug).first();
        if (!current) return json({ error: "Project not found." }, 404);
        if (env.FILES) await deleteStoragePrefix(env.FILES, storagePrefix(user.id, slug));
        await env.DB.batch([
          env.DB.prepare("DELETE FROM records WHERE owner_id = ? AND project = ?").bind(user.id, slug),
          env.DB.prepare("DELETE FROM projects WHERE owner_id = ? AND slug = ?").bind(user.id, slug)
        ]);
        return new Response(null, { status: 204 });
      }
    }

    if (path === "/v1/database/status" && method === "GET") {
      if (!env.ATDEV_DB_URL) return json({ configured: false, connected: false, service: "atdev-db" });
      try {
        const base = env.ATDEV_DB_URL.replace(/\/+$/, "");
        const response = await fetch(base + "/health", { signal: AbortSignal.timeout(2500) });
        if (!response.ok) return json({ configured: true, connected: false, service: "atdev-db" });
        const health = await response.json();
        return json({ configured: true, connected: health.status === "ok", service: "atdev-db" });
      } catch {
        return json({ configured: true, connected: false, service: "atdev-db" });
      }
    }

    if (path === "/v1/database/query" && method === "POST") {
      const body = await readJson(request);
      if (!safeName(body.project)) return json({ error: "Invalid project name." }, 400);
      if (typeof body.sql !== "string" || !body.sql.trim() || body.sql.length > 10000) {
        return json({ error: "SQL must contain between 1 and 10000 characters." }, 400);
      }
      if (!env.ATDEV_DB_URL) return json({ error: "AtDev DB has not been connected to this Worker yet." }, 503);
      try {
        const base = env.ATDEV_DB_URL.replace(/\/+$/, "");
        const headers = { "content-type": "application/json" };
        if (env.ATDEV_DB_TOKEN) headers.authorization = "Bearer " + env.ATDEV_DB_TOKEN;
        const response = await fetch(base + "/v1/query", {
          method: "POST", headers,
          body: JSON.stringify({ database: user.id.replace(/[^a-zA-Z0-9_-]/g, "_") + "_" + body.project, sql: body.sql })
        });
        if (!response.ok) return json({ error: "AtDev DB service unavailable." }, 502);
        const result = await response.json();
        if (!result.ok) return json({ error: result.error || "Database query failed." }, 400);
        return json({ result: result.result || "" });
      } catch {
        return json({ error: "Could not reach the AtDev DB service." }, 503);
      }
    }

    const recordsMatch = path.match(/^\/v1\/projects\/([a-zA-Z0-9_-]{1,64})\/records\/([a-zA-Z0-9_-]{1,64})(?:\/([a-zA-Z0-9_-]{1,64}))?$/);
    if (recordsMatch) {
      const [, project, collection, id] = recordsMatch;
      if (!id && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, data, created_at, updated_at FROM records WHERE owner_id = ? AND project = ? AND collection = ? ORDER BY created_at DESC LIMIT 500"
        ).bind(user.id, project, collection).all();
        return json({ data: result.results.map(row => ({ ...JSON.parse(row.data), id: row.id, created_at: row.created_at, updated_at: row.updated_at })) });
      }
      if (!id && method === "POST") {
        const body = await readJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "A JSON object is required." }, 400);
        const serialized = JSON.stringify(body);
        if (serialized.length > 65536) return json({ error: "Record exceeds the 64 KB limit." }, 413);
        const now = new Date().toISOString();
        const recordId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO records (id, project, collection, owner_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(recordId, project, collection, user.id, serialized, now, now).run();
        return json({ data: { ...body, id: recordId, created_at: now, updated_at: now } }, 201);
      }
      if (id && method === "GET") {
        const row = await env.DB.prepare("SELECT id, data, created_at, updated_at FROM records WHERE owner_id = ? AND project = ? AND collection = ? AND id = ?")
          .bind(user.id, project, collection, id).first();
        if (!row) return json({ error: "Record not found." }, 404);
        return json({ data: { ...JSON.parse(row.data), id: row.id, created_at: row.created_at, updated_at: row.updated_at } });
      }
      if (id && method === "PATCH") {
        const body = await readJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "A JSON object is required." }, 400);
        const row = await env.DB.prepare("SELECT data FROM records WHERE owner_id = ? AND project = ? AND collection = ? AND id = ?")
          .bind(user.id, project, collection, id).first();
        if (!row) return json({ error: "Record not found." }, 404);
        const merged = { ...JSON.parse(row.data), ...body };
        if (JSON.stringify(merged).length > 65536) return json({ error: "Record exceeds the 64 KB limit." }, 413);
        await env.DB.prepare("UPDATE records SET data = ?, updated_at = ? WHERE owner_id = ? AND project = ? AND collection = ? AND id = ?")
          .bind(JSON.stringify(merged), new Date().toISOString(), user.id, project, collection, id).run();
        return json({ data: { ...merged, id } });
      }
      if (id && method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM records WHERE owner_id = ? AND project = ? AND collection = ? AND id = ?")
          .bind(user.id, project, collection, id).run();
        if (!result.meta.changes) return json({ error: "Record not found." }, 404);
        return new Response(null, { status: 204 });
      }
    }


    const filesMatch = path.match(/^\/v1\/projects\/([a-zA-Z0-9_-]{1,64})\/files(?:\/([0-9a-fA-F-]{36}))?$/);
    if (filesMatch) {
      if (!env.FILES) return json({ error: "AtDev Storage is not configured. Bind an R2 bucket as FILES." }, 503);
      const [, project, fileId] = filesMatch;
      const projectRow = await env.DB.prepare("SELECT id FROM projects WHERE owner_id = ? AND slug = ?")
        .bind(user.id, project).first();
      if (!projectRow) return json({ error: "Project not found." }, 404);
      const prefix = storagePrefix(user.id, project);

      if (!fileId && method === "GET") {
        const cursor = url.searchParams.get("cursor") || undefined;
        const page = await env.FILES.list({ prefix, cursor, limit: 100, include: ["httpMetadata", "customMetadata"] });
        return json({
          files: page.objects.map(object => ({
            id: object.key.slice(prefix.length),
            name: object.customMetadata?.originalName || object.key.split("/").pop(),
            size: object.size,
            uploaded: object.uploaded,
            contentType: object.httpMetadata?.contentType || "application/octet-stream"
          })),
          cursor: page.truncated ? page.cursor : null
        });
      }

      if (!fileId && method === "POST") {
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (!contentLength) return json({ error: "Content-Length is required for uploads." }, 411);\n        if (contentLength > MAX_FILE_BYTES + 65536) return json({ error: "Upload limit is 10 MB per file." }, 413);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "Multipart field 'file' is required." }, 400);
        if (file.size < 1) return json({ error: "Empty files are not allowed." }, 400);
        if (file.size > MAX_FILE_BYTES) return json({ error: "Upload limit is 10 MB per file." }, 413);
        const id = crypto.randomUUID();
        const name = safeFileName(file.name);
        const key = prefix + id;
        const contentType = file.type && file.type.length <= 120 ? file.type : "application/octet-stream";
        await env.FILES.put(key, file.stream(), {
          httpMetadata: { contentType },
          customMetadata: { originalName: name, ownerId: user.id, project, fileId: id }
        });
        return json({ file: { id, name, size: file.size, contentType } }, 201);
      }

      if (fileId && method === "GET") {
        const object = await env.FILES.get(prefix + fileId);
        if (!object) return json({ error: "File not found." }, 404);
        const name = safeFileName(object.customMetadata?.originalName || "download");
        const contentType = object.httpMetadata?.contentType || "application/octet-stream";
        return new Response(object.body, {
          headers: {
            "content-type": contentType,
            "content-length": String(object.size),
            "content-disposition": "attachment; filename=\"" + name.replace(/["\\\\]/g, "_") + "\"",
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff"
          }
        });
      }

      if (fileId && method === "DELETE") {
        const key = prefix + fileId;
        const object = await env.FILES.head(key);
        if (!object) return json({ error: "File not found." }, 404);
        await env.FILES.delete(key);
        return new Response(null, { status: 204 });
      }
    }

    return json({ error: "Not found." }, 404);
  }

  return new Response(INDEX_HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}

export default {
  async fetch(request, env) {
    try {
      return await handleApi(request, env);
    } catch (error) {
      const status = Number(error && error.status) || 500;
      if (status >= 500) console.error(JSON.stringify({ level: "error", message: String(error && error.message || error) }));
      return json({ error: status >= 500 ? "Internal server error." : String(error.message || error) }, status);
    }
  }
};
