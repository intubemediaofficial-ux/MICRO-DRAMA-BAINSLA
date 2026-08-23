"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { paywallRedirectDecision } from "@/lib/episode-gating";
import type { EpisodeRailSource } from "@/lib/episode-rail";
import { selectPlaybackMode } from "@/lib/playback";
import EpisodeRail from "./episode-rail";

type Subtitle = { lang: string; url: string };

export default function WatchClient({
  episodeId,
  title,
  nextId,
  nextLocked,
  previousId,
  episodes,
  subtitles,
}: {
  episodeId: string;
  title: string;
  nextId: string | null;
  nextLocked: boolean;
  previousId: string | null;
  episodes: EpisodeRailSource[];
  subtitles: Subtitle[];
}) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLTrackElement>(null);
  const touchStart = useRef<number | null>(null);
  const lastTap = useRef(0);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgress = useRef(-1);
  const resumePosition = useRef(0);
  const resumeApplied = useRef(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [watermark, setWatermark] = useState("");
  const [speed, setSpeed] = useState(1);
  const [subtitleOn, setSubtitleOn] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [message, setMessage] = useState("");
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);
  const [pipAvailable, setPipAvailable] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState("");
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showEpisodes, setShowEpisodes] = useState(false);

  useEffect(() => {
    setPipAvailable(Boolean(document.pictureInPictureEnabled));
  }, []);

  useEffect(() => {
    if (nextCountdown === null || !nextId) return;
    if (nextCountdown === 0) {
      navigate(nextId, nextLocked);
      return;
    }
    const timer = window.setTimeout(
      () => setNextCountdown((value) => (value === null ? null : value - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [nextCountdown, nextId, nextLocked]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let hls: Hls | null = null;
    let networkRetries = 0;
    let mediaRetries = 0;
    const element = video.current;
    setLoading(true);
    setPlaybackError("");
    setShowTapToPlay(false);
    setMessage("");
    setPosition(0);
    setDuration(0);
    lastProgress.current = -1;
    resumePosition.current = 0;
    resumeApplied.current = false;

    async function attemptPlay() {
      if (!active || !video.current) return;
      try {
        await video.current.play();
        if (active) setShowTapToPlay(false);
      } catch {
        if (!active || !video.current) return;
        video.current.muted = true;
        setMuted(true);
        try {
          await video.current.play();
          if (active) setShowTapToPlay(false);
        } catch {
          if (active) {
            setShowTapToPlay(true);
            setPlaybackError("Tap play to start this episode.");
          }
        }
      }
    }

    void fetch(`/api/episodes/${episodeId}/playback`, { signal: controller.signal })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          const data = (await response.json()) as {
            playbackUrl: string;
            isHls: boolean;
            watermark: string;
            entitlement?: string;
            resumePositionSec?: number;
          };
          setWatermark(data.watermark);
          resumePosition.current = data.resumePositionSec ?? 0;
          if (!element) return;
          const mode = selectPlaybackMode(
            data.isHls,
            Hls.isSupported(),
            Boolean(element.canPlayType("application/vnd.apple.mpegurl")),
          );
          if (mode === "hls.js") {
            hls = new Hls({ enableWorker: true });
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (!active) return;
              setLoading(false);
              void attemptPlay();
            });
            hls.on(Hls.Events.ERROR, (_event, errorData) => {
              if (!active || !errorData.fatal) return;
              if (errorData.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 2) {
                networkRetries += 1;
                setLoading(true);
                hls?.startLoad();
                return;
              }
              if (errorData.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) {
                mediaRetries += 1;
                hls?.recoverMediaError();
                return;
              }
              setLoading(false);
              setPlaybackError(
                `Playback failed${errorData.details ? `: ${errorData.details}` : ""}`,
              );
            });
            hls.loadSource(data.playbackUrl);
            hls.attachMedia(element);
          } else if (mode === "mp4" || mode === "native-hls") {
            element.src = data.playbackUrl;
            element.addEventListener(
              "loadedmetadata",
              () => {
                if (!active) return;
                setLoading(false);
                void attemptPlay();
              },
              { once: true },
            );
          } else {
            setLoading(false);
            setPlaybackError("This browser cannot play HLS video.");
          }
        } else if (response.status === 401 || response.status === 403) {
          const access = response.status === 401 ? "anonymous" : "locked";
          const decision = paywallRedirectDecision(episodeId, access);
          if (decision.destination === "paywall") router.replace(decision.href as Route);
        } else {
          setLoading(false);
          setPlaybackError("Sign in to watch this episode.");
        }
      })
      .catch((error: unknown) => {
        if (active && (error as { name?: string }).name !== "AbortError") {
          setLoading(false);
          setPlaybackError("Could not load this episode. Try again.");
        }
      });

    return () => {
      active = false;
      controller.abort();
      hls?.destroy();
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    };
  }, [episodeId, retryNonce, router]);

  function applyResumePosition() {
    if (resumeApplied.current || !video.current) return;
    const mediaDuration = video.current.duration;
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return;
    const target = resumePosition.current;
    video.current.currentTime = target > 0 && target < mediaDuration ? target : 0;
    setPosition(video.current.currentTime);
    resumeApplied.current = true;
  }

  useEffect(() => {
    const textTrack = track.current?.track;
    if (textTrack) textTrack.mode = subtitleOn ? "showing" : "hidden";
  }, [subtitleOn, subtitles]);

  function navigate(id: string | null, locked = false) {
    if (!id) return;
    if (locked) {
      router.push(paywallRedirectDecision(id, "locked").href as Route);
      return;
    }
    router.push(`/watch/${id}`);
  }
  function onTouchStart(event: React.TouchEvent) {
    touchStart.current = event.changedTouches[0]?.clientY ?? null;
  }
  function onTouchEnd(event: React.TouchEvent) {
    if (touchStart.current === null) return;
    const distance = event.changedTouches[0]?.clientY - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) < 50) return;
    navigate(distance < 0 ? nextId : previousId);
  }
  function onVideoClick() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setLiked(true);
      void fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
    }
    lastTap.current = now;
  }
  function startLongPress() {
    longPress.current = setTimeout(() => {
      const nextSpeed = speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : 1;
      setSpeed(nextSpeed);
      if (video.current) video.current.playbackRate = nextSpeed;
      setShowLongPressMenu(true);
    }, 500);
  }
  function stopLongPress() {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  }
  async function requestPictureInPicture() {
    if (!video.current || !pipAvailable) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.current.requestPictureInPicture();
    } catch {
      setMessage("Picture-in-picture is unavailable in this browser.");
    }
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 sm:flex-row sm:items-start sm:px-0">
      <div
        className="relative mx-auto aspect-[9/16] max-h-[calc(100vh-4rem)] w-full max-w-[600px] overflow-hidden bg-zinc-900 sm:mx-0"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") navigate(nextId, nextLocked);
          if (event.key === "ArrowUp") navigate(previousId);
        }}
        tabIndex={0}
      >
        <video
          ref={video}
          className="h-full w-full object-cover"
          controls
          playsInline
          muted={muted}
          onClick={onVideoClick}
          onPointerDown={startLongPress}
          onPointerUp={stopLongPress}
          onPointerLeave={stopLongPress}
          onEnded={(event) => {
            void fetch("/api/progress", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                episodeId,
                positionSec: Math.floor(event.currentTarget.duration || duration),
                completed: true,
              }),
            });
            if (autoNext && nextId) setNextCountdown(3);
          }}
          onError={() => {
            setLoading(false);
            setPlaybackError("This video could not be played.");
          }}
          onStalled={() => setLoading(true)}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onLoadedMetadata={(event) => {
            setDuration(
              Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
            );
            applyResumePosition();
            setLoading(false);
          }}
          onTimeUpdate={(event) => {
            setPosition(event.currentTarget.currentTime);
            const positionSec = Math.floor(event.currentTarget.currentTime);
            if (
              positionSec >= 0 &&
              positionSec % 10 === 0 &&
              positionSec !== lastProgress.current
            ) {
              lastProgress.current = positionSec;
              void fetch("/api/progress", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ episodeId, positionSec }),
              });
            }
          }}
        >
          {subtitles.map((subtitle) => (
            <track
              key={subtitle.lang}
              ref={subtitle.lang === subtitles[0]?.lang ? track : undefined}
              kind="subtitles"
              src={subtitle.url}
              srcLang={subtitle.lang}
              label={subtitle.lang.toUpperCase()}
            />
          ))}
        </video>
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-black/20 text-sm text-white">
            Loading episode…
          </div>
        )}
        {showTapToPlay && (
          <button
            type="button"
            onClick={() => {
              if (!video.current) return;
              video.current.muted = muted;
              void video.current
                .play()
                .then(() => setShowTapToPlay(false))
                .catch(() => {
                  setPlaybackError("Tap play to start this episode.");
                });
            }}
            className="absolute inset-0 z-10 grid place-items-center bg-black/40 text-lg font-bold"
          >
            Tap to play
          </button>
        )}
        {playbackError && (
          <div className="absolute left-4 right-4 top-16 z-20 rounded-2xl border border-rose-300/30 bg-zinc-950/95 p-4 text-sm text-rose-100">
            <p>{playbackError}</p>
            <button
              type="button"
              onClick={() => setRetryNonce((value) => value + 1)}
              className="mt-3 rounded-full bg-rose-500 px-4 py-2 font-semibold text-white"
            >
              Retry
            </button>
          </div>
        )}
        <div className="pointer-events-none absolute right-3 top-1/2 -rotate-12 text-xs text-white/50">
          {watermark}
        </div>
        {showLongPressMenu && (
          <div className="absolute left-4 top-16 z-10 rounded-2xl bg-black/80 p-3 text-sm">
            <p className="text-xs text-zinc-400">Playback speed: {speed}×</p>
            {pipAvailable && (
              <button
                onClick={() => void requestPictureInPicture()}
                className="mt-2 block rounded-lg bg-zinc-800 px-3 py-2"
              >
                Picture in picture
              </button>
            )}
            <button
              onClick={() => setShowLongPressMenu(false)}
              className="mt-2 block rounded-lg px-3 py-2 text-zinc-400"
            >
              Close
            </button>
          </div>
        )}
        {nextCountdown !== null && nextId && (
          <div className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-2xl bg-black/80 p-5 text-center">
            <p className="text-sm text-zinc-300">Up next in</p>
            <p className="mt-1 text-4xl font-black">{nextCountdown}</p>
            <button
              onClick={() => setNextCountdown(null)}
              className="mt-3 rounded-full border border-zinc-600 px-4 py-2 text-sm"
            >
              Cancel autoplay
            </button>
          </div>
        )}
        <div className="absolute bottom-5 left-4 right-4 flex items-end justify-between">
          <div>
            <p className="text-xs text-zinc-300">NOW PLAYING</p>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-xs text-zinc-400">
              {Math.floor(position / 60)}:{String(Math.floor(position % 60)).padStart(2, "0")} /{" "}
              {duration
                ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`
                : "--:--"}{" "}
              · Hold video: {speed}×
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              aria-label={muted ? "Unmute video" : "Mute video"}
              onClick={() => {
                const nextMuted = !muted;
                setMuted(nextMuted);
                if (video.current) {
                  video.current.muted = nextMuted;
                  if (!nextMuted)
                    void video.current.play().catch(() => {
                      setMuted(true);
                      if (video.current) video.current.muted = true;
                    });
                }
              }}
              className="rounded-full bg-black/60 px-3 py-2"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              onClick={() => setSubtitleOn((value) => !value)}
              disabled={!subtitles.length}
              className="rounded-full bg-black/60 px-3 py-2"
            >
              {subtitleOn ? "CC on" : "CC"}
            </button>
            <button
              onClick={() => setAutoNext((value) => !value)}
              className="rounded-full bg-black/60 px-3 py-2"
            >
              {autoNext ? "Auto" : "Manual"}
            </button>
            <button
              onClick={() => {
                setLiked((value) => !value);
                void fetch("/api/likes", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ episodeId }),
                });
              }}
              className="rounded-full bg-black/60 px-3 py-2"
            >
              {liked ? "❤️" : "🤍"}
            </button>
            {nextId && (
              <button
                onClick={() => navigate(nextId, nextLocked)}
                className="rounded-full bg-rose-500 px-3 py-2"
              >
                Next ›
              </button>
            )}
          </div>
        </div>
        {message && (
          <p className="absolute left-4 top-16 rounded-xl bg-black/70 p-3 text-sm text-rose-200">
            {message}
          </p>
        )}
      </div>
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setShowEpisodes((value) => !value)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-left font-bold"
        >
          Episodes {showEpisodes ? "⌃" : "⌄"}
        </button>
      </div>
      <aside className={`${showEpisodes ? "block" : "hidden"} w-full sm:block sm:w-72`}>
        <EpisodeRail
          episodes={episodes}
          currentEpisodeId={episodeId}
          onSelect={(selected) => navigate(selected.id, !selected.entitled)}
        />
      </aside>
    </div>
  );
}
