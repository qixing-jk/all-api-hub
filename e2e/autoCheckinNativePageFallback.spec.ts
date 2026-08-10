import { createServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { PROTECTION_BYPASS_AUTOMATIC_FEATURES } from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const AUTO_CHECKIN_STATUS_STORAGE_KEY = "autoCheckin_status"
const AUTO_CHECKIN_DAILY_ALARM_NAME = "autoCheckinDaily"
const NATIVE_ACCOUNT_ID = "native-page-fallback-account"
const NATIVE_ACCOUNT_NAME = "Native Page Fallback Account"
const NATIVE_ACCOUNT_USER_ID = "native-user"

type NativeCheckinFixture = {
  siteUrl: string
  counts: {
    directCheckinPostCount: number
    nativePageClickCount: number
    nativePageRequestCount: number
    statusCheckCount: number
  }
  close: () => Promise<void>
}

type RuntimeLike = {
  sendMessage?: (message: unknown) => Promise<unknown>
}

type UiOpenPretriggerObservation = {
  requestCount: number
  completedCount: number
  responses: unknown[]
}

function autoCheckinOptionsUrl(extensionId: string) {
  return `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`
}

async function readAutoCheckinStatus(
  serviceWorker: Worker,
): Promise<AutoCheckinStatus | null> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    AUTO_CHECKIN_STATUS_STORAGE_KEY,
  )

  if (typeof raw !== "string") return null

  return JSON.parse(raw) as AutoCheckinStatus
}

function getLocalDay(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

async function seedTodayDailyRunTarget(serviceWorker: Worker) {
  await setPlasmoStorageValue(serviceWorker, AUTO_CHECKIN_STATUS_STORAGE_KEY, {
    dailyAlarmTargetDay: getLocalDay(),
  } satisfies AutoCheckinStatus)
  await serviceWorker.evaluate(async (alarmName) => {
    const chromeApi = (globalThis as any).chrome
    await chromeApi.alarms.create(alarmName, {
      when: Date.now() + 60 * 60 * 1_000,
    })
  }, AUTO_CHECKIN_DAILY_ALARM_NAME)
}

async function installUiOpenPretriggerObservation(page: Page) {
  await page.addInitScript((pretriggerAction) => {
    const observationKey = "__aah_auto_checkin_ui_open_pretrigger_observation__"
    const createEmptyObservation = (): UiOpenPretriggerObservation => ({
      requestCount: 0,
      completedCount: 0,
      responses: [],
    })

    const readObservation = (): UiOpenPretriggerObservation => {
      try {
        const raw = window.sessionStorage.getItem(observationKey)
        return raw ? JSON.parse(raw) : createEmptyObservation()
      } catch {
        return createEmptyObservation()
      }
    }

    const writeObservation = (next: UiOpenPretriggerObservation) => {
      window.sessionStorage.setItem(observationKey, JSON.stringify(next))
    }

    const patchRuntime = (runtime: RuntimeLike | undefined) => {
      if (!runtime || typeof runtime.sendMessage !== "function") return

      const originalSendMessage = runtime.sendMessage.bind(runtime)
      Object.defineProperty(runtime, "sendMessage", {
        configurable: true,
        writable: true,
        value: async (message: unknown) => {
          const type =
            typeof message === "object" && message !== null && "type" in message
              ? String((message as { type?: unknown }).type ?? "")
              : ""

          if (type !== pretriggerAction) {
            return await originalSendMessage(message)
          }

          const startedObservation = readObservation()
          writeObservation({
            ...startedObservation,
            requestCount: startedObservation.requestCount + 1,
          })

          const response = await originalSendMessage(message)
          const observedResponse =
            response && typeof response === "object" && "res" in response
              ? (response as { res?: unknown }).res
              : response
          const observation = readObservation()
          writeObservation({
            ...observation,
            completedCount: observation.completedCount + 1,
            responses: [...observation.responses, observedResponse],
          })

          return response
        },
      })
    }

    patchRuntime(globalThis.chrome?.runtime)
    const browserRuntime = globalThis.browser?.runtime as
      | RuntimeLike
      | undefined
    if (browserRuntime && browserRuntime !== globalThis.chrome?.runtime) {
      patchRuntime(browserRuntime)
    }
  }, AutoCheckinMessageTypes.PretriggerDailyOnUiOpen)
}

async function readUiOpenPretriggerObservation(
  page: Page,
): Promise<UiOpenPretriggerObservation> {
  return await page.evaluate(() => {
    try {
      const raw = window.sessionStorage.getItem(
        "__aah_auto_checkin_ui_open_pretrigger_observation__",
      )
      return raw
        ? JSON.parse(raw)
        : { requestCount: 0, completedCount: 0, responses: [] }
    } catch {
      return { requestCount: 0, completedCount: 0, responses: [] }
    }
  })
}

function fulfillJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(payload))
}

