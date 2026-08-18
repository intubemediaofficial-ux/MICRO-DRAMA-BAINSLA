"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SearchControls({
  q,
  genre,
  trope,
  cast,
}: {
  q?: string;
  genre?: string;
  trope?: string;
  cast?: string;
}) {
  const [value, setValue] = useState(q ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`)
        .then((response) => (response.ok ? response.json() : { suggestions: [] }))
        .then((data: { suggestions?: string[] }) => setSuggestions(data.suggestions ?? []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <form className="mt-5 grid gap-2 sm:grid-cols-4">
      <div className="relative sm:col-span-2">
        <input
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search title, tags…"
          className="w-full min-w-0 rounded-xl bg-zinc-900 p-4"
        />
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
            {suggestions.map((suggestion) => (
              <Link
                key={suggestion}
                href={`/search?q=${encodeURIComponent(suggestion)}`}
                className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-800"
              >
                {suggestion}
              </Link>
            ))}
          </div>
        )}
      </div>
      <input
        name="genre"
        defaultValue={genre}
        placeholder="Genre"
        className="rounded-xl bg-zinc-900 p-4"
      />
      <input
        name="trope"
        defaultValue={trope}
        placeholder="Trope"
        className="rounded-xl bg-zinc-900 p-4"
      />
      <input
        name="cast"
        defaultValue={cast}
        placeholder="Cast"
        className="rounded-xl bg-zinc-900 p-4"
      />
      <button className="rounded-xl bg-rose-500 px-5 font-bold sm:col-span-4">
        Search catalogue
      </button>
    </form>
  );
}
