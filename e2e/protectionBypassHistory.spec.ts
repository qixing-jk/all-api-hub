import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ProtectionBypassHistoryEntry } from "~/services/protectionBypass/historyStorage"
import { SiteHealthStatus, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const entry of ["reminder", "health warning"] as const) {
  test(`opens history from the account ${entry} on a narrow screen`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      language: "en",
      tempWindowFallback: { enabled: false },
      tempWindowFallbackReminder: { dismissed: entry === "health warning" },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        site_name: "History entry fixture",
        health: {
          status: SiteHealthStatus.Warning,
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
          reason: "Automatic verification assistance is disabled",
        },
      }),
    ])

    const accountUrl = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`
    await page.goto(accountUrl)
    await waitForExtensionRoot(page)
    const pageCount = context.pages().length

    if (entry === "health warning") {
      await page
        .getByRole("button", { name: "Click to refresh health status" })
        .focus()
    }

    const source =
      entry === "reminder"
        ? page.getByRole("dialog", {
            name: "Automatic refresh needs site verification",
          })
        : page.getByRole("tooltip").filter({
            hasText: "Automatic verification assistance is disabled",
          })
    const historyLink = source.getByRole("button", {
      name: "View shield bypass history",
    })
    await expect(historyLink).toBeVisible()
    await expect(historyLink).toBeInViewport({ ratio: 1 })

    if (entry === "health warning") {
      await page.keyboard.press("Tab")
      await page.keyboard.press("Tab")
      await expect(historyLink).toBeFocused()
    }

    await page.screenshot({
      path: testInfo.outputPath(
        `shield-history-${entry.replaceAll(" ", "-")}-entry-mobile.png`,
      ),
      animations: "disabled",
    })
    await historyLink.press("Enter")

    await expect(page).toHaveURL(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=refresh&anchor=shield-history#${MENU_ITEM_IDS.BASIC}`,
    )
    const history = page.getByRole("dialog", { name: "Shield bypass history" })
    await expect(history).toBeVisible()
    await expect(
      history.getByRole("heading", { name: "Shield bypass history" }),
    ).toBeFocused()
    await expect(source).not.toBeVisible()
    expect(context.pages()).toHaveLength(pageCount)

    await page.keyboard.press("Escape")
    await expect(history).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(accountUrl)
  })
}

