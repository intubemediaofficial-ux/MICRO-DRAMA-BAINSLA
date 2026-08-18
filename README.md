# MicroDrama Bainsla

A mobile-first vertical micro-drama OTT platform built with Next.js 15, Prisma, PostgreSQL, and Tailwind CSS.

## Quickstart

Prerequisites: Node.js 20+, npm, and PostgreSQL 14+.

```bash
npm i
cp .env.example .env
# Create the database named microdrama, then:
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. Development credentials are `admin@microdrama.local` and `user@microdrama.local`; the OTP is the value of `OTP_DEV_CODE` (default `123456`).

The admin dashboard is available at `/admin` and is server-role-gated. Existing catalogue,
analytics, and subscription screens remain available, while `/admin/users` provides account
search, detail, ledger-backed coin adjustments, role changes, subscription overrides, and
disable/enable controls. `/admin/commerce` provides CRUD controls for coin bundles, banners,
coupons, plans, localized integer-minor-unit prices, and discount codes. Destructive UI actions
require confirmation; records with paid history are blocked from deletion to preserve financial
and ledger history.

Useful commands: `npm run format`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run db:reset`, and `npm run db:seed`.

The seed creates three 60-episode series, posters/thumbnails, subtitles, progress, likes,
paid unlock activity, completed and failed provider purchases, a `WELCOME50` coupon, and
multi-currency VIP subscriptions in every lifecycle state. Run the subscription cron locally with:

```bash
curl -X POST http://localhost:3000/api/cron/subscriptions \
  -H "x-cron-secret: ${CRON_SECRET:-local-cron-secret}"
```

The subscription offer resolves a fixed `PlanPrice` row from `cf-ipcountry` or
`x-vercel-ip-country`, then the country in `Accept-Language`, and finally INR. It never
calculates prices with live FX.

Seeded annual prices are ₹999 / ₹9 trial (INR), $99.99 / $0.99 trial (USD), €89.99 / €0.99
trial (EUR), and AED 479 / AED 9 trial. Users can start the three-day trial or buy the localized
annual pass directly. Trial claims are one-time per server-known email and optional device
fingerprint, including after account recreation.

## Environment

| Variable                | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                       |
| `SESSION_SECRET`        | JWT cookie signing secret                          |
| `STREAM_TOKEN_SECRET`   | Playback and ad token signing secret               |
| `OTP_DEV_CODE`          | Fixed OTP used in development                      |
| `STRIPE_SECRET_KEY`     | Optional Stripe secret; enables the Stripe adapter |
| `STRIPE_WEBHOOK_SECRET` | Optional Stripe webhook signature secret           |
| `CRON_SECRET`           | Shared secret for subscription lifecycle cron      |
| `MEDIA_DIR`             | Local media storage directory                      |
| `NEXT_PUBLIC_APP_URL`   | Public app URL                                     |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).
