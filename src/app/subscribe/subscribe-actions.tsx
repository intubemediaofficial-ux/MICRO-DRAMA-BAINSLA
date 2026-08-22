"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SubscriptionOffer = {
  currency: string;
  amountMinor: number;
  trialAmountMinor: number;
  trialDays: number;
};

export default function SubscribeActions({
  episodeId,
  offer,
  trialAlreadyUsed,
  coinPrice,
  trialLabel,
  annualLabel,
}: {
  episodeId: string;
  offer: SubscriptionOffer | null;
  trialAlreadyUsed: boolean;
  coinPrice: number;
  trialLabel: string | null;
  annualLabel: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"trial" | "annual" | "coin" | null>(null);

  function getDeviceFingerprint() {
    const key = "microdrama_device_fingerprint";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const fingerprint = crypto.randomUUID();
    window.localStorage.setItem(key, fingerprint);
    return fingerprint;
  }

  async function startSubscription(mode: "trial" | "annual") {
    setPending(mode);
    setMessage("");
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planCode: "VIP_ANNUAL",
        mode,
        ...(mode === "trial" ? { deviceFingerprint: getDeviceFingerprint() } : {}),
      }),
    });
    if (response.ok) {
      router.replace(`/watch/${episodeId}`);
      return;
    }
    const errorMessage = ((await response.json()) as { error?: { message?: string } }).error
      ?.message;
    setMessage(
      errorMessage === "SUBSCRIPTION_EXISTS"
        ? "You already have a subscription. Manage it from My Subscription."
        : errorMessage === "TRIAL_ALREADY_USED"
          ? "Trial already used — buy the annual pass."
          : (errorMessage ?? "Could not start subscription"),
    );
    setPending(null);
  }

  async function unlockWithCoins() {
    setPending("coin");
    setMessage("");
    const response = await fetch("/api/unlocks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ episodeId, source: "coin" }),
    });
    if (response.ok) {
      router.replace(`/watch/${episodeId}`);
      return;
    }
    setMessage(
      ((await response.json()) as { error?: { message?: string } }).error?.message ??
        "Unlock failed",
    );
    setPending(null);
  }

  return (
    <div className="mt-6 space-y-3">
      {offer && trialLabel && !trialAlreadyUsed && (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void startSubscription("trial")}
          className="w-full rounded-2xl bg-amber-400 px-5 py-4 text-left font-bold text-zinc-950 disabled:opacity-60"
        >
          Start {offer.trialDays}-Day Trial for just {trialLabel}
        </button>
      )}
      {offer && annualLabel && (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void startSubscription("annual")}
          className="w-full rounded-2xl border border-amber-400/60 px-5 py-4 text-left font-bold text-amber-100 disabled:opacity-60"
        >
          Full Annual Pass: {annualLabel}
        </button>
      )}
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => void unlockWithCoins()}
        className="w-full rounded-2xl border border-rose-400/60 px-5 py-4 text-left font-semibold text-rose-100 disabled:opacity-60"
      >
        Unlock this episode for {coinPrice} coins
      </button>
      {message && <p className="rounded-xl bg-rose-950/60 p-3 text-sm text-rose-200">{message}</p>}
    </div>
  );
}
