"use client";

export default function ShareButton({ title, url }: { title: string; url: string }) {
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <button
      className="rounded-full border border-white/15 bg-zinc-900 px-4 py-2 text-sm font-semibold"
      type="button"
      onClick={() => void share()}
    >
      Share
    </button>
  );
}
