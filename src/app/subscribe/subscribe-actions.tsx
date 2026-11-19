"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PlanOption = { code: string; name: string; priceLabel: string };
type RazorpayCheckout = {
  keyId: string;
  razorpaySubscriptionId: string;
  description: string;
  prefill: { email?: string; contact?: string; name?: string };
};
type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};
type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: RazorpayCheckout["prefill"];
  theme: { color: string };
  modal: { ondismiss: () => void };
  handler: (result: RazorpayResult) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("RAZORPAY_LOAD_FAILED"));
    document.body.appendChild(script);
  });
}

type TrialOption = { planCode: string; days: number; priceLabel: string; thenLabel: string };

export default function SubscribeActions({
  episodeId,
  plans,
  trial,
  paymentsAvailable,
  trialAlreadyUsed,
  coinPrice,
}: {
  episodeId: string;
  plans: PlanOption[];
  trial: TrialOption | null;
  paymentsAvailable: boolean;
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
      const { checkout } = (await response.json()) as { checkout?: RazorpayCheckout };
      if (checkout) {
        await openRazorpay(checkout, mode);
        return;
      }
      router.replace(`/watch/${episodeId}`);
      return;
    }
    const errorMessage = ((await response.json()) as { error?: { message?: string } }).error
      ?.message;
    setMessage(
      errorMessage === "SUBSCRIPTION_EXISTS"
        ? "You already have a subscription. Manage it from My Subscription."
        : errorMessage === "CHECKOUT_PENDING"
          ? "Your previous payment is still processing. Try again in a few minutes."
          : errorMessage === "TRIAL_ALREADY_USED"
            ? "Trial already used — choose a plan below."
            : (errorMessage ?? "Could not start subscription"),
    );
    setPending(null);
  }

  async function openRazorpay(checkout: RazorpayCheckout, mode: "trial" | "paid") {
    try {
      await loadRazorpayScript();
    } catch {
      setMessage("Could not load the payment page. Check your connection and try again.");
      setPending(null);
      return;
    }
    const razorpay = new window.Razorpay!({
      key: checkout.keyId,
      subscription_id: checkout.razorpaySubscriptionId,
      name: "Intube Drama",
      description: checkout.description,
      prefill: checkout.prefill,
      theme: { color: "#e11d48" },
      modal: { ondismiss: () => setPending(null) },
      handler: async (result) => {
        const verify = await fetch("/api/subscriptions/razorpay/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            razorpayPaymentId: result.razorpay_payment_id,
            razorpaySubscriptionId: result.razorpay_subscription_id,
            razorpaySignature: result.razorpay_signature,
            ...(mode === "trial" ? { deviceFingerprint: getDeviceFingerprint() } : {}),
          }),
        });
        if (verify.ok) {
          router.replace(`/watch/${episodeId}`);
          return;
        }
        setMessage(
          "Payment received but confirmation is pending. VIP will activate in a few minutes.",
        );
        setPending(null);
      },
    });
    razorpay.open();
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
    return ((await response.json()) as { error?: { message?: string } }).error?.message ?? fallback;
  }

  return (
    <div className="mt-6 space-y-3">
      {!paymentsAvailable && (
        <div className="rounded-2xl border border-amber-400/40 p-4 text-sm text-amber-100">
          <p className="font-bold">VIP subscriptions open soon.</p>
          <ul className="mt-2 space-y-1">
            {trial && (
              <li>
                {trial.days}-day trial for {trial.priceLabel}, then {trial.thenLabel}
              </li>
            )}
            {plans.map((plan) => (
              <li key={plan.code}>
                {plan.name}: {plan.priceLabel}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-zinc-300">Meanwhile, unlock this episode below.</p>
        </div>
      )}
      {paymentsAvailable && trial && !trialAlreadyUsed && (
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
      {paymentsAvailable &&
        plans.map((plan) => (
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
      {message && <p className="rounded-xl bg-rose-950/60 p-3 text-sm text-rose-200">{message}</p>}
    </div>
  );
}
