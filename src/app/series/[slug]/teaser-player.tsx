"use client";

import { useEffect, useRef, useState } from "react";

export default function TeaserPlayer({
  src,
  poster,
  title,
}: {
  src: string;
  poster: string;
  title: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = true;
    void element.play().catch(() => undefined);
    return () => element.pause();
  }, [src]);

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (video.current) {
      video.current.muted = nextMuted;
      if (!nextMuted) {
        void video.current.play().catch(() => {
          setMuted(true);
          if (video.current) video.current.muted = true;
        });
      }
    }
    try {
      sessionStorage.setItem("microdrama-teaser-unmuted", String(!nextMuted));
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }

  if (failed || !src || src === "/media/sample.mp4") return null;
  return (
    <div className="absolute inset-0 z-10">
      <video
        ref={video}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={`${title} teaser`}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover opacity-60"
      />
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Unmute teaser" : "Mute teaser"}
        className="absolute right-4 top-4 z-10 rounded-full bg-black/70 px-3 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-rose-300"
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </div>
  );
}
