import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import {
  E2E_NEW_API_RC22_AUTH,
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { openAccountManagementPage } from "~~/e2e/utils/realSite/accountAdd"
import { withUiCreatedAccount } from "~~/scripts/cdp/sandbox.mjs"
import {
  assertAccountDetectionOutcome,
  detectAccountSiteType,
} from "~~/scripts/flows/auto-detect.mjs"

test("scoped-token New API detection preserves identity and guides the missing Access Token", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://scoped-token-detection.example.invalid"
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    dashboardAuthMode: "auth-bundle",
  })
  await context.route(`${baseUrl}/security`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<h1 id="security-access">Security settings</h1>',
    }),
  )
  await context.route(`${baseUrl}/api/user/self`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { id: 1, username: "e2e-user", quota: 500000 },
      },
    }),
  )
  let credentialWrites = 0
  let scopedProbes = 0
  await context.route(`${baseUrl}/api/user/access_tokens`, (route) => {
    if (route.request().method() !== "GET") credentialWrites++
    else scopedProbes++
    return route.fulfill({ json: { success: true, data: [] } })
  })
  await context.route(`${baseUrl}/api/user/token`, (route) => {
    credentialWrites++
    return route.fulfill({
      status: 403,
      json: { success: false, code: "AUTH_INSUFFICIENT_PRIVILEGE" },
    })
  })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoFillCurrentSiteUrlOnAccountAdd: false,
    autoProvisionKeyOnAccountAdd: false,
  })
  const site = await context.newPage()
  await site.goto(baseUrl)
  await openAccountManagementPage({ page, extensionId })
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill(baseUrl)
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()
  await assertAccountDetectionOutcome({
    page,
    expectedType: SITE_TYPES.NEW_API,
    fields: {
      userIdInput: "1",
      usernameInput: "e2e-user",
      siteUrlInput: baseUrl,
      accessTokenInput: "",
    },
    guidance: "Enter an Access Token manually",
    saveState: "absent",
  })
  await expect(
    dialog.getByText(/profile, account settings, or token management page/),
  ).toBeVisible()
  const openSecurity = dialog.getByRole("button", {
    name: "Open token page",
    exact: true,
  })
  await expect(openSecurity).toBeEnabled()
  const opened = context.waitForEvent("page")
  await openSecurity.click()
  const security = await opened
  // tabs.create may navigate before Playwright attaches route interception.
  // Read the browser's actual destination before replaying only this fixture GET.
  let destination = ""
  await expect
    .poll(async () => {
      destination = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        })
        return tab?.url ?? ""
      })
      return destination
    })
    .toBe(`${baseUrl}/security#security-access`)
  await security.goto(destination)
  await expect(
    security.getByRole("heading", { name: "Security settings" }),
  ).toBeVisible()
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
  ).toHaveValue("1")
  expect(credentialWrites).toBe(0)
  expect(scopedProbes).toBeGreaterThan(0)
  expect(
    (await readStoredAccounts(worker)).filter(
      (account) => account.site_url === baseUrl,
    ),
  ).toEqual([])
})

for (const dashboardAuthMode of ["legacy", "auth-bundle"] as const) {
  test(`Options reads an existing ${dashboardAuthMode} account tab without opening another page`, async ({
    context,
    page,
    extensionId,
  }) => {
    const baseUrl = "https://options-existing-tab.example.invalid"
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, { baseUrl, dashboardAuthMode })
    await seedUserPreferences(await getServiceWorker(context), {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      autoProvisionKeyOnAccountAdd: false,
    })

    const sitePage = await context.newPage()
    await sitePage.goto(baseUrl)
    if (dashboardAuthMode === "legacy") {
      await sitePage.evaluate(() => {
        localStorage.setItem(
          "user",
          JSON.stringify({ id: 1, username: "e2e-user" }),
        )
      })
    }

    await openAccountManagementPage({ page, extensionId })
    await page.bringToFront()
    await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
    const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
      .fill(baseUrl)

    const openedPages: string[] = []
    context.on("page", (openedPage) => openedPages.push(openedPage.url()))
    await detectAccountSiteType({ page, expectedType: SITE_TYPES.NEW_API })
    await assertAccountDetectionOutcome({
      page,
      expectedType: SITE_TYPES.NEW_API,
      fields: {
        userIdInput: "1",
        usernameInput: "e2e-user",
        siteUrlInput: baseUrl,
        accessTokenInput: "e2e-token",
      },
      saveState: "enabled",
    })
    expect(openedPages).toEqual([])
    expect(sitePage.isClosed()).toBe(false)
    expect(page.isClosed()).toBe(false)
  })
}

