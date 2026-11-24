import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "./config";

export const MAX_VIDEO_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export class UploadTooLargeError extends Error {
  constructor() {
    super("Video files must be 2 GB or smaller.");
    this.name = "UploadTooLargeError";
  }
}

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<string>;
  putStream(
    key: string,
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
  ): Promise<string>;
  url(key: string): string;
}
export class LocalStorageAdapter implements StorageAdapter {
  async put(key: string, data: Buffer) {
    const target = path.join(env.MEDIA_DIR, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return key;
  }
  async putStream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
    const target = path.join(env.MEDIA_DIR, key);
    const partial = `${target}.part`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    let bytesWritten = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesWritten += chunk.length;
        if (bytesWritten > maxBytes) {
          callback(new UploadTooLargeError());
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>),
        limit,
        createWriteStream(partial),
      );
      if (!bytesWritten) throw new Error("A video file is required.");
      await fs.rename(partial, target);
      return key;
    } catch (error) {
      await fs.rm(partial, { force: true });
      throw error;
    }
  }
  url(key: string) {
    return `/api/media/${encodeURIComponent(key)}`;
  }
}
// TODO: implement signed S3/Cloudflare Stream URLs behind StorageAdapter.
export const storage = new LocalStorageAdapter();
