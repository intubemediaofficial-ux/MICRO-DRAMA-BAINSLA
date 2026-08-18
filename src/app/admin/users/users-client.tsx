"use client";

import { useState } from "react";
import { Button, Confirm, useToast } from "@/components/admin/admin-ui";

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
  hasPassword: boolean;
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
  const [passwordInput, setPasswordInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const toast = useToast();
  async function reload() {
    const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`);
    if (response.ok) {
      setUsers((await response.json()) as User[]);
    } else {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast(body?.error?.message ?? "Could not load users.", "error");
    }
  }
  async function action(user: User, body: unknown, success: string, key: string) {
    setPending(key);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast(error?.error?.message ?? "Update failed.", "error");
        return;
      }
      toast(success);
      await reload();
      if (selected?.id === user.id) await view(user);
    } finally {
      setPending(null);
    }
  }
  async function adjust(user: User) {
    const value = Number(window.prompt("Coin delta (+ grant, - deduct)"));
    const reason = window.prompt("Reason");
    if (!Number.isInteger(value) || value === 0 || !reason) return;
    const key = `adjust-${user.id}`;
    setPending(key);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, delta: value, reason }),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast(error?.error?.message ?? "Adjustment failed.", "error");
        return;
      }
      const identity = user.email ?? user.name ?? user.phone ?? "user";
      toast(`${Math.abs(value)} coins ${value > 0 ? "added to" : "deducted from"} ${identity}'s wallet`);
      await reload();
      if (selected?.id === user.id) await view(user);
    } finally {
      setPending(null);
    }
  }
  async function view(user: User) {
    const response = await fetch(`/api/admin/users/${user.id}`);
    if (response.ok) {
      setSelected((await response.json()) as UserDetail);
    } else {
      const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast(error?.error?.message ?? "Could not load user details.", "error");
    }
  }
  return (
    <div className="mt-6 space-y-5">
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
        <Button type="submit" pending={pending === "search"}>Search</Button>
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
                <Button variant="secondary" pending={pending === `adjust-${user.id}`} onClick={() => void adjust(user)}>
                  Adjust coins
                </Button>
                <Button
                  variant="secondary"
                  pending={pending === `role-${user.id}`}
                  onClick={() =>
                    void action(user, {
                      action: "role",
                      role: user.role === "ADMIN" ? "USER" : "ADMIN",
                    }, `${user.email ?? "User"} ${user.role === "ADMIN" ? "demoted to user" : "promoted to admin"}`, `role-${user.id}`)
                  }
                  className="rounded bg-zinc-800 px-3 py-2"
                >
                  {user.role === "ADMIN" ? "Remove admin" : "Make admin"}
                </Button>
                <Confirm
                  pending={pending === `disable-${user.id}`}
                  message={`${user.isDisabled ? "Enable" : "Disable"} this account?`}
                  onConfirm={() =>
                    void action(
                      user,
                      { action: "disable", disabled: !user.isDisabled },
                      `${user.email ?? "User"} ${user.isDisabled ? "enabled" : "disabled"}`,
                      `disable-${user.id}`,
                    )
                  }
                >
                  {user.isDisabled ? "Enable" : "Disable"}
                </Confirm>
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
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              type="password"
              minLength={8}
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="New password (8+ characters)"
              className="rounded bg-zinc-800 px-3 py-2 text-sm"
            />
            <Button
              variant="secondary"
              pending={pending === `password-${selected.id}`}
              className="rounded bg-zinc-800 px-3 py-2 text-sm"
              onClick={() => {
                if (passwordInput.length >= 8) {
                  void action(selected, { action: "password", password: passwordInput }, `Password set for ${selected.email ?? "user"}`, `password-${selected.id}`);
                  setPasswordInput("");
                }
              }}
            >
              {selected.hasPassword ? "Reset password" : "Set password"}
            </Button>
            {selected.hasPassword && (
              <Confirm
                pending={pending === `clear-password-${selected.id}`}
                message="Clear this user's password?"
                onConfirm={() => void action(selected, { action: "clearPassword" }, `Password cleared for ${selected.email ?? "user"}`, `clear-password-${selected.id}`)}
              >
                Clear password
              </Confirm>
            )}
          </div>
          <h3 className="mt-5 font-bold">Subscriptions and invoices</h3>
          {selected.subscriptions.map((subscription) => (
            <div key={subscription.id} className="mt-2 rounded-xl bg-zinc-950 p-3 text-sm">
              <p>
                {subscription.plan.name} · {subscription.status} · {subscription.price.currency}{" "}
                {subscription.price.amountMinor} · ends{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleString()}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  pending={pending === `extend-${subscription.id}`}
                  onClick={() => {
                    const days = Number(window.prompt("Extend by how many days?", "30"));
                    if (Number.isInteger(days) && days > 0)
                      void action(selected, {
                        action: "extend",
                        subscriptionId: subscription.id,
                        days,
                      }, `Subscription extended by ${days} days`, `extend-${subscription.id}`);
                  }}
                  className="rounded bg-zinc-800 px-3 py-2"
                >
                  Extend
                </Button>
                <Confirm
                  pending={pending === `cancel-${subscription.id}`}
                  message="Cancel this subscription at period end?"
                  onConfirm={() => void action(selected, { action: "cancel", subscriptionId: subscription.id }, "Subscription cancelled at period end", `cancel-${subscription.id}`)}
                >
                  Cancel
                </Confirm>
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
