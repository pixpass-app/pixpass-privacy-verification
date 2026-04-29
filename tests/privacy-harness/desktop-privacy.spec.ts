import { expect, test } from '@playwright/test'
import {
  assertNoPrivacyViolation,
  blockThirdPartyHarnessTraffic,
  locateDownloadButton,
  uploadSyntheticSquarePng,
  type RequestRecord,
} from './privacy-harness-utils'

test('desktop: enhance bg-remove trigger has no photo upload payload', async ({ page }) => {
  test.setTimeout(90_000)
  page.setDefaultTimeout(20_000)
  page.setDefaultNavigationTimeout(30_000)
  const requests: RequestRecord[] = []

  page.on('request', (req) => {
    const method = req.method()
    const headers = req.headers() as Record<string, string>
    const contentType =
      headers['content-type'] ?? headers['Content-Type'] ?? ''
    const postDataRaw =
      ['POST', 'PUT', 'PATCH'].includes(method)
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

  return (async () => {
    await blockThirdPartyHarnessTraffic(page)
    await page.goto('/')

    const uploaded = await uploadSyntheticSquarePng(page, { size: 256 })
    test.skip(!uploaded, 'Uploader UI not reachable in CI environment')

    await expect(page.getByRole('button', { name: 'Enhance' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Enhance' }).click()

    const removeBgBtn = page.getByRole('button', { name: 'Remove background' })
    await expect(removeBgBtn).toBeVisible({ timeout: 10_000 })
    // Focus the assertion on the exact bg-remove trigger window.
    requests.length = 0
    await removeBgBtn.click()
    // Don't wait for full processing completion (can be slow/flaky).
    // The privacy question is about whether photo bytes are uploaded right
    // when the pipeline is triggered.
    await page.waitForTimeout(1_500)

    await assertNoPrivacyViolation(requests)
  })()
})

test('desktop: free download flow has no photo upload payload', async ({ page }) => {
  test.setTimeout(90_000)
  page.setDefaultTimeout(20_000)
  page.setDefaultNavigationTimeout(30_000)
  const requests: RequestRecord[] = []

  page.on('request', (req) => {
    const method = req.method()
    const headers = req.headers() as Record<string, string>
    const contentType =
      headers['content-type'] ?? headers['Content-Type'] ?? ''
    const postDataRaw =
      ['POST', 'PUT', 'PATCH'].includes(method)
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
  await page.goto('/')
  const uploaded = await uploadSyntheticSquarePng(page, { size: 256 })
  test.skip(!uploaded, 'Uploader UI not reachable in CI environment')

  // Wait for free-tools panel to be ready, then trigger standard free export.
  await expect(page.getByRole('button', { name: 'Enhance' })).toBeVisible({ timeout: 15_000 })
  requests.length = 0
  await locateDownloadButton(page).click()
  await page.waitForTimeout(800)

  await assertNoPrivacyViolation(requests)
})

test('desktop: submit-ready gating flow has no photo upload payload', async ({ page }) => {
  test.setTimeout(90_000)
  page.setDefaultTimeout(20_000)
  page.setDefaultNavigationTimeout(30_000)
  const requests: RequestRecord[] = []

  page.on('request', (req) => {
    const method = req.method()
    const headers = req.headers() as Record<string, string>
    const contentType =
      headers['content-type'] ?? headers['Content-Type'] ?? ''
    const postDataRaw =
      ['POST', 'PUT', 'PATCH'].includes(method)
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
  await page.goto('/')
  const uploaded = await uploadSyntheticSquarePng(page, { size: 256 })
  test.skip(!uploaded, 'Uploader UI not reachable in CI environment')

  // Move into "print-ready" state so the Submit Ready CTA is enabled.
  await expect(page.getByRole('button', { name: 'Enhance' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '300' }).first().click()

  requests.length = 0
  await page.getByRole('button', { name: 'Submit Ready' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(800)

  await assertNoPrivacyViolation(requests)
})

