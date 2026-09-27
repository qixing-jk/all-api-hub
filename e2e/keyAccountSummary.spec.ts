import { expect, test } from "./fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubNewApiSiteRoutes,
} from "./utils/commonUserFlows"
import { getServiceWorker } from "./utils/extensionState"

test("key account summary folds failures, retains selected accounts, and retries in place", async ({
  context,
  extensionId,
}, testInfo) => {
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    refreshOnOpen: false,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(
    worker,
    ["Healthy", "Failed"].map((name, index) =>
      createStoredAccount({
        id: `summary-${index}`,
        site_name: `${name} account`,
        site_url: `https://summary-${index}.example.com`,
      }),
    ),
  )
  for (const index of [0, 1])
    await stubNewApiSiteRoutes(context, {
      baseUrl: `https://summary-${index}.example.com`,
      initialTokens: [],
    })
  let shouldFail = true
  let releaseRetry: (() => void) | undefined
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve
  })
  await context.route(
    "https://summary-1.example.com/api/token/**",
    async (route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "Unable to load keys",
          }),
        })
      } else {
        await retryGate
        await route.fallback()
      }
    },
  )
  const page = await context.newPage()
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.goto(
    `chrome-extension://${extensionId}/options.html#keys?accountId=all`,
  )
  const summary = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText("Accounts overview", { exact: true }) })
  const toggle = summary.getByRole("button", { name: "Keys unavailable · 1" })
  await expect(toggle).toBeVisible()
  await expect(
    summary.getByRole("button", { name: /Failed account/ }),
  ).toHaveCount(0)
  await expect(
    summary.getByRole("button", { name: /Healthy account.*0 keys/ }),
  ).toBeVisible()
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(toggle).toBeVisible()
    await toggle.click()
    const failed = summary.getByRole("button", { name: /Failed account/ })
    await expect(failed).toBeVisible()
    const bounds = await summary.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(
      await summary.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`key-summary-${width}.png`),
      fullPage: true,
    })
    await toggle.click()
  }
  await toggle.click()
  await summary.getByRole("button", { name: /Failed account/ }).click()
  await expect(toggle).toHaveCount(0)
  await expect(
    summary.getByRole("button", { name: /Failed account/ }),
  ).toHaveAttribute("aria-pressed", "true")
  shouldFail = false
  await summary.getByRole("button", { name: "Retry failed" }).click()
  await expect(
    summary.getByRole("button", { name: /Failed account.*loading/ }),
  ).toBeVisible()
  releaseRetry!()
  await expect(
    summary.getByRole("button", { name: /Failed account.*0 keys/ }),
  ).toBeVisible()
  await expect(
    summary.getByRole("button", { name: "Retry failed" }),
  ).toHaveCount(0)
})
