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
  THEME_RADIUS,
} from "~/constants/theme"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  closeExtensionViews,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"

test("appearance applies across windows, survives reload, and resets", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    themeMode: THEME_MODE.LIGHT,
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  const sidepanel = await context.newPage()
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`,
  )
  // Keep the measured page active so background rendering cannot stall screenshots.
  await page.bringToFront()
  await expect(
    page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_COLOR}`),
  ).toBeVisible()
  const preview = page.getByText("Primary action", { exact: true })
  const originalColor = await preview.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  )
  const primary = page.getByRole("button", { name: "Reset appearance" })
  await page
    .locator(`#${SETTINGS_ANCHORS.APPEARANCE_COLOR}`)
    .getByRole("radio", { name: "Violet" })
    .locator("..")
    .click()
  await expect(popup.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.COLOR,
    THEME_COLOR.VIOLET,
  )
  await page
    .locator(`#${SETTINGS_ANCHORS.APPEARANCE_RADIUS}`)
    .getByRole("radio", { name: "Square" })
    .locator("..")
    .click()
  await expect(primary).toHaveCSS("border-top-left-radius", "0px")
  await expect(preview).not.toHaveCSS("background-color", originalColor)
  await expect(sidepanel.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.COLOR,
    THEME_COLOR.VIOLET,
  )
  await expect(sidepanel.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.RADIUS,
    THEME_RADIUS.NONE,
  )
  await expect(popup.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.RADIUS,
    THEME_RADIUS.NONE,
  )
  await page.reload()
  await expect(
    page
      .locator(`#${SETTINGS_ANCHORS.APPEARANCE_COLOR}`)
      .getByRole("radio", { name: "Violet" }),
  ).toBeChecked()
  await expect(primary).toHaveCSS("border-top-left-radius", "0px")
  await page
    .locator(`#${SETTINGS_ANCHORS.APPEARANCE_RADIUS}`)
    .getByRole("radio", { name: "Large" })
    .locator("..")
    .click()
  await expect(primary).toHaveCSS("border-top-left-radius", "18px")
  // The menu retains quick light/dark changes and opens the full panel in place.
  await page.getByRole("button", { name: /^Current:/ }).click()
  await page.getByRole("menuitem", { name: "Appearance settings" }).click()
  const drawer = page.getByRole("dialog", { name: "Appearance settings" })
  await expect(drawer).toBeVisible()
  await drawer
    .getByRole("radio", { name: "Dark", exact: true })
    .locator("..")
    .click()
  await expect(popup.locator("html")).toHaveClass(/dark/)
  for (const [color, label] of [
    [THEME_COLOR.BLUE, "Blue"],
    [THEME_COLOR.VIOLET, "Violet"],
    [THEME_COLOR.ROSE, "Rose"],
    [THEME_COLOR.ORANGE, "Orange"],
    [THEME_COLOR.GREEN, "Green"],
    [THEME_COLOR.SLATE, "Slate"],
  ] as const) {
    await drawer
      .getByRole("radio", { name: label, exact: true })
      .locator("..")
      .click()
    await expect(page.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.COLOR,
      color,
    )
  }
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(drawer).toBeVisible()
    expect(
      await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`appearance-dark-${width}.png`),
    })
  }
  await drawer.getByRole("button", { name: "Reset appearance" }).click()
  await expect(popup.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.COLOR,
    THEME_COLOR.BLUE,
  )
  await expect(popup.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.RADIUS,
    THEME_RADIUS.DEFAULT,
  )
  await expect(
    drawer.getByRole("radio", { name: "Follow System" }),
  ).toBeChecked()
  await drawer
    .getByRole("radio", { name: "Light", exact: true })
    .locator("..")
    .click()
  await expect(
    drawer.getByRole("radio", { name: "Light", exact: true }),
  ).toBeChecked()
  await page.screenshot({
    path: testInfo.outputPath("appearance-light-390.png"),
  })
  const defaultRadius = drawer
    .getByRole("group", { name: "Corner radius" })
    .getByRole("radio", {
      name: "Default",
      exact: true,
    })
  await defaultRadius.focus()
  await page.keyboard.press("ArrowRight")
  const largeRadius = drawer
    .getByRole("group", { name: "Corner radius" })
    .getByRole("radio", { name: "Large", exact: true })
  await expect(largeRadius).toBeChecked()
  await expect(largeRadius).toBeFocused()
  await expect(sidepanel.locator("html")).toHaveAttribute(
    THEME_ATTRIBUTES.RADIUS,
    THEME_RADIUS.LARGE,
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.keyboard.press("Escape")
  await expect(drawer).not.toBeVisible()
  await expect(page.getByRole("button", { name: /^Current:/ })).toBeFocused()
  await closeExtensionViews(context, page)
})
