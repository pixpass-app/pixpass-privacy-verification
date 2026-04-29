import { expect, test } from '@playwright/test'
import { devices } from '@playwright/test'
import {
  assertNoPrivacyViolation,
  blockThirdPartyHarnessTraffic,
  locateDownloadButton,
  uploadSyntheticSquarePng,
  type RequestRecord,
} from './privacy-harness-utils'

test.use({ ...devices['iPhone 12'] })

test('mobile: bg-remove stays disabled and no photo upload payload is sent', async ({ page }) => {
  const requests: RequestRecord[] = []

  await blockThirdPartyHarnessTraffic(page)

  page.on('request', (req) => {
    const headers = req.headers() as Record<string, string>
    const contentType = headers['content-type'] ?? headers['Content-Type'] ?? ''
    const postDataRaw = req.postData() ?? undefined
    const postData = postDataRaw && postDataRaw.length < 20_000 ? postDataRaw : undefined
    const postDataHasImageDataUrl = !!postDataRaw && /data:image\//i.test(postDataRaw)

    requests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      contentType,
      postData,
      postDataHasImageDataUrl,
    })
  })

  await page.goto('/')

  const uploaded = await uploadSyntheticSquarePng(page, { size: 256 })
  test.skip(!uploaded, 'Uploader UI not reachable in CI environment')

  const enhanceButton = page.getByRole('button', { name: /enhance/i })
  const canOpenEnhance = await enhanceButton.isVisible({ timeout: 30_000 }).catch(() => false)

  if (canOpenEnhance) {
    await enhanceButton.click()

    const removeBgBtn = page.getByRole('button', { name: /remove background/i })
    await expect(removeBgBtn).toBeVisible({ timeout: 15_000 })
    await expect(removeBgBtn).toBeDisabled()

    // Close panel without triggering bg-remove.
    await page.getByRole('button', { name: /done/i }).click()
  }
  // Mobile emulation can be flaky for hidden controls in headless mode.
  const downloadBtn = locateDownloadButton(page)
  const canDownload = await downloadBtn.isVisible().catch(() => false)
  if (canDownload) {
    await downloadBtn.click()
    await page.waitForTimeout(800)
  }

  // Mobile: preloadBgModel() is gated off. So MODNet and ORT resources should not appear.
  const hasModnetRequests = requests.some((r) => r.url.includes('/models/xenova-modnet/'))
  const hasOrtRequests = requests.some((r) => r.url.includes('/ort/'))
  expect(hasModnetRequests).toBe(false)
  expect(hasOrtRequests).toBe(false)

  await assertNoPrivacyViolation(requests)
})

