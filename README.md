# MicroDrama Bainsla

A mobile-first vertical micro-drama OTT scaffold built with Next.js 15, Prisma, PostgreSQL, and Tailwind CSS.

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

Useful commands: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run db:reset`, and `npm run db:seed`.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT cookie signing secret |
| `STREAM_TOKEN_SECRET` | Playback and ad token signing secret |
| `OTP_DEV_CODE` | Fixed OTP used in development |
| `MEDIA_DIR` | Local media storage directory |
| `NEXT_PUBLIC_APP_URL` | Public app URL |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

Vertical micro-drama OTT platform (mobile web + admin CMS) built with Next.js, Prisma and PostgreSQL.

Setup, architecture and API docs land with the initial scaffold PR.