test("opens diagnostic history on demand, links to settings and preserves background results", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language: "en",
    tempWindowFallback: { enabled: false },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=refresh#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  const history = page.getByRole("dialog", { name: "Shield bypass history" })
  const entryButton = page.getByRole("button", {
    name: "View shield bypass history",
  })
  await expect(entryButton).toBeVisible()
  await expect(history).toHaveCount(0)
  await page.locator(`#${SHIELD_SETTINGS_TARGET_IDS.root}`).screenshot({
    path: testInfo.outputPath("shield-history-entry-desktop.png"),
    animations: "disabled",
  })
  await entryButton.click()
  await expect(
    history.getByRole("heading", { name: "Shield bypass history" }),
  ).toBeFocused()

  const response = await page.evaluate(async (action) => {
    return await (globalThis as any).chrome.runtime.sendMessage({
      action,
      execution: {
        version: 2,
        kind: "automatic",
        feature: "account_refresh",
        trigger: "scheduled",
        surface: "background",
      },
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "https://history.example.test/private?token=e2e-secret",
          fetchUrl:
            "https://history.example.test/api/user/self?token=e2e-secret",
          fetchOptions: {
            method: "GET",
            headers: { Authorization: "Bearer e2e-secret" },
          },
          fallbackDiagnostic: { statusCode: 403, code: "HTTP_403" },
        },
      },
    })
  }, RuntimeActionIds.ProtectionBypassExecuteTask)
  expect(response).toMatchObject({
    success: false,
    code: "TEMP_WINDOW_DISABLED",
  })

  const summary = history.getByRole("button", {
    name: /https:\/\/history\.example\.test/,
  })
  await expect(summary).toHaveAttribute("aria-expanded", "false")
  await expect(summary).toContainText("HTTP 403")
  await expect(summary).toContainText("Automatic shield bypass is off.")
  await expect(summary).toContainText("Temporary page not opened")
  await summary.click()
  await expect(
    history.getByText("HTTP 403 · HTTP_403", { exact: true }),
  ).toBeVisible()
  await expect(
    history.getByText("Scheduled task", { exact: true }),
  ).toBeVisible()
  await expect(
    history.getByRole("heading", { name: "Trigger", exact: true }),
  ).toBeVisible()
  await expect(
    history.getByRole("heading", { name: "Outcome", exact: true }),
  ).toBeVisible()
  await expect(
    history.getByRole("heading", { name: "Browser and request", exact: true }),
  ).toBeVisible()
  await expect(history).not.toContainText("e2e-secret")
  await expect
    .poll(() =>
      history.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return Math.max(-bounds.top, bounds.bottom - window.innerHeight)
      }),
    )
    .toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath("shield-history-desktop.png"),
    animations: "disabled",
  })

  await history.getByRole("button", { name: "View related settings" }).click()
  await expect(history).toHaveCount(0)
  const enabledSetting = page
    .locator(`#${SHIELD_SETTINGS_TARGET_IDS.enabled}`)
    .getByRole("switch")
  await expect(enabledSetting).toBeFocused()
  await expect(enabledSetting).not.toBeChecked()

  await entryButton.click()
  await expect(history).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(history).toHaveCount(0)
  await expect(entryButton).toBeFocused()
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(entryButton).toBeVisible()
  await expect(history).toHaveCount(0)

  await page.getByRole("button", { name: "Open settings search" }).click()
  const searchDialog = page.getByRole("dialog", { name: "Search settings" })
  await searchDialog
    .getByPlaceholder("Search settings...")
    .fill("shield bypass history")
  await searchDialog
    .getByRole("option", { name: /Shield bypass history/ })
    .click()
  await expect(searchDialog).toHaveCount(0)
  await expect(history).toBeVisible()
  await expect(summary).toBeVisible()

  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    history.getByText("https://history.example.test", { exact: true }),
  ).toBeVisible()
  const search = history.getByRole("searchbox", {
    name: "Search sites, operations or diagnostics",
  })
  await search.fill("TEMP_WINDOW_DISABLED")
  await expect(summary).toBeVisible()
  await search.fill("absent.example")
  await history.getByRole("button", { name: "Clear filters" }).click()
  await expect(search).toHaveValue("")
  await expect(summary).toBeVisible()

  await history.getByRole("button", { name: "History actions" }).click()
  await page.getByRole("menuitem", { name: "Clear history" }).click()
  const confirmation = page.getByRole("dialog", {
    name: "Clear history",
    exact: true,
  })
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click()
  await expect(confirmation).toHaveCount(0)
  await expect(summary).toBeVisible()
  await history.getByRole("button", { name: "History actions" }).click()
  await page.getByRole("menuitem", { name: "Clear history" }).click()
  await confirmation.getByRole("button", { name: "Clear", exact: true }).click()
  await expect(
    history.getByText("No shield bypass history yet", { exact: true }),
  ).toBeVisible()
  await page.reload()
  await waitForExtensionRoot(page)
  await expect(
    history.getByText("No shield bypass history yet", { exact: true }),
  ).toBeVisible()
})

