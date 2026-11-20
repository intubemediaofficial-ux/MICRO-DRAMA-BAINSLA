"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string; slug: string; description: string | null };
export default function BlogTaxonomy() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  async function load() {
    const result = await fetch("/api/admin/blog/categories").then((response) => response.json());
    setCategories(result.categories || []);
  }
  useEffect(() => { void load(); }, []);
  async function create() {
    const response = await fetch("/api/admin/blog/categories", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Category creation failed");
    else { setName(""); setSlug(""); setError(""); await load(); }
  }
  async function save(category: Category) {
    const response = await fetch(`/api/admin/blog/categories/${category.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: category.name, slug: category.slug, description: category.description }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Category update failed");
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this category? Posts will become uncategorized.")) return;
    await fetch(`/api/admin/blog/categories/${id}`, { method: "DELETE" });
    await load();
  }
  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-zinc-900 p-4">
      <h2 className="mb-3 text-lg font-bold">Categories</h2>
      {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Category name" className="rounded-lg bg-zinc-950 p-2" />
        <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Slug (optional)" className="rounded-lg bg-zinc-950 p-2" />
        <button onClick={() => void create()} className="rounded-lg bg-rose-600 px-4 py-2">Add</button>
      </div>
      {categories.map((category) => (
        <div key={category.id} className="mb-2 flex flex-wrap gap-2 rounded-lg bg-zinc-950 p-2">
          <input aria-label="Category name" value={category.name} onChange={(event) => setCategories((items) => items.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} className="min-w-32 flex-1 bg-transparent p-1" />
          <input aria-label="Category slug" value={category.slug} onChange={(event) => setCategories((items) => items.map((item) => item.id === category.id ? { ...item, slug: event.target.value } : item))} className="min-w-32 flex-1 bg-transparent p-1" />
          <button onClick={() => void save(category)} className="text-sm text-rose-300">Save</button>
          <button onClick={() => void remove(category.id)} className="text-sm text-red-300">Delete</button>
        </div>
      ))}
    </section>
  );
}
