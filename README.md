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

## Environment

| Variable                | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                       |
| `SESSION_SECRET`        | JWT cookie signing secret                          |
| `STREAM_TOKEN_SECRET`   | Playback and ad token signing secret               |
| `OTP_DEV_CODE`          | Fixed OTP used in development                      |
| `MEDIA_DIR`             | Local media storage directory                      |
| `NEXT_PUBLIC_APP_URL`   | Public app URL                                     |
| `STRIPE_SECRET_KEY`     | Optional Stripe secret; enables the Stripe adapter |
| `STRIPE_WEBHOOK_SECRET` | Optional Stripe webhook signature secret           |
| `CRON_SECRET`           | Shared secret for the subscription cron endpoint   |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).
