# Architecture

## Stack and boundaries

The single Next.js 15 App Router app is in `src/app`; route handlers under `src/app/api` are the JSON API. Prisma models and indexes live in `prisma/schema.prisma`, and `src/server/db.ts` owns the server-only client. Zod validates every API payload.

## Viewer flows

`/` is a snap-scrolling discovery feed and curated rows. `/series/[slug]` renders metadata and a free/coin episode grid. `/watch/[episodeId]` uses an HTML5 9:16 player, progress updates, likes, watermark, and an unlock sheet. `/wallet`, `/login`, and `/search` cover account flows. hls.js integration can be added to `WatchClient` when HLS manifests are provisioned.

## Coin economy

`src/server/coins.ts` is the only balance mutation choke point. Debit uses a conditional `updateMany` with `coinBalance >= cost` inside a Prisma transaction, then writes an append-only ledger row using the transaction-local balance. Episode unlock creation relies on the compound unique constraint and catches P2002 for concurrent idempotency. Check-ins use UTC-day uniqueness and `CHECKIN_REWARDS`. Referral credits happen once at signup.

## CMS and analytics

`/admin`, `/admin/series`, and `/admin/analytics` are role-gated CMS surfaces. The schema supports banners, coupons, campaigns, notification logs, subtitles, and upload storage. Analytics definitions are written directly above the displayed cards; production dashboards should use Prisma groupBy/raw SQL for the full funnel and provider breakdown.

## Playback, anti-piracy, and integrations

`src/server/tokens.ts` signs short-lived stream and ad tokens. `GET /api/stream/[token]` verifies session, expiry, identity, and unlock before redirecting to local media. `src/server/storage.ts` is a local adapter; S3/Cloudflare Stream signed URL support is a TODO. `src/server/video-processor.ts` is a pass-through adapter; MediaConvert/ffmpeg, DRM, forensic watermarking, and screen-recording detection are intentionally not implemented.

The in-memory rate limiter is explicitly a development helper and must be swapped for Redis in production. OTP is fixed in development and has no external sender; mobile IAP, push delivery, and transcoding adapters are documented integration points.
