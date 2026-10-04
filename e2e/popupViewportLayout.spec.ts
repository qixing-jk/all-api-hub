import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const devices = [
  {
    name: "Android tablet",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 EdgA/130.0.0.0",
    mobileHint: false,
    touchPoints: 5,
  },
  {
    name: "iPad",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1",
    mobileHint: null,
    touchPoints: 5,
  },
  {
    name: "Android phone",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
    mobileHint: true,
    touchPoints: 5,
  },
]

test.beforeEach(async ({ page, context }) => {
  installExtensionPageGuards(page)
  await stubLlmMetadataIndex(context)
})

for (const device of devices) {
  for (const surface of ["popup", "sidepanel"]) {
    test(`${surface} fills the available viewport on ${device.name}`, async ({
      page,
      extensionId,
    }) => {
      await page.addInitScript((profile) => {
        Object.defineProperties(navigator, {
          userAgent: { get: () => profile.userAgent },
          userAgentData: { get: () => ({ mobile: profile.mobileHint }) },
          maxTouchPoints: { get: () => profile.touchPoints },
        })
      }, device)
      await page.setViewportSize({ width: 820, height: 1180 })
      await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
      await waitForExtensionRoot(page)
      const container = page.getByTestId(POPUP_TEST_IDS.scrollContainer)
      await expect(container).toBeVisible()
      await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
      for (const viewport of [
        { width: 820, height: 1180 },
        { width: 1180, height: 820 },
        { width: 390, height: 700 },
      ]) {
        await page.setViewportSize(viewport)
        await expect
          .poll(async () => {
            const box = await container.boundingBox()
            return box ? Math.round(box.width) : 0
          })
          .toBe(viewport.width)
        await expect
          .poll(async () => {
            const box = await container.boundingBox()
            return box ? Math.round(box.height) : 0
          })
          .toBeGreaterThanOrEqual(viewport.height)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true)
      }
    })
  }
}

for (const surface of ["popup", "sidepanel"]) {
  test(`preserves desktop ${surface} sizing`, async ({ page, extensionId }) => {
    await page.setViewportSize({ width: 820, height: 1180 })
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
    await waitForExtensionRoot(page)
    const container = page.getByTestId(POPUP_TEST_IDS.scrollContainer)
    await expect(container).toBeVisible()
    await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
    await expect
      .poll(async () => {
        const box = await container.boundingBox()
        return (
          box && {
            width: Math.round(box.width),
            height: Math.round(box.height),
          }
        )
      })
      .toEqual(
        surface === "popup"
          ? { width: 410, height: 600 }
          : { width: 820, height: 1180 },
      )
  })
}
