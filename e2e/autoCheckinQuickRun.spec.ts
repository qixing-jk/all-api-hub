import type { Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
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
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const AUTO_CHECKIN_E2E_STATE_KEY = "__aah_auto_checkin_e2e_state__"
const AUTO_CHECKIN_STATUS_STORAGE_KEY = "autoCheckin_status"
const AUTO_CHECKIN_DAILY_ALARM_NAME = "autoCheckinDaily"
const PRETRIGGER_ACCOUNT_ID = "ui-open-pretrigger-account"
const PRETRIGGER_ACCOUNT_NAME = "UI Open Pretrigger Account"
const PRETRIGGER_SITE_URL = "https://auto-checkin-pretrigger.example.com"

type AutoCheckinRuntimeStubState = {
  calls: string[]
  runNowCount: number
}

type RuntimeLike = {
  sendMessage?: (message: unknown) => Promise<unknown>
}

type AutoCheckinRuntimeSnapshot = AutoCheckinRuntimeStubState & {
  getStatusCount: number
  runNowActionCount: number
}

type AutoCheckinAlarmSnapshot = {
  name: string
  scheduledTime?: number
} | null

type UiOpenPretriggerObservation = {
  requestCount: number
  completedCount: number
  responses: unknown[]
}

function autoCheckinOptionsUrl(extensionId: string) {
  return `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.AUTO_CHECKIN}`
}

function getLocalDay(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

async function getDailyAlarm(
  serviceWorker: Worker,
): Promise<AutoCheckinAlarmSnapshot> {
  return await serviceWorker.evaluate(async (alarmName) => {
    const chromeApi = (globalThis as any).chrome
    const alarm = await chromeApi.alarms.get(alarmName)
    return alarm
      ? {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime,
        }
      : null
  }, AUTO_CHECKIN_DAILY_ALARM_NAME)
}

async function sendTypedRuntimeMessageFromPage<TResponse>(
  page: Page,
  type: string,
  data?: Record<string, unknown>,
): Promise<TResponse> {
  return await page.evaluate(
    async ({ type, data }) => {
      const chromeApi = (globalThis as any).chrome
      const response = await chromeApi.runtime.sendMessage({
        id: Date.now(),
        type,
        data,
        timestamp: Date.now(),
      })
      return response?.res ?? response
    },
    { type, data },
  )
}

async function openAutoCheckinOptionsPage(page: Page, extensionId: string) {
  await forceExtensionLanguage(page, "en")
  installExtensionPageGuards(page)
  await page.goto(autoCheckinOptionsUrl(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible()
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
      if (!runtime || typeof runtime.sendMessage !== "function") {
        return
      }

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
        : {
            requestCount: 0,
            completedCount: 0,
            responses: [],
          }
    } catch {
      return {
        requestCount: 0,
        completedCount: 0,
        responses: [],
      }
    }
  })
}

async function readAutoCheckinRuntimeSnapshot(
  page: Page,
): Promise<AutoCheckinRuntimeSnapshot> {
  return await page.evaluate(
    ({ stateKey, getStatusAction, runNowAction }) => {
      try {
        const raw = window.sessionStorage.getItem(stateKey)
        const parsed = raw
          ? (JSON.parse(raw) as AutoCheckinRuntimeStubState)
          : {
              calls: [],
              runNowCount: 0,
            }

        return {
          ...parsed,
          getStatusCount: parsed.calls.filter(
            (action) => action === getStatusAction,
          ).length,
          runNowActionCount: parsed.calls.filter(
            (action) => action === runNowAction,
          ).length,
        }
      } catch {
        return {
          calls: [],
          runNowCount: 0,
          getStatusCount: 0,
          runNowActionCount: 0,
        }
      }
    },
    {
      stateKey: AUTO_CHECKIN_E2E_STATE_KEY,
      getStatusAction: AutoCheckinMessageTypes.GetStatus,
      runNowAction: AutoCheckinMessageTypes.RunNow,
    },
  )
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("auto-checkin quick-run route triggers the runtime action once and consumes the query flag", async ({
  extensionId,
  page,
}) => {
  await page.addInitScript(
    ({ stateKey, getStatusAction, runNowAction, siteType }) => {
      const defaultState: AutoCheckinRuntimeStubState = {
        calls: [],
        runNowCount: 0,
      }

      const readState = (): AutoCheckinRuntimeStubState => {
        try {
          const raw = window.sessionStorage.getItem(stateKey)
          return raw ? JSON.parse(raw) : { ...defaultState }
        } catch {
          return { ...defaultState }
        }
      }

      const writeState = (nextState: AutoCheckinRuntimeStubState) => {
        window.sessionStorage.setItem(stateKey, JSON.stringify(nextState))
      }

      const buildStatus = (state: AutoCheckinRuntimeStubState) =>
        state.runNowCount > 0
          ? {
              lastRunAt: "2026-03-29T12:00:00.000Z",
              lastRunResult: "success",
              summary: {
                totalEligible: 1,
                executed: 1,
                successCount: 1,
                failedCount: 0,
                skippedCount: 0,
                needsRetry: false,
              },
              perAccount: {
                "e2e-account-1": {
                  accountId: "e2e-account-1",
                  accountName: "E2E Example",
                  status: "success",
                  message: "check-in completed",
                  timestamp: Date.parse("2026-03-29T12:00:00.000Z"),
                },
              },
              accountsSnapshot: [
                {
                  accountId: "e2e-account-1",
                  accountName: "E2E Example",
                  siteType,
                  detectionEnabled: true,
                  autoCheckinEnabled: true,
                  providerAvailable: true,
                  isCheckedInToday: true,
                },
              ],
            }
          : {}

      const patchRuntime = (runtime: RuntimeLike | undefined) => {
        if (!runtime || typeof runtime.sendMessage !== "function") {
          return
        }

        const originalSendMessage = runtime.sendMessage.bind(runtime)

        Object.defineProperty(runtime, "sendMessage", {
          configurable: true,
          writable: true,
          value: async (message: unknown) => {
            const state = readState()
            const type =
              typeof message === "object" &&
              message !== null &&
              "type" in message
                ? String((message as { type?: unknown }).type ?? "unknown")
                : "unknown"
            const nextState = {
              ...state,
              calls: [...state.calls, type],
            }

            if (type === getStatusAction) {
              writeState(nextState)
              return {
                res: {
                  success: true,
                  data: buildStatus(nextState),
                },
              }
            }

            if (type === runNowAction) {
              nextState.runNowCount += 1
              writeState(nextState)
              return { res: { success: true } }
            }

            writeState(nextState)
            return await originalSendMessage(message)
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
    },
    {
      stateKey: AUTO_CHECKIN_E2E_STATE_KEY,
      getStatusAction: AutoCheckinMessageTypes.GetStatus,
      runNowAction: AutoCheckinMessageTypes.RunNow,
      siteType: SITE_TYPES.NEW_API,
    },
  )

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?runNow=true#autoCheckin`,
  )
  await waitForExtensionRoot(page)

  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible()
  await expect(page).toHaveURL(/options\.html#autoCheckin$/)

  await expect
    .poll(() => readAutoCheckinRuntimeSnapshot(page))
    .toMatchObject({
      runNowCount: 1,
      runNowActionCount: 1,
    })

  const initialRuntimeSnapshot = await readAutoCheckinRuntimeSnapshot(page)
  expect(initialRuntimeSnapshot.calls).toContain(AutoCheckinMessageTypes.RunNow)
  expect(initialRuntimeSnapshot.getStatusCount).toBeGreaterThanOrEqual(2)

  await expect(page.getByText("E2E Example").first()).toBeVisible()

  await page.reload()
  await waitForExtensionRoot(page)

  await expect
    .poll(() => readAutoCheckinRuntimeSnapshot(page))
    .toMatchObject({
      runNowCount: 1,
      runNowActionCount: 1,
    })

  const postReloadRuntimeSnapshot = await readAutoCheckinRuntimeSnapshot(page)
  expect(postReloadRuntimeSnapshot.calls).toContain(
    AutoCheckinMessageTypes.GetStatus,
  )
  expect(postReloadRuntimeSnapshot.calls).toContain(
    AutoCheckinMessageTypes.RunNow,
  )
})

test("auto-checkin UI-open pretrigger runs once through the real MV3 scheduler boundary", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  let checkinRequests = 0

  await context.route(`${PRETRIGGER_SITE_URL}/api/user/checkin`, (route) => {
    checkinRequests += 1
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "check-in completed",
        data: { checkin_date: getLocalDay(), quota_awarded: 1 },
      }),
    })
  })

  await seedUserPreferences(serviceWorker, {
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      globalEnabled: true,
      pretriggerDailyOnUiOpen: false,
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
  })
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: PRETRIGGER_ACCOUNT_ID,
      site_name: PRETRIGGER_ACCOUNT_NAME,
      site_url: PRETRIGGER_SITE_URL,
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        id: "81",
        username: "ui-open-pretrigger-user",
        access_token: "ui-open-pretrigger-token",
      },
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
      },
    }),
  ])

  const schedulerPage = await context.newPage()
  await forceExtensionLanguage(schedulerPage, "en")
  installExtensionPageGuards(schedulerPage)
  await schedulerPage.goto(autoCheckinOptionsUrl(extensionId))
  await waitForExtensionRoot(schedulerPage)

  const scheduleResponse = await sendTypedRuntimeMessageFromPage<{
    success: boolean
    scheduledTime?: number
    error?: string
  }>(schedulerPage, AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday, {
    minutesFromNow: 60,
  })
  await schedulerPage.close()

  expect(scheduleResponse).toMatchObject({ success: true })

  const scheduledAlarm = await getDailyAlarm(serviceWorker)
  expect(scheduledAlarm).toMatchObject({
    name: AUTO_CHECKIN_DAILY_ALARM_NAME,
  })
  expect(scheduledAlarm?.scheduledTime).toBe(scheduleResponse.scheduledTime)

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
  })

  await installUiOpenPretriggerObservation(page)
  await openAutoCheckinOptionsPage(page, extensionId)

  await expect
    .poll(() => readUiOpenPretriggerObservation(page), {
      message: "first UI-open pretrigger should complete before rerun check",
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

  const today = getLocalDay()
  await expect
    .poll(() => readAutoCheckinStatus(serviceWorker))
    .toMatchObject({
      lastDailyRunDay: today,
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 0,
        needsRetry: false,
      },
      perAccount: {
        [PRETRIGGER_ACCOUNT_ID]: {
          accountId: PRETRIGGER_ACCOUNT_ID,
          accountName: PRETRIGGER_ACCOUNT_NAME,
          status: "success",
        },
      },
    })
  expect(checkinRequests).toBe(1)

  const statusAfterFirstOpen = await readAutoCheckinStatus(serviceWorker)
  expect(statusAfterFirstOpen?.lastRunAt).toBeTruthy()

  const secondPage = await context.newPage()
  await installUiOpenPretriggerObservation(secondPage)
  await openAutoCheckinOptionsPage(secondPage, extensionId)

  await expect
    .poll(() => readUiOpenPretriggerObservation(secondPage), {
      message: "second UI-open pretrigger should settle before assertions",
    })
    .toMatchObject({
      requestCount: 1,
      completedCount: 1,
      responses: [
        {
          success: true,
          started: false,
          eligible: false,
          ineligibleReason: "already_ran_today",
        },
      ],
    })

  expect(checkinRequests).toBe(1)

  const statusAfterSecondOpen = await readAutoCheckinStatus(serviceWorker)
  expect(statusAfterSecondOpen?.lastDailyRunDay).toBe(today)
  expect(statusAfterSecondOpen?.lastRunAt).toBe(statusAfterFirstOpen?.lastRunAt)
  expect(statusAfterSecondOpen?.summary).toEqual(statusAfterFirstOpen?.summary)
})
