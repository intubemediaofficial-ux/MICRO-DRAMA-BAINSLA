"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function NotFoundTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) void fetch("/api/seo/not-found", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
