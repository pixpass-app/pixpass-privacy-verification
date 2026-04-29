import { expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const baseURL = process.env.PIXPASS_BASE_URL ?? 'http://localhost:3000'
const baseHost = new URL(baseURL).hostname
const selfHosts = new Set([baseHost, 'localhost', '127.0.0.1'])

export function isAllowedExternalHost(hostname: string): boolean {
  // Mirrors your CSP allowlist intentions:
  // - Plausible: https://plausible.io
  // - Paddle: https://*.paddle.com (and checkout iframe)
  // - ProfitWell: https://public.profitwell.com
  return (
    hostname === 'plausible.io' ||
    hostname === 'public.profitwell.com' ||
    hostname.endsWith('.paddle.com')
  )
}

export type RequestRecord = {
  url: string
  method: string
  resourceType: string
  contentType: string
  postData?: string
  postDataHasImageDataUrl: boolean
}

export function classifyContentType(headers: Record<string, string>): string {
  return headers['content-type'] ?? headers['Content-Type'] ?? ''
}

export async function blockThirdPartyHarnessTraffic(page: any) {
  // Avoid generating synthetic analytics/payment traffic during harness runs.
  // This keeps privacy tests deterministic and prevents noise in dashboards.
  await page.route('https://plausible.io/**', (route: any) => route.abort())
  await page.route('https://*.paddle.com/**', (route: any) => route.abort())
  await page.route('https://public.profitwell.com/**', (route: any) => route.abort())
}

export async function selectFirstPreset(page: any) {
  // Best-effort: close common cookie/consent banners if present.
  const acceptButtons = page.getByRole('button', {
    name: /accept|agree|allow all|ok|got it/i,
  })
  if (await acceptButtons.count()) {
    await acceptButtons.first().click().catch(() => {})
  }

  const presetControl = page
    .locator(
      'input[role="combobox"], input[type="search"], input[placeholder], [role="combobox"], button[aria-haspopup="listbox"]',
    )
    .first()

  // Some deployments already land with a default preset selected.
  // If there is no selectable control, continue with that default.
  if (!(await presetControl.count())) return

  await presetControl.click({ timeout: 8_000 }).catch(() => {})

  const firstPreset = page
    .locator(
      'ul li > button, [role="listbox"] [role="option"], [data-radix-popper-content-wrapper] button',
    )
    .first()
  if (await firstPreset.count()) {
    await firstPreset.click({ timeout: 8_000 }).catch(() => {})
  }
}

export async function uploadSyntheticSquarePng(page: any, { size = 256 }: { size?: number } = {}): Promise<boolean> {
  const dataUrl = await page.evaluate(({ size: canvasSize }: { size: number }) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvasSize
    canvas.height = canvasSize

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas not available')

    // Simple high-contrast synthetic image. No face required for crop/preview.
    ctx.fillStyle = 'rgb(255,255,255)'
    ctx.fillRect(0, 0, canvasSize, canvasSize)
    ctx.fillStyle = 'rgb(20,20,20)'
    ctx.fillRect(
      Math.floor(canvasSize * 0.1),
      Math.floor(canvasSize * 0.15),
      Math.floor(canvasSize * 0.8),
      Math.floor(canvasSize * 0.7),
    )

    return canvas.toDataURL('image/png')
  }, { size })

  const base64 = dataUrl.split(',')[1] ?? ''
  const bytes = Buffer.from(base64, 'base64')

  const outDir = path.join(process.cwd(), 'tests/privacy-harness/.tmp')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `synthetic-${size}.png`)
  fs.writeFileSync(outPath, bytes)

  // Prefer direct input when present.
  const inputLocator = page.locator('input[type="file"][accept], input[type="file"], input[accept*="image"]')
  if (await inputLocator.count()) {
    await inputLocator.first().setInputFiles(outPath, { timeout: 8_000 }).catch(() => {})
    return true
  }

  // Otherwise try real uploader path via file chooser.
  const dropZone = page
    .locator('[data-testid="dropzone"], [ondrop], div:has-text("click to upload"), div:has-text("Drop your photo")')
    .first()
  if (await dropZone.count()) {
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(() => null)
    await dropZone.click({ timeout: 5_000 }).catch(() => {})
    const chooser = await chooserPromise
    if (chooser) {
      await chooser.setFiles(outPath).catch(() => {})
      return true
    }
  }

  return false
}

export function locateDownloadButton(page: any) {
  // In the free panel: "Download" button containing a span "96 DPI · JPEG"
  return page.getByText(/96 DPI\s*·\s*JPEG/i).locator('xpath=ancestor::button[1]')
}

export async function assertNoPrivacyViolation(requests: RequestRecord[]) {
  const violations: string[] = []

  for (const r of requests) {
    const url = new URL(r.url)
    const external = !selfHosts.has(url.hostname)

    // 1) Allowlist checks (best-effort; still focus on content-type/body for "photo upload").
    if (
      external &&
      (r.resourceType === 'xhr' || r.resourceType === 'fetch' || r.method !== 'GET')
    ) {
      if (!isAllowedExternalHost(url.hostname)) {
        violations.push(`Disallowed external host: ${url.hostname} (${r.method} ${url.pathname})`)
      }
    }

    if (['POST', 'PUT', 'PATCH'].includes(r.method)) {
      const ct = r.contentType.toLowerCase()

      const looksLikeBinaryPhotoUpload =
        ct.includes('multipart/form-data') ||
        ct.startsWith('image/') ||
        ct.includes('application/octet-stream')

      if (looksLikeBinaryPhotoUpload) {
        violations.push(
          `POST looks like image upload: content-type=${r.contentType} url=${url.pathname}`,
        )
      }

      if (r.postDataHasImageDataUrl) {
        violations.push(`POST body contains data:image/* base64 url=${url.pathname}`)
      }
    }
  }

  expect(violations, violations.length ? violations.join('\n') : undefined).toHaveLength(0)
  console.info('[privacy-harness] no privacy violation detected')
}

