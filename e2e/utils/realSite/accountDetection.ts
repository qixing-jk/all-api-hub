import { writeFile } from "node:fs/promises"
import type { ConsoleMessage, Page } from "@playwright/test"

import { AUTO_DETECT_STRATEGIES } from "~/constants/autoDetect"
import type { AccountSiteType } from "~/constants/siteType"
import type {
  accountDetectionProbe,
  AccountDetectionProbeInput,
} from "~~/e2e/fixtures/accountDetectionProbe"
import { ACCOUNT_DETECTION_PROBE_SOURCES } from "~~/e2e/fixtures/accountDetectionProbeSources"
import { expect, test as extensionTest } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  autoDetectAccountFromAddDialog,
  openAccountManagementPage,
} from "~~/e2e/utils/realSite/accountAdd"
import { collectCleanupError } from "~~/e2e/utils/scenarioErrors"

type DetectionCleanup = {
  finish?: () => Promise<void>
  pages: Page[]
}

// Only these detection cases disable authenticated captures; existing account
// usage scenarios retain their own artifact policy.
const test = extensionTest.extend<{ detectionCleanup: DetectionCleanup }>({
  screenshot: "off",
  trace: "off",
  video: "off",
  detectionCleanup: [
    async ({ context }, use) => {
      // Depend on context so cleanup runs before browser teardown, including
      // after the test body times out. Never revoke another run's login.
      void context
      const owned: DetectionCleanup = { pages: [] }
      const cleanup = async () => {
        const failure = await collectCleanupError(
          [
            async () => {
              await owned.finish?.()
            },
            ...owned.pages.map((page) => async () => {
              if (!page.isClosed()) await page.close()
            }),
          ],
          "Real account detection cleanup failed",
        )
        if (failure) throw failure
      }
      try {
        await use(owned)
      } finally {
        await cleanup()
      }
    },
    { timeout: 90_000 },
  ],
})

type RealSiteAccountDetectionTarget<C extends { baseUrl: string }> = {
  label: string
  siteType: AccountSiteType
  cookieBootstrap: boolean
  cookieIdentityHeader?: string
  resolve: () => { config: C | null; missingEnvKeys: string[] }
  login: (
    page: Page,
    config: C,
  ) => Promise<{
    userId: string
    cleanup?: () => Promise<void>
  }>
}

/**
 * Register the source matrix using one login and one isolated profile per target.
 * @param target Real-site login/configuration adapter and expected identity type.
 */
export function registerRealSiteAccountDetectionTests<
  C extends { baseUrl: string },
