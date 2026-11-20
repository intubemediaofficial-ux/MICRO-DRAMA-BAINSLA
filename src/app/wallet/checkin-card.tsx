"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type CheckinStatus = {
  checkedInToday: boolean;
  streak: number;
  nextReward: number;
  rewards: number[];
};

export default function CheckinCard() {
  const router = useRouter();
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/mobile/checkin", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Check-in status unavailable");
    setStatus(body);
  }

  useEffect(() => {
    refresh().catch(() => setMessage("Check-in status unavailable."));
  }, []);

  async function claim() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/mobile/checkin", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Check-in failed");
      await refresh();
      setMessage(`You earned ${body.coinsAwarded} coins.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check-in failed");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-amber-400/20 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-300">Daily check-in</p>
          <p className="mt-1 text-sm text-zinc-400">
            {status
              ? `${status.streak}-day streak · ${status.nextReward} coins next`
              : "Loading your streak…"}
          </p>
        </div>
        <button
          className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
          type="button"
          disabled={!status || status.checkedInToday || busy}
          onClick={claim}
        >
          {busy ? "Claiming…" : status?.checkedInToday ? "Checked in today" : "Claim coins"}
        </button>
      </div>
      {status ? (
        <p className="mt-3 text-xs text-zinc-500">
          Rewards: {status.rewards.join(" · ")} coins
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-zinc-300">{message}</p> : null}
    </section>
  );
}
