import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { THEME_CONTENT_WIDTH } from "~/constants/theme"
import { OPTIONS_TEST_IDS } from "~/entrypoints/options/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("sidebar collapse and content width survive reload and reset", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  const card = page.getByTestId(OPTIONS_TEST_IDS.contentCard)
  await expect(card).toBeVisible()
  const sidebar = page.getByRole("complementary")
  const collapse = page.getByRole("button", {
    name: "Collapse sidebar",
    exact: true,
  })
  await expect
    .poll(async () => {
      const box = await collapse.boundingBox()
      return Math.abs(box!.y + box!.height / 2 - 540)
    })
    .toBeLessThan(2)
  await expect
    .poll(async () => {
      const buttonBox = await collapse.boundingBox()
      const sidebarBox = await sidebar.boundingBox()
      return Math.abs(
        buttonBox!.x + buttonBox!.width / 2 - sidebarBox!.x - sidebarBox!.width,
      )
    })
    .toBeLessThan(2)
  const centeredWidth = await card.evaluate(
    (el) => el.getBoundingClientRect().width,
  )
  const widthControl = page.locator(
    `#${SETTINGS_ANCHORS.APPEARANCE_CONTENT_WIDTH}`,
  )
  await widthControl
    .getByRole("radio", { name: "Full width", exact: true })
    .locator("..")
    .click()
  await expect
    .poll(() => card.evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(centeredWidth + 100)
  // Choosing the setting scrolls the document; the edge control stays centered.
  await expect
    .poll(async () => {
      const box = await collapse.boundingBox()
      return Math.abs(box!.y + box!.height / 2 - 540)
    })
    .toBeLessThan(2)
  await collapse.focus()
  await page.keyboard.press("Enter")
  const expand = page.getByRole("button", {
    name: "Expand sidebar",
    exact: true,
  })
  await expect(expand).toBeEnabled()
  await expect(expand).toBeFocused()
  await page.reload()
  await expect(expand).toBeVisible()
  await expect
    .poll(async () => {
      const box = await expand.boundingBox()
      return Math.abs(box!.x + box!.width / 2 - 64)
    })
    .toBeLessThan(2)
  await expect(
    widthControl.getByRole("radio", { name: "Full width", exact: true }),
  ).toBeChecked()
  await expect
    .poll(() => card.evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(centeredWidth + 100)
  await expand.click()
  await expect(
    page.getByRole("button", { name: "Collapse sidebar", exact: true }),
  ).toBeEnabled()
  await expect
    .poll(() =>
      page
        .getByRole("complementary")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBe(240)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath("sidebar-expanded.png") })
  await widthControl.getByRole("button", { name: /Content width/ }).click()
  await expect(
    widthControl.getByRole("radio", { name: "Centered", exact: true }),
  ).toBeChecked()
  await expect
    .poll(() => card.evaluate((el) => el.getBoundingClientRect().width))
    .toBe(centeredWidth)
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click()
  await expect(expand).toBeEnabled()
  await expect
    .poll(() =>
      page
        .getByRole("complementary")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBe(64)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath("sidebar-collapsed.png") })
})

for (const width of [320, 390]) {
  test(`mobile navigation stays expanded with saved desktop collapse at ${width}px`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await seedUserPreferences(await getServiceWorker(context), {
      themeMode: "dark",
      appearance: {
        sidebarCollapsed: true,
        contentWidth: THEME_CONTENT_WIDTH.FULL,
        textSize: "extra-large",
        density: "compact",
      },
    })
    await page.setViewportSize({ width, height: 844 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
    )
    await page.getByRole("button", { name: "Toggle menu", exact: true }).click()
    const sidebar = page.getByRole("complementary")
    const nav = sidebar.getByRole("navigation")
    await expect
      .poll(() => sidebar.evaluate((el) => el.getBoundingClientRect().width))
      .toBe(256)
    await expect(
      sidebar.getByRole("button", { name: "Close", exact: true }),
    ).toBeVisible()
    await expect(
      nav.getByRole("button", { name: "Overview", exact: true }),
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)
    for (const item of await nav.getByRole("button").all()) {
      expect(
        await item.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    }
    await page.screenshot({
      path: testInfo.outputPath(`sidebar-${width}-dark.png`),
    })
    await nav.getByRole("button", { name: "Overview", exact: true }).click()
    await expect(page).toHaveURL(/#overview/)
    await expect(sidebar).not.toBeInViewport()
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(
      page.getByRole("button", { name: "Expand sidebar", exact: true }),
    ).toBeVisible()
  })
}
