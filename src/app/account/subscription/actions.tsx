"use client";

import { useState } from "react";

export default function SubscriptionActions({
  subscriptionId,
  cancelAtPeriodEnd,
}: {
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
}) {
  const [message, setMessage] = useState("");
  async function request(url: string) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptionId }),
    });
    if (response.ok) location.reload();
    else setMessage(((await response.json()).error?.message as string) ?? "Request failed");
  }
  return (
    <div className="mt-5">
      <button
        onClick={() =>
          void request(
            cancelAtPeriodEnd ? "/api/subscriptions/resume" : "/api/subscriptions/cancel",
          )
        }
        className="rounded-full bg-rose-500 px-5 py-3 font-bold"
      >
        {cancelAtPeriodEnd ? "Resume subscription" : "Manage / Cancel"}
      </button>
      {message && <p className="mt-2 text-sm text-rose-300">{message}</p>}
    </div>
  );
}
