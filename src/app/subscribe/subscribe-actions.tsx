"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PlanOption = { code: string; name: string; priceLabel: string };
type TrialOption = { planCode: string; days: number; priceLabel: string; thenLabel: string };

export default function SubscribeActions({
  episodeId,
  plans,
  trial,
  trialAlreadyUsed,
  coinPrice,
}: {
  episodeId: string;
  plans: PlanOption[];
  trial: TrialOption | null;
  trialAlreadyUsed: boolean;
  coinPrice: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  function getDeviceFingerprint() {
    const key = "microdrama_device_fingerprint";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const fingerprint = crypto.randomUUID();
    window.localStorage.setItem(key, fingerprint);
    return fingerprint;
  }

  async function startSubscription(mode: "trial" | "paid", planCode: string) {
    setPending(mode === "trial" ? "trial" : planCode);
    setMessage("");
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planCode,
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
          ? "Trial already used — choose a plan below."
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
    setMessage(await getErrorMessage(response, "Unlock failed"));
    setPending(null);
  }

  async function getErrorMessage(response: Response, fallback: string) {
    return (
      ((await response.json()) as { error?: { message?: string } }).error?.message ?? fallback
    );
  }

  async function unlockWithAd() {
    setPending("ad");
    setMessage("");
    const tokenResponse = await fetch("/api/ads/reward-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ episodeId }),
    });
    if (!tokenResponse.ok) {
      setMessage(await getErrorMessage(tokenResponse, "Could not start the rewarded ad."));
      setPending(null);
      return;
    }
    const { token } = (await tokenResponse.json()) as { token?: string };
    if (!token) {
      setMessage("Could not start the rewarded ad.");
      setPending(null);
      return;
    }
    const response = await fetch("/api/unlocks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ episodeId, source: "ad", adToken: token }),
    });
    if (response.ok) {
      router.replace(`/watch/${episodeId}`);
      return;
    }
    setMessage(await getErrorMessage(response, "Unlock failed"));
    setPending(null);
  }

  return (
    <div className="mt-6 space-y-3">
      {trial && !trialAlreadyUsed && (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void startSubscription("trial", trial.planCode)}
          className="w-full rounded-2xl bg-amber-400 px-5 py-4 text-left font-bold text-zinc-950 disabled:opacity-60"
        >
          Start {trial.days}-Day Trial for just {trial.priceLabel}
          <span className="block text-sm font-semibold opacity-80">Then {trial.thenLabel}</span>
        </button>
      )}
      {plans.map((plan) => (
        <button
          key={plan.code}
          type="button"
          disabled={pending !== null}
          onClick={() => void startSubscription("paid", plan.code)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-400/60 px-5 py-4 text-left font-bold text-amber-100 disabled:opacity-60"
        >
          <span>{plan.name}</span>
          <span className="shrink-0">{plan.priceLabel}</span>
        </button>
      ))}
      {coinPrice > 0 && (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void unlockWithCoins()}
          className="w-full rounded-2xl border border-rose-400/60 px-5 py-4 text-left font-semibold text-rose-100 disabled:opacity-60"
        >
          Unlock this episode for {coinPrice} coins
        </button>
      )}
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => void unlockWithAd()}
        className="w-full rounded-2xl border border-zinc-600 px-5 py-4 text-left font-semibold text-zinc-200 disabled:opacity-60"
      >
        Watch a short ad to unlock this episode
      </button>
      {message && <p className="rounded-xl bg-rose-950/60 p-3 text-sm text-rose-200">{message}</p>}
    </div>
  );
}
