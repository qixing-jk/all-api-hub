import { readFile } from "node:fs/promises"
import path from "node:path"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import {
  THEME_ATTRIBUTES,
  THEME_COLOR,
  THEME_MODE,
  THEME_OWNER,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { THEME_PRESETS } from "~/types/theme"
import { THEME_BOOTSTRAP_CACHE_KEY } from "~/utils/ui/themePreferences"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { seedUserPreferences } from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

for (const preset of THEME_PRESETS) {
  for (const themeMode of [THEME_MODE.LIGHT, THEME_MODE.DARK]) {
    test(`popup restores ${preset} ${themeMode} colors before its application bundle`, async ({
      context,
      page,
      extensionId,
      extensionDir,
    }, testInfo) => {
      const html = await readFile(
        path.join(extensionDir, POPUP_PAGE_PATH),
        "utf8",
      )
      const mainScript = html.match(
        /<script\b[^>]*type="module"[^>]*src="([^"]+)"/u,
      )?.[1]
      expect(mainScript).toBeTruthy()
      let blocked = false
      const scriptUrl = `chrome-extension://${extensionId}${mainScript}`
      await page.route(scriptUrl, async (route) => {
        blocked = true
        await route.abort()
      })
      await page.addInitScript(
        (cacheKey) => localStorage.removeItem(cacheKey),
        THEME_BOOTSTRAP_CACHE_KEY,
      )
      await page.emulateMedia({
        colorScheme:
          themeMode === THEME_MODE.DARK ? THEME_MODE.LIGHT : THEME_MODE.DARK,
        reducedMotion: "reduce",
      })
      await seedUserPreferences(await getServiceWorker(context), {
        themeMode,
        appearance: {
          preset,
          color: THEME_COLOR.VIOLET,
          radius: THEME_RADIUS.LARGE,
        },
      })
      await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
      await expect.poll(() => blocked).toBe(true)
      await expect(page.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.OWNER,
        THEME_OWNER.BOOTSTRAP,
      )
      await expect(page.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.PRESET,
        preset,
      )
      const expectedBackground =
        preset === THEME_PRESET.ANTHROPIC
          ? themeMode === THEME_MODE.DARK
            ? "rgb(36, 35, 32)"
            : "rgb(250, 249, 245)"
          : themeMode === THEME_MODE.DARK
            ? "rgb(15, 23, 42)"
            : "rgb(255, 255, 255)"
      const expectedMuted =
        preset === THEME_PRESET.ANTHROPIC
          ? themeMode === THEME_MODE.DARK
            ? "rgb(52, 49, 44)"
            : "rgb(238, 236, 228)"
          : themeMode === THEME_MODE.DARK
            ? "rgb(37, 50, 71)"
            : "rgb(243, 244, 246)"
      const skeleton = page.locator(".popup-skeleton")
      await expect(skeleton).toBeVisible()
      await expect(skeleton).toHaveCSS("background-color", expectedBackground)
      await expect(skeleton.locator(".popup-skeleton__bar").first()).toHaveCSS(
        "background-color",
        expectedMuted,
      )
      await expect(skeleton.locator(".popup-skeleton__bar").first()).toHaveCSS(
        "animation-name",
        "none",
      )
      await page.screenshot({
        path: testInfo.outputPath(`${preset}-${themeMode}-startup.png`),
      })
      await page.unroute(scriptUrl)
      await page.reload()
      await expect(page.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.OWNER,
        THEME_OWNER.REACT,
      )
      await expect(skeleton).toHaveCount(0)
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        expectedBackground,
      )
    })
  }
}
