"use client";

import { useState } from "react";

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
export default function AdminCommerceClient({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState("");
  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    setMessage(
      response.ok ? "Saved." : ((await response.json()).error?.message ?? "Request failed"),
    );
    if (response.ok) {
      const [bundles, banners, coupons, plans, discounts] = await Promise.all(
        ["bundles", "banners", "coupons", "plans", "discounts"].map((path) =>
          fetch(`/api/admin/${path}`).then((result) => result.json()),
        ),
      );
      setData({ bundles, banners, coupons, plans, discounts });
    }
  }
  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-emerald-400">{message}</p>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Coin bundles</h2>
        <button
          onClick={() =>
            void request("/api/admin/bundles", "POST", {
              coins: 100,
              bonusCoins: 0,
              priceMinor: 4900,
              currency: "INR",
              sortOrder: data.bundles.length,
            })
          }
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add bundle
        </button>
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
              });
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
            <button className="rounded bg-zinc-800 p-2">Save</button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this bundle? Purchases block deletion."))
                  void request("/api/admin/bundles", "DELETE", { id: bundle.id });
              }}
              className="rounded bg-zinc-950 p-2 text-rose-300"
            >
              Delete
            </button>
          </form>
        ))}
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Coupons</h2>
        <button
          onClick={() =>
            void request("/api/admin/coupons", "POST", {
              code: `ADMIN${Date.now()}`,
              coins: 50,
              maxRedemptions: 100,
            })
          }
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add coupon
        </button>
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
              });
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
            <button className="rounded bg-zinc-800 p-2">Save</button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this coupon? Redemptions block deletion."))
                  void request("/api/admin/coupons", "DELETE", { id: coupon.id });
              }}
              className="rounded bg-zinc-950 p-2 text-rose-300"
            >
              Delete
            </button>
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
              });
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
            <button className="rounded bg-zinc-800 p-2">Save</button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this banner?"))
                  void request("/api/admin/banners", "DELETE", { id: banner.id });
              }}
              className="rounded bg-zinc-950 p-2 text-rose-300"
            >
              Delete
            </button>
          </form>
        ))}
        <button
          onClick={() =>
            void request("/api/admin/banners", "POST", {
              title: "New banner",
              imageUrl: "/media/poster-0.jpg",
              sortOrder: data.banners.length,
            })
          }
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add banner
        </button>
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Plans</h2>
        <button
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
            })
          }
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add plan
        </button>
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
                });
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
              <button className="rounded bg-zinc-700 p-2">Save plan</button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this plan? Existing subscriptions block deletion."))
                    void request("/api/admin/plans", "DELETE", { id: plan.id });
                }}
                className="rounded bg-zinc-950 px-3 py-2 text-rose-300"
              >
                Delete
              </button>
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
                  });
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
                  <button className="rounded bg-zinc-700 p-2">Save price</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm("Delete this localized price? Subscriptions block deletion.")
                      )
                        void request("/api/admin/plan-prices", "DELETE", { id: price.id });
                    }}
                    className="rounded bg-zinc-950 p-2 text-rose-300"
                  >
                    Delete
                  </button>
                </span>
              </form>
            ))}
            <button
              onClick={() =>
                void request("/api/admin/plan-prices", "POST", {
                  planId: plan.id,
                  currency: "USD",
                  amountMinor: 9999,
                  trialAmountMinor: 99,
                  countryCodes: ["US"],
                })
              }
              className="mt-2 rounded bg-zinc-800 px-3 py-2"
            >
              Add USD price
            </button>
          </div>
        ))}
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Discount codes</h2>
        <button
          onClick={() =>
            void request("/api/admin/discounts", "POST", {
              code: `SALE${Date.now()}`,
              type: "PERCENT",
              value: 20,
              maxRedemptions: 100,
              planIds: data.plans.map((plan) => plan.id),
            })
          }
          className="mt-3 rounded bg-rose-500 px-3 py-2"
        >
          Add 20% discount
        </button>
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
              });
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
            <button className="rounded bg-zinc-800 p-2">Save</button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this discount? Redemptions block deletion."))
                  void request("/api/admin/discounts", "DELETE", { id: discount.id });
              }}
              className="rounded bg-zinc-950 p-2 text-rose-300"
            >
              Delete
            </button>
          </form>
        ))}
      </section>
    </div>
  );
}
