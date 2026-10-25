import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { forceExtensionLanguage } from "~~/e2e/utils/commonUserFlows"
import { expectCornerShape } from "~~/e2e/utils/cornerShape"

test("tooltip follows theme radius, density and colors", async ({
  page,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await page.setViewportSize({ width: 480, height: 720 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15000 })
  const anchor = page.getByRole("button", { name: "Settings", exact: true })
  await anchor.focus()
  const tooltip = page.getByRole("tooltip", { name: "Settings", exact: true })
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveCSS("opacity", "0.9")
  const arrow = tooltip.locator(".react-tooltip-arrow")
  await expect(arrow).toHaveCSS("width", "8px")
  await expect(arrow).toHaveCSS("height", "8px")
  await page.screenshot({
    path: testInfo.outputPath("tooltip-initial.png"),
    animations: "disabled",
  })
  for (const [radius, expected] of [
    ["none", "0px"],
    ["small", "5px"],
    ["default", "10px"],
    ["large", "15px"],
  ] as const) {
    await page
      .locator("html")
      .evaluate(
        (element, value) => element.setAttribute("data-theme-radius", value),
        radius,
      )
    await expect(tooltip).toHaveCSS("border-top-left-radius", expected)
  }
  await expectCornerShape(tooltip, "superellipse(1.5)")
  await expect(tooltip).toHaveCSS("padding-left", "12px")
  await expect(tooltip).toHaveCSS("font-size", "12px")
  for (const [density, expected] of [
    ["compact", "6px"],
    ["comfortable", "10px"],
  ] as const) {
    await page
      .locator("html")
      .evaluate(
        (element, value) => element.setAttribute("data-theme-density", value),
        density,
      )
    await expect(tooltip).toHaveCSS("padding-top", expected)
  }
  const lightBackground = await tooltip.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )
  await page
    .locator("html")
    .evaluate((element) => element.classList.add("dark"))
  await expect(tooltip).not.toHaveCSS("background-color", lightBackground)
  await page.screenshot({
    path: testInfo.outputPath("tooltip-dark.png"),
    animations: "disabled",
  })
})
