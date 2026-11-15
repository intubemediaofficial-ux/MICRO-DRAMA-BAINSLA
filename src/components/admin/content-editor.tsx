"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { JSONContent } from "@tiptap/core";
import RichEditor from "@/components/editor/rich-editor";
import SeoPanel from "@/components/editor/seo-panel";
import type { SeoFields } from "@/lib/seo";

type ContentData = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  contentJson: JSONContent | null;
  featuredImage: string;
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED";
  publishedAt: string;
  seo: SeoFields;
  template: string;
  tags: string[];
  categoryId: string;
  readingMinutes?: number;
};
const empty: ContentData = {
  title: "", slug: "", excerpt: "", contentHtml: "", contentJson: { type: "doc", content: [{ type: "paragraph" }] },
  featuredImage: "", status: "DRAFT", publishedAt: "", seo: {}, template: "default", tags: [], categoryId: "",
};

function localDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ContentEditor({
  kind,
  id,
  customize,
}: {
  kind: "page" | "post";
  id?: string;
  customize?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<ContentData>(empty);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(Boolean(id || customize));
  const editorKey = id ?? customize ?? "new";
  const [loadedId, setLoadedId] = useState<string | null>(() => id || customize ? null : editorKey);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const endpoint = kind === "page" ? "/api/admin/pages" : "/api/admin/blog/posts";

  useEffect(() => {
    let active = true;
    if (id || customize) {
      setLoadedId(null);
      setBusy(true);
    }
    async function load() {
      try {
        if (kind === "post") {
          const response = await fetch("/api/admin/blog/categories");
          const result = await response.json();
          if (active) setCategories(result.categories ?? []);
        }
        if (id) {
          const response = await fetch(`${endpoint}/${id}`);
          const result = await response.json();
          if (!response.ok) throw new Error(result.error?.message || "Unable to load content");
          const content = result.page || result.post;
          if (active) setData({
            ...empty,
            ...content,
            id: content.id,
            excerpt: content.excerpt || "",
            featuredImage: content.featuredImage || "",
            contentJson: content.contentJson as JSONContent | null,
            publishedAt: localDateTime(content.publishedAt),
            seo: (content.seo || {}) as SeoFields,
            template: content.template || "default",
            tags: content.tags || [],
            categoryId: content.categoryId || "",
          });
        } else if (customize) {
          const response = await fetch("/api/admin/pages");
          const result = await response.json();
          const builtIn = result.builtIns?.find((page: { slug: string }) => page.slug === customize);
          if (!builtIn) throw new Error("Built-in page not found");
          if (active) setData({ ...empty, title: builtIn.title, slug: builtIn.slug, contentHtml: builtIn.html });
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load content");
      } finally {
        if (active) {
          setBusy(false);
          setLoadedId(editorKey);
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [customize, editorKey, endpoint, id, kind]);

  function change<K extends keyof ContentData>(key: K, value: ContentData[K]) {
    setData((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }

  async function save(overrides: Partial<ContentData> = {}) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const content = { ...data, ...overrides };
      const currentId = content.id || id;
      const scheduledAt = content.publishedAt ? new Date(content.publishedAt) : null;
      const publishedAt = content.status === "DRAFT"
        ? null
        : content.status === "SCHEDULED"
          ? scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt.toISOString() : null
          : scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() <= Date.now()
            ? scheduledAt.toISOString()
            : new Date().toISOString();
      const payload = {
        ...content,
        publishedAt,
        excerpt: content.excerpt || null,
        featuredImage: content.featuredImage || null,
        categoryId: content.categoryId || null,
        customizeBuiltIn: kind === "page" && Boolean(customize),
      };
      const url = currentId ? `${endpoint}/${currentId}` : endpoint;
      const response = await fetch(url, {
        method: currentId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Save failed");
      const saved = result.page || result.post;
      if (saved) {
        setData((previous) => ({
          ...previous,
          id: saved.id,
          status: saved.status,
          publishedAt: localDateTime(saved.publishedAt),
          ...(typeof saved.readingMinutes === "number" ? { readingMinutes: saved.readingMinutes } : {}),
        }));
        setSaved(true);
      }
      if (!currentId && saved?.id)
        router.replace(`/admin/${kind === "page" ? "pages" : "blog"}/${saved.id}` as Route);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFeatured(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("category", "content");
    const response = await fetch("/api/admin/media/upload", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Upload failed");
    else change("featuredImage", result.url);
  }

  async function remove() {
    const currentId = data.id || id;
    if (!currentId || !window.confirm(`Delete this ${kind}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/${currentId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Delete failed");
      router.push(`/admin/${kind === "page" ? "pages" : "blog"}` as Route);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed");
      setBusy(false);
    }
  }

  if (loadedId !== editorKey) return <p className="p-6 text-zinc-400">Loading…</p>;
  const currentId = data.id || id;
  const publicPath = `${kind === "page" ? "" : "/blog"}/${data.slug}`;
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-black">{data.title || (kind === "page" ? "New page" : "New post")}</h1>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <label className="block text-xs text-zinc-400">Title<input className="mt-1 w-full rounded-xl bg-zinc-900 p-3 text-xl text-white" value={data.title} onChange={(event) => {
            const title = event.target.value;
            setData((previous) => ({ ...previous, title, ...(previous.slug === "" || previous.slug === previous.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ? { slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") } : {}) }));
            setSaved(false);
          }} /></label>
          <label className="block text-xs text-zinc-400">Slug<input className="mt-1 w-full rounded-xl bg-zinc-900 p-3 text-white" value={data.slug} onChange={(event) => change("slug", event.target.value)} /></label>
          <label className="block text-xs text-zinc-400">Excerpt<textarea className="mt-1 min-h-20 w-full rounded-xl bg-zinc-900 p-3 text-white" value={data.excerpt} onChange={(event) => change("excerpt", event.target.value)} /></label>
          <RichEditor key={loadedId!} initialContent={data.contentJson || data.contentHtml} onChange={({ json, html }) => {
            setData((previous) => ({ ...previous, contentJson: json, contentHtml: html }));
            setSaved(false);
          }} />
        </div>
        <aside className="space-y-4">
          <section className="space-y-3 rounded-xl border border-white/10 bg-zinc-900 p-4">
            <h2 className="font-bold">Publish</h2>
            <label className="block text-sm">Status
              <select value={data.status} onChange={(event) => change("status", event.target.value as ContentData["status"])} className="mt-1 w-full rounded-lg bg-zinc-950 p-2">
                <option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="SCHEDULED">Scheduled</option>
              </select>
            </label>
            {data.status === "SCHEDULED" && (
              <label className="block text-sm">Publish date and time
                <input type="datetime-local" value={data.publishedAt} onChange={(event) => change("publishedAt", event.target.value)} className="mt-1 w-full rounded-lg bg-zinc-950 p-2" />
              </label>
            )}
            {currentId && data.status === "PUBLISHED" && <p className="text-xs text-zinc-400">Published {data.publishedAt ? new Date(data.publishedAt).toLocaleString() : ""}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void save({ status: "DRAFT" })} className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-semibold disabled:opacity-50">Save draft</button>
              <button type="button" disabled={busy || (data.status === "SCHEDULED" && !data.publishedAt)} onClick={() => void save(data.status === "SCHEDULED" ? {} : { status: "PUBLISHED" })} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold disabled:opacity-50">
                {busy ? "Saving…" : data.status === "SCHEDULED" ? "Schedule" : currentId && data.status === "PUBLISHED" ? "Update" : "Publish"}
              </button>
            </div>
            {saved && <p role="status" className="text-sm text-emerald-300">Saved.</p>}
            {currentId && <button type="button" onClick={() => void remove()} className="text-sm text-red-300">Delete</button>}
            {data.slug && (
              <div className="border-t border-white/10 pt-3 text-xs">
                <p className="mb-1 text-zinc-500">Permalink</p>
                <a href={publicPath} target="_blank" rel="noopener noreferrer" className="break-all text-sky-300">{`https://intubedrama.com${publicPath}`}</a>
                <a href={`${publicPath}?preview=1`} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-lg bg-zinc-800 px-3 py-2 text-center text-sm text-white">Preview</a>
              </div>
            )}
            {kind === "post" && typeof data.readingMinutes === "number" && <p className="text-xs text-zinc-400">{data.readingMinutes} min read</p>}
          </section>
          <section className="space-y-3 rounded-xl border border-white/10 bg-zinc-900 p-4">
            <h2 className="font-bold">Featured image</h2>
            <label className="block text-sm">Image URL<input className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={data.featuredImage} onChange={(event) => change("featuredImage", event.target.value)} /></label>
            {data.featuredImage && (
              <div className="space-y-2">
                <img src={data.featuredImage} alt="" className="max-h-48 w-full rounded-lg object-cover" />
                <button type="button" onClick={() => change("featuredImage", "")} className="text-sm text-red-300">Remove image</button>
              </div>
            )}
            <label className="block text-sm">Upload image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="mt-2 block w-full text-xs" onChange={(event) => void uploadFeatured(event.target.files?.[0])} /></label>
          </section>
          {kind === "page" ? (
            <label className="block text-sm">Template<select className="mt-1 w-full rounded-lg bg-zinc-900 p-2" value={data.template} onChange={(event) => change("template", event.target.value)}><option value="default">Default</option><option value="wide">Wide</option></select></label>
          ) : (
            <>
              <label className="block text-sm">Category<select className="mt-1 w-full rounded-lg bg-zinc-900 p-2" value={data.categoryId} onChange={(event) => change("categoryId", event.target.value)}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="block text-sm">Tags (comma separated)<input className="mt-1 w-full rounded-lg bg-zinc-900 p-2" value={data.tags.join(", ")} onChange={(event) => change("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
            </>
          )}
        </aside>
      </div>
      <SeoPanel kind={kind} title={data.title} slug={data.slug} description={data.excerpt} html={data.contentHtml} seo={data.seo} onChange={(seo) => change("seo", seo)} />
    </div>
  );
}
