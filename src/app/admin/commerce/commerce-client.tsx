"use client";

import { useState } from "react";
import { Button, Confirm, useToast } from "@/components/admin/admin-ui";

type Data = {
  bundles: {
    id: string;
    coins: number;
    bonusCoins: number;
    priceMinor: number;
    currency: string;
    isActive: boolean;
    sortOrder: number;
  }[];
  banners: { id: string; title: string; imageUrl: string; sortOrder: number; isActive: boolean }[];
  coupons: { id: string; code: string; coins: number; maxRedemptions: number; isActive: boolean }[];
  plans: {
    id: string;
    code: string;
    name: string;
    trialDays: number;
    isActive: boolean;
    prices: {
      id: string;
      currency: string;
      amountMinor: number;
      trialAmountMinor: number;
      countryCodes: string[];
      isActive: boolean;
    }[];
  }[];
  discounts: {
    id: string;
    code: string;
    type: string;
    value: number;
    maxRedemptions: number;
    isActive: boolean;
  }[];
};
const listPaths = ["bundles", "banners", "coupons", "plans", "discounts"] as const;

export default function AdminCommerceClient({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const toast = useToast();

  async function refreshLists() {
    const results = await Promise.allSettled(
      listPaths.map(async (path) => {
        const response = await fetch(`/api/admin/${path}`);
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            (body as { error?: { message?: string } } | null)?.error?.message ??
            `HTTP ${response.status}`;
          throw new Error(message);
        }
        return { path, body };
      }),
    );
    const next = { ...data };
    const failures: string[] = [];
    results.forEach((result, index) => {
      const path = listPaths[index];
      if (result.status === "fulfilled") {
        const value = result.value.body;
        if (path === "bundles") next.bundles = value;
        if (path === "banners") next.banners = value;
        if (path === "coupons") next.coupons = value;
        if (path === "plans") next.plans = value;
        if (path === "discounts") next.discounts = value;
      } else {
        failures.push(`${path}: ${result.reason instanceof Error ? result.reason.message : "Request failed"}`);
      }
    });
    setData(next);
    return failures;
  }

  async function request(url: string, method: string, body: unknown, success: string, key: string) {
    setPending(key);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast(error?.error?.message ?? "Request failed.", "error");
        return;
      }
      const failures = await refreshLists();
      toast(success);
      failures.forEach((failure) => toast(`Could not refresh ${failure}`, "error"));
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Coin bundles</h2>
        <Button
          onClick={() =>
            void request("/api/admin/bundles", "POST", {
              coins: 100,
              bonusCoins: 0,
              priceMinor: 4900,
              currency: "INR",
              sortOrder: data.bundles.length,
            }, "100-coin bundle created.", "bundle-create")
          }
          pending={pending === "bundle-create"}
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add bundle
        </Button>
        {data.bundles.map((bundle) => (
          <form
            key={bundle.id}
            className="mt-3 grid gap-2 sm:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void request("/api/admin/bundles", "PATCH", {
                id: bundle.id,
                data: {
                  coins: Number(form.get("coins")),
                  bonusCoins: Number(form.get("bonusCoins")),
                  priceMinor: Number(form.get("priceMinor")),
                  currency: String(form.get("currency")),
                  isActive: form.get("isActive") === "on",
                  sortOrder: Number(form.get("sortOrder")),
                },
              }, `Bundle updated — ${Number(form.get("coins"))} coins.`, `bundle-${bundle.id}`);
            }}
          >
            <input
              name="coins"
              defaultValue={bundle.coins}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <input
              name="bonusCoins"
              defaultValue={bundle.bonusCoins}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <input
              name="priceMinor"
              defaultValue={bundle.priceMinor}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <input
              name="currency"
              defaultValue={bundle.currency}
              className="rounded bg-zinc-800 p-2"
            />
            <input
              name="sortOrder"
              defaultValue={bundle.sortOrder}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <Button type="submit" variant="secondary" pending={pending === `bundle-${bundle.id}`}>Save</Button>
            <Confirm pending={pending === `bundle-delete-${bundle.id}`} message="Delete this bundle? Purchases block deletion." onConfirm={() => void request("/api/admin/bundles", "DELETE", { id: bundle.id }, "Coin bundle deleted.", `bundle-delete-${bundle.id}`)}>Delete</Confirm>
          </form>
        ))}
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Coupons</h2>
        <Button
          onClick={() => {
            const code = `ADMIN${Date.now()}`;
            void request("/api/admin/coupons", "POST", {
              code,
              coins: 50,
              maxRedemptions: 100,
            }, `Coupon ${code} created — 50 coins.`, "coupon-create");
          }}
          pending={pending === "coupon-create"}
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add coupon
        </Button>
        {data.coupons.map((coupon) => (
          <form
            key={coupon.id}
            className="mt-3 grid gap-2 sm:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void request("/api/admin/coupons", "PATCH", {
                id: coupon.id,
                data: {
                  code: String(form.get("code")),
                  coins: Number(form.get("coins")),
                  maxRedemptions: Number(form.get("maxRedemptions")),
                  isActive: form.get("isActive") === "on",
                },
              }, `Coupon ${String(form.get("code"))} updated — ${Number(form.get("coins"))} coins.`, `coupon-${coupon.id}`);
            }}
          >
            <input name="code" defaultValue={coupon.code} className="rounded bg-zinc-800 p-2" />
            <input
              name="coins"
              defaultValue={coupon.coins}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <input
              name="maxRedemptions"
              defaultValue={coupon.maxRedemptions}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <label className="p-2">
              <input name="isActive" type="checkbox" defaultChecked={coupon.isActive} /> Active
            </label>
            <Button type="submit" variant="secondary" pending={pending === `coupon-${coupon.id}`}>Save</Button>
            <Confirm pending={pending === `coupon-delete-${coupon.id}`} message="Delete this coupon? Redemptions block deletion." onConfirm={() => void request("/api/admin/coupons", "DELETE", { id: coupon.id }, "Coupon deleted.", `coupon-delete-${coupon.id}`)}>Delete</Confirm>
          </form>
        ))}
      </section>
      <section id="marketing" className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Banners</h2>
        {data.banners.map((banner) => (
          <form
            key={banner.id}
            className="mt-3 grid gap-2 sm:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void request("/api/admin/banners", "PATCH", {
                id: banner.id,
                data: {
                  title: String(form.get("title")),
                  imageUrl: String(form.get("imageUrl")),
                  sortOrder: Number(form.get("sortOrder")),
                  isActive: form.get("isActive") === "on",
                },
              }, `Banner ${String(form.get("title"))} updated.`, `banner-${banner.id}`);
            }}
          >
            <input name="title" defaultValue={banner.title} className="rounded bg-zinc-800 p-2" />
            <input
              name="imageUrl"
              defaultValue={banner.imageUrl}
              className="rounded bg-zinc-800 p-2"
            />
            <input
              name="sortOrder"
              defaultValue={banner.sortOrder}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <label className="p-2">
              <input name="isActive" type="checkbox" defaultChecked={banner.isActive} /> Active
            </label>
            <Button type="submit" variant="secondary" pending={pending === `banner-${banner.id}`}>Save</Button>
            <Confirm pending={pending === `banner-delete-${banner.id}`} message="Delete this banner?" onConfirm={() => void request("/api/admin/banners", "DELETE", { id: banner.id }, "Banner deleted.", `banner-delete-${banner.id}`)}>Delete</Confirm>
          </form>
        ))}
        <Button
          onClick={() =>
            void request("/api/admin/banners", "POST", {
              title: "New banner",
              imageUrl: "/demo/banners/banner-tonight.jpg",
              sortOrder: data.banners.length,
            }, "New banner created — edit its title and image below.", "banner-create")
          }
          pending={pending === "banner-create"}
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add banner
        </Button>
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Plans</h2>
        <Button
          onClick={() =>
            void request("/api/admin/plans", "POST", {
              code: `VIP_${Date.now()}`,
              name: "New VIP plan",
              trialDays: 3,
              prices: [
                {
                  currency: "INR",
                  amountMinor: 99900,
                  trialAmountMinor: 900,
                  countryCodes: ["IN"],
                },
              ],
            }, "VIP plan created — 3-day trial.", "plan-create")
          }
          pending={pending === "plan-create"}
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add plan
        </Button>
        {data.plans.map((plan) => (
          <div key={plan.id}>
            <form
              className="mt-3 grid gap-2 rounded-xl bg-zinc-800 p-3 sm:grid-cols-5"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void request("/api/admin/plans", "PATCH", {
                  id: plan.id,
                  data: {
                    name: String(form.get("name")),
                    trialDays: Number(form.get("trialDays")),
                    isActive: form.get("isActive") === "on",
                  },
                }, `Plan ${String(form.get("name"))} updated.`, `plan-${plan.id}`);
              }}
            >
              <input name="name" defaultValue={plan.name} className="rounded bg-zinc-700 p-2" />
              <span className="p-2 text-sm text-zinc-400">{plan.code}</span>
              <input
                name="trialDays"
                defaultValue={plan.trialDays}
                type="number"
                min={0}
                className="rounded bg-zinc-700 p-2"
              />
              <label className="p-2">
                <input name="isActive" type="checkbox" defaultChecked={plan.isActive} /> Active
              </label>
              <Button type="submit" variant="secondary" pending={pending === `plan-${plan.id}`}>Save plan</Button>
              <Confirm pending={pending === `plan-delete-${plan.id}`} message="Delete this plan? Existing subscriptions block deletion." onConfirm={() => void request("/api/admin/plans", "DELETE", { id: plan.id }, "Plan deleted.", `plan-delete-${plan.id}`)}>Delete</Confirm>
            </form>
            {plan.prices.map((price) => (
              <form
                key={price.id}
                className="mt-2 grid gap-2 rounded-xl bg-zinc-800/60 p-3 sm:grid-cols-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                    void request("/api/admin/plan-prices", "PATCH", {
                    id: price.id,
                    data: {
                      currency: String(form.get("currency")),
                      amountMinor: Number(form.get("amountMinor")),
                      trialAmountMinor: Number(form.get("trialAmountMinor")),
                      countryCodes: String(form.get("countryCodes"))
                        .split(",")
                        .map((country) => country.trim().toUpperCase())
                        .filter(Boolean),
                      isActive: form.get("isActive") === "on",
                    },
                    }, `${price.currency} localized price updated.`, `price-${price.id}`);
                }}
              >
                <input
                  name="currency"
                  defaultValue={price.currency}
                  maxLength={3}
                  className="rounded bg-zinc-800 p-2"
                />
                <input
                  name="amountMinor"
                  defaultValue={price.amountMinor}
                  type="number"
                  min={0}
                  className="rounded bg-zinc-800 p-2"
                />
                <input
                  name="trialAmountMinor"
                  defaultValue={price.trialAmountMinor}
                  type="number"
                  min={0}
                  className="rounded bg-zinc-800 p-2"
                />
                <input
                  name="countryCodes"
                  defaultValue={price.countryCodes.join(",")}
                  className="rounded bg-zinc-800 p-2"
                />
                <label className="p-2">
                  <input name="isActive" type="checkbox" defaultChecked={price.isActive} /> Active
                </label>
                <span className="flex gap-2">
                  <Button type="submit" variant="secondary" pending={pending === `price-${price.id}`}>Save price</Button>
                  <Confirm pending={pending === `price-delete-${price.id}`} message="Delete this localized price? Subscriptions block deletion." onConfirm={() => void request("/api/admin/plan-prices", "DELETE", { id: price.id }, `${price.currency} localized price deleted.`, `price-delete-${price.id}`)}>Delete</Confirm>
                </span>
              </form>
            ))}
            <Button
              onClick={() =>
                void request("/api/admin/plan-prices", "POST", {
                  planId: plan.id,
                  currency: "USD",
                  amountMinor: 9999,
                  trialAmountMinor: 99,
                  countryCodes: ["US"],
                }, "USD localized price added.", `price-create-${plan.id}`)
              }
              pending={pending === `price-create-${plan.id}`}
              className="mt-2 rounded bg-zinc-800 px-3 py-2"
            >
              Add USD price
            </Button>
          </div>
        ))}
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Discount codes</h2>
        <Button
          onClick={() => {
            const code = `SALE${Date.now()}`;
            void request("/api/admin/discounts", "POST", {
              code,
              type: "PERCENT",
              value: 20,
              maxRedemptions: 100,
              planIds: data.plans.map((plan) => plan.id),
            }, `Discount ${code} created — 20%.`, "discount-create");
          }}
          pending={pending === "discount-create"}
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add 20% discount
        </Button>
        {data.discounts.map((discount) => (
          <form
            key={discount.id}
            className="mt-3 grid gap-2 sm:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void request("/api/admin/discounts", "PATCH", {
                id: discount.id,
                data: {
                  code: String(form.get("code")),
                  type: String(form.get("type")),
                  value: Number(form.get("value")),
                  maxRedemptions: Number(form.get("maxRedemptions")),
                  isActive: form.get("isActive") === "on",
                },
              }, `Discount ${String(form.get("code"))} updated.`, `discount-${discount.id}`);
            }}
          >
            <input name="code" defaultValue={discount.code} className="rounded bg-zinc-800 p-2" />
            <select name="type" defaultValue={discount.type} className="rounded bg-zinc-800 p-2">
              <option>PERCENT</option>
              <option>FIXED_MINOR</option>
            </select>
            <input
              name="value"
              defaultValue={discount.value}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <input
              name="maxRedemptions"
              defaultValue={discount.maxRedemptions}
              type="number"
              className="rounded bg-zinc-800 p-2"
            />
            <Button type="submit" variant="secondary" pending={pending === `discount-${discount.id}`}>Save</Button>
            <Confirm pending={pending === `discount-delete-${discount.id}`} message="Delete this discount? Redemptions block deletion." onConfirm={() => void request("/api/admin/discounts", "DELETE", { id: discount.id }, "Discount deleted.", `discount-delete-${discount.id}`)}>Delete</Confirm>
          </form>
        ))}
      </section>
    </div>
  );
}
