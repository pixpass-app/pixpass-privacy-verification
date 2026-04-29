# pixpass-privacy-verification

This repository is a verifiable privacy/reference subset, not the full product.

## Privacy Verification

Automated privacy checks are run by the Playwright harness and in CI.

- Local run:
  - `npm install`
  - `npm run playwright:install`
  - `PIXPASS_BASE_URL=https://pixpass.app npm run test:privacy`
- CI workflow: `.github/workflows/privacy-harness.yml`
- CI design:
  - `harness-integrity` is blocking (suite integrity/compilation check)
  - `privacy-harness-prod` runs against production and is non-blocking (reports + artifacts)
- Full details: `docs/privacy-verification.md`
