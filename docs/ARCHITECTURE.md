# Architecture

## Stack and boundaries

The single Next.js 15 App Router app is in `src/app`; route handlers under `src/app/api` are the JSON API. Prisma models and indexes live in `prisma/schema.prisma`, and `src/server/db.ts` owns the server-only client. Zod validates every API payload.

## Viewer flows

`/` is a snap-scrolling discovery feed and database-ranked rows for For You, trending, releases, genres, and tropes. For You scores genre/trope affinity from the viewer's WatchProgress and EpisodeUnlock rows in SQL and falls back deterministically to trending for cold-start users. `/series/[slug]` renders poster/thumbnail metadata and a free/coin/VIP episode grid with a Watched badge derived from existing WatchProgress. `/watch/[episodeId]` uses an HTML5 9:16 player with hls.js manifest support, MP4 fallback, swipe and keyboard navigation, double-tap likes, long-press speed changes with feature-detected picture-in-picture, subtitles, cancellable three-second autoplay, watermark, progress, and a bottom-sheet unlock flow. `/wallet`, `/login`, and database-backed `/search` cover account flows; search suggestions are debounced DB queries over titles and tags.

## Coin economy

`src/server/coins.ts` is the only balance mutation choke point. Debit uses a conditional `updateMany` with `coinBalance >= cost` inside a Prisma transaction, then writes an append-only ledger row using the transaction-local balance. Episode unlock creation relies on the compound unique constraint and catches P2002 for concurrent idempotency. Check-ins use UTC-day uniqueness and `CHECKIN_REWARDS`. Referral credits happen once at signup.

## CMS and analytics

`/admin`, `/admin/series`, `/admin/users`, `/admin/commerce`, and `/admin/analytics` are role-gated CMS surfaces. Existing catalogue and subscription screens remain the primary editors for series, episodes, localized plan prices, analytics, and lifecycle settings. The full-access additions provide user search/detail, ledger-backed coin adjustments, role and account enable/disable controls, bundle CRUD, banner/coupon/discount CRUD, plan and price creation/deletion, and protected bulk episode updates. Every mutation calls `adminSession()` on the server and validates its payload with Zod; client controls never grant authority.

Coin changes use the `ADMIN_ADJUST` ledger type through `adjustCoins`, recording the admin actor in the reference and never writing `coinBalance` without a matching `CoinTransaction`. Subscription overrides continue through `cancelSubscription` and `adminExtendSubscription`, which append `SubscriptionEvent` rows with `actorType: ADMIN` and the admin id. Deletes that would remove paid history are blocked with a clear conflict response; unreferenced catalogue/commerce records can be deleted, while published content with history can instead be unpublished.

`src/server/analytics.ts` computes the episode funnel from distinct `WatchProgress` viewers, ARPU,
coins spent per paying user, seven-day coin velocity, top genres by unlock, and provider success
rates. Each definition is immediately above its query, and the metrics are available under
`/api/admin/analytics/*`.

## Subscriptions and entitlement

`Plan` and `PlanPrice` store integer minor-unit prices per currency; no exchange-rate arithmetic is
used. The seeded annual prices are INR ₹999 / ₹9 trial, USD $99.99 / $0.99 trial, EUR €89.99 /
€0.99 trial, and AED 479 / AED 9 trial. Currency resolution checks `cf-ipcountry` /
`x-vercel-ip-country`, then `Accept-Language`, then falls back to INR. `/api/subscriptions`
supports both the ₹9 three-day trial and a direct full-price annual purchase. Both paths claim the
subscription and pending invoice before charging, then reconcile a paid invoice or record a failed
invoice and terminal state. `TrialClaim` stores normalized server-known email plus an optional
device fingerprint with unique constraints; claims survive account deletion and a repeat claim
returns `TRIAL_ALREADY_USED` without charging. `src/server/entitlements.ts` is the single resolver
used by playback, stream delivery, the series grid, and the watch paywall. Free episodes, coin
unlocks, and active/trialing subscriptions remain compatible.

`POST /api/cron/subscriptions` is protected by `CRON_SECRET`. It structurally deduplicates
24-hour reminders through the unique subscription notification kind and renewals through the
unique subscription invoice period key. Trial claims are persisted before charging, and a failed
charge is recorded as a failed invoice before the subscription becomes terminal. Renewal failures
become `PAST_DUE`, reset the renewal claim, and retry within the configurable dunning grace window;
they expire only after that window. Access remains available through the current period. Renewal
periods are anchored to the prior period boundary so cron lag does not drift future renewals.
Webhook and cron payment success share the invoice period key, so either order settles one invoice
and extends one period. A partial PostgreSQL unique index on `Subscription.userId` for `TRIALING`,
`ACTIVE`, and `PAST_DUE` enforces one non-terminal subscription per user.

`/admin/subscriptions` computes trial conversion, country revenue, and annual revenue run rate
with SQL aggregates and provides price, discount, user override, reminder, and dunning controls. The Dev
provider is implemented and used without keys. The Stripe adapter and signed webhook path are
code-complete but unverified without Stripe credentials. Apple and Google receipt verification
remain integration stubs; their native cancel flows must link users to Apple/Google subscription
management.

## Playback, anti-piracy, and integrations

`src/server/tokens.ts` signs short-lived stream and ad tokens. `GET /api/stream/[token]` verifies session, expiry, identity, and unlock before redirecting to local media. Ad nonces are atomically claimed for single use. `src/server/storage.ts` is a local adapter; S3/Cloudflare Stream signed URL support is a TODO. `src/server/video-processor.ts` is a pass-through adapter; MediaConvert/ffmpeg, DRM, forensic watermarking, and screen-recording detection are intentionally not implemented.

The in-memory rate limiter is explicitly a development helper and must be swapped for Redis in production. OTP is fixed in development and has no external sender; mobile IAP, push delivery, real transcoding/cropping, CDN storage, DRM, and forensic screen-capture detection remain documented integration points.