test("Options detects and saves a white-label AuthBundle account through a temporary tab", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://options-nailao-detection.example.invalid"
  const origin = new URL(baseUrl).origin
  const managementPat = E2E_NEW_API_RC22_AUTH.managementPat
  const dashboardToken = E2E_NEW_API_RC22_AUTH.dashboardToken
  const refreshPageUrls: string[] = []
  let unauthorizedSelfReads = 0

  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    title: "奶酪公益站 - 免费AI公益站｜注册即送额度，每日签到",
    systemName: "奶酪公益站",
    dashboardAuthMode: "auth-bundle",
    accessToken: managementPat,
  })
  await context.route(`${origin}/api/user/self`, async (route) => {
    const authorization = route.request().headers()["authorization"]
    const isDashboardRequest = authorization === `Bearer ${dashboardToken}`
    const isPatRequest = authorization === `Bearer ${managementPat}`
    if (isDashboardRequest || isPatRequest) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            id: 1,
            username: "e2e-user",
            ...(isPatRequest ? { access_token: managementPat } : {}),
          },
        }),
      })
      return
    }

    unauthorizedSelfReads += 1
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "AUTH_UNAUTHORIZED",
        message: "invalid access token",
      }),
    })
  })
  await context.route(`${origin}/api/user/auth/refresh`, async (route) => {
    refreshPageUrls.push(route.request().frame().page().url())
    await route.fallback()
  })

  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    autoFillCurrentSiteUrlOnAccountAdd: false,
    autoProvisionKeyOnAccountAdd: false,
    logging: { consoleEnabled: true, level: "info" },
    tempWindowFallback: { enabled: true, tempContextMode: "tab" },
  })

  await openAccountManagementPage({ page, extensionId })
  await page.bringToFront()
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill(baseUrl)

  // With no open site tab, this explicit add flow must read the site through
  // its temporary browsing context. The visible title/status name are custom,
  // while the unauthenticated identity endpoint only reports a generic 401.
  const temporaryPagePromise = context.waitForEvent("page")
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()
  const temporaryPage = await temporaryPagePromise
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
  ).toHaveValue("1")
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger),
  ).toHaveAttribute("data-site-type", SITE_TYPES.NEW_API)
  expect(new URL(temporaryPage.url()).origin).toBe(origin)
  expect(refreshPageUrls.some((url) => new URL(url).origin === origin)).toBe(
    true,
  )
  expect(unauthorizedSelfReads).toBeGreaterThan(0)
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
  ).toHaveValue(managementPat)
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
  ).toBeEnabled()
  await withUiCreatedAccount(
    serviceWorker,
    async (name) => {
      await dialog
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
        .fill(name)
      await dialog
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton)
        .click()
      await expect(dialog).toBeHidden()
    },
    async (saved) => {
      expect(saved.account_info.id).toBe("1")
      expect(saved.account_info.access_token).toBe(managementPat)
      expect(JSON.stringify(saved)).not.toContain(
        E2E_NEW_API_RC22_AUTH.dashboardToken,
      )
    },
  )
  expect(
    (await readStoredAccounts(serviceWorker)).filter(
      (account) => account.site_url === baseUrl,
    ),
  ).toEqual([])

  await expect
    .poll(async () => {
      const history = await getPlasmoStorageJsonValue<{
        entries: { scope: string; message: string; details: string | null }[]
      }>(serviceWorker, STORAGE_KEYS.LOG_HISTORY)
      return (
        history?.entries.some((entry) => {
          if (
            entry.scope !== "RuntimeMessages" ||
            entry.message !== "AccountDetectionRelay"
          )
            return false
          try {
            const relay = JSON.parse(entry.details ?? "null") as {
              event?: string
              details?: {
                events?: {
                  event: string
                  siteType?: string
                  extractor?: string
                }[]
              }
            } | null
            return (
              relay?.event === "detection_finished" &&
              relay.details?.events?.some(
                (event) =>
                  event.event === "extractor_started" &&
                  event.extractor === "new-api-auth-bundle" &&
                  event.siteType === SITE_TYPES.UNKNOWN,
              )
            )
          } catch {
            return false
          }
        }) ?? false
      )
    })
    .toBe(true)
})

test("Options discovers and saves an unknown Sub2API account through the shared temporary-tab probe", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://options-sub2-probe.example.invalid"
  const user = {
    id: 123,
    username: "probe-user",
    email: "probe@example.invalid",
    balance: 2,
  }
  const accessToken = "e2e-sub2-probe-token"
  let verifiedPageReads = 0
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(`${baseUrl}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === "/api/v1/auth/me") {
      if (request.headers().authorization === `Bearer ${accessToken}`) {
        verifiedPageReads += 1
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ code: 0, message: "ok", data: user }),
        })
      } else {
        // The extension's unauthenticated detector cannot classify this shielded
        // response; only the logged-in page can confirm the account protocol.
        await route.fulfill({
          status: 401,
          contentType: "text/html",
          body: "Authentication required",
        })
      }
      return
    }
    if (path === "/api/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { system_name: "Custom AI Console" },
        }),
      })
      return
    }
    if (path === "/api/user/self") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Unauthorized" }),
      })
      return
    }
    if (path.startsWith("/api/")) {
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "Not found",
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><title>Custom AI Console</title><script>
      localStorage.setItem('auth_token', ${JSON.stringify(accessToken)});
      localStorage.setItem('auth_user', JSON.stringify(${JSON.stringify(user)}));
    </script><h1>Custom AI Console</h1>`,
    })
  })
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    autoFillCurrentSiteUrlOnAccountAdd: false,
    autoProvisionKeyOnAccountAdd: false,
    tempWindowFallback: { enabled: true, tempContextMode: "tab" },
  })
  await openAccountManagementPage({ page, extensionId })
  await page.bringToFront()
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill(baseUrl)
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
  ).toHaveValue("123")
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger),
  ).toHaveAttribute("data-site-type", SITE_TYPES.SUB2API)
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
  ).toHaveValue(accessToken)
  expect(verifiedPageReads).toBeGreaterThan(0)
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
  ).toBeEnabled()
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton).click()
  await expect(dialog).toBeHidden()
  const saved = (await readStoredAccounts(serviceWorker)).find(
    (account) => account.site_url === baseUrl,
  )
  expect(saved?.site_type).toBe(SITE_TYPES.SUB2API)
  expect(saved?.account_info.id).toBe("123")
  expect(saved?.account_info.access_token).toBe(accessToken)
})
