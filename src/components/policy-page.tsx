import Link from "next/link";
import type { ReactNode } from "react";
import CmsHtml from "@/components/cms-html";
import { getTheme } from "@/server/site-config";

export default async function PolicyPage({
  title,
  children,
  contentHtml,
}: {
  title: string;
  children?: ReactNode;
  contentHtml?: string;
}) {
  const theme = await getTheme();
  return (
    <article className="mx-auto max-w-3xl px-5 py-10 text-zinc-200">
      <Link href="/" className="text-sm text-zinc-400">← {theme.siteName}</Link>
      <h1 className="mt-7 text-3xl font-black">{title}</h1>
      {contentHtml
        ? <CmsHtml html={contentHtml} className="mt-6 text-sm leading-7 text-zinc-300" />
        : <div className="mt-6 space-y-5 text-sm leading-7 text-zinc-300">{children}</div>}
      <p className="mt-8 text-xs text-zinc-500">Intube Media · intubedrama.com</p>
    </article>
  );
}
