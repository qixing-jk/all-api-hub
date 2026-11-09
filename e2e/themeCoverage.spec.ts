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
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
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

for (const themeMode of [THEME_MODE.DARK, THEME_MODE.LIGHT]) {
  test(`account URL input keeps the group's background in ${themeMode} mode`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await seedUserPreferences(await getServiceWorker(page.context()), {
      themeMode,
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
    )
    await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
    const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
    const input = dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    await expect(input).toBeVisible()
    await finishColorTransitions(input)
    await dialog.screenshot({
      path: testInfo.outputPath(`account-url-${themeMode}.png`),
    })
    await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  })
}

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
      // The removed appearance preview carried the preset badge; the selected
      // preset's own badge covers the same tinted-surface contrast check.
      const badge = page.locator(
        `#${SETTINGS_ANCHORS.APPEARANCE_PRESET} label:has(input[value="${preset}"]) span.bg-primary.text-primary-foreground`,
      )
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
