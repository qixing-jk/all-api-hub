import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
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
  finishColorTransitions,
  MIN_CONTRAST_RATIO,
  readColorContrast,
} from "~~/e2e/utils/colorContrast"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("gateway guidance follows the selected palette in light and dark modes", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  for (const themeMode of [THEME_MODE.DARK, THEME_MODE.LIGHT]) {
    const backgrounds: string[] = []
    for (const preset of [THEME_PRESET.ANTHROPIC, THEME_PRESET.DEFAULT]) {
      await seedUserPreferences(worker, {
        themeMode,
        appearance: {
          preset,
          color: THEME_COLOR.VIOLET,
          radius: THEME_RADIUS.DEFAULT,
        },
      })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
      )
      await expect(page.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.PRESET,
        preset,
      )
      const guidance = page.getByRole("status").filter({
        hasText: "After configuration, you can import scattered account keys",
      })
      await expect(guidance).toBeVisible()
      backgrounds.push(
        await guidance.evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      await page.screenshot({
        path: testInfo.outputPath(`${preset}-${themeMode}-guidance.png`),
      })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
      )
      const badge = page.locator('[data-slot="badge"]').filter({
        hasText:
          preset === THEME_PRESET.ANTHROPIC ? "Anthropic" : "Default theme",
      })
      await expect(badge).toBeVisible()
      expect((await readColorContrast(badge)).ratio).toBeGreaterThanOrEqual(
        MIN_CONTRAST_RATIO.TEXT,
      )
      const toggle = page.getByRole("switch").first()
      const thumb = toggle.locator('[data-slot="switch-thumb"]')
      for (const checked of [false, true]) {
        if ((await toggle.isChecked()) !== checked) await toggle.click()
        await expect(toggle).toHaveAttribute("aria-checked", String(checked))
        await finishColorTransitions(toggle)
        await expect
          .poll(
            async () => (await readColorContrast(thumb, "background")).ratio,
          )
          .toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.NON_TEXT)
      }
      const darkPreview = page
        .locator(
          `#${SETTINGS_ANCHORS.APPEARANCE_PRESET} [${THEME_ATTRIBUTES.PRESET}="${THEME_PRESET.ANTHROPIC}"]`,
        )
        .last()
      await expect(darkPreview).toHaveCSS("background-color", "rgb(36, 35, 32)")
      await badge.locator("../..").screenshot({
        path: testInfo.outputPath(`${preset}-${themeMode}-preview.png`),
      })
    }
    expect(backgrounds[1]).not.toBe(backgrounds[0])
  }
})
