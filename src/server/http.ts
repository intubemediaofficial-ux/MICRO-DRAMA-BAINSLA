import { NextResponse } from "next/server";
export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: { message } }, { status });
}
export async function body<T>(request: Request, schema: { parse(input: unknown): T }) {
  try {
    return schema.parse(await request.json());
  } catch {
    throw new Error("INVALID_INPUT");
  }
}
