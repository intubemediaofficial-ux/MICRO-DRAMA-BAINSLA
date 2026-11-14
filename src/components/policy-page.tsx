import Link from "next/link";
import type { ReactNode } from "react";

export default function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-10 text-zinc-200">
      <Link href="/" className="text-sm text-zinc-400">← Intube Drama</Link>
      <h1 className="mt-7 text-3xl font-black">{title}</h1>
      <div className="mt-6 space-y-5 text-sm leading-7 text-zinc-300">{children}</div>
      <p className="mt-8 text-xs text-zinc-500">Intube Media · intubedrama.com</p>
    </article>
  );
}
