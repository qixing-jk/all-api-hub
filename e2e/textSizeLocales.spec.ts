import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { THEME_ATTRIBUTES } from "~/constants/theme"
import deSettings from "~/locales/de/settings.json" with { type: "json" }
import esSettings from "~/locales/es-419/settings.json" with { type: "json" }
import zhSettings from "~/locales/zh-CN/settings.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import {
  closeExtensionViews,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"

test.use({ actionTimeout: 10_000 })

for (const width of [390, 320]) {
  for (const [language, settings] of [
    ["de", deSettings],
    ["es-419", esSettings],
    ["zh-CN", zhSettings],
  ] as const) {
    test(`compact extra large text fits ${language} settings at ${width}px`, async ({
      context,
      page,
      extensionId,
    }, testInfo) => {
      await forceExtensionLanguage(page, language)
      await page.setViewportSize({ width, height: 900 })
      await seedUserPreferences(await getServiceWorker(context), {
        language,
        themeMode: "dark",
        appearance: { density: "compact", textSize: "extra-large" },
      })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#basic?tab=general&anchor=${SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE}`,
      )
      await expect(page.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.TEXT_SIZE,
        "extra-large",
      )
      const textSize = page.getByRole("group", {
        name: settings.appearance.textSize,
        exact: true,
      })
      await expect(
        textSize.getByRole("radio", {
          name: settings.appearance.textSizes.extraLarge,
          exact: true,
        }),
      ).toBeChecked()
      // Measure actual glyphs, since a page can hide horizontal overflow while
      // an individual translated choice still paints outside its border.
      for (const target of [
        SETTINGS_ANCHORS.APPEARANCE_DENSITY,
        SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE,
        SETTINGS_ANCHORS.APPEARANCE_RADIUS,
      ]) {
        const labels = page.locator(`#${target} label > span`)
        const overflows = await labels.evaluateAll((elements) =>
          elements.flatMap((element) => {
            const bounds = element.getBoundingClientRect()
            const walker = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
            )
            const errors = []
            while (walker.nextNode()) {
              const text = walker.currentNode
              if (!text.textContent?.trim()) continue
              const range = document.createRange()
              range.selectNodeContents(text)
              for (const rect of Array.from(range.getClientRects())) {
                if (
                  rect.left < bounds.left - 1 ||
                  rect.right > bounds.right + 1 ||
                  rect.top < bounds.top - 1 ||
                  rect.bottom > bounds.bottom + 1
                )
                  errors.push(text.textContent)
              }
            }
            return errors
          }),
        )
        expect(overflows).toEqual([])
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await textSize.screenshot({
        path: testInfo.outputPath(`${language}-text-size-${width}.png`),
      })
      await page
        .getByRole("region", { name: settings.appearance.preview, exact: true })
        .screenshot({
          path: testInfo.outputPath(`${language}-preview-${width}.png`),
        })
      await closeExtensionViews(context, page)
    })
  }
}
