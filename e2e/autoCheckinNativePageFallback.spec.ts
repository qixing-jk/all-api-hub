import { createServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
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

const AUTO_CHECKIN_STATUS_STORAGE_KEY = "autoCheckin_status"
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

test("New API native page fallback clicks the site page and confirms checked-in status", async ({
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
      tempWindowFallback: {
        ...DEFAULT_PREFERENCES.tempWindowFallback!,
        enabled: true,
        tempContextMode: "tab",
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
        checkIn: {
          enableDetection: true,
          autoCheckInEnabled: true,
          siteStatus: {
            isCheckedInToday: false,
          },
        },
      }),
    ])

    await forceExtensionLanguage(page, "en")
    installExtensionPageGuards(page)
    await page.goto(autoCheckinOptionsUrl(extensionId))
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)

    await page.getByRole("button", { name: "Run now" }).click()

    try {
      await expect
        .poll(() => nativeFixture.counts.nativePageClickCount, {
          message: "native page fallback should click the site check-in button",
          timeout: 30_000,
        })
        .toBeGreaterThan(0)
      expect(nativeFixture.counts.nativePageRequestCount).toBeGreaterThan(0)
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
