import http from "node:http"
import type { AddressInfo } from "node:net"
import type { Locator } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_ROUTE_PARAMS } from "~/features/KeyManagement/constants"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedAutoCheckinStatus,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  E2E_BUILD_VARIANTS,
  readE2eBuildVariant,
} from "~~/e2e/utils/e2eBuildVariants"
import {
  closeOtherPages,
  getManifestRequiredPermissions,
  getServiceWorker,
  requestAndExpectOptionalPermissions,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test("AnyRouter authentication failures guide login setup and recover the saved Cookie", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  test.skip(
    readE2eBuildVariant() !== E2E_BUILD_VARIANTS.DnrRequired,
    "Requires real Cookie/DNR transport",
  )
  test.slow()
  const selfCookies: string[] = []
  let logins = 0
  let rejectOriginalCookie = false
  let holdLoginPage = false
  let requireBrowserProof = false
  const server = http.createServer(async (request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Content-Type", "application/json")
    if (path === "/api/status")
      return response.end(
        JSON.stringify({
          success: true,
          data: {
            system_name: "Any Router",
            github_oauth: true,
            github_client_id: "fixture",
            linuxdo_oauth: true,
            linuxdo_client_id: "fixture",
            turnstile_check: holdLoginPage,
            password_login_enabled: true,
            quota_per_unit: 500000,
          },
        }),
      )
    if (path === "/api/user/login") {
      logins++
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const credentials = JSON.parse(Buffer.concat(chunks).toString())
      if (
        credentials.username !== "member" ||
        credentials.password !== "fixture-password"
      ) {
        response.statusCode = 401
        return response.end(JSON.stringify({ success: false }))
      }
      response.setHeader("Set-Cookie", [
        "session=renewed; Path=/; HttpOnly; SameSite=Lax",
        ...(requireBrowserProof
          ? ["browser-proof=1; Path=/; HttpOnly; SameSite=Lax"]
          : []),
      ])
      return response.end(
        JSON.stringify({ success: true, data: { id: 17, username: "member" } }),
      )
    }
    if (path === "/api/user/self") {
      const cookie = request.headers.cookie ?? ""
      selfCookies.push(cookie)
      if (
        (requireBrowserProof && !cookie.includes("browser-proof=1")) ||
        (!cookie.includes("session=renewed") &&
          (rejectOriginalCookie || !cookie.includes("session=original")))
      ) {
        response.statusCode = 401
        return response.end(
          JSON.stringify({ success: false, message: "login required" }),
        )
      }
      return response.end(
        JSON.stringify({
          success: true,
          data: {
            id: 17,
            username: "member",
            quota: 5000000,
            used_quota: 0,
            request_count: 0,
          },
        }),
      )
    }
    if (path === "/api/user/auth/refresh") {
      response.statusCode = 401
      return response.end(JSON.stringify({ success: false }))
    }
    if (path === "/api/log/stat")
      return response.end(
        JSON.stringify({
          success: true,
          data: { quota: 0, token: 0, request_count: 0 },
        }),
      )
    if (path === "/api/token/" || path === "/api/token") {
      if (
        rejectOriginalCookie &&
        !request.headers.cookie?.includes("session=renewed")
      ) {
        response.statusCode = 401
        return response.end(
          JSON.stringify({ success: false, message: "login required" }),
        )
      }
      return response.end(JSON.stringify({ success: true, data: [] }))
    }
    if (path.startsWith("/api/"))
      return response.end(JSON.stringify({ success: true, data: {} }))
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    if (path === "/login" && holdLoginPage)
      return response.end(
        "<!doctype html><title>Waiting login fixture</title><p>Waiting for login verification</p>",
      )
    return response.end(
      path === "/login"
        ? `<!doctype html><title>Any Router native login fixture</title>
      <form><input name="username" autocomplete="username"><input type="password" autocomplete="current-password"><button type="submit">Login</button></form>
      <script>document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault(); const result=await fetch('/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.querySelector('[name=username]').value,password:document.querySelector('[type=password]').value})}).then(r=>r.json());localStorage.setItem('user',JSON.stringify(result.data));location.assign('/console');});</script>`
        : "<!doctype html><title>Any Router fixture</title>",
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    installExtensionPageGuards(page, {
      ignoreConsoleErrorPatterns: [
        /Failed to load resource: the server responded with a status of 401/u,
        /刷新账号数据失败/u,
        /Failed to load key list/u,
      ],
    })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      accountAutoRefresh: { enabled: false, refreshOnOpen: false },
      autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
      tempWindowFallback: { enabled: true },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "recover-anyrouter",
        site_name: "AnyRouter",
        site_type: SITE_TYPES.ANYROUTER,
        site_url: origin,
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=original" },
        login: undefined,
        account_info: { id: "17", username: "member", access_token: "" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(page)
    const required = await getManifestRequiredPermissions(page)
    await requestAndExpectOptionalPermissions(
      page,
      ["cookies", "declarativeNetRequestWithHostAccess"].filter(
        (p) => !required.includes(p),
      ),
    )
    const row = page.getByTestId(
      getAccountManagementListItemTestId("recover-anyrouter"),
    )
    await page.emulateMedia({ reducedMotion: "reduce" })
    const dialog = page.getByRole("dialog")
    const login = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionLogin,
    )
    const recoverySwitch = login.getByRole("switch", {
      name: "Automatically recover login",
    })
    const loginMethod = login.getByRole("combobox", { name: "Login method" })
    const expectUnconfiguredDestination = async () => {
      await expect(loginMethod).toBeFocused()
      await expect(recoverySwitch).not.toBeChecked()
      await expect(recoverySwitch).toBeDisabled()
      expect((await readStoredAccounts(worker))[0]?.login).toBeUndefined()
      expect(logins).toBe(0)
      await page.keyboard.press("Escape")
      await expect(dialog).not.toBeVisible()
    }
    rejectOriginalCookie = true
    await row.hover()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
      .click()
    await expect
      .poll(async () => (await readStoredAccounts(worker))[0]?.health.code)
      .toBe("authentication_required")
    expect(logins).toBe(0)
    const refreshNotification = page.getByRole("status").filter({
      hasText: /The website rejected the current login credentials/u,
    })
    await expect(refreshNotification).toBeVisible()
    await expect(
      page.getByText("AnyRouter refreshed successfully!", { exact: true }),
    ).not.toBeVisible()
    await refreshNotification.locator("..").screenshot({
      path: testInfo.outputPath("anyrouter-refresh-notification.png"),
      animations: "disabled",
    })
    await refreshNotification
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expect(loginMethod).toBeFocused()
    await expect(refreshNotification).not.toBeVisible()
    await expectUnconfiguredDestination()
    await row
      .getByRole("button", { name: "Click to refresh health status" })
      .focus()
    const healthGuidance = page
      .getByRole("tooltip")
      .filter({ hasText: "Configure login recovery" })
    await expect(healthGuidance).toBeVisible()
    await expect
      .poll(async () =>
        healthGuidance
          .getByText(/The website rejected the current login credentials/u)
          .evaluate((element) => {
            const textRange = document.createRange()
            textRange.selectNodeContents(element)
            return Array.from(textRange.getClientRects()).every((rect) => {
              const paintedElement = document.elementFromPoint(
                rect.right - 1,
                rect.top + rect.height / 2,
              )
              return element.contains(paintedElement)
            })
          }),
      )
      .toBe(true)
    const guidanceBounds = await healthGuidance
      .getByText(/The website rejected the current login credentials/u)
      .evaluate((element) => {
        const tooltip = element.closest('[role="tooltip"]')!
        const textRange = document.createRange()
        textRange.selectNodeContents(element)
        let visibleRight = window.innerWidth
        for (
          let ancestor = element.parentElement;
          ancestor;
          ancestor = ancestor.parentElement
        ) {
          if (
            /hidden|clip|auto|scroll/u.test(
              getComputedStyle(ancestor).overflowX,
            )
          ) {
            visibleRight = Math.min(
              visibleRight,
              ancestor.getBoundingClientRect().right,
            )
          }
        }
        return {
          textRight: textRange.getBoundingClientRect().right,
          popupRight: tooltip.getBoundingClientRect().right,
          visibleRight,
        }
      })
    expect(guidanceBounds.textRight).toBeLessThanOrEqual(
      Math.min(guidanceBounds.popupRight, guidanceBounds.visibleRight),
    )
    await healthGuidance.screenshot({
      path: testInfo.outputPath("anyrouter-authentication-failure.png"),
      animations: "disabled",
    })
    await healthGuidance
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expectUnconfiguredDestination()
    await row
      .getByRole("button", { name: "Click to refresh health status" })
      .focus()
    await healthGuidance
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expectUnconfiguredDestination()

    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.OVERVIEW}`,
    )
    await waitForExtensionRoot(page)
    const attention = page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.needsAttention)
    await expect(
      attention.getByRole("button", { name: "Configure login recovery" }),
    ).toBeVisible()
    await attention.screenshot({
      path: testInfo.outputPath("anyrouter-overview-recovery-guidance.png"),
      animations: "disabled",
    })
    await attention
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expectUnconfiguredDestination()

    await seedAutoCheckinStatus(worker, {
      lastRunAt: new Date().toISOString(),
      lastRunResult: AUTO_CHECKIN_RUN_RESULT.PARTIAL,
      perAccount: {
        "recover-anyrouter": {
          accountId: "recover-anyrouter",
          accountName: "AnyRouter",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
          timestamp: Date.now(),
        },
      },
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
    )
    await waitForExtensionRoot(page)
    const checkInFailure = page.getByRole("row").filter({
      has: page.getByRole("button", { name: "Configure login recovery" }),
    })
    await expect(checkInFailure).toBeVisible()
    await checkInFailure.screenshot({
      path: testInfo.outputPath("anyrouter-check-in-failure-guidance.png"),
      animations: "disabled",
    })
    await checkInFailure
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expectUnconfiguredDestination()

    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?${KEY_MANAGEMENT_ROUTE_PARAMS.AccountId}=recover-anyrouter#${MENU_ITEM_IDS.KEYS}`,
    )
    await waitForExtensionRoot(page)
    const keyRecoveryAction = page.getByRole("button", {
      name: "Configure login recovery",
    })
    await expect(keyRecoveryAction).toBeVisible()
    await keyRecoveryAction.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath("anyrouter-key-inventory-failure-guidance.png"),
      animations: "disabled",
    })
    await keyRecoveryAction.click()
    await expectUnconfiguredDestination()

    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyKeyButton).click()
    const copyDialog = page.getByRole("dialog")
    await expect(
      copyDialog.getByRole("button", { name: "Configure login recovery" }),
    ).toBeVisible()
    await copyDialog.screenshot({
      path: testInfo.outputPath("anyrouter-copy-key-failure-guidance.png"),
      animations: "disabled",
    })
    await copyDialog
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expect(page.getByRole("dialog")).toHaveCount(1)
    await expect(loginMethod).toBeFocused()

    const authentication = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth,
    )
    await authentication
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expect(loginMethod).toBeFocused()
    await expect(recoverySwitch).not.toBeChecked()
    await loginMethod.click()
    await page
      .getByRole("option", { name: "Password login", exact: true })
      .click()
    await login.getByLabel(/Login username/u).fill("member")
    await login.getByLabel(/^Login password/u).fill("fixture-password")
    await recoverySwitch.click()
    expect(logins).toBe(0)
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton)
      .click()
    await expect(dialog).not.toBeVisible()
    await expect
      .poll(
        async () =>
          (await readStoredAccounts(worker))[0]?.login?.automaticRecovery,
      )
      .toBe(true)
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    await expect(recoverySwitch).toBeChecked()
    await authentication.scrollIntoViewIfNeeded()
    await authentication.screenshot({
      path: testInfo.outputPath("anyrouter-cookie-auth-guidance.png"),
      animations: "disabled",
    })
    const authMethod = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger,
    )
    await authMethod.click()
    await page
      .getByRole("option", { name: "Access Token Authentication", exact: true })
      .click()
    await expect(recoverySwitch).toHaveCount(0)
    await expect(
      dialog
        .getByRole("navigation")
        .getByRole("button", { name: "Account login", exact: true }),
    ).toHaveCount(0)
    await authentication.screenshot({
      path: testInfo.outputPath("anyrouter-token-without-cookie-recovery.png"),
      animations: "disabled",
    })
    expect(
      (await readStoredAccounts(worker))[0]?.login?.automaticRecovery,
    ).toBe(true)
    await authMethod.click()
    await page
      .getByRole("option", { name: "Cookie Authentication", exact: true })
      .click()
    await expect(recoverySwitch).toBeChecked()
    await expect(login.getByLabel(/^Login password/u)).toHaveValue(
      "fixture-password",
    )
    await dialog.getByRole("navigation").screenshot({
      path: testInfo.outputPath("anyrouter-account-directory.png"),
      animations: "disabled",
    })
    await authentication
      .getByRole("button", { name: "Configure login recovery" })
      .click()
    await expect(
      dialog
        .getByRole("navigation")
        .getByRole("button", { name: "Account login", exact: true }),
    ).toHaveAttribute("aria-current", "location")
    await login.scrollIntoViewIfNeeded()
    await login.screenshot({
      path: testInfo.outputPath("anyrouter-login-recovery.png"),
      animations: "disabled",
    })
    const checkIn = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn,
    )
    await expect(
      checkIn.getByText("AgentRouter checks in by signing in again", {
        exact: true,
      }),
    ).toHaveCount(0)
    await checkIn.scrollIntoViewIfNeeded()
    await checkIn.screenshot({
      path: testInfo.outputPath("anyrouter-check-in-guidance.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await page
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
      .click()
    await expect
      .poll(
        async () =>
          (await readStoredAccounts(worker))[0]?.cookieAuth?.sessionCookie,
        { timeout: 60000 },
      )
      .toBe("session=renewed")
    await expect
      .poll(async () => (await readStoredAccounts(worker))[0]?.health.status, {
        timeout: 30000,
      })
      .toBe("healthy")
    expect(logins).toBe(1)
    expect((await readStoredAccounts(worker))[0]?.health.code).toBeUndefined()
    expect(
      selfCookies.some((cookie) => cookie.includes("session=original")),
    ).toBe(true)
    expect(
      selfCookies.some((cookie) => cookie.includes("session=renewed")),
    ).toBe(true)

    // The editor can recover immediately even when automatic recovery is off.
    const beforeManual = (await readStoredAccounts(worker))[0]!
    await seedStoredAccounts(worker, [
      {
        ...beforeManual,
        cookieAuth: { sessionCookie: "session=expired" },
        login: { ...beforeManual.login!, automaticRecovery: false },
      },
    ])
    await context.clearCookies()
    await page.reload()
    await waitForExtensionRoot(page)
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    const credential = dialog.getByRole("group", {
      name: "Session Cookie",
      exact: true,
    })
    const cookieInput = credential.getByRole("textbox")
    await credential
      .getByRole("button", { name: "Verify this Cookie", exact: true })
      .click()
    // The diagnostic has a 15s request deadline plus an eligible protected read;
    // wait for that bounded outcome rather than the default 10s UI assertion.
    await expect(credential.getByRole("status")).toContainText(
      "This Cookie is invalid.",
      { timeout: 60000 },
    )
    expect(logins).toBe(1)
    await credential.screenshot({
      path: testInfo.outputPath("cookie-manual-recovery-offered.png"),
      animations: "disabled",
    })
    // Closing the editor must retire its pending browser login before another run.
    holdLoginPage = true
    await credential
      .getByRole("button", { name: "Restore login", exact: true })
      .click()
    await expect
      .poll(
        () =>
          context
            .pages()
            .filter((candidate) => candidate.url() === `${origin}/login`)
            .length,
      )
      .toBe(1)
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect
      .poll(
        () =>
          context
            .pages()
            .filter((candidate) => candidate.url() === `${origin}/login`)
            .length,
      )
      .toBe(0)
    expect(logins).toBe(1)
    expect(
      (await readStoredAccounts(worker))[0]?.cookieAuth?.sessionCookie,
    ).toBe("session=expired")
    holdLoginPage = false
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    await credential
      .getByRole("button", { name: "Verify this Cookie", exact: true })
      .click()
    await expect(credential.getByRole("status")).toContainText(
      "This Cookie is invalid.",
      { timeout: 60000 },
    )
    // The browser can authenticate with an extra cookie that is not exported.
    // Recovery must reject the captured session by itself and preserve the draft.
    requireBrowserProof = true
    await credential
      .getByRole("button", { name: "Restore login", exact: true })
      .click()
    await expect(
      page.getByText(
        "Login recovery did not complete. Check your login settings or complete website verification, then try again.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 60000 })
    await expect(cookieInput).toHaveValue("session=expired")
    expect(
      (await readStoredAccounts(worker))[0]?.cookieAuth?.sessionCookie,
    ).toBe("session=expired")
    expect(logins).toBe(2)
    requireBrowserProof = false
    await context.clearCookies()
    await cookieInput.fill("")
    await expect(
      credential.getByRole("button", { name: "Restore login", exact: true }),
    ).toBeEnabled()
    await credential.screenshot({
      path: testInfo.outputPath("cookie-empty-recovery-offered.png"),
      animations: "disabled",
    })
    await credential
      .getByRole("button", { name: "Restore login", exact: true })
      .click()
    await expect(credential.getByRole("status")).toContainText(
      "Cookie verified for this account.",
      { timeout: 60000 },
    )
    await expect(cookieInput).toHaveValue("session=renewed")
    expect(logins).toBe(3)
    const beforeSave = (await readStoredAccounts(worker))[0]!
    expect(beforeSave.cookieAuth?.sessionCookie).toBe("session=expired")
    expect(beforeSave.login?.automaticRecovery).toBe(false)
    await credential.screenshot({
      path: testInfo.outputPath("cookie-manual-recovery-confirmed.png"),
      animations: "disabled",
    })
    await dialog
      .getByRole("button", { name: "Save Changes", exact: true })
      .click()
    await expect(dialog).not.toBeVisible()
    expect(
      (await readStoredAccounts(worker))[0]?.cookieAuth?.sessionCookie,
    ).toBe("session=renewed")
    expect(
      (await readStoredAccounts(worker))[0]?.login?.automaticRecovery,
    ).toBe(false)
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    await expect(credential.getByRole("textbox")).toHaveValue("session=renewed")
    await expect(credential.getByRole("status")).toHaveCount(0)
    await page.keyboard.press("Escape")

    const narrowPage = await context.newPage()
    await narrowPage.setViewportSize({ width: 390, height: 844 })
    await narrowPage.emulateMedia({ reducedMotion: "reduce" })
    installExtensionPageGuards(narrowPage, {
      ignoreConsoleErrorPatterns: [
        /Failed to load resource: the server responded with a status of 401/u,
      ],
    })
    await forceExtensionLanguage(narrowPage, "zh-CN")
    await narrowPage.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(narrowPage)
    const narrowRow = narrowPage.getByTestId(
      getAccountManagementListItemTestId("recover-anyrouter"),
    )
    await narrowRow.hover()
    await narrowRow
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
      .click()
    const narrowLogin = narrowPage.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionLogin,
    )
    await expect(
      narrowLogin.getByRole("switch", { name: "自动恢复登录" }),
    ).not.toBeChecked()
    const narrowAuthentication = narrowPage.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth,
    )
    await narrowAuthentication.scrollIntoViewIfNeeded()
    await narrowAuthentication.screenshot({
      path: testInfo.outputPath("anyrouter-cookie-auth-guidance-zh-narrow.png"),
      animations: "disabled",
    })
    const narrowCredential = narrowAuthentication.getByRole("group", {
      name: "会话 Cookie",
      exact: true,
    })
    await narrowCredential.getByRole("textbox").fill("session=invalid")
    const narrowVerify = narrowCredential.getByRole("button", {
      name: "验证这条 Cookie",
      exact: true,
    })
    const pagesBeforeCookieVerification = context.pages().length
    await narrowVerify.click()
    await expect(narrowCredential.getByRole("status")).toContainText(
      "Cookie 无效。",
      { timeout: 60000 },
    )
    await expect(
      narrowCredential.getByRole("button", { name: "恢复登录", exact: true }),
    ).toBeVisible()
    expect(context.pages()).toHaveLength(pagesBeforeCookieVerification)
    await narrowVerify.blur()
    await narrowPage.mouse.move(0, 0)
    await expect(narrowPage.getByRole("tooltip")).toHaveCount(0)
    expect(
      await narrowCredential.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1)
    await narrowCredential.screenshot({
      path: testInfo.outputPath("cookie-manual-recovery-zh-narrow.png"),
      animations: "disabled",
    })
    const alignment = await narrowCredential.evaluate((element) => {
      const input = element.querySelector("textarea")!
      const verify = element.querySelector("button")!
      const status = element.querySelector('[role="status"]')!
      const recover = status.querySelector("button")!
      const center = (node: Element) => {
        const box = node.getBoundingClientRect()
        return box.y + box.height / 2
      }
      const textCenter = (node: Element) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        let text = walker.nextNode()
        while (text && !text.textContent?.trim()) text = walker.nextNode()
        const range = document.createRange()
        range.selectNodeContents(text!)
        const box = range.getClientRects()[0]!
        return box.y + box.height / 2
      }
      const inputTextLeft =
        input.getBoundingClientRect().x +
        Number.parseFloat(getComputedStyle(input).paddingLeft)
      return {
        iconDelta: Math.abs(
          center(verify.querySelector("svg")!) -
            center(status.querySelector("svg")!),
        ),
        textDelta:
          Math.max(
            textCenter(verify),
            textCenter(status),
            textCenter(recover),
          ) -
          Math.min(textCenter(verify), textCenter(status), textCenter(recover)),
        leftDelta: Math.abs(
          verify.querySelector("svg")!.getBoundingClientRect().x -
            inputTextLeft,
        ),
      }
    })
    expect(alignment.iconDelta).toBeLessThanOrEqual(1)
    expect(alignment.textDelta).toBeLessThanOrEqual(1)
    expect(alignment.leftDelta).toBeLessThanOrEqual(1)
    const narrowCookieField = narrowCredential.locator("../..")
    await narrowCookieField.screenshot({
      path: testInfo.outputPath("cookie-help-closed-zh-narrow.png"),
      animations: "disabled",
    })
    const captureCookieHint = async (hint: Locator, filename: string) => {
      await expect(hint).toBeVisible()
      const hintBox = (await hint.boundingBox())!
      const fieldBox = (await narrowCookieField.boundingBox())!
      expect(hintBox.x).toBeGreaterThanOrEqual(0)
      expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(391)
      const top = Math.max(0, Math.min(hintBox.y, fieldBox.y) - 4)
      await narrowPage.screenshot({
        path: testInfo.outputPath(filename),
        animations: "disabled",
        clip: {
          x: 0,
          y: top,
          width: 390,
          height:
            Math.max(hintBox.y + hintBox.height, fieldBox.y + fieldBox.height) -
            top +
            4,
        },
      })
    }
    await narrowAuthentication
      .getByRole("button", {
        name: "Cookie 使用说明",
        exact: true,
      })
      .click()
    await expect(
      narrowAuthentication.getByText(/此账号保存了访问令牌/u),
    ).toHaveCount(0)
    await expect(
      narrowAuthentication.getByText(
        "如需确认输入框中的 Cookie 是否有效，请点击「验证」。",
        { exact: true },
      ),
    ).toBeVisible()
    await narrowCookieField.screenshot({
      path: testInfo.outputPath("cookie-compatibility-zh-narrow.png"),
      animations: "disabled",
    })
    const narrowCookieHelp = narrowAuthentication.getByRole("button", {
      name: "会话 Cookie 说明",
      exact: true,
    })
    await narrowCookieHelp.focus()
    await expect(narrowCookieHelp).toHaveAccessibleDescription(
      "网站登录后生成的会话 Cookie，可直接粘贴或从浏览器导入。同站点的不同账号需分别填写。",
    )
    await captureCookieHint(
      narrowPage
        .getByRole("tooltip")
        .filter({ hasText: "网站登录后生成的会话 Cookie" }),
      "cookie-session-help-zh-narrow.png",
    )
    const narrowImport = narrowAuthentication.getByRole("button", {
      name: "从当前登录导入",
      exact: true,
    })
    await narrowImport.focus()
    await expect(narrowImport).toHaveAccessibleDescription(
      "读取浏览器中此站点当前登录账号的 Cookie。",
    )
    await captureCookieHint(
      narrowPage
        .getByRole("tooltip")
        .filter({ hasText: "读取浏览器中此站点当前登录账号的 Cookie。" }),
      "cookie-import-help-zh-narrow.png",
    )
    await narrowVerify.focus()
    await expect(narrowVerify).toHaveAccessibleDescription(
      "检查这条 Cookie 是否有效，以及是否属于当前账号。",
    )
    await captureCookieHint(
      narrowPage.getByRole("tooltip").filter({
        hasText: "检查这条 Cookie 是否有效，以及是否属于当前账号。",
      }),
      "cookie-verification-help-zh-narrow.png",
    )
    await narrowAuthentication
      .getByRole("button", { name: "配置登录恢复" })
      .click()
    await expect(
      narrowLogin.getByRole("combobox", { name: "登录方式" }),
    ).toBeFocused()
    await narrowLogin.scrollIntoViewIfNeeded()
    await narrowLogin.screenshot({
      path: testInfo.outputPath("anyrouter-login-recovery-zh-narrow.png"),
      animations: "disabled",
    })
    const narrowCheckIn = narrowPage.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn,
    )
    await expect(
      narrowCheckIn.getByText("AgentRouter 通过重新登录触发签到", {
        exact: true,
      }),
    ).toHaveCount(0)
    await narrowCheckIn.scrollIntoViewIfNeeded()
    await narrowCheckIn.screenshot({
      path: testInfo.outputPath("anyrouter-check-in-guidance-zh-narrow.png"),
      animations: "disabled",
    })
    // A site change can hide an unfinished login; clearing must remain reachable.
    await narrowLogin
      .getByRole("textbox", { name: "登录用户名或邮箱" })
      .fill("")
    await narrowPage
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger)
      .click()
    await narrowPage
      .getByRole("option", { name: SITE_TYPES.NEW_API, exact: true })
      .click()
    const unfinishedLogin = narrowPage.locator('[data-tone="warning"]').filter({
      hasText: "当前修改的登录配置不完整，或此站点不支持该方式。",
    })
    await expect(unfinishedLogin).toBeVisible()
    await unfinishedLogin.scrollIntoViewIfNeeded()
    await unfinishedLogin.screenshot({
      path: testInfo.outputPath("unfinished-login-clear-zh-narrow.png"),
      animations: "disabled",
    })
    await unfinishedLogin
      .getByRole("button", { name: "清空", exact: true })
      .click()
    await expect(unfinishedLogin).toHaveCount(0)
    await narrowPage.close()
  } finally {
    await closeOtherPages(context)
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
