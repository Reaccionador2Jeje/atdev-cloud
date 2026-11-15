import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { config } from "./config.js";

export interface AuthUser { id: string; email: string }
declare global {
  namespace Express { interface Request { user?: AuthUser } }
}

const findUser = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?");
const insertUser = db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)");

export async function register(emailInput: unknown, passwordInput: unknown) {
  if (typeof emailInput !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
    throw Object.assign(new Error("A valid email is required."), { status: 400 });
  }
  if (typeof passwordInput !== "string" || passwordInput.length < 10 || passwordInput.length > 72) {
    throw Object.assign(new Error("Password must contain between 10 and 72 characters."), { status: 400 });
  }
  const email = emailInput.trim().toLowerCase();
  if (findUser.get(email)) throw Object.assign(new Error("Email is already registered."), { status: 409 });
  const user = { id: randomUUID(), email };
  const passwordHash = await bcrypt.hash(passwordInput, 12);
  insertUser.run(user.id, user.email, passwordHash, new Date().toISOString());
  return user;
}

export async function authenticate(emailInput: unknown, passwordInput: unknown) {
  if (typeof emailInput !== "string" || typeof passwordInput !== "string") {
    throw Object.assign(new Error("Email and password are required."), { status: 400 });
  }
  const row = findUser.get(emailInput.trim().toLowerCase()) as
    | { id: string; email: string; password_hash: string } | undefined;
  if (!row || !(await bcrypt.compare(passwordInput, row.password_hash))) {
    throw Object.assign(new Error("Invalid email or password."), { status: 401 });
  }
  return { id: row.id, email: row.email };
}

export function createToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, { expiresIn: "12h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Authentication required." });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return res.status(401).json({ error: "Invalid token." });
    }
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
