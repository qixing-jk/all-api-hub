import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "~/features/KeyManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS as provisioning } from "~/features/TokenProvisioning/testIds"
import { PMPLAN_WEB_ORIGIN as origin } from "~/services/accountSiteDefinitions/identifiers"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedSiteAnnouncementsStore,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { openNativeKeyEditor } from "~~/scripts/flows/native-key-editor.mjs"

// Controlled native-contract fixtures, including variants unavailable in the live Lite account.
const accountId = "pmplan-semantics"
const account = () =>
  createStoredAccount({
    id: accountId,
    site_name: "PM-Plan fixture",
    site_url: origin,
    site_type: SITE_TYPES.PMPLAN,
    authType: AuthTypeEnum.Cookie,
    cookieAuth: { sessionCookie: "pmplan_session=fixture" },
    account_info: {
      id: "661",
      username: "sample",
      access_token: "",
      quota: undefined,
    },
  })
const dashboard = () => ({
  user: { id: 661, username: "sample" },
  plan: { name: "Lite" },
  usage: {
    h5_used: 250000,
    h5_limit: 1000000,
    weekly_used: 500000,
    weekly_limit: 2000000,
    monthly_used: 1000000,
    monthly_limit: 5000000,
    requests_30d: 12,
    tokens_30d: 450,
  },
  checkin: {
    today: "2026-11-03",
    checked_in_today: true,
    can_checkin: false,
    streak: 1,
  },
  daily_usage: [
    { day: "11-02", requests: 8, cost_micro: 900000 },
    { day: "11-03", requests: 3, cost_micro: 125000 },
  ],
  recent_usage: [],
})

test("PM-Plan personal notices preserve read facts and recover from authentication failure", async ({
  context,
  extensionId,
  extensionDir,
  page,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    siteAnnouncementNotifications: {
      enabled: false,
      notificationEnabled: false,
    },
  })
  await seedStoredAccounts(worker, [account()])
  const siteKey = `account:pmplan:${accountId}:${origin}`
  await seedSiteAnnouncementsStore(worker, {
    [siteKey]: {
      siteKey,
      siteName: "PM-Plan fixture",
      siteType: SITE_TYPES.PMPLAN,
      baseUrl: origin,
      accountId,
      sourceScope: "account",
      status: "success",
      lastSuccessAt: Date.now() - 60000,
      records: [],
    },
  })
  let unauthorized = false
  const methods: string[] = []
  await context.route(`${origin}/**`, async (route) => {
    methods.push(route.request().method())
    if (new URL(route.request().url()).pathname === "/api/me")
      return route.fulfill({ json: dashboard() })
    return route.fulfill(
      unauthorized
        ? { status: 401, json: { error: "Expired notice session" } }
        : {
            json: {
              notices: [
                {
                  id: 7,
                  user_id: 661,
                  title: "Account model update",
                  body: "A new model is available to your account.",
                  kind: "info",
                  is_read: false,
                  created_at: new Date().toISOString(),
                },
                {
                  id: 8,
                  user_id: 661,
                  title: "Previously read notice",
                  body: "Read on the native site.",
                  kind: "warning",
                  is_read: true,
                  created_at: new Date().toISOString(),
                },
              ],
              unread_count: 1,
            },
          },
    )
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#siteAnnouncements`,
  )
  await waitForExtensionRoot(page)
  const check = page
    .getByRole("button", { name: "Check now", exact: true })
    .first()
  await check.click()
  await expect(
    page.getByRole("heading", { name: "Account model update", exact: true }),
  ).toBeVisible()
  const readStore = async () => {
    const raw = await getPlasmoStorageRawValue<string>(
      worker,
      STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
    )
    return JSON.parse(raw!).sites[siteKey]
  }
  expect(
    (await readStore()).records.find(
      (r: { upstreamId: string }) => r.upstreamId === "7",
    ).read,
  ).toBe(false)
  expect(
    (await readStore()).records.find(
      (r: { upstreamId: string }) => r.upstreamId === "8",
    ).read,
  ).toBe(true)
  await captureVisualViews({
    page,
    ready: page.locator("[data-options-page-content]"),
    id: "pmplan-personal-notices",
    extensionDir,
  })
  await page.screenshot({
    path: testInfo.outputPath("pmplan-personal-notices.png"),
    animations: "disabled",
  })
  await page.getByRole("button", { name: "Mark read", exact: true }).click()
  await expect
    .poll(
      async () =>
        (await readStore()).records.find(
          (r: { upstreamId: string }) => r.upstreamId === "7",
        ).read,
    )
    .toBe(true)
  unauthorized = true
  await check.click()
  await expect.poll(async () => (await readStore()).status).toBe("error")
  await expect(
    page.getByText(/The check completed with 1 failed/),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("pmplan-notices-auth-error.png"),
    animations: "disabled",
  })
  unauthorized = false
  await check.click()
  await expect.poll(async () => (await readStore()).status).toBe("success")
  expect(
    (await readStore()).records.find(
      (r: { upstreamId: string }) => r.upstreamId === "7",
    ).read,
  ).toBe(true)
  expect(methods.every((method) => method === "GET")).toBe(true)
})

