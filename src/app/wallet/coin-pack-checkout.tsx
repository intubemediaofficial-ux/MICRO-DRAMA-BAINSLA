"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CoinBundle = {
  id: string;
  coins: number;
  bonusCoins: number;
  priceMinor: number;
  currency: string;
};

type RazorpayResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type CheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (result: RazorpayResult) => void;
  modal: { ondismiss: () => void };
};

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutScriptPromise: Promise<boolean> | null = null;

function checkoutConstructor() {
  return window.Razorpay as unknown as
    | (new (options: CheckoutOptions) => { open: () => void })
    | undefined;
}

function loadCheckoutScript() {
  if (checkoutConstructor()) return Promise.resolve(true);
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    const finish = (loaded: boolean) => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (!loaded) {
        script.remove();
        checkoutScriptPromise = null;
      }
      resolve(loaded);
    };
    const onLoad = () => finish(Boolean(checkoutConstructor()));
    const onError = () => finish(false);
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });
  return checkoutScriptPromise;
}

export default function CoinPackCheckout({ bundles }: { bundles: CoinBundle[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function buy(bundle: CoinBundle) {
    setBusyId(bundle.id);
    setMessage("");
    try {
      const orderResponse = await fetch("/api/purchases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundleId: bundle.id }),
      });
      const order = await orderResponse.json();
      if (!orderResponse.ok)
        throw new Error(order.error?.message ?? "Unable to start payment");
      if (!(await loadCheckoutScript()) || !checkoutConstructor())
        throw new Error("Razorpay Checkout could not be loaded");

      const RazorpayCheckout = checkoutConstructor();
      if (!RazorpayCheckout) throw new Error("Razorpay Checkout could not be loaded");
      const checkout = new RazorpayCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Intube Drama",
        description: `${bundle.coins + bundle.bonusCoins} coins`,
        order_id: order.orderId,
        handler: async (result) => {
          try {
            const response = await fetch("/api/purchases/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(result),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error?.message ?? "Payment verification failed");
            setMessage("Payment verified. Coins added to your wallet.");
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Payment verification failed");
          } finally {
            setBusyId("");
          }
        },
        modal: {
          ondismiss: () => {
            setMessage("Payment was not completed.");
            setBusyId("");
          },
        },
      });
      checkout.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start payment");
      setBusyId("");
    }
  }

  return (
    <div className="mt-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bundles.map((bundle) => (
          <div key={bundle.id} className="min-w-0 rounded-2xl bg-zinc-900 p-4">
            <p className="text-2xl font-black">🪙 {bundle.coins + bundle.bonusCoins}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: bundle.currency,
                maximumFractionDigits: 2,
              }).format(bundle.priceMinor / 100)}
            </p>
            <button
              className="mt-4 w-full rounded-full bg-rose-500 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => buy(bundle)}
            >
              {busyId === bundle.id ? "Opening checkout…" : "Buy coins"}
            </button>
          </div>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm text-zinc-300">{message}</p> : null}
    </div>
  );
}
