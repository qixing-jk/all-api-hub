import { createServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import accountDialogEn from "~/locales/en/accountDialog.json" with { type: "json" }
import accountDialogZh from "~/locales/zh-CN/accountDialog.json" with { type: "json" }
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { PROTECTION_BYPASS_AUTOMATIC_FEATURES } from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"
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
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { sendTypedRuntimeMessageFromPage } from "~~/e2e/utils/runtimeMessaging"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

// Every case owns its browser, scheduler state and ephemeral-port HTTP fixture.
// A reused browser profile must still have a single owner.
test.describe.configure({
  mode: process.env.AAH_E2E_USER_DATA_DIR ? "default" : "parallel",
})

const AUTO_CHECKIN_STATUS_STORAGE_KEY = "autoCheckin_status"
const AUTO_CHECKIN_DAILY_ALARM_NAME = "autoCheckinDaily"
const NATIVE_ACCOUNT_ID = "native-page-fallback-account"
const NATIVE_ACCOUNT_NAME = "Native Page Fallback Account"
const NATIVE_ACCOUNT_USER_ID = "native-user"

type ReminderTrackingScope = typeof globalThis & {
  __automaticVerificationReminders: number
}

type NativeCheckinFixture = {
  siteUrl: string
  counts: {
    directCheckinPostCount: number
    nativePageClickCount: number
    nativePageRequestCount: number
    statusCheckCount: number
    nativePowStartCount: number
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

/** Use the scheduler's locked same-day command instead of seeding alarm/state separately. */
async function seedTodayDailyRunTarget(page: Page) {
  const response = await sendTypedRuntimeMessageFromPage<{
    success: boolean
    scheduledTime?: number
    error?: string
  }>(page, AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday, {
    minutesFromNow: 60,
  })
  expect(response).toMatchObject({ success: true })
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
      RuntimeLike | undefined
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

async function createNativeCheckinFixture(
  captcha:
    | false
    | "turnstile"
    | "turnstile-auto"
    | "image"
    | "interactive"
    | "altcha"
    | "altcha-shadow" = false,
  beforeDirectPostResponse?: () => Promise<void>,
  nativePagePath?: string,
  actualUserId = NATIVE_ACCOUNT_USER_ID,
  discoverySource: "navigation" | "script" | "partial-script" = "navigation",
): Promise<NativeCheckinFixture> {
  const counts = {
    directCheckinPostCount: 0,
    nativePageClickCount: 0,
    nativePageRequestCount: 0,
    statusCheckCount: 0,
    nativePowStartCount: 0,
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/api/log/self/stat") {
      fulfillJson(response, 200, {
        success: true,
        data: { quota: 0, token: 0, rpm: 0, tpm: 0 },
      })
      return
    }
    if (
      url.pathname === "/api/log/self" ||
      url.pathname === "/api/token/" ||
      url.pathname === "/api/user/groups"
    ) {
      fulfillJson(response, 200, {
        success: true,
        data: { items: [], total: 0 },
      })
      return
    }
    if (discoverySource !== "navigation" && url.pathname === "/routes.js") {
      response.writeHead(200, { "content-type": "application/javascript" })
      response.end(
        `window.fixtureRoutes = [{ path: "${nativePagePath}" }];${
          discoverySource === "partial-script"
            ? 'window.loadUnavailableChunk = () => import("./unavailable-chunk.js");'
            : ""
        }`,
      )
      return
    }

    if (url.pathname === "/api/user/self") {
      fulfillJson(response, 200, {
        success: true,
        data: { id: actualUserId, username: "native-page-user" },
      })
      return
    }

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
        if (captcha === "turnstile-auto" && url.searchParams.has("turnstile")) {
          counts.nativePageClickCount += 1
          fulfillJson(response, 200, {
            success: counts.nativePageClickCount === 1,
            message:
              counts.nativePageClickCount === 1
                ? "Check-in successful"
                : "Check-in failed",
            data: null,
          })
          return
        }
        counts.directCheckinPostCount += 1
        await beforeDirectPostResponse?.()
        fulfillJson(response, 200, {
          success: false,
          message:
            captcha === "turnstile-auto"
              ? "Turnstile token is empty"
              : "dynamic check-in requires page action",
          data: null,
        })
        return
      }

      counts.statusCheckCount += 1
      fulfillJson(response, 200, {
        success: true,
        message: "",
        data: {
          enabled: true,
          stats: {
            checked_in_today: counts.nativePageClickCount > 0,
          },
        },
      })
      return
    }

    if (url.pathname === "/native-pow-started") {
      counts.nativePowStartCount += 1
      response.writeHead(204)
      response.end()
      return
    }

    if (url.pathname === "/native-clicked") {
      counts.nativePageClickCount += 1
      response.writeHead(204)
      response.end()
      return
    }

    if (
      nativePagePath &&
      (url.pathname === "/profile" ||
        url.pathname === "/console/personal" ||
        url.pathname === "/")
    ) {
      response.writeHead(200, { "content-type": "text/html" })
      response.end(
        `<html><body>${discoverySource !== "navigation" ? '<script src="/routes.js"></script>' : `<nav><a href="${nativePagePath}">Daily rewards</a><a href="https://elsewhere.invalid/rewards">External rewards</a></nav>`}<script>localStorage.setItem("user", JSON.stringify({id:"${NATIVE_ACCOUNT_USER_ID}", username:"native-page-user"}))</script></body></html>`,
      )
      return
    }

    if (
      nativePagePath
        ? url.pathname === nativePagePath
        : url.pathname === "/profile" || url.pathname === "/console/personal"
    ) {
      counts.nativePageRequestCount += 1
      fulfillHtml(
        response,
        `<!doctype html>
<html>
  <head><title>Native check-in fixture</title></head>
  <body>
    ${
      captcha === "altcha-shadow"
        ? '<h3><button type="button" id="check-in-section" aria-expanded="true">Daily Check in</button></h3>'
        : `<button type="button" id="check-in-section">
      <h3>Daily Check-in</h3><p>Check in daily to receive points</p>
    </button>`
    }
    <button type="button" id="check-in">Check in</button>
    <script>
      window.localStorage.setItem(
        "user",
        JSON.stringify({
          id: "${NATIVE_ACCOUNT_USER_ID}",
          username: "native-page-user"
        })
      )

      document.getElementById("check-in-section").addEventListener("click", () => {
        const action = document.getElementById("check-in")
        action.hidden = !action.hidden
      })

      document.getElementById("check-in").addEventListener("click", () => {
        if (${captcha === "turnstile-auto"}) {
          const widget = document.createElement('div')
          widget.className = 'cf-turnstile'
          widget.innerHTML = '<input id="cf-chl-widget-native_response" type="hidden" name="cf-turnstile-response">'
          document.body.append(widget)
          const root = widget.attachShadow({mode: 'closed'})
          const frame = document.createElement('iframe')
          frame.src = 'https://challenges.cloudflare.com/turnstile/aah-native-fixture'
          window.addEventListener('message', async function complete(event) {
            if (event.origin !== 'https://challenges.cloudflare.com' || event.source !== frame.contentWindow || event.data?.event !== 'complete') return
            window.removeEventListener('message', complete)
            await fetch('/native-pow-started', {method: 'POST'})
            widget.querySelector('input').value = 'fixture-token'
            await fetch('/api/user/checkin?turnstile=fixture-token', {method: 'POST'})
            widget.remove()
          })
          root.append(frame)
          return
        }
        if (${captcha === "altcha" || captcha === "altcha-shadow"}) {
          const widget = document.createElement('altcha-widget')
          const root = ${captcha === "altcha-shadow"} ? widget.attachShadow({mode: 'open'}) : widget
          root.innerHTML = '<div class="altcha" data-state="unverified"><label><input type="checkbox">Start native proof of work</label><input name="altcha" type="hidden"></div>'
          root.querySelector('input[type="checkbox"]').addEventListener('click', async () => {
            root.querySelector('.altcha').dataset.state = 'verifying'
            await fetch('/native-pow-started', {method: 'POST'})
            await fetch('/native-clicked', {method: 'POST'})
            root.querySelector('.altcha').dataset.state = 'verified'
          })
          document.body.append(widget)
          return
        }
        if (${!!captcha}) {
          setTimeout(() => {
            if (document.querySelector('[data-fixture-captcha]')) return
            const widget = document.createElement('div')
            widget.dataset.fixtureCaptcha = 'true'
            widget.setAttribute('role', 'dialog')
            widget.className = ${JSON.stringify(captcha === "turnstile" ? "cf-turnstile" : "")}
            widget.innerHTML = ${JSON.stringify(
              (captcha === "image"
                ? '<img alt="Verification Code" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%2258%22%3E%3Ctext x=%2220%22 y=%2236%22%3EABCD%3C/text%3E%3C/svg%3E"><input placeholder="Please enter verification code">'
                : captcha === "interactive"
                  ? '<p>Drag the slider to complete the puzzle</p><div><canvas width="300" height="100"></canvas><input type="range" aria-label="Puzzle slider"></div>'
                  : "") +
                '<p>Human verification required (local simulation)</p><button id="finish-verification">Complete verification</button>',
            )}
            document.body.appendChild(widget)
            document.getElementById('finish-verification').addEventListener('click', () => {
              const request = new XMLHttpRequest()
              request.open('POST', '/native-clicked', false)
              request.send()
              widget.remove()
            })
          }, 500)
          return
        }
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

for (const { language, partial } of [
  { language: "en", partial: false },
  { language: "zh-CN", partial: false },
  { language: "en", partial: true },
] as const) {
  const copy = language === "en" ? accountDialogEn : accountDialogZh
  const views =
    language === "zh-CN"
      ? [
          { id: "light", width: 380, height: 900, theme: "light" as const },
          { id: "dark", width: 380, height: 900, theme: "dark" as const },
        ]
      : undefined
  const suffix = partial ? "-partial" : language === "en" ? "" : "-zh"
  test(`configuration finds a script page read-only, adopts it and preserves it after save and reopen${suffix}`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    const fixture = await createNativeCheckinFixture(
      false,
      undefined,
      "/rewards/daily",
      "1",
      partial ? "partial-script" : "script",
    )
    try {
      const worker = await getServiceWorker(context)
      await stubLlmMetadataIndex(context)
      await seedUserPreferences(worker, {
        autoCheckin: {
          ...DEFAULT_PREFERENCES.autoCheckin!,
          globalEnabled: false,
          pretriggerDailyOnUiOpen: false,
        },
        tempWindowFallback: {
          ...DEFAULT_PREFERENCES.tempWindowFallback!,
          enabled: true,
          tempContextMode: TEMP_CONTEXT_MODES.Tab,
        },
      })
      await seedStoredAccounts(worker, [
        createStoredAccount({
          id: NATIVE_ACCOUNT_ID,
          site_name: NATIVE_ACCOUNT_NAME,
          site_url: fixture.siteUrl,
          site_type: SITE_TYPES.NEW_API,
          account_info: {
            id: "1",
            username: "native-page-user",
            access_token: "fixture-token",
          },
          checkIn: createCompatibilityCheckInConfig({
            siteType: SITE_TYPES.NEW_API,
            supported: true,
            automaticExecutionEnabled: false,
          }),
        }),
      ])
      await forceExtensionLanguage(page, language)
      if (language === "zh-CN")
        await page.setViewportSize({ width: 380, height: 900 })
      installExtensionPageGuards(page, {
        // This ordinary New API fixture intentionally rejects the optional fork probe.
        ignoreConsoleError: (message) =>
          message.text().includes("status of 404") &&
          message.location().url ===
            `${fixture.siteUrl}/api/user/xingya-checkin`,
      })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
      )
      await waitForExtensionRoot(page)
      await page.emulateMedia({ reducedMotion: "reduce" })
      const row = page.getByTestId(
        getAccountManagementListItemTestId(NATIVE_ACCOUNT_ID),
      )
      const openEditor = async () => {
        await row.hover()
        await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
        await expect(page.getByRole("dialog")).toBeVisible()
      }
      await openEditor()
      const dialog = page.getByRole("dialog")
      const path = dialog.getByLabel(copy.form.checkInPagePath, {
        exact: true,
      })
      await expect(path).toHaveValue("")
      await captureVisualViews({
        page,
        ready: path,
        id: `native-page-discovery-idle${suffix}`,
        extensionDir,
        views,
      })
      const statusReads = fixture.counts.statusCheckCount
      await dialog
        .getByRole("button", { name: copy.form.findCheckInPage, exact: true })
        .click()
      const candidates = dialog.getByRole("list", {
        name: copy.form.findCheckInPageCandidates,
      })
      await expect(
        candidates.getByText("/rewards/daily", { exact: true }),
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        candidates.getByText(copy.form.checkInPageScriptEvidence, {
          exact: false,
        }),
      ).toBeVisible()
      await expect(
        candidates.getByText(copy.form.checkInPageActionable, { exact: true }),
      ).toBeVisible()
      if (partial)
        await expect(
          dialog.getByText(copy.form.findCheckInPagePartial, { exact: true }),
        ).toBeVisible()
      await expect(path).toHaveValue("")
      expect(fixture.counts.statusCheckCount).toBe(statusReads)
      expect(fixture.counts.nativePageClickCount).toBe(0)
      expect(fixture.counts.nativePowStartCount).toBe(0)
      await captureVisualViews({
        page,
        ready: candidates,
        id: `native-page-discovery-candidates${suffix}`,
        extensionDir,
        views,
      })
      const openedPage = context.waitForEvent("page")
      await candidates
        .getByRole("button", { name: copy.form.checkInPageOpen, exact: true })
        .click()
      const reviewPage = await openedPage
      await expect(reviewPage).toHaveURL(`${fixture.siteUrl}/rewards/daily`)
      await reviewPage.close()
      await expect(path).toHaveValue("")
      expect(fixture.counts.nativePageClickCount).toBe(0)
      expect(fixture.counts.nativePowStartCount).toBe(0)
      await candidates
        .getByRole("button", { name: copy.form.checkInPageUse, exact: true })
        .click()
      await expect(path).toHaveValue("/rewards/daily")
      await dialog
        .getByRole("button", { name: copy.actions.saveChanges, exact: true })
        .click()
      await expect(dialog).toBeHidden()
      await openEditor()
      await expect(path).toHaveValue("/rewards/daily")
      await captureVisualViews({
        page,
        ready: path,
        id: `native-page-discovery-saved${suffix}`,
        extensionDir,
        views,
      })
    } finally {
      // Stop editor subscriptions before retiring the HTTP fixture they read.
      await page.close()
      await fixture.close()
    }
  })
}

test("refuses a native grant when stored target identity differs from the server login", async ({
  context,
  extensionId,
  page,
}) => {
  const worker = await getServiceWorker(context)
  const fixture = await createNativeCheckinFixture(
    false,
    undefined,
    undefined,
    "other-user",
  )
  try {
    await stubLlmMetadataIndex(context)
    await seedUserPreferences(worker, {
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
      },
      tempWindowFallback: {
        ...DEFAULT_PREFERENCES.tempWindowFallback!,
        enabled: true,
        tempContextMode: TEMP_CONTEXT_MODES.Tab,
      },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: NATIVE_ACCOUNT_ID,
        site_name: NATIVE_ACCOUNT_NAME,
        site_url: fixture.siteUrl,
        site_type: SITE_TYPES.NEW_API,
        account_info: {
          id: NATIVE_ACCOUNT_USER_ID,
          username: "native-page-user",
          access_token: "fixture-token",
        },
        checkIn: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.NEW_API,
          supported: true,
          automaticExecutionEnabled: true,
        }),
      }),
    ])
    await forceExtensionLanguage(page, "en")
    installExtensionPageGuards(page)
    await page.goto(autoCheckinOptionsUrl(extensionId))
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)
    await page
      .getByTestId(BASIC_SETTINGS_TEST_IDS.autoCheckinRunNowButton)
      .click()
    await expect
      .poll(
        async () =>
          (await readAutoCheckinStatus(worker))?.perAccount?.[NATIVE_ACCOUNT_ID]
            ?.messageKey,
        { timeout: 30_000 },
      )
      .toBe("autoCheckin:providerFallback.nativePageIdentityMismatch")
    expect(
      (await readAutoCheckinStatus(worker))?.perAccount?.[NATIVE_ACCOUNT_ID]
        ?.reasonCode,
    ).toBe("authentication_required")
    expect(fixture.counts.nativePageRequestCount).toBeGreaterThan(0)
    expect(fixture.counts.nativePageClickCount).toBe(0)
    expect(fixture.counts.nativePowStartCount).toBe(0)
  } finally {
    await fixture.close()
  }
})

for (const { order, captcha, discover } of [
  { order: "daily-first", captcha: false, discover: false },
  { order: "manual-first", captcha: false, discover: false },
  { order: "daily-first", captcha: "altcha", discover: false },
  { order: "daily-first", captcha: "altcha", discover: true },
  { order: "daily-first", captcha: "altcha-shadow", discover: false },
  { order: "daily-first", captcha: "turnstile-auto", discover: false },
] as const) {
  test(`${discover ? "discovered: " : ""}${captcha ? `${captcha}: ` : ""}${order}: overlapping automatic and manual runs perform one native check-in`, async ({
    context,
    extensionId,
    page,
  }) => {
    const serviceWorker = await getServiceWorker(context)
    let releasePost!: () => void
    const postResponse = new Promise<void>((resolve) => {
      releasePost = resolve
    })
    const nativePagePath = captcha ? "/rewards/daily" : undefined
    const nativeFixture = await createNativeCheckinFixture(
      captcha,
      () => postResponse,
      nativePagePath,
    )
    const runs: Promise<unknown>[] = []
    let markManualPending!: () => void
    const manualPending = new Promise<void>((resolve) => {
      markManualPending = resolve
    })
    try {
      await stubLlmMetadataIndex(context)
      if (captcha === "turnstile-auto") {
        // Real cross-origin messages from a closed-shadow frame, with completion
        // after the unknown-state grace period, must stay entirely automatic.
        await context.route(
          "https://challenges.cloudflare.com/turnstile/aah-native-fixture",
          (route) =>
            route.fulfill({
              contentType: "text/html",
              body: `<script>
            const report = event => parent.postMessage({source: 'cloudflare-challenge', widgetId: 'native', event}, '*');
            report('init');
            setTimeout(() => report('complete'), 13_000);
          </script>`,
            }),
        )
        await serviceWorker.evaluate((action) => {
          const scope = globalThis as ReminderTrackingScope
          scope.__automaticVerificationReminders = 0
          scope.chrome.runtime.onMessage.addListener(
            (message: { action?: unknown } | null | undefined) => {
              if (message?.action === action)
                scope.__automaticVerificationReminders++
            },
          )
        }, RuntimeActionIds.TurnstileRequestUserAssist)
      }
      await seedUserPreferences(serviceWorker, {
        logging: { consoleEnabled: true, level: "debug" },
        autoCheckin: {
          ...DEFAULT_PREFERENCES.autoCheckin!,
          globalEnabled: true,
          pretriggerDailyOnUiOpen: false,
          notifyUiOnCompletion: false,
          retryStrategy: {
            enabled: false,
            intervalMinutes: 30,
            maxAttemptsPerDay: 1,
          },
        },
        tempWindowFallback: {
          ...DEFAULT_PREFERENCES.tempWindowFallback!,
          enabled: true,
          tempContextMode: TEMP_CONTEXT_MODES.Tab,
          automaticFeatureBypass: {
            ...DEFAULT_PREFERENCES.tempWindowFallback!.automaticFeatureBypass,
            [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]: true,
          },
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
            ...createCompatibilityCheckInConfig({
              siteType: SITE_TYPES.NEW_API,
              supported: true,
              automaticExecutionEnabled: true,
            }),
            nativePagePath: discover ? undefined : nativePagePath,
          },
        }),
      ])
      await forceExtensionLanguage(page, "en")
      installExtensionPageGuards(page)
      await page.goto(autoCheckinOptionsUrl(extensionId))
      await waitForExtensionRoot(page)
      await expectPermissionOnboardingHidden(page)
      await seedTodayDailyRunTarget(page)
      const triggers: [string, string] =
        order === "daily-first"
          ? [
              AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
              AutoCheckinMessageTypes.RunNow,
            ]
          : [
              AutoCheckinMessageTypes.RunNow,
              AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
            ]
      await serviceWorker.evaluate((accountId) => {
        const scope = globalThis as any
        scope.__concurrentCheckinEntered = false
        const originalDebug = console.debug.bind(console)
        console.debug = (message, details) => {
          originalDebug(message, details)
          if (
            String(message).endsWith("Queued concurrent check-in") &&
            details?.accountId === accountId &&
            details.pendingCallers >= 2
          )
            scope.__concurrentCheckinEntered = true
        }
      }, NATIVE_ACCOUNT_ID)
      const run = async (type: string) => {
        if (type === AutoCheckinMessageTypes.RunNow) {
          // The UI owns the user-command lease needed for CAPTCHA/login recovery.
          const button = page.getByTestId(
            BASIC_SETTINGS_TEST_IDS.autoCheckinRunNowButton,
          )
          await button.click()
          await expect(button).toBeDisabled()
          markManualPending()
          await expect(button).toBeEnabled({
            timeout: captcha === "turnstile-auto" ? 25_000 : 10_000,
          })
        } else {
          const response = await sendTypedRuntimeMessageFromPage(page, type)
          expect(response).toMatchObject({ success: true })
        }
      }
      runs.push(run(triggers[0]))
      await expect
        .poll(() => nativeFixture.counts.directCheckinPostCount)
        .toBe(1)
      runs.push(run(triggers[1]))
      await expect
        .poll(() =>
          serviceWorker.evaluate(
            () => (globalThis as any).__concurrentCheckinEntered,
          ),
        )
        .toBe(true)
      await manualPending
      // The second command has joined account execution while the first POST
      // is held, and the manual UI has entered its pending state.
      releasePost()
      await Promise.all(runs)
      expect(nativeFixture.counts.directCheckinPostCount).toBe(1)
      expect(nativeFixture.counts.nativePageClickCount).toBe(1)
      expect(nativeFixture.counts.nativePowStartCount).toBe(captcha ? 1 : 0)
      if (captcha === "turnstile-auto") {
        expect(
          await serviceWorker.evaluate(
            () =>
              (globalThis as ReminderTrackingScope)
                .__automaticVerificationReminders,
          ),
        ).toBe(0)
      }
      const status = await readAutoCheckinStatus(serviceWorker)
      const result = status?.perAccount?.[NATIVE_ACCOUNT_ID]
      expect(result).toBeDefined()
      expect(["success", "already_checked"]).toContain(result?.status)
      expect(status?.pendingRetry).toBe(false)
      const stored = (await readStoredAccounts(serviceWorker)).find(
        (account) => account.id === NATIVE_ACCOUNT_ID,
      )
      expect(stored?.checkIn.nativePagePath).toBe(
        discover ? undefined : nativePagePath,
      )
    } finally {
      releasePost()
      await Promise.allSettled(runs)
      await nativeFixture.close()
    }
  })
}

for (const nearMidnight of [false, true]) {
  test.describe(nearMidnight ? "near midnight" : "current time", () => {
    test("automatic native-page fallback is denied while an explicit run is allowed", async ({
      context,
      extensionId,
      page,
    }) => {
      const serviceWorker = await getServiceWorker(context)
      const realClockNearMidnight = new Date().setHours(23, 59, 0, 0)
      if (nearMidnight) {
        // Page timezone emulation does not affect the MV3 worker. Use tomorrow's
        // 23:52 so the real browser cannot fire this alarm if the run crosses
        // midnight. Keep browser alarms/timers real in this disposable context.
        await serviceWorker.evaluate(() => {
          const NativeDate = (globalThis as any).Date
          const futureDay = new NativeDate()
          futureDay.setDate(futureDay.getDate() + 1)
          const fixedNow = futureDay.setHours(23, 52, 0, 0)
          ;(globalThis as any).Date = class extends NativeDate {
            constructor(...args: unknown[]) {
              super(...(args.length ? args : [fixedNow]))
            }
            static now() {
              return fixedNow
            }
          }
        })
      }
      const nativeFixture = await createNativeCheckinFixture()

      try {
        await stubLlmMetadataIndex(context)

        const preferences = {
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
        }
        // Finish page/service startup with UI-open execution disabled, then prepare
        // today's alarm through its owner before enabling the observed pretrigger.
        await seedUserPreferences(serviceWorker, {
          ...preferences,
          autoCheckin: {
            ...preferences.autoCheckin,
            pretriggerDailyOnUiOpen: false,
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

        await forceExtensionLanguage(page, "en")
        installExtensionPageGuards(page)
        await page.goto(autoCheckinOptionsUrl(extensionId))
        await waitForExtensionRoot(page)
        await expectPermissionOnboardingHidden(page)
        await seedTodayDailyRunTarget(page)
        await seedUserPreferences(serviceWorker, preferences)

        const scheduledDay = await serviceWorker.evaluate(async (alarmName) => {
          const alarm = await (globalThis as any).chrome.alarms.get(alarmName)
          return {
            today: new Date().toDateString(),
            target: new Date(alarm.scheduledTime).toDateString(),
            hour: new Date().getHours(),
            scheduledTime: alarm.scheduledTime,
          }
        }, AUTO_CHECKIN_DAILY_ALARM_NAME)
        if (nearMidnight) {
          expect(scheduledDay.hour).toBe(23)
          // Even if the real clock reaches 23:59 during setup, the alarm must
          // remain beyond the test's two-minute execution budget.
          expect(scheduledDay.scheduledTime).toBeGreaterThan(
            realClockNearMidnight + 120_000,
          )
        }
        expect(
          scheduledDay.target,
          "UI-open fixture must schedule today's alarm",
        ).toBe(scheduledDay.today)

        const pagesBeforeAutomaticRun = context.pages().length
        const countsBeforeAutomaticRun = { ...nativeFixture.counts }
        const automaticPhasePages: Page[] = []
        const observeAutomaticPage = (automaticPage: Page) => {
          automaticPhasePages.push(automaticPage)
        }
        context.on("page", observeAutomaticPage)

        try {
          await forceExtensionLanguage(page, "en")
          await installUiOpenPretriggerObservation(page)
          await page.reload()
          await waitForExtensionRoot(page)
          await expectPermissionOnboardingHidden(page)

          await expect
            .poll(() => readUiOpenPretriggerObservation(page), {
              message:
                "UI-open pretrigger should settle before policy assertions",
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
            .catch(async (error: unknown) => {
              throw new Error(
                `UI-open pretrigger did not start: ${JSON.stringify(await readUiOpenPretriggerObservation(page))}`,
                { cause: error },
              )
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
                  status: "success",
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
  })
}

for (const { captcha, completeVerification } of [
  { captcha: "turnstile", completeVerification: true },
  { captcha: "turnstile", completeVerification: false },
  { captcha: "image", completeVerification: true },
  { captcha: "interactive", completeVerification: false },
] as const) {
  test(
    `${captcha}: ` +
      (completeVerification
        ? "native-page captcha reminder opens the retained page and confirms check-in after user completion"
        : "native-page captcha result explains the recovery when verification is not completed"),
    async ({ context, extensionId, extensionDir, page }) => {
      const serviceWorker = await getServiceWorker(context)
      const nativeFixture = await createNativeCheckinFixture(captcha)
      try {
        await serviceWorker.evaluate(
          (actions) => {
            const scope = globalThis as any
            scope.__nativeCaptchaMessages = []
            scope.chrome.runtime.onMessage.addListener((message: any) => {
              if (actions.includes(message?.action)) {
                scope.__nativeCaptchaMessages.push({
                  action: message.action,
                  requestId: message.requestId,
                })
              }
            })
          },
          [
            RuntimeActionIds.TurnstileRequestUserAssist,
            RuntimeActionIds.TurnstileAssistPageNotice,
          ],
        )
        await stubLlmMetadataIndex(context)
        await seedUserPreferences(serviceWorker, {
          autoCheckin: {
            ...DEFAULT_PREFERENCES.autoCheckin!,
            // This scenario exercises Run now; an unrelated daily alarm must
            // not issue another POST while the user completes verification.
            globalEnabled: false,
            pretriggerDailyOnUiOpen: false,
            notifyUiOnCompletion: false,
            retryStrategy: {
              enabled: false,
              intervalMinutes: 30,
              maxAttemptsPerDay: 1,
            },
          },
          tempWindowFallback: {
            ...DEFAULT_PREFERENCES.tempWindowFallback!,
            enabled: true,
            tempContextMode: TEMP_CONTEXT_MODES.Tab,
            automaticFeatureBypass: {
              ...DEFAULT_PREFERENCES.tempWindowFallback!.automaticFeatureBypass,
              [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]: false,
            },
            turnstileAssistPresentation: completeVerification
              ? "page"
              : "quiet",
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
        await forceExtensionLanguage(page, "zh-CN")
        installExtensionPageGuards(page)
        await page.goto(autoCheckinOptionsUrl(extensionId))
        await waitForExtensionRoot(page)
        await expectPermissionOnboardingHidden(page)
        await page.bringToFront()
        if (captcha === "turnstile" && completeVerification) {
          // Exercise a pending daily callback instead of relying on the random
          // schedule to collide with this manual flow in CI.
          await seedTodayDailyRunTarget(page)
          const alarmResponse = await sendTypedRuntimeMessageFromPage(
            page,
            AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
          )
          expect(alarmResponse).toMatchObject({ success: true })
        }
        expect(nativeFixture.counts.directCheckinPostCount).toBe(0)
        await page
          .getByTestId(BASIC_SETTINGS_TEST_IDS.autoCheckinRunNowButton)
          .click()
        if (!completeVerification) {
          await expect
            .poll(() => readAutoCheckinStatus(serviceWorker), {
              timeout: 25_000,
            })
            .toMatchObject({
              perAccount: {
                [NATIVE_ACCOUNT_ID]: {
                  status: "failed",
                  reasonCode: "manual_verification_required",
                  retryable: false,
                },
              },
            })
          const resultMessage = page.getByText(/^签到被人机验证阻止/)
          await expect(resultMessage).toBeVisible()
          await expect(resultMessage).toContainText("请打开签到页面完成验证码")
          await expect(resultMessage).toContainText("确认今日已签到")
          expect(nativeFixture.counts.nativePageClickCount).toBe(0)
          expect(nativeFixture.counts.directCheckinPostCount).toBe(1)
          await captureVisualViews({
            page,
            ready: resultMessage,
            id: "native-captcha-result",
            extensionDir,
          })
          return
        }
        const openVerification = page.getByRole("button", {
          name: "打开验证窗口",
          exact: true,
        })
        try {
          await expect(openVerification).toBeVisible({ timeout: 30_000 })
        } catch (error) {
          const messages = await serviceWorker.evaluate(
            () => (globalThis as any).__nativeCaptchaMessages,
          )
          const focus = await page.evaluate(() => ({
            focused: document.hasFocus(),
            visibility: document.visibilityState,
          }))
          throw new Error(
            `Native captcha reminder missing: ${JSON.stringify({ messages, focus, counts: nativeFixture.counts, status: await readAutoCheckinStatus(serviceWorker) })}`,
            { cause: error },
          )
        }
        expect(nativeFixture.counts.nativePageClickCount).toBe(0)
        const verificationPage = context
          .pages()
          .find((candidate) =>
            candidate.url().startsWith(nativeFixture.siteUrl),
          )
        expect(verificationPage).toBeDefined()
        await captureVisualViews({
          page,
          ready: openVerification,
          id: "native-captcha-reminder",
          extensionDir,
        })
        await openVerification.click()
        await expect(
          verificationPage!.getByRole("button", {
            name: "Complete verification",
          }),
        ).toBeVisible()
        await captureVisualViews({
          page: verificationPage!,
          ready: verificationPage!.getByRole("button", {
            name: "Complete verification",
          }),
          id: "native-captcha-wait",
          extensionDir,
        })
        await verificationPage!
          .getByRole("button", { name: "Complete verification" })
          .click()
        await expect
          .poll(() => readAutoCheckinStatus(serviceWorker), { timeout: 20_000 })
          .toMatchObject({
            perAccount: { [NATIVE_ACCOUNT_ID]: { status: "success" } },
          })
        expect(nativeFixture.counts.directCheckinPostCount).toBe(1)
        expect(nativeFixture.counts.nativePageClickCount).toBe(1)
        await expect(openVerification).toBeHidden()
      } finally {
        await nativeFixture.close()
      }
    },
  )
}