test("fits all local summaries on a narrow screen and keeps the reading position during updates", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { language: "en" })
  const now = Date.now()
  const entries: ProtectionBypassHistoryEntry[] = Array.from(
    { length: 100 },
    (_, index) => ({
      id: `layout-${index}`,
      startedAt: now - index * 1000,
      status: index === 20 ? "started" : "completed",
      execution: {
        version: 2,
        kind: "automatic",
        feature: "account_refresh",
        trigger: "scheduled",
        surface: "background",
      },
      taskKind: "api_fallback_fetch",
      origin: `https://history-${index}.example.test`,
      incognito: false,
      method: "GET",
      preferredMode: "auto",
      fallbackDiagnostic: { statusCode: 403, code: "HTTP_403" },
    }),
  )
  await setPlasmoStorageValue(worker, STORAGE_KEYS.PROTECTION_BYPASS_HISTORY, {
    version: 1,
    entries,
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=refresh&anchor=${SHIELD_SETTINGS_TARGET_IDS.history}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  const history = page.getByRole("dialog", { name: "Shield bypass history" })
  await expect(history).toBeVisible()
  await expect(
    history.getByRole("button", {
      name: /https:\/\/history-\d+\.example\.test/,
      expanded: false,
    }),
  ).toHaveCount(100)
  await expect(
    history.getByRole("heading", { name: "Browser and request", exact: true }),
  ).toHaveCount(0)
  await expect(
    history.getByRole("button", { name: "Copy diagnostic details" }),
  ).toHaveCount(0)

  const search = history.getByRole("searchbox", {
    name: "Search sites, operations or diagnostics",
  })
  const filter = history.getByRole("combobox", { name: "Filter by outcome" })
  const actions = history.getByRole("button", { name: "History actions" })
  const [searchBox, filterBox, actionsBox] = await Promise.all(
    [search, filter, actions].map((locator) =>
      locator.evaluate((element) => {
        const { top, right, bottom, left } = element.getBoundingClientRect()
        return { top, right, bottom, left }
      }),
    ),
  )
  expect(searchBox.bottom).toBeLessThanOrEqual(filterBox.top)
  expect(filterBox.right).toBeLessThanOrEqual(actionsBox.left)
  for (const box of [searchBox, filterBox, actionsBox]) {
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(390)
  }
  await expect
    .poll(() =>
      history.evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true)

  const records = history.getByRole("region", { name: "Shield bypass history" })
  const reading = history.getByRole("button", {
    name: /https:\/\/history-20\.example\.test/,
  })
  await reading.evaluate((element) =>
    element.scrollIntoView({ block: "start" }),
  )
  await reading.click()
  await expect(reading).toHaveAttribute("aria-expanded", "true")
  const readingTop = await reading.evaluate(
    (element) => element.getBoundingClientRect().top,
  )
  const newEntry: ProtectionBypassHistoryEntry = {
    ...entries[0],
    id: "layout-new",
    startedAt: now + 1000,
    origin: "https://new-history.example.test",
  }
  const updated = [newEntry, ...entries.slice(0, 99)]
  await setPlasmoStorageValue(worker, STORAGE_KEYS.PROTECTION_BYPASS_HISTORY, {
    version: 1,
    entries: updated,
  })
  const showNewRecords = history.getByRole("button", {
    name: "Show 1 new record",
    exact: true,
  })
  await expect(showNewRecords).toBeVisible()
  await expect(
    history.getByText("https://new-history.example.test", { exact: true }),
  ).toHaveCount(0)
  expect(
    Math.abs(
      (await reading.evaluate(
        (element) => element.getBoundingClientRect().top,
      )) - readingTop,
    ),
  ).toBeLessThanOrEqual(1)

  await setPlasmoStorageValue(worker, STORAGE_KEYS.PROTECTION_BYPASS_HISTORY, {
    version: 1,
    entries: updated.map((entry) =>
      entry.id === "layout-20"
        ? {
            ...entry,
            status: "completed",
            contextMode: "tab",
            contextReused: true,
            httpStatus: 200,
          }
        : entry,
    ),
  })
  await expect(reading).toContainText("Completed")
  await expect(reading).toHaveAttribute("aria-expanded", "true")
  await expect(
    history.getByText("Reused an existing page", { exact: true }),
  ).toBeAttached()
  expect(
    Math.abs(
      (await reading.evaluate(
        (element) => element.getBoundingClientRect().top,
      )) - readingTop,
    ),
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath("shield-history-mobile.png"),
  })

  await showNewRecords.click()
  await expect(
    history.getByText("https://new-history.example.test", { exact: true }),
  ).toBeVisible()
  await expect(showNewRecords).toHaveCount(0)
  await expect(reading).toHaveAttribute("aria-expanded", "true")
  await expect(
    history.getByRole("button", { name: "Copy diagnostic details" }),
  ).toHaveCount(1)
  await records.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(
    history.getByText("https://history-98.example.test", { exact: true }),
  ).toBeVisible()
  await expect(
    history.getByText("Showing 100 / 100 records", { exact: true }),
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(history).toHaveCount(0)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page
      .getByRole("button", { name: "View shield bypass history" })
      .evaluate((element) => {
        element.scrollIntoView({ block: "center" })
      })
    await page.screenshot({
      path: testInfo.outputPath(`shield-history-entry-${width}.png`),
      animations: "disabled",
    })
  }
})
