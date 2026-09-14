import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredBookmark,
  forceExtensionLanguage,
  seedStoredBookmarks,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { expectCornerShape } from "~~/e2e/utils/cornerShape"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { setVisualDarkMode } from "~~/e2e/utils/visualTheme"

test.beforeEach(async ({ context, page }) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    themeMode: "light",
    currencyType: "USD",
  })
})

test("responsive finite radii restore continuous shaping after rounded-full", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  // Exercise the shared stylesheet independently of a particular component.
  // Both utilities are used by production controls and included in the build.
  await page.evaluate(() => {
    const button = document.createElement("button")
    button.textContent = "Responsive corner probe"
    button.className = "rounded-full sm:rounded-sm"
    document.body.append(button)
  })
  const button = page.getByRole("button", { name: "Responsive corner probe" })
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(button).toHaveCSS("border-top-left-radius", "9999px")
  await expectCornerShape(button, "round")
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(button).toHaveCSS("border-top-left-radius", "10px")
  await expectCornerShape(button, "superellipse(1.5)")
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(button).toHaveCSS("border-top-left-radius", "9999px")
  await expectCornerShape(button, "round")
})

test("overview edge focus rings follow the responsive card perimeter", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  const summary = page.getByTestId("options-overview-status-summary")
  const cells = summary.locator(":scope > div > *")
  await expect(cells).toHaveCount(4)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const dark of [false, true]) {
      await setVisualDarkMode(page, dark)
      await expect(cells.first()).toHaveCSS("border-top-left-radius", "15px")
      await expect(cells.first()).toHaveCSS(
        "border-bottom-left-radius",
        width === 1280 ? "15px" : "0px",
      )
      await expect(cells.nth(1)).toHaveCSS(
        "border-top-right-radius",
        width === 1280 ? "0px" : "15px",
      )
      const button = summary.getByRole("button").first()
      await button.focus()
      await expect(button).toBeFocused()
      await expect(button).toHaveCSS("border-top-left-radius", "15px")
      await expectCornerShape(button, "superellipse(1.5)")
      await expect(button).toHaveCSS("box-shadow", / 2px inset(?:,|$)/)
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`overview-focus-${width}-${dark}.png`),
      })
    }
  }
})

test("card edge rows and notification surfaces use the actual shared radius", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  const firstRow = page.locator("#display-currency-unit")
  const middleRow = page.locator("#display-today-cashflow-enabled")
  const lastRow = page.locator("#display-default-tab")
  await expect(firstRow).toBeVisible()
  for (const dark of [false, true]) {
    await page
      .locator("#appearance-theme-mode")
      .getByRole("button", {
        name: dark ? /Dark/ : /Light/,
      })
      .click()
    await expect(firstRow).toHaveCSS("border-top-left-radius", "15px")
    await expect(firstRow).toHaveCSS("border-bottom-left-radius", "0px")
    await expect(middleRow).toHaveCSS("border-top-left-radius", "0px")
    await expect(lastRow).toHaveCSS("border-bottom-left-radius", "15px")
    await expect(firstRow.locator("..")).not.toHaveCSS("overflow", "hidden")

    await firstRow
      .getByRole("button", { name: dark ? "USD ($)" : "CNY (¥)" })
      .click()
    const closeButton = page.getByRole("button", {
      name: "Close",
      exact: true,
    })
    // The close action belongs to the toast surface, independent of its styles.
    const toast = closeButton.locator("..")
    await expect(toast).toBeVisible()
    await expect(toast).toHaveCSS("border-top-left-radius", "16px")
    await expect(toast).toHaveCSS(
      "background-color",
      dark ? "rgb(30, 41, 59)" : "rgb(255, 255, 255)",
    )
    await expectCornerShape(toast, "superellipse(1.5)")
    await page.keyboard.press("Tab")
    await closeButton.focus()
    await expect(closeButton).toBeFocused()
    await expect(closeButton).toHaveCSS("border-top-left-radius", "8px")
    await expectCornerShape(closeButton, "superellipse(1.5)")
    // The visible ring is 2px thick beyond the 2px offset, not just a shadow.
    await expect(closeButton).toHaveCSS("box-shadow", / 4px(?:,|$)/)
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`card-and-toast-${dark}.png`),
    })
    await closeButton.click()
    await expect(toast).toHaveCount(0)
  }
})

