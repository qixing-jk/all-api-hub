import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const AUTO_CHECKIN_E2E_STATE_KEY = "__aah_auto_checkin_e2e_state__"

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

/**
 *
 */
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
      getStatusAction: RuntimeActionIds.AutoCheckinGetStatus,
      runNowAction: RuntimeActionIds.AutoCheckinRunNow,
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
    ({ stateKey, getStatusAction, runNowAction }) => {
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
                  siteType: "new-api",
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
            const action =
              typeof message === "object" &&
              message !== null &&
              "action" in message
                ? String((message as { action?: unknown }).action ?? "unknown")
                : "unknown"
            const nextState = {
              ...state,
              calls: [...state.calls, action],
            }

            if (action === getStatusAction) {
              writeState(nextState)
              return {
                success: true,
                data: buildStatus(nextState),
              }
            }

            if (action === runNowAction) {
              nextState.runNowCount += 1
              writeState(nextState)
              return { success: true }
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
      getStatusAction: RuntimeActionIds.AutoCheckinGetStatus,
      runNowAction: RuntimeActionIds.AutoCheckinRunNow,
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
  expect(initialRuntimeSnapshot.calls).toContain(
    RuntimeActionIds.AutoCheckinRunNow,
  )
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
    RuntimeActionIds.AutoCheckinGetStatus,
  )
  expect(postReloadRuntimeSnapshot.calls).toContain(
    RuntimeActionIds.AutoCheckinRunNow,
  )
})
