/* global chrome */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, expect } from "@playwright/test"

import { createE2eBuildInputHash } from "../../e2e/utils/e2eBuildInputs.shared.js"
import { connectDevBrowser } from "../../scripts/cdp/client.mjs"
import { loadLocalEnv } from "../../scripts/utils/local-env.mjs"
import { STORAGE_LOCKS } from "../../src/services/core/storageKeys.ts"

// Task-scoped reproducer: fake accounts and a local HTTP fixture in an owned profile.
// Run from the repo root after building the dnr-required E2E variant.
const runnerHash = createHash("sha256")
  .update(await fs.readFile(fileURLToPath(import.meta.url)))
  .digest("hex")

await loadLocalEnv()
process.env.AAH_E2E_BUILD_VARIANT = "dnr-required"
const extensionPath = path.resolve(".output/chrome-mv3-test-dnr-required")
const build = JSON.parse(
  await fs.readFile(path.join(extensionPath, ".aah-e2e-build.json"), "utf8"),
)
const inputHash = await createE2eBuildInputHash(process.cwd(), build.inputPaths)
assert.equal(
  inputHash,
  build.inputHash,
  "The CDP matrix needs a current extension build",
)
await fs.mkdir(path.resolve(".scratch/account-auth-recovery/artifacts"), {
  recursive: true,
})
const runDir = await fs.mkdtemp(
  path.resolve(".scratch/account-auth-recovery/artifacts/cdp-cookie-matrix-"),
)
const profile = path.join(runDir, "profile")
process.env.AAH_DEV_PROFILE_DIR = profile
const owner = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 900 },
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--enable-unsafe-extension-debugging",
    "--enable-automation",
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
  ],
})
let dev
const report = {
  startedAt: new Date().toISOString(),
  sourceBuild: build,
  runnerHash,
  cases: [],
  cleanupErrors: [],
}
try {
  const portFile = await fs.readFile(
    path.join(profile, "DevToolsActivePort"),
    "utf8",
  )
  const port = Number(portFile.split("\n")[0])
  dev = await connectDevBrowser({ cdpUrl: `http://127.0.0.1:${port}` })
  const session = await dev.browser.newBrowserCDPSession()
  const version = await session.send("Browser.getVersion")
  const { arguments: browserArgs } = await session.send(
    "Browser.getBrowserCommandLine",
  )
  assert(
    browserArgs.some(
      (argument) => argument === `--load-extension=${extensionPath}`,
    ),
  )
  await session.detach()
  let worker = dev.context.serviceWorkers()[0]
  if (!worker)
    worker = await dev.context.waitForEvent("serviceworker", { timeout: 25000 })
  const extensionId = new URL(worker.url()).host
  assert.equal(await worker.evaluate(() => chrome.runtime.id), extensionId)
  report.runtime = {
    cdpPort: port,
    product: version.product,
    extensionId,
    extensionPath,
    isolatedFixtureProfile: true,
  }
  report.runtime.incognitoAllowed = await worker.evaluate(
    () =>
      new Promise((resolve) =>
        chrome.extension.isAllowedIncognitoAccess(resolve),
      ),
  )
  console.log(JSON.stringify({ runtime: report.runtime, runDir }))
  let page = await dev.context.newPage()
  page.setDefaultTimeout(15000)
  await page.addInitScript(() =>
    localStorage.setItem("all-api-hub-i18nextLng", "en"),
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await worker.evaluate(
    async (lockName) =>
      navigator.locks.request(lockName, async () => {
        const storage = await chrome.storage.local.get("user_preferences")
        const preferences = storage.user_preferences
          ? JSON.parse(storage.user_preferences)
          : {}
        await chrome.storage.local.set({
          user_preferences: JSON.stringify({
            ...preferences,
            accountAutoRefresh: { enabled: false, refreshOnOpen: false },
            autoCheckin: {
              ...(preferences.autoCheckin ?? {}),
              globalEnabled: false,
              pretriggerDailyOnUiOpen: false,
            },
            showTodayCashflow: false,
            tempWindowFallback: {
              ...(preferences.tempWindowFallback ?? {}),
              enabled: true,
            },
          }),
        })
      }),
    STORAGE_LOCKS.USER_PREFERENCES,
  )
  const scenarios = [
    {
      name: "valid-saved-cookie-no-token-browser-logged-out",
      cookie: "session=valid",
      token: "",
      expected: "success",
      source: "cookie",
    },
    {
      name: "wrong-saved-cookie-valid-token-browser-logged-out",
      cookie: "session=wrong",
      token: "valid-token",
      recovery: true,
      expected: "success",
      source: "token",
    },
    {
      name: "wrong-cookie-no-token-recovery-off",
      cookie: "session=wrong",
      token: "",
      expected: "auth-failure",
    },
    {
      name: "valid-cookie-invalid-token-falls-back-to-cookie",
      cookie: "session=valid",
      token: "invalid-token",
      expected: "success",
      source: "cookie",
    },
    {
      name: "wrong-cookie-invalid-token-recovery-off",
      cookie: "session=wrong",
      token: "invalid-token",
      expected: "auth-failure",
    },
    {
      name: "configured-login-but-recovery-disabled",
      cookie: "session=wrong",
      token: "",
      loginConfigured: true,
      recovery: false,
      expected: "auth-failure",
    },
    {
      name: "wrong-cookie-same-user-browser-session-valid",
      cookie: "session=wrong",
      token: "",
      ambient: "ambient-valid",
      recovery: true,
      expected: "success",
      source: "cookie",
    },
    {
      name: "saved-cookie-wins-after-other-browser-user-is-rejected",
      cookie: "session=valid",
      token: "",
      ambient: "ambient-other",
      expected: "success",
      source: "cookie",
    },
    {
      name: "empty-cookie-uses-existing-browser-session",
      cookie: "",
      token: "",
      ambient: "ambient-valid",
      expected: "success",
      source: "cookie",
    },
    {
      name: "expired-cookie-password-recovery-and-repeat-refresh",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      expected: "success",
      source: "cookie",
      expectLogin: 1,
      changedCookie: true,
      repeat: true,
    },
    {
      name: "expired-cookie-invalid-token-password-recovery",
      cookie: "session=wrong",
      token: "invalid-token",
      recovery: true,
      expected: "success",
      source: "cookie",
      expectLogin: 1,
      changedCookie: true,
      repeat: true,
    },
    {
      name: "wrong-password-keeps-rejected-cookie",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      password: "wrong-password",
      expected: "non-auth-failure",
      expectLogin: 1,
    },
    {
      name: "incomplete-login-configuration-does-not-submit",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      incompleteLogin: true,
      expected: "auth-failure",
    },
    {
      name: "native-login-identity-mismatch-does-not-write-cookie",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      nativeIdentity: 18,
      expected: "recovery-failure",
      expectLogin: 1,
    },
    {
      name: "http-200-html-is-not-credential-expiry",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      rejection: "html-200",
      expected: "non-auth-failure",
    },
    {
      name: "http-401-html-is-not-ordinary-authentication-failure",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      rejection: "html-401",
      expected: "non-auth-failure",
    },
    {
      name: "http-200-business-error-is-not-guessed-from-text",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      rejection: "business-200",
      expected: "non-auth-failure",
    },
    {
      name: "network-failure-does-not-relogin",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      rejection: "network",
      expected: "non-auth-failure",
    },
    {
      name: "access-token-mode-does-not-use-saved-or-browser-cookie",
      cookie: "session=wrong",
      token: "valid-token",
      ambient: "ambient-other",
      authType: "access_token",
      recovery: true,
      expected: "success",
      source: "token",
    },
    {
      name: "invalid-access-token-mode-does-not-recover-cookie",
      cookie: "session=valid",
      token: "invalid-token",
      ambient: "ambient-valid",
      ambientOther: true,
      authType: "access_token",
      recovery: true,
      expected: "auth-failure",
      noGuide: true,
    },
    {
      name: "other-provider-does-not-adopt-anyrouter-recovery",
      cookie: "session=wrong",
      token: "",
      siteType: "new-api",
      recovery: true,
      expected: "auth-failure",
      noGuide: true,
    },
    {
      name: "two-options-pages-share-one-native-recovery",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      concurrent: true,
      expected: "success",
      source: "cookie",
      expectLogin: 1,
      changedCookie: true,
    },
    {
      name: "cancel-native-login-before-response-does-not-write",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      cancel: true,
      expected: "recovery-failure",
      expectLogin: 1,
    },
    {
      name: "new-api-rejected-cookie-has-no-recovery-action",
      siteType: "new-api",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      expected: "auth-failure",
      noGuide: true,
      diagnostic: "invalid",
      noRecovery: true,
    },
    {
      name: "saved-cookie-diagnostic-isolates-token-and-browser-session",
      cookie: "session=wrong",
      token: "valid-token",
      ambient: "ambient-valid",
      recovery: true,
      expected: "success",
      source: "cookie",
      diagnostic: "invalid",
    },
    {
      name: "saved-cookie-diagnostic-verifies-a-valid-cookie",
      cookie: "session=valid",
      token: "invalid-token",
      expected: "success",
      source: "cookie",
      diagnostic: "valid",
    },
    {
      name: "saved-cookie-diagnostic-detects-another-account",
      cookie: "session=renewed-18",
      token: "valid-token",
      expected: "success",
      source: "token",
      diagnostic: "identity_mismatch",
    },
    {
      name: "saved-cookie-diagnostic-does-not-label-html-as-expiry",
      cookie: "session=wrong",
      token: "",
      recovery: true,
      rejection: "html-200",
      expected: "non-auth-failure",
      diagnostic: "unavailable",
    },
    {
      name: "saved-cookie-diagnostic-chinese-narrow-settings",
      cookie: "session=wrong",
      token: "valid-token",
      recovery: true,
      expected: "success",
      source: "token",
      diagnostic: "invalid",
      locale: "zh-CN",
    },
    {
      name: "new-api-cookie-compatibility-guide-with-token",
      siteType: "new-api",
      cookie: "session=wrong",
      token: "valid-token",
      expected: "success",
      source: "token",
      guide: { visible: true, token: true },
    },
    {
      name: "new-api-cookie-compatibility-guide-without-token",
      siteType: "new-api",
      cookie: "session=valid",
      token: "",
      expected: "success",
      source: "cookie",
      guide: { visible: true, token: false },
      locale: "zh-CN",
    },
    {
      name: "new-api-access-token-hides-cookie-guide",
      siteType: "new-api",
      authType: "access_token",
      cookie: "session=wrong",
      token: "valid-token",
      expected: "success",
      source: "token",
      guide: { visible: false, token: false },
    },
  ]
  const filterIndex = process.argv.indexOf("--case")
  const selectedName = filterIndex < 0 ? null : process.argv[filterIndex + 1]
  const groupIndex = process.argv.indexOf("--group")
  const groupName = groupIndex < 0 ? null : process.argv[groupIndex + 1]
  if (groupName && !["cookie-guidance", "recovery"].includes(groupName))
    throw new Error("Unknown CDP matrix group")
  const selected = (scenario) =>
    (!selectedName || scenario.name === selectedName) &&
    (!groupName ||
      (groupName === "recovery" && !scenario.guide) ||
      (groupName === "cookie-guidance" &&
        (Boolean(scenario.guide) ||
          [
            "saved-cookie-diagnostic-isolates-token-and-browser-session",
            "saved-cookie-diagnostic-chinese-narrow-settings",
          ].includes(scenario.name))))
  if (
    filterIndex >= 0 &&
    !scenarios.some((scenario) => scenario.name === selectedName)
  )
    throw new Error("Unknown CDP matrix case")
  const selectedScenarios = scenarios.filter(selected)
  assert(
    selectedScenarios.length > 0,
    "CDP matrix filters selected no scenarios",
  )
  report.selection = scenarios.map((scenario) => ({
    name: scenario.name,
    status: selected(scenario) ? "selected" : "unselected",
  }))
  for (const scenario of selectedScenarios) {
    const fixtureAccountId = `cdp-matrix-${scenarios.indexOf(scenario) + 1}`
    const result = { name: scenario.name, expected: scenario.expected }
    report.cases.push(result)
    const state = { requests: [], logins: 0 }
    const server = http.createServer(async (request, response) => {
      const cookie = request.headers.cookie ?? ""
      const authorization = request.headers.authorization ?? ""
      const source =
        /(?:^|;\s*)session=(?:valid|renewed|ambient-valid)(?:;|$)/u.test(cookie)
          ? "cookie"
          : authorization === "Bearer valid-token"
            ? "token"
            : null
      state.requests.push({
        path: request.url,
        method: request.method,
        cookie,
        authorization,
        source,
      })
      response.setHeader("Access-Control-Allow-Origin", "*")
      response.setHeader("Content-Type", "application/json")
      if (request.url === "/api/user/self") {
        if (scenario.rejection === "network") {
          request.socket.destroy()
          return
        }
        if (scenario.rejection?.startsWith("html")) {
          response.statusCode = scenario.rejection === "html-401" ? 401 : 200
          response.setHeader("Content-Type", "text/html")
          response.end(
            "<!doctype html><title>Just a moment...</title><body>Checking your browser Cloudflare verification</body>",
          )
          return
        }
        if (scenario.rejection === "business-200") {
          response.end(
            JSON.stringify({ success: false, message: "login required" }),
          )
          return
        }
        if (/session=renewed-18/u.test(cookie)) {
          response.end(
            JSON.stringify({
              success: true,
              data: { id: 18, username: "different-member", quota: 90000 },
            }),
          )
          return
        }
        response.statusCode = source ? 200 : 401
        response.end(
          JSON.stringify(
            source
              ? {
                  success: true,
                  data: {
                    id: 17,
                    username: "member",
                    quota: 37000,
                    used_quota: 0,
                    request_count: 0,
                  },
                }
              : { success: false, message: "login required" },
          ),
        )
      } else if (request.url === "/api/user/login") {
        state.logins++
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const credentials = JSON.parse(Buffer.concat(chunks).toString())
        if (
          credentials.username !== "member" ||
          credentials.password !== "good-password"
        ) {
          response.statusCode = 401
          response.end(
            JSON.stringify({ success: false, message: "Invalid password" }),
          )
          return
        }
        if (scenario.cancel)
          await new Promise((resolve) => setTimeout(resolve, 1500))
        if (response.destroyed) return
        const identity = scenario.nativeIdentity ?? 17
        response.setHeader(
          "Set-Cookie",
          `session=${identity === 17 ? "renewed" : "renewed-18"}; Path=/; HttpOnly; SameSite=Lax`,
        )
        response.end(
          JSON.stringify({
            success: true,
            data: { id: identity, username: "member" },
          }),
        )
      } else if (request.url === "/api/user/auth/refresh") {
        response.statusCode = 401
        response.end(
          JSON.stringify({ success: false, message: "login required" }),
        )
      } else if (request.url === "/api/status")
        response.end(
          JSON.stringify({
            success: true,
            data: {
              system_name:
                scenario.siteType === "new-api" ? "New API" : "Any Router",
              password_login_enabled: true,
              turnstile_check: false,
              quota_per_unit: 500000,
            },
          }),
        )
      else if (request.url.startsWith("/api/log"))
        response.end(
          JSON.stringify({
            success: true,
            data: { quota: 0, items: [], total: 0 },
          }),
        )
      else if (request.url.startsWith("/api/token"))
        response.end(JSON.stringify({ success: true, data: [] }))
      else if (request.url === "/login") {
        response.setHeader("Content-Type", "text/html")
        response.end(
          `<!doctype html><title>Any Router Login</title><form><input name="username" placeholder="Username"><input type="password" placeholder="Password"><button type="submit">Login</button></form><div role="alert"></div><script>document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const result=await fetch('/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.querySelector('[name=username]').value,password:document.querySelector('[type=password]').value})}).then(r=>r.json());if(result.success){localStorage.setItem('user',JSON.stringify(result.data));location.assign('/console')}else{document.querySelector('[role=alert]').textContent=result.message||'Login failed'}});</script>`,
        )
      } else {
        response.setHeader("Content-Type", "text/html")
        response.end("<!doctype html><title>Any Router fixture</title>")
      }
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    try {
      if (scenario.locale || scenario.guide) {
        await page.close()
        page = await dev.context.newPage()
        await page.addInitScript(
          (locale) => localStorage.setItem("all-api-hub-i18nextLng", locale),
          scenario.locale ?? "en",
        )
        await page.setViewportSize(
          scenario.locale === "zh-CN"
            ? { width: 390, height: 844 }
            : { width: 1280, height: 900 },
        )
        await page.emulateMedia({ reducedMotion: "reduce" })
        page.setDefaultTimeout(15000)
      }
      await dev.context.clearCookies({ domain: "127.0.0.1" })
      if (scenario.ambient)
        await dev.context.addCookies([
          {
            name: "session",
            value: scenario.ambient,
            url: origin,
            httpOnly: true,
            sameSite: "Lax",
          },
        ])
      const beforeBrowserCookies = await dev.context.cookies(origin)
      assert.equal(beforeBrowserCookies.length > 0, Boolean(scenario.ambient))
      if (scenario.ambientOther)
        await dev.context.addCookies([
          { name: "unrecognized_preference", value: "present", url: origin },
        ])
      const now = Date.now()
      const account = {
        id: fixtureAccountId,
        site_name: "CDP AnyRouter fixture",
        site_url: origin,
        site_type: scenario.siteType ?? "anyrouter",
        authType: scenario.authType ?? "cookie",
        exchange_rate: 7,
        configVersion: 8,
        account_info: {
          id: "17",
          username: "member",
          access_token: scenario.token,
          quota: 1000,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        cookieAuth: { sessionCookie: scenario.cookie },
        ...(scenario.recovery || scenario.loginConfigured
          ? {
              login: {
                methodId: "password",
                automaticRecovery: scenario.recovery === true,
                ...(scenario.incompleteLogin
                  ? {}
                  : {
                      credentials: {
                        username: "member",
                        password: scenario.password ?? "good-password",
                      },
                    }),
              },
            }
          : {}),
        disabled: false,
        excludeFromTotalBalance: false,
        excludeFromTodayIncome: false,
        health: { status: "healthy" },
        last_sync_time: now - 3000,
        created_at: now,
        updated_at: now,
        user_updated_at: now,
        notes: "",
        tagIds: [],
        checkIn: {
          automaticExecutionEnabled: false,
          methodKnowledge: { methods: {} },
          selection: { mode: "automatic" },
        },
      }
      await worker.evaluate(
        async ({ account, lockName }) =>
          navigator.locks.request(lockName, async () => {
            const current = await chrome.storage.local.get("site_accounts")
            const envelope = current.site_accounts
              ? JSON.parse(current.site_accounts)
              : {
                  accounts: [],
                  bookmarks: [],
                  pinnedAccountIds: [],
                  last_updated: Date.now(),
                }
            await chrome.storage.local.set({
              site_accounts: JSON.stringify({
                ...envelope,
                accounts: [account],
                last_updated: Date.now(),
              }),
            })
          }),
        { account, lockName: STORAGE_LOCKS.ACCOUNT_STORAGE },
      )
      await page.goto(
        `chrome-extension://${extensionId}/options.html#account`,
        { waitUntil: "domcontentloaded" },
      )
      const row = page.getByTestId(
        `account-management-account-list-item-${fixtureAccountId}`,
      )
      await expect(row).toBeVisible({ timeout: 45000 })
      const read = () =>
        worker.evaluate(async () => {
          const raw = (await chrome.storage.local.get("site_accounts"))
            .site_accounts
          return JSON.parse(raw).accounts[0]
        })
      const beforeRefresh = await read()
      state.requests.length = 0
      state.logins = 0
      const refresh = async (targetPage) => {
        const targetRow = targetPage.getByTestId(
          `account-management-account-list-item-${fixtureAccountId}`,
        )
        await targetRow
          .getByTestId("account-management-row-more-actions-button")
          .click()
        await targetPage
          .getByTestId("account-management-row-refresh-menu-item")
          .click()
      }
      let concurrentPage
      if (scenario.concurrent) {
        concurrentPage = await dev.context.newPage()
        await concurrentPage.addInitScript(() =>
          localStorage.setItem("all-api-hub-i18nextLng", "en"),
        )
        await concurrentPage.goto(
          `chrome-extension://${extensionId}/options.html#account`,
        )
        await expect(
          concurrentPage.getByTestId(
            `account-management-account-list-item-${fixtureAccountId}`,
          ),
        ).toBeVisible()
        await Promise.all([refresh(page), refresh(concurrentPage)])
      } else await refresh(page)
      if (scenario.cancel) {
        await expect.poll(() => state.logins, { timeout: 25000 }).toBe(1)
        const cancelSession = await dev.browser.newBrowserCDPSession()
        try {
          const { targetInfos } = await cancelSession.send("Target.getTargets")
          const loginTarget = targetInfos.find(
            (target) =>
              target.type === "page" &&
              target.url.startsWith(origin + "/login"),
          )
          assert(
            loginTarget,
            "The cancellation must target this fixture's native login page",
          )
          await cancelSession.send("Target.closeTarget", {
            targetId: loginTarget.targetId,
          })
        } finally {
          await cancelSession.detach()
        }
      }
      await expect
        .poll(async () => (await read()).last_sync_time, { timeout: 90000 })
        .toBeGreaterThan(beforeRefresh.last_sync_time)
      if (concurrentPage) {
        await expect(
          concurrentPage
            .getByRole("status")
            .filter({ hasText: /refreshed|account data/u }),
        ).toBeVisible({ timeout: 30000 })
        await concurrentPage.close()
      }
      const updated = await read()
      const selfRequests = state.requests.filter(
        (request) =>
          request.path === "/api/user/self" && request.method === "GET",
      )
      result.observed = {
        health: updated.health.status,
        healthCode: updated.health.code ?? null,
        quotaChanged: updated.account_info.quota !== account.account_info.quota,
        syncTimeChanged: updated.last_sync_time !== account.last_sync_time,
        cookieChanged: updated.cookieAuth?.sessionCookie !== scenario.cookie,
        authType: updated.authType,
        browserHadLoginCookie: beforeBrowserCookies.length > 0,
        loginCount: state.logins,
        selfRequests: selfRequests.map((request) => ({
          cookieSent: request.cookie,
          authorizationSent: Boolean(request.authorization),
          authSource: request.source,
        })),
      }
      assert(selfRequests.length > 0)
      if (scenario.authType === "access_token")
        assert(selfRequests.every((request) => !request.cookie))
      assert.equal(
        updated.cookieAuth?.sessionCookie,
        scenario.changedCookie ? "session=renewed" : scenario.cookie,
      )
      assert.equal(state.logins, scenario.expectLogin ?? 0)
      if (scenario.expected === "success") {
        assert.equal(updated.health.status, "healthy")
        assert.equal(updated.account_info.quota, 37000)
        assert.equal(
          selfRequests.filter((request) => request.source).at(-1)?.source,
          scenario.source,
        )
      } else {
        assert.notEqual(updated.health.status, "healthy")
        if (scenario.expected === "auth-failure")
          assert.equal(updated.health.code, "authentication_required")
        if (
          ["non-auth-failure", "recovery-failure"].includes(scenario.expected)
        )
          assert.notEqual(updated.health.code, "authentication_required")
        assert.equal(updated.account_info.quota, 1000)
        if (
          updated.health.code === "authentication_required" &&
          !scenario.noGuide
        )
          await expect(
            page.getByRole("status").filter({
              hasText: "The website rejected the current login credentials",
            }),
          ).toBeVisible()
        if (scenario.noGuide)
          await expect(
            page
              .getByRole("status")
              .filter({ hasText: "Configure login recovery" }),
          ).not.toBeVisible()
      }
      if (scenario.ambient) {
        assert(
          (await dev.context.cookies(origin)).some(
            (cookie) =>
              cookie.name === "session" && cookie.value === scenario.ambient,
          ),
          "The original browser session must be preserved",
        )
      }
      if (scenario.repeat) {
        const priorSync = updated.last_sync_time
        await refresh(page)
        await expect
          .poll(async () => (await read()).last_sync_time)
          .toBeGreaterThan(priorSync)
        assert.equal((await read()).health.status, "healthy")
        assert.equal(state.logins, scenario.expectLogin)
        result.repeatRefreshWithoutLogin = true
      }
      if (scenario.guide) {
        const snapshot = await read()
        const requestOffset = state.requests.length
        const priorLogins = state.logins
        await row.hover()
        await row.getByTestId("account-management-row-edit-button").click()
        const dialog = page.getByRole("dialog")
        const locale = scenario.locale ?? "en"
        const copy = JSON.parse(
          await fs.readFile(
            path.resolve(`src/locales/${locale}/accountDialog.json`),
            "utf8",
          ),
        ).cookieValidation
        if (scenario.guide.visible) {
          const help = dialog.getByRole("button", {
            name: copy.help,
            exact: true,
          })
          await expect(help).toHaveAttribute("aria-expanded", "false")
          await help.click()
        }
        await expect(
          dialog.getByText(copy.compatibilityExplanation, { exact: true }),
        ).toHaveCount(scenario.guide.visible ? 1 : 0)
        await expect(
          dialog.getByText(copy.savedTokenExplanation, { exact: true }),
        ).toHaveCount(scenario.guide.token ? 1 : 0)
        await expect(
          dialog.getByRole("button", { name: copy.action, exact: true }),
        ).toHaveCount(scenario.guide.visible ? 1 : 0)
        await expect(
          dialog.getByRole("button", {
            name: /Configure login recovery|配置登录恢复/,
          }),
        ).toHaveCount(0)
        const panel = scenario.guide.visible
          ? dialog
              .locator("#account-session-cookie")
              .locator(
                "xpath=ancestor::*[.//label[@for='account-session-cookie']][1]",
              )
          : dialog
        await panel.screenshot({
          path: path.join(runDir, `${scenario.name}.png`),
          animations: "disabled",
        })
        assert.equal(
          state.requests
            .slice(requestOffset)
            .filter((request) => request.path === "/api/user/self").length,
          0,
        )
        assert.equal(state.logins, priorLogins)
        assert.deepEqual(await read(), snapshot)
        result.cookieCompatibilityGuide = {
          ...scenario.guide,
          accountUnchanged: true,
          loginUnchanged: true,
          noValidationRequest: true,
        }
        await page.keyboard.press("Escape")
      }
      if (scenario.diagnostic) {
        const snapshot = await read()
        const requestOffset = state.requests.length
        const priorLogins = state.logins
        await row.hover()
        await row.getByTestId("account-management-row-edit-button").click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.locator("#account-session-cookie")).toHaveValue(
          scenario.cookie,
        )
        const copy = JSON.parse(
          await fs.readFile(
            path.resolve(
              `src/locales/${scenario.locale ?? "en"}/accountDialog.json`,
            ),
            "utf8",
          ),
        ).cookieValidation
        await dialog
          .getByRole("button", { name: copy.help, exact: true })
          .click()
        await expect(
          dialog.getByText(copy.compatibilityExplanation, { exact: true }),
        ).toHaveCount(1)
        await expect(
          dialog.getByText(copy.savedTokenExplanation, { exact: true }),
        ).toHaveCount(scenario.token ? 1 : 0)
        await dialog
          .getByRole("button", {
            name: scenario.locale ? "验证这条 Cookie" : "Verify this Cookie",
            exact: true,
          })
          .click()
        const expectedText = {
          invalid: copy.invalid,
          valid: copy.valid,
          identity_mismatch: copy.identityMismatch,
          unavailable: copy.unavailable,
        }[scenario.diagnostic]
        await expect(
          dialog.getByRole("status").filter({ hasText: expectedText }),
        ).toBeVisible()
        if (scenario.noRecovery) {
          await expect(
            dialog.getByRole("button", {
              name: /Configure login recovery|Restore login/,
            }),
          ).toHaveCount(0)
          await expect(
            dialog.getByRole("switch", {
              name: "Automatically recover login",
            }),
          ).toHaveCount(0)
        }
        const requests = state.requests
          .slice(requestOffset)
          .filter((request) => request.path === "/api/user/self")
        // A protection page allows one read in the protected browser context.
        assert.equal(
          requests.length,
          scenario.rejection?.startsWith("html") ? 2 : 1,
        )
        for (const request of requests) {
          assert.equal(request.authorization, "")
          assert.equal(request.cookie, scenario.cookie)
        }
        assert.equal(state.logins, priorLogins)
        assert.deepEqual(await read(), snapshot)
        result.savedCookieDiagnostic = {
          status: scenario.diagnostic,
          isolatedCredentials: true,
          accountUnchanged: true,
          loginUnchanged: true,
        }
        const cookieField = dialog
          .locator("#account-session-cookie")
          .locator(
            "xpath=ancestor::*[.//label[@for='account-session-cookie']][1]",
          )
        await expect(cookieField.getByRole("status")).toBeVisible()
        await dialog
          .getByRole("button", { name: copy.action, exact: true })
          .blur()
        await page.mouse.move(0, 0)
        await expect(page.getByRole("tooltip")).toHaveCount(0)
        await cookieField.screenshot({
          path: path.join(runDir, `${scenario.name}.png`),
          animations: "disabled",
        })
        await page.keyboard.press("Escape")
      }
      result.status = "passed"
      console.log(JSON.stringify(result))
    } catch (error) {
      result.status = "failed"
      result.error = error.message
      result.pageErrors = await page
        .locator("body")
        .innerText()
        .then((text) => text.slice(-1800))
        .catch(() => "")
      await page
        .screenshot({
          path: path.join(runDir, `${scenario.name}-failure.png`),
          animations: "disabled",
        })
        .catch(() => {})
      process.exitCode = 1
      console.error(
        JSON.stringify({
          name: scenario.name,
          error: error.message,
          observed: result.observed,
        }),
      )
    } finally {
      try {
        await page.goto("about:blank")
        const cleanupSession = await dev.browser.newBrowserCDPSession()
        try {
          const { targetInfos } = await cleanupSession.send("Target.getTargets")
          for (const target of targetInfos.filter(
            (target) =>
              target.type === "page" && target.url.startsWith(origin + "/"),
          )) {
            const closed = await cleanupSession.send("Target.closeTarget", {
              targetId: target.targetId,
            })
            assert(closed.success, "The owned fixture target must close")
          }
        } finally {
          await cleanupSession.detach()
        }
      } catch (error) {
        report.cleanupErrors.push({ name: scenario.name, error: error.message })
      }
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }
} catch (error) {
  report.error = error.message
  process.exitCode = 1
  console.error(error.message)
} finally {
  await dev?.close().catch((error) => report.cleanupErrors.push(error.message))
  await owner.close().catch((error) => report.cleanupErrors.push(error.message))
  if (report.cleanupErrors.length) process.exitCode = 1
  report.completedAt = new Date().toISOString()
  await fs.writeFile(
    path.join(runDir, "report.json"),
    JSON.stringify(report, null, 2),
  )
  console.log(
    JSON.stringify({
      report: path.join(runDir, "report.json"),
      status:
        report.error ||
        report.cleanupErrors.length ||
        report.cases.some((result) => result.status !== "passed")
          ? "failed"
          : "passed",
    }),
  )
}
