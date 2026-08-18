import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { storage } from "@/server/storage";

const kind = z.enum(["poster", "teaser", "cast"]);

export async function POST(request: Request) {
  try {
    await adminSession();
    const form = await request.formData();
    const file = form.get("file");
    const category = kind.parse(form.get("category") ?? "poster");
    if (!(file instanceof File) || file.size === 0)
      return NextResponse.json({ error: { message: "Choose a file to upload." } }, { status: 400 });
    if (file.size > 200 * 1024 * 1024)
      return NextResponse.json({ error: { message: "Files must be smaller than 200 MB." } }, { status: 400 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `admin/${category}/${crypto.randomUUID()}-${safeName}`;
    await storage.put(key, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ key, url: storage.url(key) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}
