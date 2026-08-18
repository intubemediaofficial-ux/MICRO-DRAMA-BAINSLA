import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "./config";
const encode = (value: string) => Buffer.from(value).toString("base64url");
const sign = (body: string) => createHmac("sha256", env.STREAM_TOKEN_SECRET).update(body).digest("base64url");
export function createStreamToken(userId: string, episodeId: string, ttlSeconds = 300) {
  const body = `${userId}.${episodeId}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  return `${encode(body)}.${sign(body)}`;
}
export function verifyStreamToken(token: string): { userId: string; episodeId: string } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const body = Buffer.from(encoded, "base64url").toString();
  const expected = sign(body);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const [userId, episodeId, exp] = body.split(".");
  if (!userId || !episodeId || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return { userId, episodeId };
}
export function createAdToken(userId: string, episodeId: string, ttlSeconds = 120) {
  const nonce = randomUUID();
  const body = `${userId}.${episodeId}.${nonce}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  return `${encode(body)}.${sign(body)}`;
}
export function verifyAdToken(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const body = Buffer.from(encoded, "base64url").toString();
  const expected = sign(body);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const [userId, episodeId, nonce, exp] = body.split(".");
  if (!userId || !episodeId || !nonce || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return { userId, episodeId, nonce, expiresAt: new Date(Number(exp) * 1000) };
}
export function watermark(phone: string | null, userId: string) {
  return phone ? `${phone.slice(0, 3)}•••${phone.slice(-2)}` : `MD-${userId.slice(-6).toUpperCase()}`;
}
