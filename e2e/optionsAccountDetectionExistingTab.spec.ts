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
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton)
      .click()
    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
    ).toHaveValue("1")
    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
    ).toBeEnabled()
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
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton).click()
  await expect(dialog).toBeHidden()

  const saved = (await readStoredAccounts(serviceWorker)).find(
    (account) =>
      account.site_type === SITE_TYPES.NEW_API && account.site_url === baseUrl,
  )
  expect(saved?.account_info.id).toBe("1")
  expect(saved?.account_info.access_token).toBe(managementPat)
  expect(JSON.stringify(saved)).not.toContain(
    E2E_NEW_API_RC22_AUTH.dashboardToken,
  )

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
