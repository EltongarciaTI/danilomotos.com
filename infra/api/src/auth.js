import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { query } from "./db.js";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const SESSION_DAYS = 30;
const COOKIE_NAME = "dm_session";

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function signSession(userId) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(JWT_SECRET);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, to_timestamp($3))`,
    [userId, sha256(token), exp],
  );

  return { token, expiresAt: new Date(exp * 1000) };
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    const r = await query(
      `SELECT s.user_id, u.email, u.uuid
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
        LIMIT 1`,
      [sha256(token)],
    );
    if (!r.rows.length) return null;
    return { id: r.rows[0].user_id, email: r.rows[0].email, uuid: r.rows[0].uuid, payload };
  } catch {
    return null;
  }
}

export async function revokeSession(token) {
  if (!token) return;
  await query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

export async function login(email, password) {
  const r = await query("SELECT id, encrypted_password FROM users WHERE email = $1", [email]);
  if (!r.rows.length) return { error: "Email ou senha inválidos" };
  const ok = await bcrypt.compare(password, r.rows[0].encrypted_password);
  if (!ok) return { error: "Email ou senha inválidos" };

  await query("UPDATE users SET last_sign_in_at = now() WHERE id = $1", [r.rows[0].id]);
  const { token, expiresAt } = await signSession(r.rows[0].id);
  return { token, expiresAt };
}

export function cookieFor(token, expiresAt) {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export function getTokenFromHeaders(c) {
  const cookie = c.req.header("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (m) return decodeURIComponent(m[1]);
  // Fallback: Authorization: Bearer …
  const auth = c.req.header("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export function requireAuth() {
  return async (c, next) => {
    const token = getTokenFromHeaders(c);
    const user = await verifySession(token);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", user);
    c.set("token", token);
    await next();
  };
}

export const cookieName = COOKIE_NAME;
