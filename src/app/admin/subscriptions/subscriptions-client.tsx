"use client";

import { useState } from "react";
import { Button, Confirm, useToast } from "@/components/admin/admin-ui";

type Metrics = {
  activeTrials: number;
  trials: number;
  converted: number;
  conversionRate: number;
  countryRevenue: { country: string; currency: string; revenueMinor: number }[];
  annualRevenueRunRateMinor: number;
  users: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string | null;
    subscriptions: {
      id: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      plan: { name: string };
    }[];
  }[];
};
type Plan = {
  id: string;
  name: string;
  code: string;
  trialDays: number;
  isActive: boolean;
  prices: {
    id: string;
    currency: string;
    amountMinor: number;
    trialAmountMinor: number;
    countryCodes: string[];
  }[];
};

export default function AdminSubscriptionsClient({
  metrics,
  plans,
  settings,
}: {
  metrics: Metrics;
  plans: Plan[];
  settings: { enabled: boolean; reminderLeadHours: number; gracePeriodHours: number };
}) {
  const [currentMetrics, setCurrentMetrics] = useState(metrics);
  const [currentPlans, setCurrentPlans] = useState(plans);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState(settings.enabled);
  const [leadHours, setLeadHours] = useState(settings.reminderLeadHours);
  const [graceHours, setGraceHours] = useState(settings.gracePeriodHours);
  const [pending, setPending] = useState<string | null>(null);
  const toast = useToast();
  async function save(body: unknown, success: string, key: string) {
    setPending(key);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast(error?.error?.message ?? "Request failed.", "error");
        return;
      }
      toast(success);
      await reloadMetrics();
    } finally {
      setPending(null);
    }
  }
  async function reloadMetrics() {
    const query = new URLSearchParams({ days: String(days) });
    if (search.trim()) query.set("q", search.trim());
    const response = await fetch(`/api/admin/subscriptions?${query.toString()}`);
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast(error?.error?.message ?? "Could not load subscription metrics.", "error");
      return;
    }
    const data = (await response.json()) as {
      metrics: Metrics;
      plans: Plan[];
    };
    setCurrentMetrics(data.metrics);
    setCurrentPlans(data.plans);
    toast("Subscription metrics refreshed.");
  }
  async function refreshMetrics() {
    setPending("metrics");
    try {
      await reloadMetrics();
    } finally {
      setPending(null);
    }
  }
  async function userAction(id: string, action: "extend" | "cancel") {
    const key = `${action}-${id}`;
    setPending(key);
    try {
      const response = await fetch(`/api/admin/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "extend" ? { action, days: 7 } : { action }),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast(error?.error?.message ?? "Subscription update failed.", "error");
        return;
      }
      toast(action === "extend" ? "Trial extended by 7 days." : "Subscription cancelled at period end.");
      await reloadMetrics();
    } finally {
      setPending(null);
    }
  }
  const money = (minor: number, currency = "INR") =>
    new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);
  return (
    <div className="mt-6 space-y-6">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl bg-zinc-900 p-4">
        <label className="text-sm">
          Conversion window
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="ml-2 rounded bg-zinc-800 p-2"
          >
            {[7, 30, 90, 365].map((value) => (
              <option key={value} value={value}>
                {value} days
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          User search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="email, phone or name"
            className="ml-2 rounded bg-zinc-800 p-2"
          />
        </label>
        <Button
          onClick={() => void refreshMetrics()}
          pending={pending === "metrics"}
          className="rounded bg-rose-500 px-4 py-2 font-bold"
        >
          Apply
        </Button>
      </section>
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Active trials", currentMetrics.activeTrials],
          ["Trials in window", currentMetrics.trials],
          ["Converted", currentMetrics.converted],
          ["Conversion rate", `${(currentMetrics.conversionRate * 100).toFixed(1)}%`],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Revenue by country</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Annual revenue run rate: {money(currentMetrics.annualRevenueRunRateMinor / 12)}
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {currentMetrics.countryRevenue.map((row) => (
            <li key={`${row.country}-${row.currency}`} className="flex justify-between">
              <span>{row.country}</span>
              <b>{money(row.revenueMinor, row.currency)}</b>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Reminder automation</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enabled
          </label>
          <input
            type="number"
            min="1"
            value={leadHours}
            onChange={(event) => setLeadHours(Number(event.target.value))}
            className="w-24 rounded-xl bg-zinc-800 p-3"
          />
          <span className="text-sm text-zinc-400">hours before trial ends</span>
          <input
            type="number"
            min="1"
            value={graceHours}
            onChange={(event) => setGraceHours(Number(event.target.value))}
            className="w-24 rounded-xl bg-zinc-800 p-3"
          />
          <span className="text-sm text-zinc-400">dunning grace hours</span>
          <Button
            onClick={() =>
              void save({
                kind: "settings",
                enabled,
                reminderLeadHours: leadHours,
                gracePeriodHours: graceHours,
              }, "Trial reminder settings saved.", "settings")
            }
            pending={pending === "settings"}
            className="rounded-full bg-rose-500 px-4 py-2 font-bold"
          >
            Save
          </Button>
        </div>
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Plans and localized prices</h2>
        {currentPlans.map((plan) => (
          <div key={plan.id} className="mt-4">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void save({
                  kind: "plan",
                  id: plan.id,
                  name: String(form.get("name")),
                  trialDays: Number(form.get("trialDays")),
                  isActive: form.get("isActive") === "on",
                }, `${plan.code} plan saved — ${Number(form.get("trialDays"))} trial days.`, `plan-${plan.id}`);
              }}
            >
              <input name="name" defaultValue={plan.name} className="rounded bg-zinc-800 p-2" />
              <input
                name="trialDays"
                type="number"
                min="0"
                defaultValue={plan.trialDays}
                className="w-24 rounded bg-zinc-800 p-2"
              />
              <label className="flex items-center gap-2 text-sm">
                <input name="isActive" type="checkbox" defaultChecked={plan.isActive} />
                Active
              </label>
              <Button type="submit" variant="secondary" pending={pending === `plan-${plan.id}`}>Save plan</Button>
            </form>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {plan.prices.map((price) => (
                <form
                  key={price.id}
                  className="rounded-xl bg-zinc-800 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void save({
                      kind: "price",
                      id: price.id,
                      amountMinor: Number(form.get("amountMinor")),
                      trialAmountMinor: Number(form.get("trialAmountMinor")),
                      countryCodes: String(form.get("countryCodes"))
                        .split(",")
                        .map((country) => country.trim().toUpperCase())
                        .filter(Boolean),
                      isActive: true,
                    }, `${price.currency} price saved — ${money(Number(form.get("amountMinor")), price.currency)}.`, `price-${price.id}`);
                  }}
                >
                  <p className="text-sm text-zinc-400">{price.currency}</p>
                  <input
                    name="amountMinor"
                    defaultValue={price.amountMinor}
                    className="mt-2 w-full rounded bg-zinc-700 p-2"
                  />
                  <input
                    name="trialAmountMinor"
                    defaultValue={price.trialAmountMinor}
                    className="mt-2 w-full rounded bg-zinc-700 p-2"
                  />
                  <input
                    name="countryCodes"
                    defaultValue={price.countryCodes.join(",")}
                    placeholder="IN,US"
                    className="mt-2 w-full rounded bg-zinc-700 p-2"
                  />
                  <Button type="submit" variant="secondary" pending={pending === `price-${price.id}`} className="mt-2">Save price</Button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">User overrides</h2>
        <div className="mt-3 space-y-2">
          {currentMetrics.users.map((user) => {
            const subscription = user.subscriptions[0];
            return (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-800 p-3"
              >
                <span>{user.email ?? user.phone ?? user.name ?? user.id}</span>
                {subscription && (
                  <span className="flex gap-2 text-xs">
                    <Button
                      variant="secondary"
                      pending={pending === `extend-${subscription.id}`}
                      onClick={() => void userAction(subscription.id, "extend")}
                      className="rounded bg-zinc-950 px-3 py-2"
                    >
                      Extend 7d
                    </Button>
                    <Confirm
                      pending={pending === `cancel-${subscription.id}`}
                      message="Cancel this subscription at period end?"
                      onConfirm={() => void userAction(subscription.id, "cancel")}
                    >
                      Cancel
                    </Confirm>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Festive discount code</h2>
        <Button
          onClick={() => {
            const code = `FESTIVE${Date.now()}`;
            void save({
              kind: "discount",
              code,
              type: "PERCENT",
              value: 20,
              maxRedemptions: 100,
              planIds: plans.map((plan) => plan.id),
            }, `Discount ${code} created — 20%.`, "discount");
          }}
          pending={pending === "discount"}
          className="mt-3 rounded-full bg-zinc-800 px-4 py-2"
        >
          Create 20% discount
        </Button>
      </section>
    </div>
  );
}
