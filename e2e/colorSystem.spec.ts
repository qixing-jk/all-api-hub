import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { THEME_ATTRIBUTES, THEME_COLOR, THEME_MODE } from "~/constants/theme"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("custom color roles reach page content, controls and portals in both modes", async ({
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
  await expect(
    page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_COLOR}`),
  ).toBeVisible()
  // Content-script roots resolve aliases locally, even under a differently themed host.
  await page.evaluate(
    ({ attributes, color, darkClass }) => {
      const scope = document.createElement("div")
      scope.setAttribute(attributes.COLOR_SCOPE, "")
      scope.setAttribute(attributes.COLOR, color)
      scope.className = darkClass
      scope.id = "content-color-scope-probe"
      const surface = document.createElement("div")
      surface.className = "bg-popover text-popover-foreground"
      scope.append(surface)
      document.body.append(scope)
    },
    {
      attributes: THEME_ATTRIBUTES,
      color: THEME_COLOR.GREEN,
      darkClass: THEME_MODE.DARK,
    },
  )
  const scopedSurface = page.locator("#content-color-scope-probe > div")
  await expect(scopedSurface).toHaveCSS("background-color", "rgb(30, 41, 59)")
  await expect(scopedSurface).toHaveCSS("color", "rgb(241, 245, 249)")
  await page
    .locator("#content-color-scope-probe")
    .evaluate((element) => element.remove())
  for (const dark of [false, true]) {
    await page.evaluate(
      ({ darkClass, enabled }) => {
        document.documentElement.classList.toggle(darkClass, enabled)
        for (const [role, color] of Object.entries({
          background: "#f1e4d3",
          foreground: "#253841",
          card: "#f7edde",
          popover: "#e2efdc",
          "popover-foreground": "#23452d",
          sidebar: "#e4def0",
          border: "#896249",
          primary: "#873fa0",
          "primary-foreground": "#fff2cf",
        }))
          document.documentElement.style.setProperty(`--${role}`, color)
      },
      { darkClass: THEME_MODE.DARK, enabled: dark },
    )
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(241, 228, 211)",
    )
    await expect(page.locator("body")).toHaveCSS("color", "rgb(37, 56, 65)")
    await expect(page.locator("aside div.bg-sidebar")).toHaveCSS(
      "background-color",
      "rgb(228, 222, 240)",
    )
    const preview = page.getByText("Primary action", { exact: true })
    await expect(preview).toHaveCSS("background-color", "rgb(135, 63, 160)")
    await expect(preview).toHaveCSS("color", "rgb(255, 242, 207)")
    const outline = page.getByText("Secondary action", { exact: true })
    await expect(outline).toHaveCSS("background-color", "rgb(247, 237, 222)")
    await expect(outline).toHaveCSS("border-top-color", "rgb(137, 98, 73)")
    await page.getByRole("button", { name: /^Current:/ }).click()
    await expect(page.getByRole("menu")).toHaveCSS(
      "background-color",
      "rgb(226, 239, 220)",
    )
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Appearance settings" }).click()
    const drawer = page.getByRole("dialog", { name: "Appearance settings" })
    await expect(drawer).toHaveCSS("background-color", "rgb(226, 239, 220)")
    await expect(drawer).toHaveCSS("color", "rgb(35, 69, 45)")
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`custom-colors-${dark}.png`),
    })
    await page.keyboard.press("Escape")
    await expect(drawer).not.toBeVisible()
    await page.evaluate((id) => {
      location.hash = id
    }, MENU_ITEM_IDS.ACCOUNT)
    const button = page.getByRole("button", {
      name: "Add Account",
      exact: true,
    })
    await expect(button).toHaveCSS("background-color", "rgb(135, 63, 160)")
    await expect(button).toHaveCSS("color", "rgb(255, 242, 207)")
    await page.evaluate((id) => {
      location.hash = id
    }, MENU_ITEM_IDS.BASIC)
    await expect(
      page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_COLOR}`),
    ).toBeVisible()
  }
})