test("bookmark search surface follows the owning card in both themes", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  await seedStoredBookmarks(await getServiceWorker(context), [
    createStoredBookmark({ id: "corner-bookmark", name: "Corner bookmark" }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BOOKMARK}`,
  )
  const card = page
    .getByTestId("bookmarks-list-view")
    .locator('[data-slot="card"]')
  const searchSurface = card.locator(":scope > div > div").first()
  await expect(searchSurface).toBeVisible()
  for (const dark of [false, true]) {
    await setVisualDarkMode(page, dark)
    await expect(searchSurface).toHaveCSS("border-top-left-radius", "15px")
    await expect(searchSurface).toHaveCSS("border-bottom-left-radius", "0px")
    await expectCornerShape(searchSurface, "superellipse(1.5)")
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`bookmark-search-${dark}.png`),
    })
  }
})

test("settings preserve inset corners, circular switches and focus in both themes", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  const group = page.locator("#appearance-theme-mode").getByRole("group")
  const button = group.getByRole("button").first()
  await expect(button).toBeVisible()

  for (const dark of [false, true]) {
    await setVisualDarkMode(page, dark)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await button.scrollIntoViewIfNeeded()
      await button.focus()
      await expect(button).toBeFocused()
      await expect(button).not.toHaveCSS("box-shadow", "none")
      await expect(button).toHaveCSS("border-top-left-radius", "8px")
      await expectCornerShape(button, "superellipse(1.5)")
      const toggle = page.getByRole("switch").first()
      await expect(toggle).toHaveCSS("border-top-left-radius", "9999px")
      await expectCornerShape(toggle, "round")
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true)
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(
          `settings-${dark ? "dark" : "light"}-${width}.png`,
        ),
      })
    }
  }

  // Changing the outer token must also change the inset; no independent child radius.
  await group.evaluate((element) => {
    element.style.setProperty("--radius-md", "20px")
    element.style.setProperty("--corner-inset", "6px")
  })
  await expect(group).toHaveCSS("border-top-left-radius", "20px")
  await expect(button).toHaveCSS("border-top-left-radius", "14px")
})

test("portalled menus and search dialog keep their nested outlines", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  const language = page.locator("#appearance-language").getByRole("combobox")
  await expect(language).toBeVisible()
  for (const dark of [false, true]) {
    await setVisualDarkMode(page, dark)
    await language.click()
    const select = page.locator('[data-slot="select-content"]')
    await expect(select).toBeVisible()
    await expect(select).toHaveCSS("border-top-left-radius", "16px")
    const option = select.getByRole("option").first()
    await option.hover()
    await expect(option).toHaveCSS("border-top-left-radius", "11px")
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`select-${dark}.png`),
    })
    await page.keyboard.press("Escape")

    await page
      .getByRole("banner")
      .getByRole("button", { name: /Current:/ })
      .click()
    const menu = page.getByRole("menu")
    await expect(menu).toHaveCSS("border-top-left-radius", "16px")
    const item = menu.getByRole("menuitemradio").first()
    await item.hover()
    await expect(item).toHaveCSS("border-top-left-radius", "11px")
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`menu-${dark}.png`),
    })
    await page.keyboard.press("Escape")

    await page.keyboard.press("Control+k")
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS("border-top-left-radius", "24px")
    await expect(dialog.locator('[data-slot="command"]')).toHaveCSS(
      "border-top-left-radius",
      "24px",
    )
    await dialog.getByRole("combobox").fill("theme")
    await expect(dialog.getByRole("option").first()).toBeVisible()
    await expect(dialog.getByRole("option").first()).toHaveCSS(
      "border-top-left-radius",
      "16px",
    )
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`dialog-${dark}.png`),
    })
    await page.keyboard.press("Escape")
  }
})

test("popup tabs retain concentric geometry with native shaping and the fallback stylesheet", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.setViewportSize({ width: 400, height: 600 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  const tabs = page.getByRole("tablist").first()
  const tab = tabs.getByRole("tab").first()
  await expect(tab).toBeVisible()
  await expect(tabs).toHaveCSS("border-top-left-radius", "12px")
  await expect(tab).toHaveCSS("border-top-left-radius", "8px")
  await expectCornerShape(tab, "superellipse(1.5)")
  await tab.hover()
  await tab.focus()
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("popup-native.png"),
  })

  // Exercise the actual fallback declarations by removing only the enhancement
  // block, as an engine without corner-shape support would ignore it.
  const removed = await page.evaluate(() => {
    let count = 0
    const removeEnhancement = (sheet: CSSStyleSheet | CSSGroupingRule) => {
      for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
        const rule = sheet.cssRules[index]
        if (
          rule instanceof CSSSupportsRule &&
          rule.conditionText.includes("corner-shape")
        ) {
          sheet.deleteRule(index)
          count++
        } else if (rule instanceof CSSGroupingRule) {
          removeEnhancement(rule)
        }
      }
    }
    for (const sheet of document.styleSheets) removeEnhancement(sheet)
    return count
  })
  expect(removed).toBeGreaterThan(0)
  await expectCornerShape(tab, "round")
  await expect(tab).toHaveCSS("border-top-left-radius", "8px")
  await tab.press("ArrowRight")
  await expect(tabs.getByRole("tab").nth(1)).toBeFocused()
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("popup-fallback.png"),
  })
})