>(target: RealSiteAccountDetectionTarget<C>) {
  test.describe(`${target.label} real detection sources`, () => {
    test.describe.configure({ retries: 0 })
    test("identifies the same real user through each applicable detection source", async ({
      context,
      page,
      extensionId,
      detectionCleanup,
    }, testInfo) => {
      test.setTimeout(180_000)
      const resolution = target.resolve()
      test.skip(
        !resolution.config,
        `Missing real-site configuration: ${resolution.missingEnvKeys.join(", ")}`,
      )
      const config = resolution.config!
      const origin = new URL(config.baseUrl).origin
      const worker = await getServiceWorker(context)
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await seedUserPreferences(worker, {
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
        logging: { consoleEnabled: true, level: "debug" },
        tempWindowFallback: { enabled: true, tempContextMode: "tab" },
      })
      const probePage = await context.newPage()
      const sitePage = await context.newPage()
      detectionCleanup.pages.push(sitePage, probePage)
      // The probe is packaged only in test builds and calls production public
      // interfaces with real browser APIs. No upstream responses are mocked.
      await probePage.goto(
        `chrome-extension://${extensionId}/account-detection-test.html`,
      )
      await expect
        .poll(
          () => probePage.evaluate(() => typeof window.accountDetectionProbe),
          { timeout: 10_000 },
        )
        .toBe("function")
      const login = await target.login(sitePage, config)
      detectionCleanup.finish = login.cleanup
      expect(login.userId).not.toBe("")
      const expectedId = login.userId
      const tabId = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({})
        return tabs.find(
          (tab) => tab.url && new URL(tab.url).origin === new URL(url).origin,
        )?.id
      }, config.baseUrl)
      expect(typeof tabId).toBe("number")

      let probeIndex = 0
      const responses: { path: string; status: number }[] = []
      context.on("response", (response) => {
        const url = new URL(response.url())
        if (url.origin === origin)
          responses.push({ path: url.pathname, status: response.status() })
      })
      /** Run an API-only contract and persist its filtered detection evidence. */
      const probe = async (source: AccountDetectionProbeInput["source"]) => {
        responses.length = 0
        const result = await probePage.evaluate(
          async ({ source, url, tabId }) => {
            return await window.accountDetectionProbe({
              source,
              url,
              tabId,
            })
          },
          { source, url: config.baseUrl, tabId: tabId! },
        )
        const evidencePath = testInfo.outputPath(
          `detection-${++probeIndex}-${source}.json`,
        )
        await writeFile(
          evidencePath,
          JSON.stringify({ ...result, responses }, null, 2),
        )
        await testInfo.attach(`detection-${source}`, {
          path: evidencePath,
          contentType: "application/json",
        })
        return result
      }
      /** Compare a probe result with the identity obtained independently at login. */
      const expectIdentity = (
        result: Awaited<ReturnType<typeof accountDetectionProbe>>,
        strategy: string,
      ) => {
        expect(result.success, JSON.stringify(result)).toBe(true)
        expect(result.userId).toBe(expectedId)
        expect(result.siteType).toBe(target.siteType)
        expect(result.strategy).toBe(strategy)
      }

      /** Require the UI attempt to use the requested source and record its surface. */
      const detectThroughUi = async (
        uiPage: Page,
        strategy: string,
        beforeDetect?: () => Promise<void>,
      ) => {
        const events: Record<string, unknown>[] = []
        const pending: Promise<void>[] = []
        const onConsole = (message: ConsoleMessage) => {
          if (!message.text().includes("][AccountDetection]")) return
          pending.push(
            (async () => {
              const details = (await message.args()[1]?.jsonValue()) as
                | Record<string, unknown>
                | undefined
              if (!details) return
              const label = (await message.args()[0]?.jsonValue()) as string
              const safeKeys = [
                "source",
                "strategy",
                "success",
                "reason",
                "from",
                "to",
                "mode",
                "requestedMode",
              ]
              events.push({
                event: label.split("][AccountDetection] ")[1],
                ...Object.fromEntries(
                  Object.entries(details).filter(([key]) =>
                    safeKeys.includes(key),
                  ),
                ),
              })
            })(),
          )
        }
        uiPage.on("console", onConsole)
        responses.length = 0
        await probePage.evaluate(
          (url) => window.startAccountDetectionUiObservation(url),
          config.baseUrl,
        )
        let contexts: { windowType: string | undefined }[] = []
        try {
          const dialog = await autoDetectAccountFromAddDialog(
            uiPage,
            config.baseUrl,
            beforeDetect,
          )
          await expect(dialog.userIdInput).toHaveValue(expectedId, {
            timeout: 30_000,
          })
          await expect(dialog.siteTypeTrigger).toHaveAttribute(
            "data-site-type",
            target.siteType,
          )
          await expect
            .poll(
              async () => {
                await Promise.all(pending)
                return events.some(
                  (event) =>
                    event.event === "site_detection_finished" &&
                    event.success === true &&
                    event.strategy === strategy,
                )
              },
              { timeout: 10_000, message: `UI detection must use ${strategy}` },
            )
            .toBe(true)
          await dialog.dialog
            .getByRole("button", { name: "Close", exact: true })
            .click()
          await expect(dialog.dialog).toBeHidden()
        } finally {
          uiPage.off("console", onConsole)
          await Promise.all(pending)
          contexts = await probePage.evaluate(() =>
            window.finishAccountDetectionUiObservation(),
          )
          const evidencePath = testInfo.outputPath(
            `detection-${++probeIndex}-ui-${strategy}.json`,
          )
          await writeFile(
            evidencePath,
            JSON.stringify({ events, contexts, responses }, null, 2),
          )
          await testInfo.attach(`detection-ui-${strategy}`, {
            path: evidencePath,
            contentType: "application/json",
          })
        }
        return { events, contexts }
      }

      /** Grant optional Cookie access in Settings before testing session absence. */
      const grantCookiesThroughUi = async () => {
        await page.goto(
          `chrome-extension://${extensionId}/options.html?tab=permissions#basic`,
        )
        const cookiePermission = page.locator("#cookies")
        await expect(cookiePermission).toBeVisible()
        if (
          !(await worker.evaluate(() =>
            chrome.permissions.contains({ permissions: ["cookies"] }),
          ))
        ) {
          const allow = cookiePermission.getByRole("button", {
            name: "Allow (recommended)",
            exact: true,
          })
          await expect(allow).toBeVisible()
          await allow.click()
        }
        await expect(
          cookiePermission.getByRole("button", { name: "Revoke", exact: true }),
        ).toBeVisible()
        await expect
          .poll(() =>
            worker.evaluate(() =>
              chrome.permissions.contains({
                permissions: ["cookies", "declarativeNetRequestWithHostAccess"],
              }),
            ),
          )
          .toBe(true)
      }

      await test.step("Popup identifies the active target tab through the UI", async () => {
        await page.goto(`chrome-extension://${extensionId}/popup.html`)
        await detectThroughUi(page, AUTO_DETECT_STRATEGIES.CurrentTab, () =>
          sitePage.bringToFront(),
        )
      })
      await test.step("Options reuses the logged-in target tab", async () => {
        await openAccountManagementPage({ page, extensionId })
        await page.bringToFront()
        await detectThroughUi(page, AUTO_DETECT_STRATEGIES.ExistingTab)
      })
      if (target.cookieBootstrap) {
        await test.step("Cookie API honors the real identity bootstrap contract", async () => {
          await grantCookiesThroughUi()
          expect(
            await worker.evaluate(() =>
              chrome.permissions.contains({
                permissions: ["cookies", "declarativeNetRequestWithHostAccess"],
              }),
            ),
            "Cookie API tests require the real optional Cookie grant",
          ).toBe(true)
          const userHint = await sitePage.evaluate(() =>
            localStorage.getItem("user"),
          )
          try {
            await sitePage.evaluate(() => localStorage.removeItem("user"))
            const nativeSelf = await sitePage.evaluate(
              async (identityHeader) => {
                const response = await fetch("/api/user/self", {
                  credentials: "include",
                })
                const body = await response.json()
                return {
                  status: response.status,
                  success: body.success === true,
                  userId: body.data?.id,
                  identityHeaderRequired: Boolean(
                    identityHeader &&
                      typeof body.message === "string" &&
                      body.message.includes(identityHeader),
                  ),
                }
              },
              target.cookieIdentityHeader,
            )
            await writeFile(
              testInfo.outputPath("detection-cookie-contract.json"),
              JSON.stringify(nativeSelf, null, 2),
            )
            if (target.cookieIdentityHeader) {
              expect(nativeSelf).toMatchObject({
                status: 401,
                success: false,
                identityHeaderRequired: true,
              })
              const boundSelf = await sitePage.evaluate(
                async ({ header, userId }) => {
                  const response = await fetch("/api/user/self", {
                    credentials: "include",
                    headers: { [header]: userId },
                  })
                  const body = await response.json()
                  return {
                    status: response.status,
                    success: body.success === true,
                    userId: String(body.data?.id ?? ""),
                  }
                },
                { header: target.cookieIdentityHeader, userId: expectedId },
              )
              expect(boundSelf).toEqual({
                status: 200,
                success: true,
                userId: expectedId,
              })
              for (const source of [
                ACCOUNT_DETECTION_PROBE_SOURCES.Direct,
                ACCOUNT_DETECTION_PROBE_SOURCES.CurrentTab,
              ] as const) {
                const result = await probe(source)
                expect(result.success).toBe(false)
                expect(result.userId).toBeUndefined()
                expect(result.strategy).toBe(
                  source === ACCOUNT_DETECTION_PROBE_SOURCES.Direct
                    ? AUTO_DETECT_STRATEGIES.DirectApi
                    : AUTO_DETECT_STRATEGIES.FallbackApi,
                )
                expect(result.events).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({ event: "api_session_failed" }),
                  ]),
                )
              }
            } else {
              expect(nativeSelf.success).toBe(true)
              expect(String(nativeSelf.userId)).toBe(expectedId)
              expectIdentity(
                await probe(ACCOUNT_DETECTION_PROBE_SOURCES.Direct),
                AUTO_DETECT_STRATEGIES.DirectApi,
              )
              expectIdentity(
                await probe(ACCOUNT_DETECTION_PROBE_SOURCES.CurrentTab),
                AUTO_DETECT_STRATEGIES.FallbackApi,
              )
            }
          } finally {
            if (userHint !== null)
              await sitePage.evaluate(
                (userHint) => localStorage.setItem("user", userHint),
                userHint,
              )
          }
          await openAccountManagementPage({ page, extensionId })
        })
      } else {
        testInfo.annotations.push({
          type: "not-applicable",
          description:
            "Cookie API bootstrap is not the target's dashboard authentication contract; browser-session sources are tested.",
        })
      }
      // Keep the login owner's Page alive for exact-session cleanup while
      // removing every target-origin tab from discovery.
      await sitePage.goto("about:blank")
      for (const mode of ["tab", "window"] as const) {
        await test.step(`reads the session through a real temporary ${mode}`, async () => {
          await page.goto(
            `chrome-extension://${extensionId}/options.html?tab=refresh#basic`,
          )
          const modeButton = page
            .getByRole("group", { name: "Opening method", exact: true })
            .getByRole("button", {
              name:
                mode === "tab"
                  ? "Tab in current window"
                  : "New window each time",
              exact: true,
            })
          await modeButton.click()
          await expect(modeButton).toHaveAttribute("aria-pressed", "true")
          await openAccountManagementPage({ page, extensionId })
          await expect
            .poll(
              () =>
                worker.evaluate(
                  async (origin) =>
                    (await chrome.tabs.query({})).filter(
                      (tab) => tab.url && new URL(tab.url).origin === origin,
                    ).length,
                  origin,
                ),
              { timeout: 15_000 },
            )
            .toBe(0)
          await page.bringToFront()
          const result = await detectThroughUi(
            page,
            AUTO_DETECT_STRATEGIES.BackgroundTempContext,
          )
          expect(result.events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                event: "session_read_started",
                source: "temp_window",
              }),
              expect.objectContaining({
                event: "temp_session_response",
                success: true,
              }),
            ]),
          )
          expect(result.contexts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                windowType: mode === "window" ? "popup" : "normal",
              }),
            ]),
          )
        })
      }
      await test.step("temporary pages are released after detection", async () => {
        await expect
          .poll(
            () =>
              worker.evaluate(
                async (origin) =>
                  (await chrome.tabs.query({})).filter(
                    (tab) => tab.url && new URL(tab.url).origin === origin,
                  ).length,
                origin,
              ),
            { timeout: 15_000 },
          )
          .toBe(0)
      })
      await test.step("direct API cannot invent an account without session cookies", async () => {
        // Grant first so this proves cookie absence rather than a denied read.
        await grantCookiesThroughUi()
        await context.clearCookies()
        const result = await probe(ACCOUNT_DETECTION_PROBE_SOURCES.Direct)
        expect(result.success).toBe(false)
        expect(result.userId).toBeUndefined()
        expect(result.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              event: "source_skipped",
              source: "direct_api",
              reason: "cookies_missing",
            }),
          ]),
        )
      })
    })
  })
}
