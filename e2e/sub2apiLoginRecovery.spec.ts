import http from "node:http"
import type { AddressInfo } from "node:net"
import type { BrowserContext, Locator, Page, TestInfo } from "@playwright/test"

import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_ROUTE_PARAMS } from "~/features/AccountManagement/routeParams"
import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "~/features/AccountManagement/testIds"
import en from "~/locales/en/accountDialog.json" with { type: "json" }
import zhCn from "~/locales/zh-CN/accountDialog.json" with { type: "json" }
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const presentations = [
  { locale: "en", theme: "light", copy: en },
  { locale: "zh-CN", theme: "dark", copy: zhCn },
] as const

test("Sub2API manual token gains login recovery and subsequent refresh-token renewal", async ({
  context,
  page,
  extensionId,
  extensionDir,
}, testInfo) => {
  await runLoginRecovery({ context, page, extensionId, extensionDir }, testInfo)
})

for (const presentation of presentations) {
  test(`Sub2API session modes on desktop and Popup (${presentation.locale} ${presentation.theme})`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }, testInfo) => {
    await runLoginRecovery(
      { context, page, extensionId, extensionDir },
      testInfo,
      presentation,
    )
  })
}

async function runLoginRecovery(
  {
    context,
    page,
    extensionId,
    extensionDir,
  }: {
    context: BrowserContext
    page: Page
    extensionId: string
    extensionDir: string
  },
  testInfo: TestInfo,
  presentation?: (typeof presentations)[number],
) {
  test.slow()
  let accessToken = "original"
  let logins = 0
  const refreshBodies: unknown[] = []
  const user = {
    id: 17,
    email: "member@example.com",
    username: "member",
    balance: 12.5,
  }
  const server = http.createServer(async (request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Content-Type", "application/json")
    const send = (data: unknown) =>
      response.end(JSON.stringify({ code: 0, message: "success", data }))
    if (path === "/api/v1/settings/public")
      return send({ site_name: "Sub2API", password_login_enabled: true })
    if (path === "/api/v1/auth/login") {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const credentials = JSON.parse(Buffer.concat(chunks).toString())
      if (
        credentials.email !== "member@example.com" ||
        credentials.password !== "fixture-password"
      ) {
        response.statusCode = 401
        return response.end(
          JSON.stringify({ code: 401, message: "invalid credentials" }),
        )
      }
      logins++
      accessToken = "login-access"
      return send({
        user,
        access_token: accessToken,
        refresh_token: "login-refresh",
        expires_in: 3600,
      })
    }
    if (path === "/api/v1/auth/refresh") {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      refreshBodies.push(body)
      if (body.refresh_token !== "login-refresh") {
        response.statusCode = 401
        return response.end(
          JSON.stringify({ code: 401, message: "invalid refresh token" }),
        )
      }
      accessToken = "rotated-access"
      return send({
        access_token: accessToken,
        refresh_token: "rotated-refresh",
        expires_in: 3600,
      })
    }
    if (path === "/api/v1/auth/me") {
      if (request.headers.authorization !== `Bearer ${accessToken}`) {
        response.statusCode = 401
        return response.end(
          JSON.stringify({ code: 401, message: "login required" }),
        )
      }
      return send(user)
    }
    if (path === "/api/v1/usage/stats")
      return send({
        total_actual_cost: 0,
        total_requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      })
    if (path.startsWith("/api/")) return send([])
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    return response.end(
      path === "/login"
        ? `<!doctype html><title>Sub2API login fixture</title><form><input name="email" type="email" autocomplete="username"><input type="password" autocomplete="current-password"><button type="submit">Login</button></form><script>document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const result=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.querySelector('[name=email]').value,password:document.querySelector('[type=password]').value})}).then(r=>r.json());const data=result.data;localStorage.setItem('auth_user',JSON.stringify(data.user));localStorage.setItem('auth_token',data.access_token);localStorage.setItem('refresh_token',data.refresh_token);localStorage.setItem('token_expires_at',String(Date.now()+data.expires_in*1000));location.assign('/dashboard');});</script>`
        : "<!doctype html><title>Sub2API</title><main>Dashboard fixture</main>",
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    installExtensionPageGuards(page, {
      // The expired identity request and credential-free protocol probe are
      // expected rejections. Their recovery outcomes are asserted below.
      ignoreConsoleError: (message) =>
        [`${origin}/api/v1/auth/me`, `${origin}/api/v1/auth/refresh`].includes(
          message.location().url,
        ) && message.text().includes("status of 401"),
    })
    await forceExtensionLanguage(page, presentation?.locale ?? "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      ...(presentation && {
        themeMode: presentation.theme,
        language: presentation.locale,
      }),
      openChangelogOnUpdate: false,
      accountAutoRefresh: {
        ...DEFAULT_PREFERENCES.accountAutoRefresh,
        enabled: false,
        refreshOnOpen: false,
      },
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: false,
      },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "sub2api-recovery",
        site_name: "Sub2API recovery",
        site_type: SITE_TYPES.SUB2API,
        site_url: origin,
        authType: AuthTypeEnum.AccessToken,
        account_info: {
          id: "17",
          username: "member",
          access_token: "original",
        },
        sub2apiAuth: undefined,
        login: undefined,
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(page)
    await page.emulateMedia({ reducedMotion: "reduce" })
    if (presentation) {
      await verifySessionModes({
        context,
        page,
        extensionId,
        presentation,
        testInfo,
      })
      expect(logins).toBeGreaterThanOrEqual(1)
      expect(
        (await readStoredAccounts(worker))[0]?.sub2apiAuth?.refreshToken,
      ).toBe("login-refresh")
      return
    }
    const row = page.getByTestId(
      getAccountManagementListItemTestId("sub2api-recovery"),
    )
    await row.hover()
    await row.getByTestId(ids.rowEditButton).click()
    const dialog = page.getByRole("dialog", {
      name: "Edit Account",
      exact: true,
    })
    await expect(dialog).toBeVisible()
    const disclosure = dialog.getByTestId(ids.sub2apiManualDisclosure)
    const save = dialog.getByRole("button", {
      name: "Save Changes",
      exact: true,
    })
    await dialog.getByTestId(ids.sub2apiIndependentSessionOption).click()
    await disclosure.click()
    const importSession = dialog.getByTestId(ids.sub2apiImportSessionButton)
    await expect(importSession).toHaveText("Import from site")
    await expect(importSession).toHaveAccessibleDescription(
      "Importing shares your browser session. Using it in multiple places can interrupt renewal.",
    )
    const manualToken = dialog.getByTestId(ids.sub2apiRefreshTokenInput)
    await expect(manualToken).toHaveValue("")
    await disclosure.evaluate((button) =>
      button.scrollIntoView({ block: "center" }),
    )
    await dialog.screenshot({
      path: testInfo.outputPath("manual-ordinary.png"),
      animations: "disabled",
    })
    await disclosure.click()
    await save.click()
    const setupLogin = dialog.getByRole("button", { name: "Set up login" })
    await expect(setupLogin).toBeFocused()
    await expect(setupLogin).not.toHaveAttribute("aria-invalid")
    await disclosure.click()
    await save.click()
    const labeledToken = dialog.getByLabel("Refresh Token", { exact: true })
    await expect(labeledToken).toBeFocused()
    await expect(labeledToken).toHaveAttribute("aria-invalid", "true")
    await expect(labeledToken).toHaveAccessibleDescription(
      "Enter a Refresh Token or use the login options above.",
    )
    await dialog.screenshot({
      path: testInfo.outputPath("manual-validation.png"),
      animations: "disabled",
    })
    await dialog.getByTestId(ids.sub2apiBrowserSessionOption).click()
    const login = dialog.getByTestId(ids.accountFormSectionLogin)
    await login.getByRole("combobox", { name: "Login method" }).click()
    await page.getByRole("option", { name: /password/i }).click()
    await login.locator("#account-login-username").fill("member@example.com")
    await login.locator("#account-login-password").fill("fixture-password")
    const toggle = login.getByRole("switch", {
      name: "Automatic login recovery",
    })
    await expect(toggle).not.toBeChecked()
    await toggle.click()
    await login.screenshot({
      path: testInfo.outputPath("sub2api-login-settings.png"),
      animations: "disabled",
    })
    await captureVisualViews({
      page,
      ready: login,
      id: "sub2api-login-recovery",
      extensionDir,
    })
    await dialog
      .getByRole("button", { name: "Save Changes", exact: true })
      .click()
    await expect(dialog).not.toBeVisible()
    const completion = page.getByRole("dialog", {
      name: "Create API Key",
      exact: true,
    })
    await expect(completion).toBeVisible()
    await completion
      .getByRole("button", { name: "Cancel", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await readStoredAccounts(worker))[0]?.login?.automaticRecovery,
      )
      .toBe(true)
    expect((await readStoredAccounts(worker))[0]?.sub2apiAuth).toBeUndefined()
    const refresh = async () => {
      await row.hover()
      await row.getByTestId(ids.rowMoreActionsButton).click()
      await page.getByTestId(ids.rowRefreshMenuItem).click()
    }
    accessToken = "expired"
    await refresh()
    await expect
      .poll(
        async () =>
          (await readStoredAccounts(worker))[0]?.account_info.access_token,
        { timeout: 90000 },
      )
      .toBe("login-access")
    const recovered = (await readStoredAccounts(worker))[0]!
    expect(recovered.sub2apiAuth?.refreshToken).toBe("login-refresh")
    expect(recovered.sub2apiAuth?.tokenExpiresAt).toBeGreaterThan(Date.now())
    expect(logins).toBe(1)
    accessToken = "expired-again"
    await refresh()
    await expect
      .poll(
        async () =>
          (await readStoredAccounts(worker))[0]?.account_info.access_token,
        { timeout: 90000 },
      )
      .toBe("rotated-access")
    expect(
      (await readStoredAccounts(worker))[0]?.sub2apiAuth?.refreshToken,
    ).toBe("rotated-refresh")
    expect(refreshBodies).toEqual([
      { refresh_token: "" },
      { refresh_token: "login-refresh" },
    ])
    expect(logins).toBe(1)
    await row.hover()
    await row.getByTestId(ids.rowEditButton).click()
    await expect(toggle).toBeChecked()
    await expect(login.locator("#account-login-username")).toHaveValue(
      "member@example.com",
    )
  } finally {
    await Promise.all(
      context.pages().map((tab) => tab.close().catch(() => undefined)),
    )
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

async function verifySessionModes({
  context,
  page,
  extensionId,
  presentation: { locale, theme, copy },
  testInfo,
}: {
  context: BrowserContext
  page: Page
  extensionId: string
  presentation: (typeof presentations)[number]
  testInfo: TestInfo
}) {
  const openEditor = async (surface: Page) => {
    const row = surface.getByTestId(
      getAccountManagementListItemTestId("sub2api-recovery"),
    )
    await row.hover()
    await row.getByTestId(ids.rowEditButton).click()
    const dialog = surface.getByRole("dialog", { name: copy.title.edit })
    await expect(dialog).toBeVisible()
    await expect(surface.locator("html")).toHaveClass(
      theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b).*$/,
    )
    return dialog
  }

  const prepareEditor = async (surface: Page, kind: "desktop" | "popup") => {
    const dialog = await openEditor(surface)
    const browser = dialog.getByTestId(ids.sub2apiBrowserSessionOption)
    const independent = dialog.getByTestId(ids.sub2apiIndependentSessionOption)
    const panelAction = dialog.getByTestId(ids.sub2apiLoginSessionButton)
    const manual = dialog.getByTestId(ids.sub2apiManualDisclosure)
    const login = dialog.getByTestId(ids.accountFormSectionLogin)
    const acquire = login.getByTestId(ids.sub2apiLoginSectionAcquireButton)
    const screenshot = async (state: string, anchor?: Locator) => {
      if (anchor) {
        await expect(anchor).toBeVisible()
        await anchor.evaluate((element) =>
          element.scrollIntoView({ block: "center" }),
        )
      }
      await surface.evaluate(() => document.fonts.ready)
      await surface.screenshot({
        path: testInfo.outputPath(`${kind}-${state}.png`),
        animations: "disabled",
      })
    }
    await expect(
      browser.getByRole("radio", { name: copy.form.sub2apiBrowserSession }),
    ).toBeChecked()
    await screenshot("site-information")
    await screenshot("browser-session", browser)
    await independent.click()
    await expect(independent.getByRole("radio")).toBeChecked()
    const setup = dialog.getByRole("button", {
      name: copy.form.sub2apiLoginSetupAction,
    })
    await screenshot("unconfigured", setup)
    await manual.click()
    await screenshot(
      "manual-expanded",
      dialog.getByTestId(ids.sub2apiRefreshTokenInput),
    )
    await manual.click()
    await setup.click()
    await login.getByRole("combobox", { name: copy.login.method }).click()
    await surface
      .getByRole("option", { name: copy.login.passwordMethod })
      .click()
    await login.locator("#account-login-username").fill("member@example.com")
    await expect(acquire).toHaveCount(0)
    await login.locator("#account-login-password").fill("fixture-password")
    await expect(acquire).toBeEnabled()
    await expect(panelAction).toHaveText(copy.form.sub2apiLoginForSession)
    await screenshot("configured", panelAction)
    await screenshot("login-action", acquire)
    return { dialog, panelAction, acquire, login, screenshot }
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  const desktop = await prepareEditor(page, "desktop")
  const openPopup = async () => {
    const popup = await context.newPage()
    await popup.setViewportSize({ width: 390, height: 720 })
    await popup.emulateMedia({ reducedMotion: "reduce" })
    await forceExtensionLanguage(popup, locale)
    await popup.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
    await waitForExtensionRoot(popup)
    return popup
  }
  let popup = await openPopup()
  try {
    const popupDraft = await prepareEditor(popup, "popup")
    await expect(popupDraft.acquire).toHaveAccessibleDescription(
      new RegExp(
        copy.form.sub2apiLoginSidePanelHelp +
          "|" +
          copy.form.sub2apiLoginFullPageHelp,
      ),
    )
    await popupDraft.acquire.click()
    await expect.poll(() => popup.isClosed()).toBe(true)
    await expect
      .poll(() =>
        page.evaluate(
          ({ sidePanelPath, routeParam, loginTestId, readyText }) =>
            chrome.extension.getViews().some((view) => {
              const location = new URL(view.location.href)
              const isReceiver =
                location.pathname === `/${sidePanelPath}` ||
                location.searchParams.has(routeParam)
              return (
                isReceiver &&
                Array.from(
                  view.document.querySelectorAll(
                    `[data-testid="${loginTestId}"] [role="status"]`,
                  ),
                ).some((status) => status.textContent?.includes(readyText))
              )
            }),
          {
            sidePanelPath: SIDEPANEL_PAGE_PATH,
            routeParam: ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountDialogRecovery,
            loginTestId: ids.accountFormSectionLogin,
            readyText: copy.login.sub2apiSessionReady,
          },
        ),
      )
      .toBe(true)
    const worker = await getServiceWorker(context)
    expect((await readStoredAccounts(worker))[0]?.sub2apiAuth).toBeUndefined()

    await desktop.acquire.click()
    const ready = desktop.login.getByRole("status").filter({
      hasText: copy.login.sub2apiSessionReady,
    })
    await expect(ready).toBeInViewport()
    await expect(ready).toBeFocused()
    await expect(desktop.acquire).toHaveCount(0)
    await desktop.screenshot("login-confirmed")
    await expect(desktop.panelAction).toHaveText(copy.form.sub2apiReacquire)
    await desktop.screenshot("acquired", desktop.panelAction)
    await desktop.dialog
      .getByRole("button", { name: copy.actions.saveChanges })
      .click()
    await expect(desktop.dialog).toBeHidden()

    popup = await openPopup()
    const popupSaved = await openEditor(popup)
    const reacquire = popupSaved.getByTestId(ids.sub2apiLoginSessionButton)
    await expect(reacquire).toHaveText(copy.form.sub2apiReacquire)
    await reacquire.evaluate((button) =>
      button.scrollIntoView({ block: "center" }),
    )
    await popup.screenshot({
      path: testInfo.outputPath("popup-acquired.png"),
      animations: "disabled",
    })
    const popupReady = popupSaved
      .getByTestId(ids.accountFormSectionLogin)
      .getByRole("status")
      .filter({ hasText: copy.login.sub2apiSessionReady })
    await popupReady.evaluate((status) =>
      status.scrollIntoView({ block: "center" }),
    )
    await popup.screenshot({
      path: testInfo.outputPath("popup-login-confirmed.png"),
      animations: "disabled",
    })
  } finally {
    await popup.close()
  }
}
