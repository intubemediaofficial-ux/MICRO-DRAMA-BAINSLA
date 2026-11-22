import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("ref")?.trim();
  if (!code || !/^[a-z\d_-]{2,64}$/i.test(code)) return NextResponse.next();
  const response = NextResponse.next();
  response.cookies.set("ref", code.toUpperCase(), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
