import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  THEME_ATTRIBUTES,
  THEME_COLOR,
  THEME_MODE,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  MIN_CONTRAST_RATIO,
  readColorContrast,
} from "~~/e2e/utils/colorContrast"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  closeExtensionViews,
  getServiceWorker,
  getStoredUserPreferences,
} from "~~/e2e/utils/extensionState"

test("Anthropic supplies complete light/dark palettes and restores the user's default theme", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    themeMode: THEME_MODE.LIGHT,
    appearance: {
      preset: THEME_PRESET.DEFAULT,
      color: THEME_COLOR.VIOLET,
      radius: THEME_RADIUS.LARGE,
    },
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  const presetGroup = page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_PRESET}`)
  await expect(presetGroup).toBeVisible()
  const originalBackground = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  const primaryAction = page.getByText("Primary action", { exact: true })
  const originalAccent = await primaryAction.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  )
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  const sidepanel = await context.newPage()
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`,
  )
  // Keep the settings tab active while measuring responsive screenshots.
  // Older Chromium can throttle rendering behind the popup/sidepanel tabs.
  await page.bringToFront()
  await presetGroup
    .getByRole("radio", { name: "Anthropic", exact: true })
    .locator("..")
    .click()
  for (const view of [page, popup, sidepanel]) {
    await expect(view.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
    await expect(view.locator("body")).toHaveCSS(
      "background-color",
      "rgb(250, 249, 245)",
    )
    await expect(view.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.RADIUS,
      THEME_RADIUS.LARGE,
    )
  }
  await page.reload()
  await expect(
    presetGroup.getByRole("radio", { name: "Anthropic", exact: true }),
  ).toBeChecked()
  await page.getByRole("button", { name: "Appearance settings" }).click()
  const drawer = page.getByRole("dialog", { name: "Appearance settings" })
  for (const mode of ["Light", "Dark", "Follow system"] as const) {
    if (mode === "Follow system")
      await page.emulateMedia({ colorScheme: THEME_MODE.DARK })
    await drawer
      .getByRole("radio", { name: mode, exact: true })
      .locator("..")
      .click()
    const dark = mode !== "Light"
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      dark ? "rgb(36, 35, 32)" : "rgb(250, 249, 245)",
    )
    await expect(drawer).toHaveCSS(
      "background-color",
      dark ? "rgb(53, 50, 45)" : "rgb(255, 253, 247)",
    )
    await expect(page.locator("aside div.bg-sidebar")).toHaveCSS(
      "background-color",
      dark ? "rgb(32, 31, 28)" : "rgb(238, 235, 226)",
    )
    // Readability is checked against actual browser-resolved foreground/background pairs.
    // The complete preview lives on the settings page; the drawer has option previews.
    for (const sample of [
      primaryAction,
      drawer.getByRole("heading", { name: "Appearance settings", exact: true }),
    ]) {
      const contrast = await readColorContrast(sample)
      expect(contrast.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
    }
    if (mode !== "Follow system") {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(drawer).toBeVisible()
        expect(
          await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true)
        await page.screenshot({
          animations: "disabled",
          path: testInfo.outputPath(
            `anthropic-${mode.toLowerCase()}-${width}.png`,
          ),
        })
      }
      await page.setViewportSize({ width: 1280, height: 900 })
    }
    if (mode === "Dark") {
      for (const view of [popup, sidepanel])
        await expect(view.locator("body")).toHaveCSS(
          "background-color",
          "rgb(36, 35, 32)",
        )
    }
  }
  await page.emulateMedia({ colorScheme: THEME_MODE.LIGHT })
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(250, 249, 245)",
  )
  await drawer
    .getByRole("radio", { name: "Default theme", exact: true })
    .locator("..")
    .click()
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    originalBackground,
  )
  await expect(primaryAction).toHaveCSS("background-color", originalAccent)
  await expect(
    drawer.getByRole("radio", { name: "Violet", exact: true }),
  ).toBeChecked()
  await expect(
    drawer
      .getByRole("group", { name: "Corner radius", exact: true })
      .getByRole("radio", { name: "Large", exact: true }),
  ).toBeChecked()
  await expect
    .poll(async () => (await getStoredUserPreferences(worker)).appearance)
    .toEqual({
      preset: "default",
      color: "violet",
      radius: "large",
      density: "default",
      textSize: "default",
      fontFamily: "default",
      contentWidth: "centered",
      sidebarCollapsed: false,
    })
  await expect(popup.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.PRESET,
    THEME_PRESET.DEFAULT,
  )
  await closeExtensionViews(context, page)
})
