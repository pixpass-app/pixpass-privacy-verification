import { expect, test } from '@playwright/test'
import {
  aiEnhanceButton,
  assertNoPrivacyViolation,
  blockThirdPartyHarnessTraffic,
  selectBabyAge,
  selectBabyPreset,
  uploadSyntheticSquarePng,
  type RequestRecord,
} from './privacy-harness-utils'

test('desktop: baby mode upload and bridge to main tool has no photo upload payload', async ({
  page,
}) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(20_000)
  page.setDefaultNavigationTimeout(45_000)

  const requests: RequestRecord[] = []

  page.on('request', (req) => {
    const method = req.method()
    const headers = req.headers() as Record<string, string>
    const contentType = headers['content-type'] ?? headers['Content-Type'] ?? ''
    const postDataRaw = ['POST', 'PUT', 'PATCH'].includes(method)
      ? req.postData() ?? undefined
      : undefined
    const postData = postDataRaw && postDataRaw.length < 20_000 ? postDataRaw : undefined
    const postDataHasImageDataUrl = !!postDataRaw && /data:image\//i.test(postDataRaw)

    requests.push({
      url: req.url(),
      method,
      resourceType: req.resourceType(),
      contentType,
      postData,
      postDataHasImageDataUrl,
    })
  })

  await blockThirdPartyHarnessTraffic(page)
  await page.goto('/baby', { waitUntil: 'load' })

  const onBabyPage = await page
    .getByRole('heading', { name: /Baby & infant photos/i })
    .isVisible({ timeout: 45_000 })
    .catch(() => false)
  test.skip(!onBabyPage, 'Baby Mode page not available at PIXPASS_BASE_URL')

  await selectBabyAge(page)
  await selectBabyPreset(page)

  // Measure only the upload + IndexedDB bridge + navigation to the main tool.
  requests.length = 0

  const uploaded = await uploadSyntheticSquarePng(page, { size: 256 })
  test.skip(!uploaded, 'Baby Mode uploader not reachable in CI environment')

  await page.waitForURL(
    (url) => {
      const p = url.pathname
      return p === '/' || p === ''
    },
    { timeout: 45_000 },
  )

  await expect(aiEnhanceButton(page)).toBeVisible({ timeout: 45_000 })
  await page.waitForTimeout(1_000)

  await assertNoPrivacyViolation(requests)
})
