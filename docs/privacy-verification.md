# Privacy Verification Harness

This document explains how PixPass verifies the claim:

> Photos are processed in-browser and photo payloads are not uploaded by core user flows.

## What Is Verified

Primary objective: detect whether photo data is uploaded or transferred off-device during core user flows.

The Playwright harness validates four practical paths:

1. **Desktop free flow**  
   Standard upload -> free download path does not send photo upload payloads.

2. **Desktop AI enhance flow**  
   Upload -> Enhance -> Remove background trigger does not send photo upload payloads.

3. **Desktop Submit Ready gating flow**  
   Upload -> print-ready options -> Submit Ready modal open does not send photo upload payloads.

4. **Mobile guardrail flow**  
   Background removal remains disabled on mobile and no photo upload payloads are sent.

## What Counts As A Privacy Violation

The harness flags requests as violations if any `POST`/`PUT`/`PATCH` looks like image upload, including:

- `multipart/form-data`
- `image/*`
- `application/octet-stream`
- request body containing `data:image/`

If none are detected, tests print:

`[privacy-harness] no privacy violation detected`

## Third-Party Traffic During Tests

To avoid synthetic analytics/payment noise, the harness aborts requests to:

- `plausible.io`
- `*.paddle.com`
- `public.profitwell.com`

This is intentional for test isolation and does not change production behavior.

## Run Locally

From this repository root:

```bash
npm install
npm run playwright:install
PIXPASS_BASE_URL=https://pixpass.app npm run test:privacy
```

## CI Setup

Set a repository variable named `PIXPASS_BASE_URL` (for example `https://pixpass.app`) so GitHub Actions can run the suite.

CI runs in two layers:

- `harness-integrity` (blocking): validates suite integrity/compilation.
- `privacy-harness-prod` (non-blocking): runs against production and publishes report artifacts, even when live-site rendering conditions are transient.

## Scope Notes

What this harness **does** provide:

- Automated evidence for key user-facing flows.
- Regression protection against accidental upload behavior changes.

What this harness **does not** prove by itself:

- It is not a formal security audit.
- It does not model every possible browser extension, MITM setup, or custom runtime.

For strongest trust posture, combine this harness with CSP hardening and public documentation of allowed network behavior.
