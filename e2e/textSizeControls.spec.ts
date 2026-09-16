import type { Locator } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { THEME_ATTRIBUTES } from "~/constants/theme"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
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

test.use({ actionTimeout: 10_000 })

/** Measure settled popovers and their real line boxes, including calendar days. */
async function expectSurfaceToFit(surface: Locator, width: number) {
  // Radix repositioning can cancel an in-flight transition in Chrome 114;
  // Animation.finished rejects on cancellation even though layout has settled.
  await expect
    .poll(() =>
      surface.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().iterations !== Infinity,
            ).length,
      ),
    )
    .toBe(0)
  const bounds = (await surface.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  const clipped = await surface
    .locator('input, button, [role="option"]')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height) return []
        if (
          element instanceof HTMLInputElement &&
          ["checkbox", "radio", "hidden"].includes(element.type)
        )
          return []
        if (
          !(element instanceof HTMLInputElement) &&
          !element.textContent?.trim()
        )
          return []
        const style = getComputedStyle(element)
        const available =
          element.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom)
        const line = parseFloat(style.lineHeight)
        return available + 1 < line ||
          element.scrollHeight > element.clientHeight + 1
          ? [
              {
                label:
                  element.getAttribute("aria-label") || element.textContent,
                available,
                line,
              },
            ]
          : []
      }),
    )
  expect(clipped).toEqual([])
}

test("virtual bookmark rows grow with text size and keep their offsets aligned", async ({
  context,
  page,
  extensionId,
}) => {
  await forceExtensionLanguage(page, "en")
  await page.setViewportSize({ width: 320, height: 900 })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    themeMode: "light",
    appearance: { density: "compact" },
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton),
  ).toBeVisible()
  // Supply bookmark data without granting native permissions or scanning sites;
  // this test exercises the real virtualizer and ResizeObserver layout.
  await page.evaluate(() => {
    const contains = chrome.permissions.contains.bind(chrome.permissions)
    Object.defineProperty(chrome.permissions, "contains", {
      value: async (permissions: chrome.permissions.Permissions) =>
        permissions.permissions?.includes("bookmarks") || contains(permissions),
    })
    const browserGlobals = globalThis as typeof globalThis & {
      browser: typeof chrome
    }
    Object.defineProperty(browserGlobals.browser, "bookmarks", {
      value: {
        getTree: async () => [
          {
            id: "text-size-bookmark-1",
            title: "Work account",
            url: "https://work.example.test",
          },
          {
            id: "text-size-bookmark-2",
            title: "Home account",
            url: "https://home.example.test",
          },
        ],
      },
    })
  })
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton)
    .click()
  const dialog = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportDialog,
  )
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton)
    .click()
  const tree = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScopeTree,
  )
  const rows = tree.getByRole("treeitem")
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toHaveCSS("height", "30px")
  await seedUserPreferences(worker, {
    themeMode: "light",
    appearance: { density: "compact", textSize: "extra-large" },
  })
  await expect(tree.getByText("Work account", { exact: true })).toHaveCSS(
    "font-size",
    "18px",
  )
  await expect(rows.first()).toHaveCSS("height", "32px")
  const first = (await rows.nth(0).boundingBox())!
  const second = (await rows.nth(1).boundingBox())!
  expect(first.y + first.height).toBeLessThanOrEqual(second.y)
  await expectSurfaceToFit(tree, 320)
  await page.keyboard.press("Escape")
  await closeExtensionViews(context, page)
})

for (const width of [390, 320]) {
  test(`compact extra large text fits selects and form popovers at ${width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width, height: 900 })
    await stubLlmMetadataIndex(context)
    await seedUserPreferences(await getServiceWorker(context), {
      language: "en",
      themeMode: "dark",
      appearance: { density: "compact", textSize: "extra-large" },
      logging: { consoleEnabled: true, level: "info" },
    })
    const base = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`
    await page.goto(`${base}#basic?tab=general&anchor=logging`)
    await expect(page.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTES.TEXT_SIZE,
      "extra-large",
    )
    const level = page.locator("#logging-min-level").getByRole("combobox")
    await level.click()
    const listbox = page.getByRole("listbox")
    await expect(
      listbox.getByRole("option", { name: "Warn", exact: true }),
    ).toHaveCSS("font-size", "18px")
    await expectSurfaceToFit(listbox, width)
    await listbox.getByRole("option", { name: "Warn", exact: true }).click()
    await expect(level).toHaveText("Warn")

    await page.goto(`${base}#apiCredentialProfiles`)
    await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.addButton).click()
    const dialog = page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialog)
    await expect(dialog).toBeVisible()
    const secret = dialog.locator('input[type="password"]')
    await secret.fill("sk-text-size-example-long-value")
    expect(
      await secret.evaluate((element) => {
        const action = element.parentElement!.querySelector("button")!
        const textRight =
          element.getBoundingClientRect().right -
          parseFloat(getComputedStyle(element).paddingRight)
        return textRight <= action.getBoundingClientRect().left - 4
      }),
    ).toBe(true)
    await expectSurfaceToFit(dialog, width)

    // SearchableSelect uses Command inside a portal, separate from Radix Select.
    await dialog.getByRole("combobox").first().click()
    const menu = page.locator(
      '[data-slot="popover-content"][data-state="open"]',
    )
    await expect(menu.getByRole("combobox")).toBeVisible()
    await menu.getByRole("combobox").fill("anthropic")
    await expectSurfaceToFit(menu, width)
    await menu.getByRole("option").filter({ hasText: "Anthropic" }).click()

    await dialog
      .getByRole("button", { name: "Select tags", exact: true })
      .click()
    await menu.getByRole("combobox").fill("Work")
    await expectSurfaceToFit(menu, width)
    await menu
      .getByRole("button", { name: 'Create "Work"', exact: true })
      .click()
    await page.keyboard.press("Escape")

    await dialog
      .getByRole("button", { name: /Expiration date:.*calendar/i })
      .click()
    const calendar = page.locator('[data-slot="calendar"]')
    await expect(calendar).toBeVisible()
    await expectSurfaceToFit(menu, width)
    await menu.screenshot({
      path: testInfo.outputPath(`calendar-extra-large-${width}.png`),
    })
    await calendar
      .locator("button[data-day]")
      .filter({ hasText: /^15$/ })
      .first()
      .click()
    await expect(calendar).toBeHidden()
    await expectSurfaceToFit(dialog, width)
    await dialog.screenshot({
      path: testInfo.outputPath(`form-extra-large-${width}.png`),
    })
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await closeExtensionViews(context, page)
  })
}
