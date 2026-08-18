# Integration points

## Flutter / React Native

Use the JSON endpoints under `/api`: request and verify OTP, list `/api/series`, obtain playback from `/api/episodes/:id/playback`, persist `/api/progress`, and call `/api/unlocks`. Mobile clients should store no stream secrets; cookies or a native session bridge carry authentication.

## Video, CDN, and DRM

`StorageAdapter` in `src/server/storage.ts` is local-only today. Replace it with signed S3 or Cloudflare Stream URLs. `VideoProcessor` is a pass-through today; connect MediaConvert/ffmpeg for HLS/DASH renditions, subtitle conversion, thumbnails, and 9:16 subject-aware crops. Add a DRM license server (Widevine/FairPlay/PlayReady) before premium production distribution.

## Payments and coins

Development purchases immediately complete through `/api/purchases`. Implement Apple IAP, Google Play, UPI, card, and PayPal provider adapters with server-side receipt verification, idempotent provider references, and webhook reconciliation before enabling real payments.

## Subscriptions

The subscription API exposes a fixed-price annual VIP plan with a three-day trial, localized by
country headers and fixed `PlanPrice` rows for INR ₹999 / ₹9 trial, USD $99.99 / $0.99 trial, EUR
€89.99 / €0.99 trial, and AED 479 / AED 9 trial. The API supports both trial checkout and direct
full-price annual purchase. Both claim the subscription and pending invoice before charging, then
reconcile the provider result. The cron endpoint sends a dry-run 24-hour reminder, converts expired
trials, retries failed renewals during the configured dunning grace window, charges annual
renewals on the prior period boundary, and expires canceled or past-due periods after their
applicable window. Cron and webhook payment success share an invoice period key, preventing
double settlement. Run it locally with
`curl -X POST http://localhost:3000/api/cron/subscriptions -H "x-cron-secret: $CRON_SECRET"`.

Trial claims are fraud-resistant across account recreation: the server normalizes the user's
known email and combines it with an optional client device fingerprint. A unique `TrialClaim`
row enforces one claim per email and per non-null device fingerprint; a missing fingerprint is
not treated as a match. Repeat attempts return `TRIAL_ALREADY_USED` and do not call a provider.

`DevSubscriptionProvider` is the local immediate-success adapter. `StripeSubscriptionProvider`
uses Stripe's HTTP API and signed webhook verification when `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are configured; this path is implemented but unverified without keys.
Apple IAP and Google Play receipt validation remain stubs. Their cancel buttons must open the
native Apple/Google subscription-management path rather than pretending cancellation is controlled
by this server.

## Push and safety

Push campaigns and dry-run `NotificationLog` persistence are modeled. Add FCM/APNs adapters for actual delivery. The dynamic watermark is a visible deterrent only; production anti-piracy should combine forensic watermarking, DRM, token binding, device limits, and platform screen-capture controls.
