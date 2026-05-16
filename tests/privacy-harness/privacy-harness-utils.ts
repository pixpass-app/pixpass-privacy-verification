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

function presetSearchInput(page: any) {
  return page.locator('main').getByPlaceholder('Search by country or document type…')
}

/** Baby Mode — pick age band (default: infant). */
export async function selectBabyAge(page: any, age: 'newborn' | 'infant' | 'toddler' = 'infant') {
  const labels: Record<typeof age, RegExp> = {
    newborn: /Newborn \(0[–-]1 month\)/i,
    infant: /Infant \(1[–-]12 months\)/i,
    toddler: /Toddler \(1[–-]3 years\)/i,
  }
  await expect(page.getByRole('heading', { name: /Baby & infant photos/i })).toBeVisible({
    timeout: 45_000,
  })

  const ageButton = page.getByRole('button', { name: labels[age] })
  await expect(ageButton).toBeVisible({ timeout: 45_000 })
  await ageButton.click()

  // Prod can hydrate after domcontentloaded; preset search stays disabled until age state commits.
  const search = presetSearchInput(page)
  const enabled = await expect(search).toBeEnabled({ timeout: 8_000 }).then(() => true).catch(() => false)
  if (!enabled) {
    await ageButton.click()
    await expect(search).toBeEnabled({ timeout: 45_000 })
  }
}

/** Open PresetSearchBar and pick the first listed preset. */
export async function selectPresetFromSearchBar(page: any) {
  const acceptButtons = page.getByRole('button', {
    name: /accept|agree|allow all|ok|got it/i,
  })
  if (await acceptButtons.count()) {
    await acceptButtons.first().click().catch(() => {})
  }

  const search = presetSearchInput(page)
  await expect(search).toBeEnabled({ timeout: 30_000 })
  await search.click()
  const option = page.locator('ul li button').filter({
    has: page.locator('span.font-medium'),
  }).first()
  await expect(option).toBeVisible({ timeout: 15_000 })
  await option.click({ force: true })
}

/** Baby Mode — open preset search and pick first result (after age is selected). */
export async function selectBabyPreset(page: any) {
  await selectPresetFromSearchBar(page)
  await expect(page.getByText('Drop or click to begin')).toBeVisible({ timeout: 30_000 })
}

/** Main tool — pick a square-friendly preset (US passport is first in the list). */
export async function selectHomePreset(page: any) {
  await selectPresetFromSearchBar(page)
  await expect(page.getByText('Drop or click to begin')).toBeVisible({ timeout: 30_000 })
}

/** @deprecated Use selectHomePreset or selectPresetFromSearchBar */
export async function selectFirstPreset(page: any) {
  await selectHomePreset(page)
}

export function aiEnhanceButton(page: any) {
  return page.getByRole('button', { name: /AI Enhance/i })
}

/** Preset → upload → crop (if needed) → resize panel with free tools. */
export async function prepareMainToolDesktop(page: any, { size = 256 }: { size?: number } = {}) {
  await selectHomePreset(page)
  const uploaded = await uploadSyntheticSquarePng(page, { size })
  if (!uploaded) return false

  const continueBtn = page.getByRole('button', { name: 'Continue' })
  if (await continueBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await continueBtn.click()
  }

  await expect(aiEnhanceButton(page)).toBeVisible({ timeout: 45_000 })
  return true
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
    .locator(
      '[data-testid="dropzone"], [ondrop], div:has-text("Drop or click to begin"), div:has-text("click to upload"), div:has-text("Drop your photo")',
    )
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

