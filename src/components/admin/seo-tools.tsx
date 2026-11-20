"use client";

import { useEffect, useState } from "react";

type RedirectEntry = {
  id: string;
  fromPath: string;
  toPath: string;
  permanent: boolean;
  active: boolean;
  hits: number;
  lastHitAt: string | null;
};

type MissingEntry = { path: string; hits: number; lastSeenAt: string };

export default function SeoTools() {
  const [redirects, setRedirects] = useState<RedirectEntry[]>([]);
  const [missing, setMissing] = useState<MissingEntry[]>([]);
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const [redirectResult, missingResult] = await Promise.all([
      fetch("/api/admin/redirects").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Redirect lookup failed");
        return result;
      }),
      fetch("/api/admin/seo/not-found").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "404 log lookup failed");
        return result;
      }),
    ]);
    setRedirects(redirectResult.redirects || []);
    setMissing(missingResult.notFound || []);
  }
  useEffect(() => {
    void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Unable to load SEO tools"));
  }, []);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/redirects", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromPath, toPath, permanent, active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Redirect creation failed");
      setFromPath("");
      setToPath("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Redirect creation failed");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(id: string, active: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/redirects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Redirect update failed");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Redirect update failed");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this redirect?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/redirects/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Redirect deletion failed");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Redirect deletion failed");
    } finally {
      setBusy(false);
    }
  }
  async function clearNotFound() {
    if (!window.confirm("Clear the complete 404 log?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/seo/not-found", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "404 log clear failed");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "404 log clear failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-8 p-5">
      <div className="rounded-2xl bg-zinc-900 p-4">
        <h2 className="mb-3 text-lg font-bold">Redirects</h2>
        {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">From<input value={fromPath} onChange={(event) => setFromPath(event.target.value)} placeholder="/old-path" className="mt-1 w-full rounded-lg bg-zinc-950 p-2" /></label>
          <label className="text-sm">To<input value={toPath} onChange={(event) => setToPath(event.target.value)} placeholder="/new-path" className="mt-1 w-full rounded-lg bg-zinc-950 p-2" /></label>
          <label className="text-sm">Redirect type
            <select value={permanent ? "301" : "302"} onChange={(event) => setPermanent(event.target.value === "301")} className="mt-1 w-full rounded-lg bg-zinc-950 p-2">
              <option value="301">Permanent (301)</option><option value="302">Temporary (302)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Enabled</label>
          <button type="button" disabled={busy || !fromPath || !toPath} onClick={() => void create()} className="rounded-lg bg-rose-600 px-4 py-2 disabled:opacity-50">Add redirect</button>
        </div>
        <div className="space-y-2">
          {redirects.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 border-t border-white/10 py-2 text-sm">
              <span className="mr-auto min-w-56">{item.fromPath} → {item.toPath} · {item.permanent ? "301" : "302"} · {item.hits} hits</span>
              <span className={item.active ? "text-emerald-300" : "text-zinc-500"}>{item.active ? "Enabled" : "Disabled"}</span>
              <button type="button" disabled={busy} onClick={() => void toggle(item.id, item.active)} className="text-rose-300 disabled:opacity-50">{item.active ? "Disable" : "Enable"}</button>
              <button type="button" disabled={busy} onClick={() => void remove(item.id)} className="text-red-300 disabled:opacity-50">Delete</button>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-zinc-900 p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="mr-auto text-lg font-bold">404 monitor</h2>
          <button type="button" disabled={busy || missing.length === 0} onClick={() => void clearNotFound()} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm disabled:opacity-50">Clear log</button>
        </div>
        {missing.map((item) => (
          <div key={item.path} className="flex flex-wrap items-center gap-3 border-t border-white/10 py-2 text-sm">
            <span className="mr-auto">{item.path} · {item.hits} hits · {new Date(item.lastSeenAt).toLocaleString()}</span>
            <button type="button" onClick={() => setFromPath(item.path)} className="text-sky-300">Create redirect</button>
          </div>
        ))}
      </div>
    </section>
  );
}
