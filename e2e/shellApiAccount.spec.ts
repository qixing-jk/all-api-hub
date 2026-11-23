import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "~/features/KeyManagement/testIds"
import { MODEL_LIST_TEST_IDS as models } from "~/features/ModelList/testIds"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { refreshAccountRowsAndReadStorage } from "~~/e2e/scenarios/accountManualAdd"
import { verifyAccountModelCatalog } from "~~/e2e/scenarios/modelListCatalog"
import {
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  autoDetectAccountFromAddDialog,
  expectAccountListItemVisible,
  openAccountManagementPage,
  waitForSavedAccount,
} from "~~/e2e/utils/realSite/accountAdd"

const origin = "https://shell-gateway.example.com"
const user = { id: 42, username: "shell-fixture" }

for (const mode of ["cookie", "token", "manual-token"] as const) {
  const useCookie = mode === "cookie"
  const systemToken = "shell-system-token"
  test(`detects Shell, saves, reopens and refreshes via ${mode}`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const serviceWorker = await getServiceWorker(context)
    await seedUserPreferences(serviceWorker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      tempWindowFallback: { enabled: false },
    })

    const requests: string[] = []
    const profileAuth: { cookie: boolean; bearer: boolean }[] = []
    let quota = 750000
    let token: Record<string, unknown> | undefined
    await context.route(origin + "/**", async (route) => {
      const { pathname } = new URL(route.request().url())
      requests.push(route.request().method() + " " + pathname)
      if (pathname === "/" || pathname === "/account/profile")
        return route.fulfill({
          contentType: "text/html",
          body: "<title>Example Gateway</title>",
        })
      if (pathname === "/api/status")
        return route.fulfill({
          json: {
            success: true,
            data: {
              system_name: "Example Gateway",
              ShellApiLogOptimizerEnabled: false,
            },
          },
        })
      if (pathname === "/api/user/self") {
        const headers = await route.request().allHeaders()
        const cookie =
          headers.cookie?.includes("session=shell-fixture") === true
        const bearer = headers.authorization === `Bearer ${systemToken}`
        profileAuth.push({ cookie, bearer })
        if (!cookie && !bearer)
          return route.fulfill({ status: 401, json: { success: false } })
        return route.fulfill({
          json: {
            success: true,
            data: {
              ...user,
              quota,
              access_token:
                mode === "manual-token"
                  ? ""
                  : useCookie
                    ? "unverified-profile-token"
                    : systemToken,
            },
          },
        })
      }
      if (pathname === "/api/token/" && route.request().method() === "POST") {
        token = {
          id: 81,
          user_id: user.id,
          key: "sk-shell-test-key",
          status: 1,
          created_time: 1,
          accessed_time: 1,
          expired_time: -1,
          used_quota: 0,
          ...route.request().postDataJSON(),
        }
        return route.fulfill({ json: { success: true, data: token } })
      }
      if (pathname === "/api/token/")
        return route.fulfill({
          json: { success: true, data: token ? [token] : [] },
        })
      if (pathname === "/api/token/81") {
        if (route.request().method() === "DELETE") token = undefined
        return route.fulfill({ json: { success: true, data: token } })
      }
      if (pathname === "/api/groupPro/selectable")
        return route.fulfill({
          json: {
            success: true,
            data: [{ name: "default", convert_ratio: 1 }],
          },
        })
      if (pathname === "/api/user/available_model/")
        return route.fulfill({ json: { success: true, data: ["shell-model"] } })
      if (pathname === "/api/pricing")
        return route.fulfill({
          json: {
            success: true,
            data: [
              {
                model_name: "shell-model",
                quota_type: 0,
                model_ratio: 1,
                completion_ratio: 2,
                enable_groups: ["default"],
              },
            ],
            group_ratio: { default: 1 },
            usable_group: { default: "Default" },
          },
        })
      return route.fulfill({ status: 404, json: { success: false } })
    })

    const site = await context.newPage()
    await site.addInitScript((fixture) => {
      localStorage.setItem("USER_STATE", JSON.stringify({ user: fixture }))
      document.cookie = "session=shell-fixture; path=/; Secure; SameSite=None"
    }, user)
    await site.goto(origin)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openAccountManagementPage({ page, extensionId })
    const dialog = await autoDetectAccountFromAddDialog(
      page,
      origin,
      async () => {
        if (useCookie) {
          await page.getByTestId(accounts.authTypeTrigger).click()
          await page
            .getByRole("option", { name: "Cookie Authentication" })
            .click()
        }
        await site.bringToFront()
      },
    )

    await expect(dialog.siteTypeTrigger).toHaveAttribute(
      "data-site-type",
      SITE_TYPES.SHELL_API,
    )
    await expect(dialog.userIdInput).toHaveValue(String(user.id))
    await expect(dialog.usernameInput).toHaveValue(user.username)
    if (!useCookie)
      await expect(dialog.dialog).not.toContainText(
        "Uses the browser session for this site",
      )
    if (mode === "manual-token") {
      await expect(dialog.accessTokenInput).toHaveValue("")
      await expect(dialog.confirmAddButton).toBeHidden()
      await expect(dialog.dialog).toContainText("Use an existing System token")
      await dialog.dialog.screenshot({
        path: testInfo.outputPath("shell-manual-token-guide.png"),
        animations: "disabled",
      })
      const profilePagePromise = context.waitForEvent("page")
      await dialog.dialog
        .getByRole("button", { name: "Open account profile", exact: true })
        .click()
      const profilePage = await profilePagePromise
      await expect(profilePage).toHaveURL(origin + "/account/profile")
      await profilePage.close()
      await expect(dialog.userIdInput).toHaveValue(String(user.id))
      await expect(dialog.usernameInput).toHaveValue(user.username)
      await dialog.accessTokenInput.fill(systemToken)
    }
    if (!useCookie)
      await expect(dialog.accessTokenInput).toHaveValue(systemToken)
    await expect(dialog.confirmAddButton).toBeEnabled()
    await page.bringToFront()
    await dialog.dialog.screenshot({
      path: testInfo.outputPath("shell-account-detection.png"),
      animations: "disabled",
    })
    await dialog.confirmAddButton.click()
    await expect(dialog.dialog).toBeHidden()

    const account = await waitForSavedAccount({
      serviceWorker,
      siteType: SITE_TYPES.SHELL_API,
      baseUrl: origin,
      predicate: (saved) =>
        saved.account_info.balance?.positions.some(
          ({ amount }) => "value" in amount && amount.value === "1.5",
        ) ?? false,
    }).catch((error) => {
      throw new Error(
        "Shell account balance was not saved: " +
          JSON.stringify({ requests, profileAuth }),
        { cause: error },
      )
    })
    expect(account).toMatchObject({
      authType: useCookie ? AuthTypeEnum.Cookie : AuthTypeEnum.AccessToken,
      account_info: {
        id: String(user.id),
        username: user.username,
        access_token: useCookie ? "" : systemToken,
        balance: {
          positions: [
            expect.objectContaining({
              asset: expect.objectContaining({
                kind: "currency",
                code: "USD",
              }),
              amount: expect.objectContaining({ value: "1.5" }),
            }),
          ],
        },
      },
    })
    await site.close()
    if (!useCookie) await context.clearCookies()
    quota = 1250000
    const [refreshed] = await refreshAccountRowsAndReadStorage({
      page,
      serviceWorker,
      accountIds: [account.id],
      expectedBalances: [
        { value: "2.5", asset: { kind: "currency", code: "USD" } },
      ],
    })
    expect(refreshed?.account_info.balance?.positions[0]?.amount).toMatchObject(
      {
        source: {
          adapter: SITE_TYPES.SHELL_API,
          amountInputs: { quota: "1250000" },
        },
      },
    )

    const row = await expectAccountListItemVisible(page, account.id)
    await expect(row).toContainText("$2.50")
    await row.screenshot({
      path: testInfo.outputPath("shell-account-balance.png"),
      animations: "disabled",
    })
    await page.screenshot({
      path: testInfo.outputPath("shell-account-list.png"),
      animations: "disabled",
    })

    await row.hover()
    await row.getByTestId(accounts.rowEditButton).click()
    await expect(dialog.dialog).toBeVisible()
    await expect(dialog.siteUrlInput).toHaveValue(origin)
    await expect(dialog.siteTypeTrigger).toHaveAttribute(
      "data-site-type",
      SITE_TYPES.SHELL_API,
    )
    await expect(dialog.userIdInput).toHaveValue(String(user.id))
    await expect(dialog.usernameInput).toHaveValue(user.username)
    await expect(page.getByTestId(accounts.authTypeTrigger)).toContainText(
      useCookie ? "Cookie Authentication" : "Access Token Authentication",
    )
    if (useCookie) await expect(dialog.accessTokenInput).toBeHidden()
    else await expect(dialog.accessTokenInput).toHaveValue(systemToken)
    await dialog.dialog
      .getByRole("button", { name: "Cancel", exact: true })
      .click()
    await expect(dialog.dialog).toBeHidden()

    expect(requests).toContain("GET /api/status")
    expect(requests).toContain("GET /api/user/self")
    expect(profileAuth).toContainEqual({ cookie: true, bearer: false })
    expect(profileAuth.some(({ bearer }) => bearer)).toBe(!useCookie)
    if (!useCookie)
      expect(profileAuth).toContainEqual({ cookie: false, bearer: true })
    expect(requests).not.toContain("GET /api/user/token")
    expect(requests.some((request) => request.includes("/api/log/self"))).toBe(
      true,
    )
    expect(requests.every((request) => request.startsWith("GET "))).toBe(true)

    if (mode === "token") {
      await row.hover()
      await row.getByTestId(accounts.rowMoreActionsButton).click()
      for (const action of [
        accounts.rowKeyManagementMenuItem,
        accounts.rowModelManagementMenuItem,
      ]) {
        await expect(page.getByTestId(action)).toBeVisible()
        await expect(page.getByTestId(action)).toBeEnabled()
      }
      await page.getByRole("menuitem", { name: "Share", exact: true }).hover()
      await expect(
        page.getByTestId(accounts.rowCopyInviteLinkMenuItem),
      ).toBeEnabled()
      await page.keyboard.press("Escape")
      await row.getByTestId(accounts.rowMoreActionsButton).click()
      await page
        .getByRole("menuitem", { name: "Related pages", exact: true })
        .hover()
      await expect(page.getByTestId(accounts.rowRedeemMenuItem)).toBeEnabled()
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")
      const keyPage = await openKeyManagementForAccount({
        page,
        extensionId,
        accountId: account.id,
        openFromAccountRow: true,
      })
      await submitTokenCreationFromKeyManagementPage({
        page: keyPage,
        tokenName: "Shell test key",
        prepareEditor: async (editor) => {
          await editor.screenshot({
            path: testInfo.outputPath("shell-key-editor.png"),
            animations: "disabled",
          })
        },
      })
      const created = await expectTokenCreatedInKeyManagementPage({
        page: keyPage,
        tokenName: "Shell test key",
      })
      expect(token).toMatchObject({ name: "Shell test key" })
      await created.page.screenshot({
        path: testInfo.outputPath("shell-key-list.png"),
        animations: "disabled",
      })
      await deleteTokenFromKeyManagementPage({
        page: created.page,
        token: "Shell test key",
      })
      expect(token).toBeUndefined()
      await expect(created.page.getByTestId(keys.nativeKeyRow)).toHaveCount(0)
      const modelPage = await verifyAccountModelCatalog({
        page: created.page,
        extensionId,
        accountId: account.id,
        expectations: { modelNames: ["shell-model"], totalModels: 1 },
      })
      await modelPage.getByTestId(models.page).screenshot({
        path: testInfo.outputPath("shell-model-prices.png"),
        animations: "disabled",
      })
    }
  })
}
