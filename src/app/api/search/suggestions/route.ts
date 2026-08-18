import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ suggestions: [] });
  const pattern = `%${query}%`;
  const rows = await prisma.$queryRaw<{ value: string }[]>(
    Prisma.sql`
      SELECT value
      FROM (
        SELECT s.title AS value
        FROM "Series" s
        WHERE s."isPublished" = true AND s.title ILIKE ${pattern}
        UNION
        SELECT tag AS value
        FROM "Series" s
        CROSS JOIN LATERAL unnest(s.genres || s."tropeTags") AS tag
        WHERE s."isPublished" = true AND tag ILIKE ${pattern}
      ) suggestions
      ORDER BY value ASC
      LIMIT 8
    `,
  );
  return NextResponse.json({ suggestions: rows.map((row) => row.value) });
}
