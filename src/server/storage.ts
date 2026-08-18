import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./config";
export interface StorageAdapter { put(key: string, data: Buffer): Promise<string>; url(key: string): string; }
export class LocalStorageAdapter implements StorageAdapter {
  async put(key: string, data: Buffer) { const target = path.join(env.MEDIA_DIR, key); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, data); return key; }
  url(key: string) { return `/api/media/${encodeURIComponent(key)}`; }
}
// TODO: implement signed S3/Cloudflare Stream URLs behind StorageAdapter.
export const storage = new LocalStorageAdapter();
