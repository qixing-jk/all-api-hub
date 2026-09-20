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
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  closeExtensionViews,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { readVisualThemeRoleColor } from "~~/e2e/utils/visualTheme"

test("theme mode keeps supporting copy close and does not reserve an invisible reset slot", async ({
  context,
  page,
  extensionId,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    themeMode: THEME_MODE.SYSTEM,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  const card = page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_THEME_MODE}`)
  const group = card.getByRole("group")
  await expect(group).toBeVisible()
  const control = card.locator('[data-slot="card-item-control"]')
  await expect
    .configure({ soft: true })
    .poll(async () => {
      const groupBox = (await group.boundingBox())!
      const controlBox = (await control.boundingBox())!
      return controlBox.x + controlBox.width - groupBox.x - groupBox.width
    })
    .toBeLessThanOrEqual(1)
  const description = card.getByText("Choose light, dark, or follow system", {
    exact: true,
  })
  const currentTheme = card.getByText(/^Current:/)
  await expect(async () => {
    const descriptionBox = (await description.boundingBox())!
    const currentBox = (await currentTheme.boundingBox())!
    const gap = currentBox.y - descriptionBox.y - descriptionBox.height
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(4)
  }).toPass({ timeout: 10_000 })
})

for (const width of [1280, 390, 320]) {
  test(`changing text size keeps the appearance drawer bottom aligned at ${width}px`, async ({
    context,
    page,
    extensionId,
  }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
    const appearanceButton = page.getByRole("button", {
      name: "Appearance settings",
    })
    await expect(appearanceButton).toBeInViewport()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)
    await appearanceButton.click()
    const drawer = page.getByRole("dialog", { name: "Appearance settings" })
    for (const name of ["Extra large", "Large", "Default"]) {
      const radio = drawer
        .getByRole("group", { name: "Text size", exact: true })
        .getByRole("radio", { name, exact: true })
      await radio.evaluate((input) => input.scrollIntoView({ block: "start" }))
      await radio.locator("..").click()
      await expect(radio).toBeChecked()
      await expect(drawer.locator('[aria-busy="true"]')).toHaveCount(0)
      await expect(
        drawer.getByRole("heading", { name: "Appearance settings" }),
      ).toBeInViewport()
      await expect
        .poll(async () =>
          drawer.evaluate((el) => {
            const reset = Array.from(el.querySelectorAll("button")).find(
              (button) => button.textContent?.includes("Reset appearance"),
            )!
            const scroller = reset.closest("[aria-busy]")!.parentElement!
            scroller.scrollTop = scroller.scrollHeight
            return Math.abs(
              el.getBoundingClientRect().bottom -
                reset.getBoundingClientRect().bottom,
            )
          }),
        )
        .toBeLessThan(48)
    }
  })
}

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
  // The removed appearance preview was the live sample of the accent and the
  // corner scale. Sample a surviving accent-painted control and a settings card
  // instead: the card's radius comes from the same `--radius-lg` token the
  // reload and reset assertions below rely on.
  const accentSample = page.locator(
    `#${SETTINGS_ANCHORS.APPEARANCE_PRESET} label:has(input[value="${THEME_PRESET.DEFAULT}"]) span.bg-primary.text-primary-foreground`,
  )
  const radiusSample = page
    .locator(`#${SETTINGS_ANCHORS.APPEARANCE_RADIUS}`)
    .locator("xpath=ancestor::*[@data-slot='card'][1]")
  const originalColor = await readVisualThemeRoleColor(page, "--primary")
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
  await expect(radiusSample).toHaveCSS("border-top-left-radius", "0px")
  await expect(accentSample).not.toHaveCSS("background-color", originalColor)
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
  await expect(radiusSample).toHaveCSS("border-top-left-radius", "0px")
  await page
    .locator(`#${SETTINGS_ANCHORS.APPEARANCE_RADIUS}`)
    .getByRole("radio", { name: "Large" })
    .locator("..")
    .click()
  // The card reads the same `--radius-lg` scale the removed preview button drew
  // from `--radius-md`; the exact step is asserted on the theme attribute, so
  // this only needs to prove the rendered corner follows the setting.
  await expect(radiusSample).not.toHaveCSS("border-top-left-radius", "0px")
  // The independent appearance button opens the full panel in place.
  await page.getByRole("button", { name: "Appearance settings" }).click()
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
  for (const width of [1280, 390, 320]) {
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
  await expect(
    page.getByRole("button", { name: "Appearance settings" }),
  ).toBeFocused()
  await closeExtensionViews(context, page)
})
