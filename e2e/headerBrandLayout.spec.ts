import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { forceExtensionLanguage } from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const entrypoint of ["options", "popup", "sidepanel"]) {
  test(`${entrypoint} preserves the logo and hides cramped branding`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await page.goto(`chrome-extension://${extensionId}/${entrypoint}.html`)
    await waitForExtensionRoot(page)
    const header = page.getByRole("banner")
    const logo = header.getByRole("img", { name: "All API Hub", exact: true })
    const name = header.getByText("All API Hub", { exact: true })

    const narrowWidth = entrypoint === "options" ? 320 : 260
    for (const width of [narrowWidth, 320, 390, 1440, narrowWidth]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(logo).toBeVisible()
      await expect(async () => {
        const box = await logo.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.width).toBeGreaterThanOrEqual(28)
        expect(Math.abs(box!.width - box!.height)).toBeLessThan(1)
      }).toPass({ timeout: 3000 })
      if (width === narrowWidth) {
        await expect(name).toBeHidden()
        await expect(header.getByText(/^v\d+\./)).toBeHidden()
      }
      if (width === 1440 && entrypoint !== "popup")
        await expect(name).toBeVisible()
      const overflow = await header.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: testInfo.outputPath(`${entrypoint}-${width}.png`),
      })
    }
  })
}
