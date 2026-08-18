# Architecture

## Stack and boundaries

The single Next.js 15 App Router app is in `src/app`; route handlers under `src/app/api` are the JSON API. Prisma models and indexes live in `prisma/schema.prisma`, and `src/server/db.ts` owns the server-only client. Zod validates every API payload.

## Viewer flows

`/` is a snap-scrolling discovery feed and database-ranked rows for trending, releases, genres, and tropes. `/series/[slug]` renders poster/thumbnail metadata and a free/coin episode grid. `/watch/[episodeId]` uses an HTML5 9:16 player with hls.js manifest support, MP4 fallback, swipe and keyboard navigation, double-tap likes, long-press speed changes, subtitles, autoplay, watermark, progress, and an unlock sheet. `/wallet`, `/login`, and database-backed `/search` cover account flows.

## Coin economy

`src/server/coins.ts` is the only balance mutation choke point. Debit uses a conditional `updateMany` with `coinBalance >= cost` inside a Prisma transaction, then writes an append-only ledger row using the transaction-local balance. Episode unlock creation relies on the compound unique constraint and catches P2002 for concurrent idempotency. Check-ins use UTC-day uniqueness and `CHECKIN_REWARDS`. Referral credits happen once at signup.

## CMS and analytics

`/admin`, `/admin/series`, and `/admin/analytics` are role-gated CMS surfaces. Admin APIs create/edit series, bulk-add and edit episodes, upload video through `StorageAdapter` and `VideoProcessor`, upload subtitles, manage banners and coupons, and write dry-run cliffhanger notification logs. Users redeem coupons through `/api/coupons/redeem`.

`src/server/analytics.ts` computes the episode funnel from distinct `WatchProgress` viewers, ARPU,
coins spent per paying user, seven-day coin velocity, top genres by unlock, and provider success
rates. Each definition is immediately above its query, and the metrics are available under
`/api/admin/analytics/*`.

## Playback, anti-piracy, and integrations

`src/server/tokens.ts` signs short-lived stream and ad tokens. `GET /api/stream/[token]` verifies session, expiry, identity, and unlock before redirecting to local media. Ad nonces are atomically claimed for single use. `src/server/storage.ts` is a local adapter; S3/Cloudflare Stream signed URL support is a TODO. `src/server/video-processor.ts` is a pass-through adapter; MediaConvert/ffmpeg, DRM, forensic watermarking, and screen-recording detection are intentionally not implemented.

The in-memory rate limiter is explicitly a development helper and must be swapped for Redis in production. OTP is fixed in development and has no external sender; mobile IAP, push delivery, real transcoding/cropping, CDN storage, DRM, and forensic screen-capture detection remain documented integration points.
