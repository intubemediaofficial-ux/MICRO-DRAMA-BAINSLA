"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Subtitle = { lang: string; url: string };
type SubscriptionOffer = {
  currency: string;
  amountMinor: number;
  trialAmountMinor: number;
  trialDays: number;
};

export default function WatchClient({
  episodeId,
  title,
  nextId,
  previousId,
  subtitles,
}: {
  episodeId: string;
  title: string;
  nextId: string | null;
  previousId: string | null;
  subtitles: Subtitle[];
}) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLTrackElement>(null);
  const touchStart = useRef<number | null>(null);
  const lastTap = useRef(0);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgress = useRef(-1);
  const [locked, setLocked] = useState(false);
  const [coinPrice, setCoinPrice] = useState(0);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [watermark, setWatermark] = useState("");
  const [speed, setSpeed] = useState(1);
  const [subtitleOn, setSubtitleOn] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [message, setMessage] = useState("");
  const [subscriptionOffer, setSubscriptionOffer] = useState<SubscriptionOffer | null>(null);
  const [trialAlreadyUsed, setTrialAlreadyUsed] = useState(false);
  const [subscriber, setSubscriber] = useState(false);
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);
  const [pipAvailable, setPipAvailable] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  useEffect(() => {
    setPipAvailable(Boolean(document.pictureInPictureEnabled));
  }, []);

  useEffect(() => {
    if (nextCountdown === null || !nextId) return;
    if (nextCountdown === 0) {
      navigate(nextId);
      return;
    }
    const timer = window.setTimeout(
      () => setNextCountdown((value) => (value === null ? null : value - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [nextCountdown, nextId]);

  useEffect(() => {
    let hls: Hls | null = null;
    void fetch(`/api/episodes/${episodeId}/playback`).then(async (response) => {
      if (response.ok) {
        const data = (await response.json()) as {
          playbackUrl: string;
          isHls: boolean;
          watermark: string;
          subtitles?: Subtitle[];
          entitlement?: string;
        };
        if (video.current) {
          if (data.isHls && Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(data.playbackUrl);
            hls.attachMedia(video.current);
          } else {
            video.current.src = data.playbackUrl;
          }
        }
        setWatermark(data.watermark);
        setSubscriber(data.entitlement === "SUBSCRIPTION");
      } else if (response.status === 403) {
        const data = (await response.json()) as {
          coinPrice: number;
          subscriptionOffer?: SubscriptionOffer | null;
          trialAlreadyUsed?: boolean;
        };
        setLocked(true);
        setCoinPrice(data.coinPrice);
        setSubscriptionOffer(data.subscriptionOffer ?? null);
        setTrialAlreadyUsed(Boolean(data.trialAlreadyUsed));
      } else {
        setMessage("Sign in to watch this episode.");
      }
    });
    return () => hls?.destroy();
  }, [episodeId]);

  useEffect(() => {
    const textTrack = track.current?.track;
    if (textTrack) textTrack.mode = subtitleOn ? "showing" : "hidden";
  }, [subtitleOn, subtitles]);

  function navigate(id: string | null) {
    if (id) router.push(`/watch/${id}`);
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
  async function unlock(source: "coin" | "ad") {
    let adToken: string | undefined;
    if (source === "ad") {
      const tokenResponse = await fetch("/api/ads/reward-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      if (!tokenResponse.ok) {
        setMessage("Could not start the rewarded ad.");
        return;
      }
      adToken = ((await tokenResponse.json()) as { token: string }).token;
    }
    const response = await fetch("/api/unlocks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ episodeId, source, adToken }),
    });
    if (response.ok) location.reload();
    else
      setMessage(
        ((await response.json()) as { error?: { message?: string } }).error?.message ??
          "Unlock failed",
      );
  }
  function getDeviceFingerprint() {
    const key = "microdrama_device_fingerprint";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const fingerprint = crypto.randomUUID();
    window.localStorage.setItem(key, fingerprint);
    return fingerprint;
  }
  async function startSubscription(mode: "trial" | "annual") {
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planCode: "VIP_ANNUAL",
        mode,
        ...(mode === "trial" ? { deviceFingerprint: getDeviceFingerprint() } : {}),
      }),
    });
    if (response.ok) location.reload();
    else
      setMessage(
        ((await response.json()) as { error?: { message?: string } }).error?.message ??
          "Could not start subscription",
      );
  }
  const trialLabel = subscriptionOffer
    ? new Intl.NumberFormat("en", {
        style: "currency",
        currency: subscriptionOffer.currency,
      }).format(subscriptionOffer.trialAmountMinor / 100)
    : "₹9";
  const annualLabel = subscriptionOffer
    ? new Intl.NumberFormat("en", {
        style: "currency",
        currency: subscriptionOffer.currency,
      }).format(subscriptionOffer.amountMinor / 100)
    : "₹999";

  return (
    <div
      className="relative mx-auto aspect-[9/16] max-h-[calc(100vh-4rem)] max-w-[600px] overflow-hidden bg-zinc-900"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") navigate(nextId);
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
        onEnded={() => autoNext && nextId && setNextCountdown(3)}
        onTimeUpdate={(event) => {
          const positionSec = Math.floor(event.currentTarget.currentTime);
          if (positionSec >= 0 && positionSec % 10 === 0 && positionSec !== lastProgress.current) {
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
          <p className="text-xs text-zinc-400">Hold video: {speed}×</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setMuted((value) => !value)}
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
            <button onClick={() => navigate(nextId)} className="rounded-full bg-rose-500 px-3 py-2">
              Next ›
            </button>
          )}
        </div>
      </div>
      {locked && (
        <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-zinc-950 p-6 shadow-2xl">
          <p className="text-sm text-zinc-400">The cliffhanger continues.</p>
          <h2 className="mt-1 text-2xl font-black">Unlock for 🪙 {coinPrice}</h2>
          {subscriptionOffer && (
            <div className="mt-4 space-y-2">
              {!trialAlreadyUsed && (
                <button
                  onClick={() => void startSubscription("trial")}
                  className="w-full rounded-2xl bg-amber-400 px-5 py-4 text-left font-bold text-zinc-950"
                >
                  <span className="block text-lg">
                    Start {subscriptionOffer.trialDays}-Day Trial for just {trialLabel}
                  </span>
                </button>
              )}
              {trialAlreadyUsed && (
                <p className="rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
                  Trial already used — buy the annual pass to keep watching.
                </p>
              )}
              <button
                onClick={() => void startSubscription("annual")}
                className="w-full rounded-2xl border border-amber-400/60 px-5 py-4 text-left font-bold text-amber-100"
              >
                <span className="block text-lg">Full Annual Pass: {annualLabel}/year</span>
                <span className="block text-sm text-zinc-400">
                  Unlimited VIP episodes and no ads
                </span>
              </button>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => void unlock("coin")}
              className="rounded-full bg-rose-500 px-5 py-3 font-bold"
            >
              Spend coins
            </button>
            {!subscriber && (
              <button
                onClick={() => void unlock("ad")}
                className="rounded-full bg-zinc-800 px-5 py-3"
              >
                Watch ad
              </button>
            )}
            <button
              onClick={() => router.push("/wallet")}
              className="rounded-full bg-zinc-800 px-5 py-3"
            >
              Buy coins
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="absolute left-4 top-16 rounded-xl bg-black/70 p-3 text-sm text-rose-200">
          {message}
        </p>
      )}
    </div>
  );
}
