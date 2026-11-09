import http from "node:http"
import type { AddressInfo } from "node:net"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
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

test("Sub2API manual token gains login recovery and subsequent refresh-token renewal", async ({
  context,
  page,
  extensionId,
  extensionDir,
}, testInfo) => {
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
      // Authentication rejection is the trigger under test, not a page failure.
      ignoreConsoleError: (message) =>
        message.location().url === `${origin}/api/v1/auth/me` &&
        message.text().includes("status of 401"),
    })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
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
    const row = page.getByTestId(
      getAccountManagementListItemTestId("sub2api-recovery"),
    )
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    const dialog = page.getByRole("dialog", {
      name: "Edit Account",
      exact: true,
    })
    await expect(dialog).toBeVisible()
    const login = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionLogin,
    )
    await login.getByRole("combobox", { name: "Login method" }).click()
    await page.getByRole("option", { name: /password/i }).click()
    await login.locator("#account-login-username").fill("member@example.com")
    await login.locator("#account-login-password").fill("fixture-password")
    const toggle = login.getByRole("switch", {
      name: "Automatically recover login",
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
      await row
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
        .click()
      await page
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
        .click()
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
    expect(refreshBodies).toContainEqual({ refresh_token: "login-refresh" })
    expect(logins).toBe(1)
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
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
})
