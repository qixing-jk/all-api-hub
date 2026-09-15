import type { Locator } from "@playwright/test"

import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { THEME_ATTRIBUTES } from "~/constants/theme"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredBookmark,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  closeExtensionViews,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"

const dimensions = (locator: Locator) =>
  locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      height: el.getBoundingClientRect().height,
      font: style.fontSize,
      width: el.getBoundingClientRect().width,
    }
  })

for (const width of [1280, 390, 320]) {
  test(`global density preserves text and fits ${width}px views`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    test.setTimeout(180_000)
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width, height: 900 })
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      models: ["gpt-4o", "claude-sonnet-4"],
      initialTokens: Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        user_id: 1,
        key: `sk-density-example-${i}`,
        status: 1,
        name: `Density key ${i + 1}`,
        created_time: 1770000000,
        accessed_time: 1770000000,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        used_quota: 0,
        group: "default",
      })),
    })
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, { themeMode: "light" })
    await seedStoredAccounts(
      worker,
      Array.from({ length: 4 }, (_, i) =>
        createStoredAccount({
          id: `density-${i}`,
          site_name: `Density account ${i + 1}`,
        }),
      ),
    )
    await worker.evaluate(
      async ({ key, bookmark }) => {
        const stored = (await chrome.storage.local.get(key))[key]
        const config = typeof stored === "string" ? JSON.parse(stored) : stored
        await chrome.storage.local.set({
          [key]: JSON.stringify({ ...config, bookmarks: [bookmark] }),
        })
      },
      {
        key: STORAGE_KEYS.ACCOUNTS,
        bookmark: createStoredBookmark({
          id: "density-bookmark",
          name: "Density bookmark",
        }),
      },
    )
    const base = `chrome-extension://${extensionId}/`
    await page.goto(`${base}${OPTIONS_PAGE_PATH}#basic`)
    const popup = await context.newPage()
    await popup.goto(`${base}${POPUP_PAGE_PATH}`)
    const sidepanel = await context.newPage()
    await sidepanel.goto(`${base}${SIDEPANEL_PAGE_PATH}`)
    await page.bringToFront()
    const densityGroup = page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_DENSITY}`)
    await expect(
      densityGroup.getByRole("radio", { name: "Default", exact: true }),
    ).toBeChecked()
    const views = [page, popup, sidepanel]
    const defaultTargets: Record<string, { height: number; width: number }[]> =
      {}
    const metrics: Record<
      string,
      Record<string, { height: number; font: string; width: number }>
    > = {}
    for (const density of ["default", "compact", "comfortable"] as const) {
      await page.goto(`${base}${OPTIONS_PAGE_PATH}#basic`)
      await densityGroup
        .getByRole("radio", {
          name: {
            default: "Default",
            compact: "Compact",
            comfortable: "Comfortable",
          }[density],
          exact: true,
        })
        .locator("..")
        .click()
      for (const view of views)
        await expect(view.locator("html")).toHaveAttribute(
          THEME_ATTRIBUTES.DENSITY,
          density,
        )
      await page.getByRole("button", { name: "Open settings search" }).click()
      const searchDialog = page.getByRole("dialog", { name: "Search settings" })
      const searchHeight = { default: 48, compact: 44, comfortable: 52 }[
        density
      ]
      for (const slot of ["command-input-wrapper", "command-input"]) {
        await expect(searchDialog.locator(`[data-slot="${slot}"]`)).toHaveCSS(
          "height",
          `${searchHeight}px`,
        )
      }
      await page.keyboard.press("Escape")
      await expect(searchDialog).toBeHidden()
      metrics[density] = {}
      // Sample real lists using the same saved preference, including a secondary list.
      for (const route of [
        "account",
        "models?accountId=density-0",
        "keys?accountId=density-0",
        "bookmark",
      ]) {
        await page.goto(`${base}${OPTIONS_PAGE_PATH}#${route}`)
        const row =
          route === "account"
            ? page
                .getByTestId(getAccountManagementListItemTestId("density-0"))
                .locator("../..")
            : route.startsWith("models")
              ? page
                  .getByTestId(MODEL_LIST_TEST_IDS.modelDisplay)
                  .locator('[data-slot="card"]')
                  .first()
              : route.startsWith("keys")
                ? page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow).first()
                : page
                    .getByText("Density bookmark", { exact: true })
                    .first()
                    .locator("..")
                    .locator("..")
        await expect(row).toBeVisible()
        metrics[density][route] = await dimensions(row)
        const targets = []
        for (const button of await row.getByRole("button").all()) {
          if (await button.isVisible()) targets.push(await dimensions(button))
        }
        if (density === "default") defaultTargets[route] = targets
        else {
          expect(targets).toHaveLength(defaultTargets[route].length)
          for (const [index, target] of targets.entries()) {
            // Shared actions retain at least 24px. Existing inline text actions
            // keep their default hit area; density must not make them smaller.
            const baseline = defaultTargets[route][index]
            expect(target.height).toBeGreaterThanOrEqual(
              Math.min(24, baseline.height),
            )
            expect(target.width).toBeGreaterThanOrEqual(
              Math.min(24, baseline.width),
            )
          }
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        // Scroll the measured row into view so narrow screenshots include results.
        await row.evaluate((element) =>
          element.scrollIntoView({ block: "center", behavior: "instant" }),
        )
        await page.mouse.move(0, 0)
        await expect(page.getByRole("tooltip")).toHaveCount(0)
        await expect(
          page.getByText("Model data loaded successfully", { exact: true }),
        ).toHaveCount(0)
        // Screenshots capture actual rendered rows, controls and wrapping.
        await page.screenshot({
          path: testInfo.outputPath(
            `${route.split("?")[0]}-${density}-${width}.png`,
          ),
        })
      }
      for (const view of [popup, sidepanel]) {
        await view.setViewportSize({ width: Math.min(width, 390), height: 900 })
        await view.bringToFront()
        expect(
          await view.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
      }
      await page.bringToFront()
    }
    for (const route of [
      "account",
      "models?accountId=density-0",
      "keys?accountId=density-0",
    ]) {
      expect(metrics.compact[route].height).toBeLessThan(
        metrics.default[route].height,
      )
      expect(metrics.comfortable[route].height).toBeGreaterThan(
        metrics.default[route].height,
      )
      expect(metrics.compact[route].font).toBe(metrics.default[route].font)
      expect(metrics.comfortable[route].font).toBe(metrics.default[route].font)
      expect(metrics.compact[route].width).toBe(metrics.default[route].width)
      expect(metrics.comfortable[route].width).toBe(
        metrics.default[route].width,
      )
    }
    await testInfo.attach("density-measurements", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    })
    await page.goto(`${base}${OPTIONS_PAGE_PATH}#basic`)
    await page.reload()
    await expect(
      densityGroup.getByRole("radio", { name: "Comfortable" }),
    ).toBeChecked()
    // The drawer and settings page use the same density control. Arrow keys
    // remain usable even though native radio inputs are visually hidden.
    await page.getByRole("button", { name: /^Current:/ }).click()
    await page.getByRole("menuitem", { name: "Appearance settings" }).click()
    const drawer = page.getByRole("dialog", { name: "Appearance settings" })
    await expect(drawer.locator('[data-slot="sheet-header"]')).toHaveCSS(
      "padding-top",
      "20px",
    )
    const drawerDensity = drawer.getByRole("group", {
      name: "Interface density",
    })
    const comfortable = drawerDensity.getByRole("radio", {
      name: "Comfortable",
    })
    await comfortable.focus()
    await page.keyboard.press("ArrowLeft")
    await expect(
      drawerDensity.getByRole("radio", { name: "Default", exact: true }),
    ).toBeChecked()
    await drawerDensity
      .getByRole("radio", { name: "Compact", exact: true })
      .locator("..")
      .click()
    await expect(popup.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.DENSITY,
      "compact",
    )
    await expect(drawer.locator('[data-slot="sheet-header"]')).toHaveCSS(
      "padding-top",
      "12px",
    )
    await drawer.getByRole("button", { name: "Reset density" }).click()
    for (const view of views)
      await expect(view.locator("html")).toHaveAttribute(
        THEME_ATTRIBUTES.DENSITY,
        "default",
      )
    await closeExtensionViews(context, page)
  })
}
