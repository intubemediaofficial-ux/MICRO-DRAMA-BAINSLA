"use client";

import { useState } from "react";

type User = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: "USER" | "ADMIN";
  isDisabled: boolean;
  coinBalance: number;
  subscriptions: { id: string; status: string; currentPeriodEnd: string | Date }[];
};
type UserDetail = Omit<User, "subscriptions"> & {
  transactions: {
    id: string;
    delta: number;
    type: string;
    refType: string | null;
    refId: string | null;
    reason: string | null;
    createdAt: string | Date;
  }[];
  unlocks: { id: string; episode: { number: number; title: string; series: { title: string } } }[];
  subscriptions: {
    id: string;
    status: string;
    currentPeriodEnd: string | Date;
    plan: { name: string; code: string };
    price: { currency: string; amountMinor: number };
    invoices: {
      id: string;
      kind: string;
      status: string;
      amountMinor: number;
      currency: string;
      createdAt: string | Date;
    }[];
  }[];
};

export default function AdminUsersClient({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [message, setMessage] = useState("");
  async function reload() {
    const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`);
    if (response.ok) setUsers((await response.json()) as User[]);
    else setMessage("Could not load users.");
  }
  async function action(user: User, body: unknown) {
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(
      response.ok ? "User updated." : ((await response.json()).error?.message ?? "Update failed"),
    );
    if (response.ok) void reload();
  }
  async function adjust(user: User) {
    const value = Number(window.prompt("Coin delta (+ grant, - deduct)"));
    const reason = window.prompt("Reason");
    if (!Number.isInteger(value) || value === 0 || !reason) return;
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id, delta: value, reason }),
    });
    setMessage(
      response.ok
        ? "Ledger adjustment saved."
        : ((await response.json()).error?.message ?? "Adjustment failed"),
    );
    if (response.ok) void reload();
  }
  async function view(user: User) {
    const response = await fetch(`/api/admin/users/${user.id}`);
    if (response.ok) setSelected((await response.json()) as UserDetail);
  }
  return (
    <div className="mt-6 space-y-5">
      <p className="text-sm text-emerald-400">{message}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void reload();
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="email, phone or name"
          className="flex-1 rounded-xl bg-zinc-900 p-3"
        />
        <button className="rounded-xl bg-rose-500 px-4 font-bold">Search</button>
      </form>
      <div className="space-y-2">
        {users.map((user) => {
          const subscription = user.subscriptions[0];
          return (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-900 p-4"
            >
              <button className="text-left" onClick={() => void view(user)}>
                <b>{user.name ?? user.email ?? user.phone ?? user.id}</b>
                <span className="ml-2 text-xs text-zinc-500">{user.email ?? user.phone ?? ""}</span>
                <span className="mt-1 block text-sm text-zinc-400">
                  {user.coinBalance} coins · {subscription?.status ?? "no subscription"}
                </span>
              </button>
              <div className="flex flex-wrap gap-2 text-xs">
                <button onClick={() => void adjust(user)} className="rounded bg-zinc-800 px-3 py-2">
                  Adjust coins
                </button>
                <button
                  onClick={() =>
                    void action(user, {
                      action: "role",
                      role: user.role === "ADMIN" ? "USER" : "ADMIN",
                    })
                  }
                  className="rounded bg-zinc-800 px-3 py-2"
                >
                  {user.role === "ADMIN" ? "Remove admin" : "Make admin"}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`${user.isDisabled ? "Enable" : "Disable"} this account?`))
                      void action(user, { action: "disable", disabled: !user.isDisabled });
                  }}
                  className="rounded bg-rose-500 px-3 py-2"
                >
                  {user.isDisabled ? "Enable" : "Disable"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {selected && (
        <section className="rounded-2xl bg-zinc-900 p-5">
          <button className="float-right text-zinc-500" onClick={() => setSelected(null)}>
            Close
          </button>
          <h2 className="text-xl font-bold">{selected.name ?? selected.email ?? "User details"}</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Balance: {selected.coinBalance} · {selected.role} ·{" "}
            {selected.isDisabled ? "disabled" : "enabled"}
          </p>
          <h3 className="mt-5 font-bold">Subscriptions and invoices</h3>
          {selected.subscriptions.map((subscription) => (
            <div key={subscription.id} className="mt-2 rounded-xl bg-zinc-950 p-3 text-sm">
              <p>
                {subscription.plan.name} · {subscription.status} · {subscription.price.currency}{" "}
                {subscription.price.amountMinor} · ends{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleString()}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const days = Number(window.prompt("Extend by how many days?", "30"));
                    if (Number.isInteger(days) && days > 0)
                      void action(selected, {
                        action: "extend",
                        subscriptionId: subscription.id,
                        days,
                      });
                  }}
                  className="rounded bg-zinc-800 px-3 py-2"
                >
                  Extend
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Cancel this subscription at period end?"))
                      void action(selected, { action: "cancel", subscriptionId: subscription.id });
                  }}
                  className="rounded bg-rose-950 px-3 py-2 text-rose-200"
                >
                  Cancel
                </button>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                {subscription.invoices.map((invoice) => (
                  <li key={invoice.id}>
                    {invoice.kind} · {invoice.status} · {invoice.currency} {invoice.amountMinor} ·{" "}
                    {new Date(invoice.createdAt).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <h3 className="mt-5 font-bold">Unlocks</h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            {selected.unlocks.map((unlock) => (
              <li key={unlock.id}>
                {unlock.episode.series.title} · EP {unlock.episode.number} · {unlock.episode.title}
              </li>
            ))}
          </ul>
          <h3 className="mt-5 font-bold">Ledger transactions</h3>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {selected.transactions.map((transaction) => (
              <li key={transaction.id}>
                {transaction.delta > 0 ? "+" : ""}
                {transaction.delta} · {transaction.type} · {transaction.refId ?? "—"} ·{" "}
                {transaction.reason ?? "No reason"} ·{" "}
                {new Date(transaction.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
