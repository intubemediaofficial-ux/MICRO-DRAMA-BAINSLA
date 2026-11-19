"use client";

import { useState } from "react";

type SeriesOption = { id: string; title: string };

export default function PushForm({ series }: { series: SeriesOption[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "series">("all");
  const [seriesId, setSeriesId] = useState("");
  const [includeSeriesLink, setIncludeSeriesLink] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/push/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, audience, seriesId, includeSeriesLink }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Notification failed");
      setMessage(
        result.configured
          ? `Sent: ${result.sent} · Failed: ${result.failed}`
          : "Push is not configured yet. No notifications were sent.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notification failed");
    } finally {
      setSending(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-6 max-w-2xl space-y-4 rounded-2xl bg-zinc-900 p-5">
      <label className="block text-sm font-semibold">
        Title
        <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl bg-zinc-950 p-3" />
      </label>
      <label className="block text-sm font-semibold">
        Body
        <textarea required maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl bg-zinc-950 p-3" />
      </label>
      <label className="block text-sm font-semibold">
        Audience
        <select value={audience} onChange={(event) => setAudience(event.target.value as "all" | "series")} className="mt-2 w-full rounded-xl bg-zinc-950 p-3">
          <option value="all">All devices</option>
          <option value="series">My List or watched this series</option>
        </select>
      </label>
      {audience === "series" || includeSeriesLink ? (
        <label className="block text-sm font-semibold">
          Series
          <select required={audience === "series" || includeSeriesLink} value={seriesId} onChange={(event) => setSeriesId(event.target.value)} className="mt-2 w-full rounded-xl bg-zinc-950 p-3">
            <option value="">Choose series</option>
            {series.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeSeriesLink} onChange={(event) => setIncludeSeriesLink(event.target.checked)} />
        Include series deep link
      </label>
      <button disabled={sending} className="rounded-xl bg-rose-500 px-4 py-3 font-bold disabled:opacity-50">
        {sending ? "Sending…" : "Send notification"}
      </button>
      {message ? <p role="status" className="text-sm text-zinc-300">{message}</p> : null}
    </form>
  );
}
