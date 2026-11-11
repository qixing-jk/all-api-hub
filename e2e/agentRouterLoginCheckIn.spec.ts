import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { AuthTypeEnum, type AccountStorageConfig } from "~/types"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedAutoCheckinStatus,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  holdExtensionWindowNavigation,
} from "~~/e2e/utils/extensionState"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

// Viewport emulation resizes popups too; keep native window sizing observable.
test.use({ viewport: null })

for (const scenario of [
  { matchingIdentity: true, provider: "linuxdo", unattended: false },
  { matchingIdentity: false, provider: "linuxdo", unattended: false },
  { matchingIdentity: true, provider: "github", unattended: false },
  { matchingIdentity: true, provider: "linuxdo", unattended: true },
  { matchingIdentity: true, provider: "github", unattended: true },
  {
    matchingIdentity: true,
    provider: "github",
    unattended: false,
    protectedPage: "/login",
  },
  {
    matchingIdentity: true,
    provider: "linuxdo",
    unattended: false,
    protectedPage: "/console/token",
  },
  {
    matchingIdentity: true,
    provider: "github",
    unattended: true,
    protectedPage: "/login",
    protectionOutcome: "continue",
  },
  {
    matchingIdentity: true,
    provider: "linuxdo",
    unattended: true,
    protectedPage: "/console/token",
    protectionOutcome: "continue",
  },
  {
    matchingIdentity: true,
    provider: "github",
    unattended: false,
    protectedPage: "/login",
    protectionOutcome: "cancel",
  },
  {
    matchingIdentity: true,
    provider: "linuxdo",
    unattended: false,
    protectedPage: "/console/token",
    protectionOutcome: "cancel",
  },
] as const) {
  const { matchingIdentity, provider, unattended } = scenario
  const protectedPage =
    "protectedPage" in scenario ? scenario.protectedPage : undefined
  const protectionOutcome =
    "protectionOutcome" in scenario ? scenario.protectionOutcome : undefined
  const cancelled = protectionOutcome === "cancel"
  test(`${unattended ? "background" : "manual"} ${provider} login check-in ${cancelled ? "cancels" : matchingIdentity ? "succeeds" : "rejects another account"} without storing cookies${protectionOutcome ? ` with persistent protection ${protectionOutcome} at ${protectedPage}` : protectedPage ? ` after protection clears at ${protectedPage}` : ""}`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    const worker = await getServiceWorker(context)
    await worker.evaluate(() => {
      const observation = {
        popupIds: [] as number[],
        focusedIds: [] as number[],
      }
      ;(
        globalThis as typeof globalThis & {
          checkinWindowFocus: typeof observation
        }
      ).checkinWindowFocus = observation
      chrome.windows.onCreated.addListener((window) => {
        if (window.type !== "popup" || window.id === undefined) return
        observation.popupIds.push(window.id)
        if (window.focused) observation.focusedIds.push(window.id)
      })
      chrome.windows.onFocusChanged.addListener((windowId) => {
        observation.focusedIds.push(windowId)
      })
    })
    await stubLlmMetadataIndex(context)
    const calls: string[] = []
    let protectedPageLoadedAt = 0
    let contentSelfReads = 0
    let loggedOut = false
    const user = { id: matchingIdentity ? "17" : "18", checked_in: true }
    await context.route("https://agentrouter.org/**", async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      calls.push(path)
      if (!route.request().serviceWorker() && path === "/api/user/self")
        contentSelfReads++
      if (
        protectedPage &&
        !route.request().serviceWorker() &&
        (path === "/api/status" || path === "/api/user/self")
      ) {
        expect(
          await route
            .request()
            .frame()
            .evaluate(() =>
              Boolean(document.querySelector('meta[name="aliyun_waf_aa"]')),
            ),
        ).toBe(false)
      }
      let payload: unknown
      if (path === "/api/status")
        payload = {
          success: true,
          data: {
            system_name: "Agent Router",
            linuxdo_oauth: true,
            linuxdo_client_id: "test-client",
            github_oauth: true,
            github_client_id: "test-client",
          },
        }
      else if (path === "/api/user/logout") {
        loggedOut = true
        payload = { success: true }
      } else if (path === "/api/oauth/state")
        payload = { success: loggedOut, data: "signed-test-state" }
      else if (path === "/api/user/self")
        payload = { success: true, data: user }
      if (payload) {
        await route.fulfill({ json: payload })
        return
      }
      if (path === `/oauth/${provider}`) {
        expect(url.searchParams.get("state")).toBe("signed-test-state")
        await route.fulfill({
          contentType: "text/html; charset=utf-8",
          headers: {
            "set-cookie":
              "session=browser-only-session; Path=/; Secure; HttpOnly",
          },
          body: `<script>localStorage.setItem('user', ${JSON.stringify(JSON.stringify(user))}); location.replace('/console/token');</script>`,
        })
        return
      }
      if (path === protectedPage) protectedPageLoadedAt = Date.now()
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        // Simulate the site's asynchronous protection script completing. The
        // extension must wait for removal before calling a business endpoint.
        body:
          path === protectedPage
            ? protectionOutcome
              ? '<html><head><title>Agent Router</title><meta name="aliyun_waf_aa"></head><body>Verification<button onclick="document.querySelector(\'meta[name=aliyun_waf_aa]\').remove()">Complete verification</button></body></html>'
              : '<html><head><title>Agent Router</title><meta name="aliyun_waf_aa"></head><body>Verification<script>setTimeout(() => document.querySelector("meta[name=aliyun_waf_aa]").remove(), 1200)</script></body></html>'
            : "<html><head><title>Agent Router</title></head><body>Agent Router</body></html>",
      })
    })
    await context.route(
      provider === "linuxdo"
        ? "https://connect.linux.do/oauth2/authorize**"
        : "https://github.com/login/oauth/authorize**",
      async (route) => {
        const url = new URL(route.request().url())
        expect(url.searchParams.get("client_id")).toBe("test-client")
        expect(url.searchParams.get("state")).toBe("signed-test-state")
        const authWindow = await worker.evaluate(async () => {
          const windows = await chrome.windows.getAll()
          const popup = windows.find((item) => item.type === "popup")
          if (!popup) throw new Error("OAuth login window is missing")
          return popup
        })
        if (!protectionOutcome) expect(authWindow.focused).toBe(false)
        expect(authWindow.width).toBe(700)
        expect(authWindow.height).toBe(500)
        if (provider === "github") {
          // An already-authorized GitHub session returns without another click.
          await route.fulfill({
            contentType: "text/html; charset=utf-8",
            body: "<script>location.replace('https://agentrouter.org/oauth/github?code=test-code&state=signed-test-state');</script>",
          })
          return
        }
        await route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<html><body><a href="https://agentrouter.org/oauth/${provider}?code=test-code&amp;state=signed-test-state">允许</a></body></html>`,
        })
      },
    )
    const saved = createStoredAccount({
      id: "login-checkin",
      site_name: "Agent Router",
      site_url: "https://agentrouter.org",
      site_type: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "17",
        username: "user",
        access_token: "unchanged-access-token",
      },
      checkIn: {
        automaticExecutionEnabled: true,
        loginCheckIn: { provider },
        selection: {
          mode: "automatic",
          methodId: AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn,
        },
        methodKnowledge: {
          methods: {
            [AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: Date.now() },
              },
            },
          },
        },
      },
    })
    await seedStoredAccounts(worker, [saved])
    await seedUserPreferences(worker, {
      tempWindowFallback: {
        ...DEFAULT_PREFERENCES.tempWindowFallback!,
        // Keep the custom dimensions inside headless Chromium's 800x600 screen.
        windowWidth: 700,
        windowHeight: 500,
        ...(protectionOutcome
          ? { turnstileAssistPresentation: "page" as const }
          : {}),
      },
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
      },
    })
    const hasCookiePermission = await worker.evaluate(async () => {
      await chrome.permissions.remove({ permissions: ["cookies"] })
      return await chrome.permissions.contains({ permissions: ["cookies"] })
    })
    expect(hasCookiePermission).toBe(false)
    await forceExtensionLanguage(page, "en")
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
    )
    const releaseNavigation = await holdExtensionWindowNavigation(
      context,
      worker,
      "https://agentrouter.org/login",
    )
    let backgroundRun: Promise<{ res?: { success?: boolean } }> | undefined
    if (unattended) {
      // Scheduling may already target tomorrow (for example after the daily
      // window closes). Exercise that state, then explicitly admit today's run.
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      await seedAutoCheckinStatus(worker, {
        dailyAlarmTargetDay: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`,
      })
      const scheduled = await page.evaluate(
        (type) =>
          chrome.runtime.sendMessage({
            id: "schedule-checkin",
            timestamp: Date.now(),
            type,
            data: { minutesFromNow: 1 },
          }),
        AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday,
      )
      expect(scheduled.res?.success).toBe(true)
      backgroundRun = page.evaluate(
        (type) =>
          chrome.runtime.sendMessage({
            id: "background-checkin",
            type,
            timestamp: Date.now(),
          }),
        AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
      )
      await releaseNavigation()
    } else {
      await page.getByRole("button", { name: "Run now", exact: true }).click()
      await releaseNavigation()
    }
    if (protectionOutcome) {
      const reminder = page.getByRole("button", {
        name: "Open login window",
        exact: true,
      })
      await expect(reminder).toBeVisible({ timeout: 45_000 })
      expect(protectedPageLoadedAt).toBeGreaterThan(0)
      expect(Date.now() - protectedPageLoadedAt).toBeGreaterThanOrEqual(20_000)
      const loginPage = context
        .pages()
        .find(
          (candidate) =>
            candidate.url() === `https://agentrouter.org${protectedPage}`,
        )
      expect(loginPage).toBeDefined()
      await expect(
        loginPage!.locator('meta[name="aliyun_waf_aa"]'),
      ).toHaveCount(1)
      const automaticFocus = await worker.evaluate(() => {
        const state = (globalThis as any).checkinWindowFocus
        return {
          opened: state.popupIds.length,
          focused: state.focusedIds.filter((id: number) =>
            state.popupIds.includes(id),
          ),
        }
      })
      expect(automaticFocus).toEqual({ opened: 1, focused: [] })
      if (protectedPage === "/login" && protectionOutcome === "continue") {
        await captureVisualViews({
          page,
          ready: reminder,
          id: "persistent-waf-login-reminder",
          extensionDir,
        })
      }
      expect(calls.filter((path) => path === "/api/user/logout")).toHaveLength(
        protectedPage === "/login" ? 0 : 1,
      )
      expect(calls.filter((path) => path === "/api/oauth/state")).toHaveLength(
        protectedPage === "/login" ? 0 : 1,
      )
      expect(contentSelfReads).toBe(0)
      if (cancelled) await loginPage!.close()
      else {
        // A deliberate reminder click may focus the existing window. The prior
        // assertion establishes that the background attempt did not focus it.
        await reminder.click()
        await loginPage!
          .getByRole("button", { name: "Complete verification", exact: true })
          .click()
      }
    }
    if (backgroundRun) expect((await backgroundRun).res?.success).toBe(true)
    await expect
      .poll(
        async () =>
          (
            await getPlasmoStorageJsonValue<AutoCheckinStatus>(
              worker,
              "autoCheckin_status",
            )
          )?.perAccount?.[saved.id]?.status,
        { timeout: 30_000 },
      )
      .toBe(matchingIdentity && !cancelled ? "success" : "failed")
    if (protectionOutcome) {
      await expect(
        page.getByRole("button", { name: "Open login window", exact: true }),
      ).toHaveCount(0)
      expect(
        await worker.evaluate(
          async () =>
            (await chrome.windows.getAll()).filter(
              (window) => window.type === "popup",
            ).length,
        ),
      ).toBe(0)
    }
    if (!cancelled) {
      expect(calls.indexOf("/api/user/logout")).toBeLessThan(
        calls.indexOf("/api/oauth/state"),
      )
      expect(calls).toContain("/api/user/self")
    } else expect(contentSelfReads).toBe(0)
    if (protectedPage) {
      expect(
        calls.filter((path) => path === protectedPage),
        JSON.stringify(calls),
      ).toHaveLength(1)
      expect(calls.filter((path) => path === "/api/user/logout")).toHaveLength(
        cancelled && protectedPage === "/login" ? 0 : 1,
      )
      expect(calls.filter((path) => path === "/api/oauth/state")).toHaveLength(
        cancelled && protectedPage === "/login" ? 0 : 1,
      )
    }
    const focusedPopups = await worker.evaluate(() => {
      const observation = (
        globalThis as typeof globalThis & {
          checkinWindowFocus: { popupIds: number[]; focusedIds: number[] }
        }
      ).checkinWindowFocus
      return {
        opened: observation.popupIds.length,
        focused: observation.focusedIds.filter((id) =>
          observation.popupIds.includes(id),
        ),
      }
    })
    expect(focusedPopups.opened).toBe(1)
    if (!protectionOutcome || cancelled)
      expect(focusedPopups.focused).toEqual([])
    const stored = atIndex(
      (await getPlasmoStorageJsonValue<AccountStorageConfig>(
        worker,
        STORAGE_KEYS.ACCOUNTS,
      ))!.accounts,
      0,
    )
    expect(stored.authType).toBe(AuthTypeEnum.AccessToken)
    expect(stored.account_info.access_token).toBe("unchanged-access-token")
    expect(stored.cookieAuth).toEqual(saved.cookieAuth)
  })
}
