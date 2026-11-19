"use client";

import Link from "next/link";
import { useState } from "react";

export default function WatchlistToggle({
  seriesId,
  initialInWatchlist,
  signedIn,
}: {
  seriesId: string;
  initialInWatchlist: boolean;
  signedIn: boolean;
}) {
  const [inWatchlist, setInWatchlist] = useState(initialInWatchlist);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/watchlist", {
        method: inWatchlist ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seriesId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Watchlist update failed");
      setInWatchlist(body.inWatchlist);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Watchlist update failed");
    } finally {
      setBusy(false);
    }
  }

  return signedIn ? (
    <div>
      <button
        type="button"
        className="rounded-full border border-white/15 bg-zinc-900 px-4 py-2 text-sm font-semibold"
        disabled={busy}
        onClick={toggle}
      >
        {busy ? "Saving…" : inWatchlist ? "✓ In My List" : "+ My List"}
      </button>
      {message ? <p className="mt-2 text-xs text-rose-300">{message}</p> : null}
    </div>
  ) : (
    <Link
      href="/login"
      className="rounded-full border border-white/15 bg-zinc-900 px-4 py-2 text-sm font-semibold"
    >
      + My List
    </Link>
  );
}