test("PM-Plan preserves rolling limits and unavailable metrics through account refresh and recovery", async ({
  context,
  extensionId,
  extensionDir,
  page,
}, testInfo) => {
  installExtensionPageGuards(page, {
    ignoreConsoleError: (message) =>
      (message.location().url === `${origin}/api/me` &&
        message.text().includes("401")) ||
      (message
        .location()
        .url.startsWith(`chrome-extension://${extensionId}/`) &&
        message.text().includes("AccountActionsContext") &&
        message.text().includes("Error refreshing account") &&
        message.text().includes("Failed to refresh PM-Plan fixture")),
  })
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    showTodayCashflow: true,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(worker, [account()])
  let body: Record<string, unknown> = { error: "unauthorized" }
  let responseStatus = 401
  let dashboardReads = 0
  await context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    expect(request.method()).toBe("GET")
    expect((await request.allHeaders()).authorization).toBeUndefined()
    if (new URL(request.url()).pathname === "/api/me") dashboardReads++
    await route.fulfill({ status: responseStatus, json: body })
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  const card = page.getByTestId(getAccountManagementListItemTestId(accountId))
  const stored = () =>
    worker.evaluate(async (id) => {
      const raw = await new Promise<unknown>((resolve) =>
        chrome.storage.local.get("site_accounts", (data) =>
          resolve(data.site_accounts),
        ),
      )
      const value = typeof raw === "string" ? JSON.parse(raw) : raw
      return value.accounts.find((account: { id: string }) => account.id === id)
    }, accountId)
  const refresh = async () => {
    const before = (await stored()).last_sync_time
    await card.getByTestId(accounts.rowMoreActionsButton).click()
    await page.getByTestId(accounts.rowRefreshMenuItem).click()
    await expect
      .poll(async () => (await stored()).last_sync_time)
      .toBeGreaterThan(before)
  }
  // The first failed read must not invent a zero cash balance or native data.
  await expect(
    card.getByRole("group", { name: "Unavailable", exact: true }),
  ).toBeVisible()
  const unavailableBalance = card.getByTitle("Click to refresh balance")
  await expect(unavailableBalance).not.toContainText("$0")
  const beforeFirstRead = await stored()
  const previousReads = dashboardReads
  await unavailableBalance.click()
  await expect.poll(() => dashboardReads).toBeGreaterThan(previousReads)
  await expect.poll(async () => (await stored()).health.reason).toContain("401")
  const firstFailure = await stored()
  expect(firstFailure.account_info.nativeBalance).toBeUndefined()
  expect(firstFailure.cookieAuth).toEqual(beforeFirstRead.cookieAuth)
  await expect(
    page.getByText("Failed to refresh PM-Plan fixture", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("PM-Plan fixture refreshed successfully!", { exact: true }),
  ).toHaveCount(0)
  await expect(
    card.getByRole("group", { name: "Unavailable", exact: true }),
  ).toBeVisible()
  await expect(unavailableBalance).not.toContainText("$0")
  await card.screenshot({
    path: testInfo.outputPath("pmplan-first-refresh-unavailable.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: card,
    id: "pmplan-first-refresh-unavailable",
    extensionDir,
  })
  responseStatus = 200
  body = dashboard()
  await refresh()
  await expect(card.getByRole("group", { name: /Lite · 5H/ })).toContainText(
    "$0.75",
  )
  expect((await stored()).account_info.today_requests_count).toBe(3)
  expect((await stored()).account_info.todayStatsAvailability.tokens).toEqual({
    status: "unavailable",
    reason: "unsupported",
  })
  await card
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  const detail = page.getByRole("dialog", {
    name: "Balance details",
    exact: true,
  })
  await expect(detail).toContainText("5H")
  await expect(detail).toContainText("7D")
  await expect(detail).toContainText("30D")
  await expect(detail).toContainText(/USD\s*0.25/)
  await expect(detail).toContainText(/USD\s*0.75/)
  await expect(detail).toContainText("Rolling")
  await detail.screenshot({
    path: testInfo.outputPath("pmplan-rolling-allowances.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: detail,
    id: "pmplan-rolling-allowances",
    extensionDir,
  })
  await page.keyboard.press("Escape")
  // Native Standard has a finite 5H/week cap and an unlimited monthly window.
  body = {
    ...dashboard(),
    plan: { name: "Standard" },
    usage: {
      ...dashboard().usage,
      h5_limit: 10000000,
      weekly_limit: 35000000,
      monthly_limit: null,
    },
  }
  await refresh()
  await expect(
    card.getByRole("group", { name: /Standard · 5H/ }),
  ).toContainText("$9.75")
  await card
    .getByRole("button", { name: "Balance details", exact: true })
    .click()
  await expect(detail).toContainText("Unlimited")
  await page.keyboard.press("Escape")
  // A missing natural-day point preserves unknown today data instead of a zero claim.
  body = { ...dashboard(), daily_usage: [] }
  await refresh()
  expect((await stored()).account_info.todayStatsAvailability.requests).toEqual(
    { status: "unavailable", reason: "invalid_payload" },
  )
  responseStatus = 401
  body = { error: "unauthorized" }
  const previous = await stored()
  await card.getByTestId(accounts.rowMoreActionsButton).click()
  await page.getByTestId(accounts.rowRefreshMenuItem).click()
  await expect.poll(async () => (await stored()).health.reason).toContain("401")
  const failed = await stored()
  expect(failed.last_sync_time).toBeGreaterThan(previous.last_sync_time)
  expect(
    failed.account_info.allowances.entries[0].constraint.remaining,
  ).toMatchObject({
    status: "stale",
    value:
      previous.account_info.allowances.entries[0].constraint.remaining.value,
  })
  expect(failed.account_info.usage.lastKnown).toBe(true)
  expect(failed.account_info.balance?.positions ?? []).toEqual([])
  expect(failed.cookieAuth).toEqual(previous.cookieAuth)
  responseStatus = 200
  body = dashboard()
  await refresh()
  await expect(card.getByRole("group", { name: /Lite · 5H/ })).toContainText(
    "$0.75",
  )
  await card.getByTestId(accounts.rowMoreActionsButton).click()
  await expect(page.getByTestId(accounts.rowRedeemMenuItem)).toHaveCount(0)
})

test("PM-Plan keeps a one-time key available after inventory readback fails", async ({
  context,
  extensionId,
  extensionDir,
  page,
}, testInfo) => {
  installExtensionPageGuards(page, {
    ignoreConsoleError: (message) =>
      message.location().url === `${origin}/api/keys` &&
      message.text().includes("503"),
  })
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(worker, [account()])
  let writes = 0
  await context.route(`${origin}/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.pathname === "/api/me") return route.fulfill({ json: dashboard() })
    if (url.pathname === "/api/models")
      return route.fulfill({ json: { models: [] } })
    if (url.pathname === "/api/keys" && request.method() === "POST") {
      writes++
      expect(request.postDataJSON().models).toEqual([])
      expect((await request.allHeaders())["x-pmplan-csrf"]).toBe("1")
      return route.fulfill({
        json: { id: 17, key: "sk-pm-controlled-one-time-secret" },
      })
    }
    if (url.pathname === "/api/keys")
      return writes
        ? route.fulfill({ status: 503, json: { error: "read unavailable" } })
        : route.fulfill({ json: { keys: [] } })
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected controlled route" },
    })
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=${accountId}`,
  )
  await waitForExtensionRoot(page)
  const editor = await openNativeKeyEditor(page, {
    trigger: page.getByTestId(keys.addTokenButton),
    readyField: page.locator("#resource-editor-expiry"),
  })
  await expect(page.locator("#resource-editor-expiry")).toContainText("Never")
  await expect(
    editor.getByRole("textbox", { name: "Token Name", exact: true }),
  ).toHaveCount(0)
  await expect(
    editor.getByLabel("Available Models", { exact: true }),
  ).toBeVisible()
  await editor.getByLabel("Available Models", { exact: true }).click()
  await expect(
    page.getByText("No options available", { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole("option")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.getByTestId(keys.nativeEditorSubmitButton)).toBeEnabled()
  await expect(
    editor.getByRole("group", { name: "Basic Information" }),
  ).toBeVisible()
  await page.locator("#resource-editor-expiry").click()
  await page.getByRole("option", { name: "Custom time", exact: true }).click()
  const customTime = editor.getByLabel("Custom time", { exact: true })
  await customTime.fill("2001-01-01T00:00")
  await page.getByTestId(keys.nativeEditorSubmitButton).click()
  await expect(customTime).toHaveAttribute("aria-invalid", "true")
  expect(writes).toBe(0)
  await customTime.fill("2099-01-01T00:00")
  await expect(customTime).toHaveAttribute("aria-invalid", "false")
  await editor.screenshot({
    path: testInfo.outputPath("pmplan-custom-expiry-empty-models.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: editor,
    id: "pmplan-custom-expiry-empty-models",
    extensionDir,
  })
  await page.getByTestId(keys.nativeEditorSubmitButton).click()
  await expect(page.getByTestId(provisioning.oneTimeKeyInput)).toHaveValue(
    "sk-pm-controlled-one-time-secret",
  )
  await expect(
    page.getByTestId(provisioning.oneTimeKeySaveButton),
  ).toBeEnabled()
  expect(writes).toBe(1)
})