function fulfillHtml(response: ServerResponse, body: string) {
  response.writeHead(200, { "content-type": "text/html" })
  response.end(body)
}

async function createNativeCheckinFixture(): Promise<NativeCheckinFixture> {
  const counts = {
    directCheckinPostCount: 0,
    nativePageClickCount: 0,
    nativePageRequestCount: 0,
    statusCheckCount: 0,
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")

    if (url.pathname === "/api/status") {
      fulfillJson(response, 200, {
        success: true,
        message: "",
        data: {},
      })
      return
    }

    if (url.pathname === "/api/user/checkin") {
      if (request.method === "POST") {
        counts.directCheckinPostCount += 1
        fulfillJson(response, 200, {
          success: false,
          message: "dynamic check-in requires page action",
          data: null,
        })
        return
      }

      counts.statusCheckCount += 1
      fulfillJson(response, 200, {
        success: true,
        message: "",
        data: {
          stats: {
            checked_in_today: counts.directCheckinPostCount > 0,
          },
        },
      })
      return
    }

    if (url.pathname === "/native-clicked") {
      counts.nativePageClickCount += 1
      response.writeHead(204)
      response.end()
      return
    }

    if (url.pathname === "/profile" || url.pathname === "/console/personal") {
      counts.nativePageRequestCount += 1
      fulfillHtml(
        response,
        `<!doctype html>
<html>
  <head><title>Native check-in fixture</title></head>
  <body>
    <button type="button" id="check-in">Check in</button>
    <script>
      window.localStorage.setItem(
        "user",
        JSON.stringify({
          id: "${NATIVE_ACCOUNT_USER_ID}",
          username: "native-page-user"
        })
      )

      document.getElementById("check-in").addEventListener("click", () => {
        const request = new XMLHttpRequest()
        request.open("POST", "/native-clicked", false)
        request.send()
      })
    </script>
  </body>
</html>`,
      )
      return
    }

    fulfillJson(response, 404, {
      success: false,
      message: `Unhandled native check-in fixture route: ${request.method} ${url.pathname}`,
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  return {
    siteUrl: `http://127.0.0.1:${address.port}`,
    counts,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
        server.closeAllConnections?.()
        server.closeIdleConnections?.()
      }),
  }
}

test("automatic native-page fallback is denied while an explicit run is allowed", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const nativeFixture = await createNativeCheckinFixture()

  try {
    await stubLlmMetadataIndex(context)

    await seedUserPreferences(serviceWorker, {
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: true,
        windowStart: "00:00",
        windowEnd: "23:59",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "23:58",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 1,
        },
      },
      tempWindowFallback: {
        ...DEFAULT_PREFERENCES.tempWindowFallback!,
        enabled: true,
        automaticFeatureBypass: {
          ...DEFAULT_PREFERENCES.tempWindowFallback!.automaticFeatureBypass,
          [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]: false,
        },
        tempContextMode: TEMP_CONTEXT_MODES.Tab,
      },
    })
    await seedStoredAccounts(serviceWorker, [
      createStoredAccount({
        id: NATIVE_ACCOUNT_ID,
        site_name: NATIVE_ACCOUNT_NAME,
        site_url: nativeFixture.siteUrl,
        site_type: SITE_TYPES.NEW_API,
        account_info: {
          id: NATIVE_ACCOUNT_USER_ID,
          username: "native-page-user",
          access_token: "native-page-token",
        },
        checkIn: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.NEW_API,
          supported: true,
          automaticExecutionEnabled: true,
        }),
      }),
    ])

    await seedTodayDailyRunTarget(serviceWorker)

    const pagesBeforeAutomaticRun = context.pages().length
    const countsBeforeAutomaticRun = { ...nativeFixture.counts }
    const automaticPhasePages: Page[] = []
    const observeAutomaticPage = (automaticPage: Page) => {
      automaticPhasePages.push(automaticPage)
    }
    context.on("page", observeAutomaticPage)

    try {
      await forceExtensionLanguage(page, "en")
      installExtensionPageGuards(page)
      await installUiOpenPretriggerObservation(page)
      await page.goto(autoCheckinOptionsUrl(extensionId))
      await waitForExtensionRoot(page)
      await expectPermissionOnboardingHidden(page)

      await expect
        .poll(() => readUiOpenPretriggerObservation(page), {
          message: "UI-open pretrigger should settle before policy assertions",
          timeout: 30_000,
        })
        .toMatchObject({
          requestCount: 1,
          completedCount: 1,
          responses: [
            {
              success: true,
              started: true,
              eligible: true,
            },
          ],
        })

      expect(nativeFixture.counts.directCheckinPostCount).toBeGreaterThan(
        countsBeforeAutomaticRun.directCheckinPostCount,
      )
      expect(nativeFixture.counts.nativePageRequestCount).toBe(
        countsBeforeAutomaticRun.nativePageRequestCount,
      )
      expect(nativeFixture.counts.nativePageClickCount).toBe(
        countsBeforeAutomaticRun.nativePageClickCount,
      )
      expect(context.pages()).toHaveLength(pagesBeforeAutomaticRun)
    } finally {
      context.off("page", observeAutomaticPage)
    }

    expect(automaticPhasePages).toHaveLength(0)

    const automaticCompletionDialog = page.getByRole("dialog")
    await expect(automaticCompletionDialog).toBeVisible()
    await expect(
      automaticCompletionDialog.getByText("Auto check-in finished"),
    ).toBeVisible()
    await automaticCompletionDialog
      .getByRole("button")
      .filter({ hasText: "Close" })
      .click()
    await expect(automaticCompletionDialog).toBeHidden()

    const countsBeforeExplicitRun = { ...nativeFixture.counts }

    await page
      .getByTestId(BASIC_SETTINGS_TEST_IDS.autoCheckinRunNowButton)
      .click()

    try {
      await expect
        .poll(
          () =>
            nativeFixture.counts.nativePageClickCount >
              countsBeforeExplicitRun.nativePageClickCount &&
            nativeFixture.counts.nativePageRequestCount >
              countsBeforeExplicitRun.nativePageRequestCount,
          {
            message:
              "explicit native-page fallback should request and click the site page",
            timeout: 30_000,
          },
        )
        .toBe(true)
    } catch (error) {
      const status = await readAutoCheckinStatus(serviceWorker)
      throw new Error(
        `Native page fallback did not click the fixture button. Request counters: ${JSON.stringify(
          nativeFixture.counts,
        )}. Persisted status: ${JSON.stringify(status)}`,
        { cause: error },
      )
    }

    try {
      await expect
        .poll(() => readAutoCheckinStatus(serviceWorker))
        .toMatchObject({
          summary: {
            totalEligible: 1,
            executed: 1,
            successCount: 1,
            failedCount: 0,
            skippedCount: 0,
            needsRetry: false,
          },
          perAccount: {
            [NATIVE_ACCOUNT_ID]: {
              accountId: NATIVE_ACCOUNT_ID,
              accountName: NATIVE_ACCOUNT_NAME,
              status: "already_checked",
            },
          },
        })
    } catch (error) {
      const status = await readAutoCheckinStatus(serviceWorker)
      throw new Error(
        `Native page fallback did not persist a successful result. Request counters: ${JSON.stringify(
          nativeFixture.counts,
        )}. Persisted status: ${JSON.stringify(status)}`,
        { cause: error },
      )
    }
  } finally {
    await nativeFixture.close()
  }
})
