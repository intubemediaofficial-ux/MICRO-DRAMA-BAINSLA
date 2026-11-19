import Link from "next/link";
import { getTheme } from "@/server/site-config";
import NotFoundTracker from "@/components/not-found-tracker";

export default async function NotFoundPage() {
  const theme = await getTheme();
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <NotFoundTracker />
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-rose-300">{theme.kicker}</p>
      <h1 className="mt-4 text-4xl font-black">Page not found</h1>
      <p className="mt-2 text-zinc-400">This story may have moved or is no longer available.</p>
      <Link href="/" className="mt-6 rounded-full bg-rose-500 px-5 py-3 font-bold text-white">Back to {theme.siteName}</Link>
    </main>
  );
}
