import "./globals.css";
import type { Metadata } from "next";
import BottomNav from "@/components/bottom-nav";
import { getSession } from "@/server/auth";
import { hasActiveSubscription } from "@/server/entitlements";

export const metadata: Metadata = {
  title: "MicroDrama",
  description: "Vertical stories. One more episode.",
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const subscription = session ? await hasActiveSubscription(session.userId) : null;
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-screen max-w-6xl">{children}</main>
        <BottomNav isAdmin={session?.role === "ADMIN"} isVip={Boolean(subscription)} />
      </body>
    </html>
  );
}
