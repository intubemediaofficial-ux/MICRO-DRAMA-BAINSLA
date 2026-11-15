"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

export default function ContentList({ kind }: { kind: "page" | "post" }) {
  const [items, setItems] = useState<any[]>([]);
  const [builtIns, setBuiltIns] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const base = kind === "page" ? "/api/admin/pages" : "/api/admin/blog/posts";
  useEffect(() => {
    let active = true;
    void fetch(`${base}?search=${encodeURIComponent(search)}`).then((response) => response.json()).then((result) => {
      if (active) {
        setItems(kind === "page" ? result.pages || [] : result.posts || []);
        if (kind === "page") setBuiltIns(result.builtIns || []);
      }
    });
    return () => { active = false; };
  }, [base, kind, search]);
  const destination = kind === "page" ? "/admin/pages" : "/admin/blog";
  return (
    <div className="space-y-5 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-black">{kind === "page" ? "Pages" : "Blog posts"}</h1>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or slug" className="rounded-lg bg-zinc-900 p-2 text-sm" />
        <Link href={`${destination}/new` as Route} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold">{kind === "page" ? "Add page" : "New post"}</Link>
      </header>
      {items.map((item) => (
        <Link key={item.id} href={`${destination}/${item.id}` as Route} className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900 p-4">
          <span className="mr-auto"><strong>{item.title}</strong><small className="block text-zinc-500">/{item.slug}</small></span>
          <span className="text-xs text-zinc-400">{item.status}</span>
        </Link>
      ))}
      {kind === "page" && <section className="mt-10"><h2 className="mb-3 text-lg font-bold">Built-in pages</h2>{builtIns.map((page) => <div key={page.slug} className="mb-2 flex items-center gap-3 rounded-xl bg-zinc-900 p-4"><strong className="mr-auto">{page.title}</strong>{items.find((item) => item.slug === page.slug) ? <Link href={`/admin/pages/${items.find((item) => item.slug === page.slug).id}` as Route} className="text-sm text-rose-300">Edit</Link> : <Link href={`/admin/pages/new?customize=${page.slug}` as Route} className="text-sm text-rose-300">Customize</Link>}</div>)}</section>}
    </div>
  );
}
