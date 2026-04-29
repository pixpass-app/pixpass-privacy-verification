# pixpass-privacy-verification

Automated verification that [PixPass](https://pixpass.app) does not upload or transmit photo data during core user flows.

> **The claim being tested:** Photos are processed in-browser. Photo payloads are not sent to any server.

This repository is a **verifiable privacy subset** — not the full product. Anyone can run these tests against the live production site and read the results themselves.

---

## What This Tests

The Playwright harness monitors network traffic during four real user flows and fails if any request matching an image upload signature is detected.

| Flow | What happens |
|---|---|
| **Desktop — free download** | Upload photo → download resized file |
| **Desktop — AI enhance** | Upload → Enhance → Remove background |
| **Desktop — Submit Ready** | Upload → print-ready options → Submit Ready modal |
| **Mobile — background removal** | Verifies feature stays disabled; no upload sent |

A request is flagged as a **privacy violation** if any `POST`, `PUT`, or `PATCH` contains:

- `multipart/form-data`
- `image/*` content type
- `application/octet-stream`
- A body containing `data:image/`

If none are found across all flows, the harness prints:

```
[privacy-harness] no privacy violation detected
```

Full methodology: [`docs/privacy-verification.md`](docs/privacy-verification.md)

---

## Run It Yourself

You do not need a PixPass account. The tests run against the public production site.

```bash
npm install
npm run playwright:install
PIXPASS_BASE_URL=https://pixpass.app npm run test:privacy
```

The harness intercepts and aborts requests to `plausible.io`, `*.paddle.com`, and `public.profitwell.com` during tests. This is intentional test isolation — those services are not relevant to the privacy claim and would add noise to results.

---

## CI

Two jobs run on every push:

- **`harness-integrity`** — blocking. Validates that the test suite compiles and is structurally sound.
- **`privacy-harness-prod`** — non-blocking. Runs the full suite against `https://pixpass.app` and publishes report artifacts regardless of transient rendering conditions.

CI configuration: [`.github/workflows/privacy-harness.yml`](.github/workflows/privacy-harness.yml)

---

## Honest Scope

**What this harness provides:**

- Automated, reproducible evidence for key user-facing flows
- Regression protection — if a future code change accidentally introduces an upload, CI catches it

**What this harness does not prove:**

- It is not a formal security audit
- It does not model every browser extension, MITM setup, or custom runtime

For the strongest possible trust posture, combine this harness with CSP hardening and public documentation of allowed network behavior.

---

## Context

Most passport photo tools upload your image to a remote server for processing. This is how they apply AI enhancement, background removal, and resizing — the model runs on their infrastructure, not yours.

Tools that do process images client-side often still load their AI models from third-party CDNs — jsDelivr, Google CDN, unpkg. That CDN request happens before you touch your photo, and it carries your IP address, timestamp, and device metadata to infrastructure you didn't choose.

PixPass bundles all models locally. No CDN request is made at any point — including during model loading. This repository exists so that claim can be tested, not just read.

---

## License

MIT — run it, fork it, adapt it.
