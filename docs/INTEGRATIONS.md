# Integration points

## Flutter / React Native

Use the JSON endpoints under `/api`: request and verify OTP, list `/api/series`, obtain playback from `/api/episodes/:id/playback`, persist `/api/progress`, and call `/api/unlocks`. Mobile clients should store no stream secrets; cookies or a native session bridge carry authentication.

## Video, CDN, and DRM

`StorageAdapter` in `src/server/storage.ts` is local-only today. Replace it with signed S3 or Cloudflare Stream URLs. `VideoProcessor` is a pass-through today; connect MediaConvert/ffmpeg for HLS/DASH renditions, subtitle conversion, thumbnails, and 9:16 subject-aware crops. Add a DRM license server (Widevine/FairPlay/PlayReady) before premium production distribution.

## Payments and coins

Development purchases immediately complete through `/api/purchases`. Implement Apple IAP, Google Play, UPI, card, and PayPal provider adapters with server-side receipt verification, idempotent provider references, and webhook reconciliation before enabling real payments.

## Push and safety

Push campaigns and dry-run `NotificationLog` persistence are modeled. Add FCM/APNs adapters for actual delivery. The dynamic watermark is a visible deterrent only; production anti-piracy should combine forensic watermarking, DRM, token binding, device limits, and platform screen-capture controls.
