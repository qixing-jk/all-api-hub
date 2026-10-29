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
} from "~~/e2e/utils/extensionState"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

// Viewport emulation resizes popups too; keep native window sizing observable.
test.use({ viewport: null })

for (const { matchingIdentity, provider, unattended } of [
  { matchingIdentity: true, provider: "linuxdo", unattended: false },
  { matchingIdentity: false, provider: "linuxdo", unattended: false },
  { matchingIdentity: true, provider: "github", unattended: false },
  { matchingIdentity: true, provider: "linuxdo", unattended: true },
  { matchingIdentity: true, provider: "github", unattended: true },
] as const) {
  test(`${unattended ? "background" : "manual"} ${provider} login check-in ${matchingIdentity ? "succeeds" : "rejects another account"} without storing cookies`, async ({
    context,
    page,
    extensionId,
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
    let loggedOut = false
    const user = { id: matchingIdentity ? "17" : "18", checked_in: true }
    await context.route("https://agentrouter.org/**", async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      calls.push(path)
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
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<html><head><title>Agent Router</title></head><body>Agent Router</body></html>",
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
        expect(authWindow.focused).toBe(false)
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
      const result = await page.evaluate(
        (type) =>
          chrome.runtime.sendMessage({
            id: "background-checkin",
            type,
            timestamp: Date.now(),
          }),
        AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
      )
      expect(result.res?.success).toBe(true)
    } else {
      await page.getByRole("button", { name: "Run now", exact: true }).click()
    }
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
      .toBe(matchingIdentity ? "success" : "failed")
    expect(calls.indexOf("/api/user/logout")).toBeLessThan(
      calls.indexOf("/api/oauth/state"),
    )
    expect(calls).toContain("/api/user/self")
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
    expect(focusedPopups).toEqual({ opened: 1, focused: [] })
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
