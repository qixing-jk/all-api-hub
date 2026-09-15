import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { THEME_ATTRIBUTES } from "~/constants/theme"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { DEFAULT_APPEARANCE } from "~/types/theme"
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

for (const width of [1280, 320]) {
  test(`secondary surfaces and calendar follow density at ${width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    test.setTimeout(240_000)
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width, height: 900 })
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    const base = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`
    const measurements: Record<
      string,
      { sidebarPadding: string; calendarHeight: number; calendarWidth: number }
    > = {}
    for (const density of ["default", "compact", "comfortable"] as const) {
      await seedUserPreferences(worker, {
        themeMode: width === 320 ? "dark" : "light",
        appearance: { ...DEFAULT_APPEARANCE, density },
      })
      for (const route of [
        MENU_ITEM_IDS.OVERVIEW,
        MENU_ITEM_IDS.BASIC,
        MENU_ITEM_IDS.AUTO_CHECKIN,
        MENU_ITEM_IDS.USAGE_ANALYTICS,
        MENU_ITEM_IDS.BALANCE_HISTORY,
        MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
        MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
        MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
        MENU_ITEM_IDS.IMPORT_EXPORT,
        MENU_ITEM_IDS.ABOUT,
        MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
      ]) {
        await page.goto(`${base}#${route}`)
        await expect(page.locator("html")).toHaveAttribute(
          THEME_ATTRIBUTES.DENSITY,
          density,
        )
        await expect(
          page.locator("main").getByRole("heading").first(),
        ).toBeVisible()
        const clippedInputs = await page
          .locator("main input")
          .evaluateAll((inputs) =>
            inputs.flatMap((input) => {
              const field = input as HTMLInputElement
              if (
                !field.getClientRects().length ||
                [
                  "hidden",
                  "checkbox",
                  "radio",
                  "range",
                  "color",
                  "file",
                ].includes(field.type)
              )
                return []
              const style = getComputedStyle(field)
              const lineHeight = Number.parseFloat(style.lineHeight)
              const contentHeight =
                field.clientHeight -
                Number.parseFloat(style.paddingTop) -
                Number.parseFloat(style.paddingBottom)
              return Number.isFinite(lineHeight) &&
                contentHeight + 0.5 < lineHeight
                ? [
                    {
                      id: field.id,
                      label: field.getAttribute("aria-label"),
                      contentHeight,
                      lineHeight,
                    },
                  ]
                : []
            }),
          )
        expect(
          clippedInputs,
          `${route}/${density}: text must fit inside input padding`,
        ).toEqual([])
        if (route === MENU_ITEM_IDS.OVERVIEW) {
          const guidanceCopy = page
            .getByRole("heading", { name: "Unified API", exact: true })
            .locator("..")
          expect(
            (await guidanceCopy.boundingBox())!.width,
          ).toBeGreaterThanOrEqual(128)
        }
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true)
        await page.screenshot({
          path: testInfo.outputPath(`${route}-${density}-${width}.png`),
        })
      }
      const sidebarPadding = await page
        .locator("aside nav button")
        .first()
        .evaluate((el) => getComputedStyle(el).paddingTop)
      await page.keyboard.press("Control+k")
      const searchInput = page.locator('[data-slot="command-input"]')
      await expect(searchInput).toBeVisible()
      await searchInput.fill("density")
      await searchInput.evaluate(async (element) => {
        const dialog = element.closest('[data-slot="dialog-content"]')!
        await Promise.all(
          dialog
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished),
        )
      })
      const searchMetrics = await searchInput.evaluate((element) => {
        const style = getComputedStyle(element)
        const wrapper = element.closest('[data-slot="command-input-wrapper"]')!
        const inputRect = element.getBoundingClientRect()
        const wrapperRect = wrapper.getBoundingClientRect()
        return {
          contentHeight:
            element.clientHeight -
            Number.parseFloat(style.paddingTop) -
            Number.parseFloat(style.paddingBottom),
          lineHeight: Number.parseFloat(style.lineHeight),
          fitsWrapper:
            inputRect.top >= wrapperRect.top - 1 &&
            inputRect.bottom <= wrapperRect.bottom + 1,
        }
      })
      expect(searchMetrics.contentHeight).toBeGreaterThanOrEqual(
        searchMetrics.lineHeight,
      )
      expect(searchMetrics.fitsWrapper).toBe(true)
      const clearSearch = page
        .locator('[data-slot="command-input-wrapper"]')
        .getByRole("button", { name: "Clear", exact: true })
      await expect(clearSearch).toBeVisible()
      const closeSearch = page.locator(
        '[data-slot="dialog-content"] > [data-slot="dialog-close"]',
      )
      const clearRect = (await clearSearch.boundingBox())!
      const closeRect = (await closeSearch.boundingBox())!
      expect(clearRect.x + clearRect.width + 4).toBeLessThanOrEqual(closeRect.x)
      expect(closeRect.width).toBeGreaterThanOrEqual(24)
      expect(closeRect.height).toBeGreaterThanOrEqual(24)
      await clearSearch.focus()
      await page.screenshot({
        path: testInfo.outputPath(`search-${density}-${width}.png`),
      })
      await clearSearch.click({ timeout: 10_000 })
      await expect(searchInput).toHaveValue("")
      await expect(searchInput).toBeFocused()
      await page.keyboard.press("Escape")
      await expect(searchInput).toBeHidden()
      await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.addButton).click()
      const dialog = page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialog)
      const secretInput = dialog.locator('input[type="password"]').first()
      await secretInput.fill("sk-density-example-long-value")
      // Trailing reveal/clear actions must not cover input text as they grow.
      expect(
        await secretInput.evaluate((element) => {
          const button = element.parentElement!.querySelector("button")!
          const textRight =
            element.getBoundingClientRect().right -
            Number.parseFloat(getComputedStyle(element).paddingRight)
          return textRight <= button.getBoundingClientRect().left - 4
        }),
      ).toBe(true)
      await dialog
        .getByRole("button", { name: /Expiration date:.*calendar/i })
        .click()
      const calendar = page.locator('[data-slot="calendar"]')
      await expect(calendar).toBeVisible()
      await expect(calendar).toHaveCSS(
        "padding-top",
        `${{ compact: 9, default: 12, comfortable: 15 }[density]}px`,
      )
      // Popovers scale during entry; measure the settled hit boxes, not an
      // intermediate animation frame whose transform changes their width.
      await calendar.evaluate(async (element) => {
        const popover = element.closest('[data-slot="popover-content"]')!
        await Promise.all(
          popover
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished),
        )
      })
      const day = calendar
        .locator("button[data-day]")
        .filter({ hasText: /^15$/ })
        .first()
      const rect = await day.boundingBox()
      expect(rect).not.toBeNull()
      expect(rect!.height).toBeGreaterThanOrEqual(24)
      expect(rect!.width).toBeGreaterThanOrEqual(24)
      const calendarRect = await calendar.boundingBox()
      expect(calendarRect!.x).toBeGreaterThanOrEqual(0)
      expect(calendarRect!.x + calendarRect!.width).toBeLessThanOrEqual(width)
      measurements[density] = {
        sidebarPadding,
        calendarHeight: rect!.height,
        calendarWidth: rect!.width,
      }
      await page.screenshot({
        path: testInfo.outputPath(`calendar-${density}-${width}.png`),
      })
      await day.click()
      await expect(calendar).toBeHidden()
      await page.keyboard.press("Escape")
    }
    expect(Number.parseFloat(measurements.compact.sidebarPadding)).toBeLessThan(
      Number.parseFloat(measurements.default.sidebarPadding),
    )
    expect(
      Number.parseFloat(measurements.comfortable.sidebarPadding),
    ).toBeGreaterThan(Number.parseFloat(measurements.default.sidebarPadding))
    expect(measurements.compact.calendarHeight).toBeLessThan(
      measurements.default.calendarHeight,
    )
    expect(measurements.comfortable.calendarHeight).toBeGreaterThan(
      measurements.default.calendarHeight,
    )
    expect(measurements.compact.calendarWidth).toBe(
      measurements.default.calendarWidth,
    )
    expect(measurements.comfortable.calendarWidth).toBe(
      measurements.default.calendarWidth,
    )
    await testInfo.attach("secondary-density-measurements", {
      body: JSON.stringify(measurements),
      contentType: "application/json",
    })
    await closeExtensionViews(context, page)
  })
}
