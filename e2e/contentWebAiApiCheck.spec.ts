import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { Locator, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import {
  getWebAiApiCheckProbeTestId,
  WEB_AI_API_CHECK_TEST_IDS,
} from "~/features/WebAiApiCheck/content/testIds"
import enVerification from "~/locales/en/aiApiVerification.json" with { type: "json" }
import enApiCheck from "~/locales/en/webAiApiCheck.json" with { type: "json" }
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
  getStoredUserPreferences,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { expectTooltipUnobstructed } from "~~/e2e/utils/tooltipVisibility"
import { createDrawingServer } from "~~/e2e/utils/verificationDrawingServer"
import {
  expectVerificationComposerBelowIntroduction,
  expectVerificationMobileEntry,
  expectVerificationMobileSheet,
  expectVerificationWorkspaceFlush,
  showVerificationSettings,
} from "~~/e2e/utils/verificationWorkspace"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const TEST_PAGE_URL = "https://api-console.example.test/console"
const TEST_PAGE_ORIGIN = "https://api-console.example.test"
const API_BASE_URL = "https://api-console.example.test/api"
const API_KEY = "sk-e2e-content-api-check-key"

test("web context test keeps Stop accessible with the mobile list collapsed", async ({
  context,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 390, height: 844 })
  await stubLlmMetadataIndex(context)
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  let requests = 0
  await context.route(`${API_BASE_URL}/v1/chat/completions`, async () => {
    requests++
    await new Promise(() => {})
  })
  const { modal } = await openApiCheckModalFromCopiedCredentials(page)
  const workspace = modal.getByTestId("verification-workspace")
  await expect(
    modal.getByRole("dialog", { name: "Tests", exact: true }),
  ).toBeVisible()
  await workspace
    .getByRole("button", { name: "Context capacity test", exact: true })
    .click()
  await workspace
    .locator('[data-testid="probe-intro-run-button"]:visible')
    .click()
  await expect.poll(() => requests).toBe(1)
  const stop = workspace
    .getByTestId("verification-active-test")
    .getByRole("button", { name: "Stop", exact: true })
  await expect(stop).toBeInViewport()
  await modal.getByRole("dialog").screenshot({
    path: test.info().outputPath("web-mobile-context-stop.png"),
    animations: "disabled",
  })
  await stop.click()
  await expect(workspace.getByTestId("verification-active-test")).toContainText(
    "Stopped",
  )
})

async function seedAutoDetectApiCheckPreferences(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await seedUserPreferences(serviceWorker, {
    language: "en",
    webAiApiCheck: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      autoDetect: {
        enabled: true,
        urlWhitelist: {
          patterns: ["^https://api-console\\.example\\.test/console"],
        },
      },
    },
  })
}

async function openApiCheckModalFromCopiedCredentials(page: Page): Promise<{
  contentHost: Locator
  modal: Locator
}> {
  await page.goto(TEST_PAGE_URL)

  const selectedCredentialText = `base_url=${API_BASE_URL}\napi_key=${API_KEY}`
  await page.locator("#copy-credentials").evaluate((target, text) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const clipboardData = new DataTransfer()
    clipboardData.setData("text", text)
    target.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
  }, selectedCredentialText)

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await contentHost.getByRole("button", { name: "Open" }).click()

  const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(modal.getByLabel("Base URL", { exact: true })).toHaveValue(
    API_BASE_URL,
  )

  return { contentHost, modal }
}

async function openApiCheckModalFromClipboardRead(page: Page): Promise<{
  contentHost: Locator
  modal: Locator
}> {
  await page.goto(TEST_PAGE_URL)
  await page.evaluate(
    (clipboardText) => navigator.clipboard.writeText(clipboardText),
    `base_url=${API_BASE_URL}\napi_key=${API_KEY}`,
  )
  await page.evaluate(() => window.getSelection()?.removeAllRanges())

  await page.getByRole("button", { name: "Copy credentials" }).click()

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await contentHost.getByRole("button", { name: "Open" }).click()

  const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(modal.getByRole("textbox", { name: "Base URL" })).toHaveValue(
    API_BASE_URL,
  )

  return { contentHost, modal }
}

async function saveCredentialProfileFromModal(
  contentHost: Locator,
  modal: Locator,
) {
  await modal
    .getByTestId(WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton)
    .click()
  await expect(
    contentHost.getByText(
      "Saved api-console.example.test to API credential library.",
    ),
  ).toBeVisible()
}

async function sendApiCheckContextMenuTrigger(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  params: {
    pageUrl: string
    selectionText: string
  },
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(
        async ({ action, pageUrl, selectionText }) => {
          const chromeApi = (globalThis as any).chrome
          const tabs = await chromeApi.tabs.query({})
          const targetTab = tabs.find(
            (tab: { id?: number; url?: string }) => tab.url === pageUrl,
          )

          if (targetTab?.id == null) {
            return { success: false, error: "Target tab not found" }
          }

          return await new Promise<{ success: boolean; error?: string }>(
            (resolve) => {
              chromeApi.tabs.sendMessage(
                targetTab.id,
                {
                  action,
                  pageUrl,
                  selectionText,
                },
                () => {
                  const error = chromeApi.runtime?.lastError
                  const errorMessage =
                    typeof error?.message === "string" ? error.message : ""
                  if (errorMessage.includes("message port closed")) {
                    resolve({ success: true })
                    return
                  }

                  resolve(
                    errorMessage
                      ? { success: false, error: errorMessage }
                      : { success: true },
                  )
                },
              )
            },
          )
        },
        {
          action: RuntimeActionIds.ApiCheckContextMenuTrigger,
          pageUrl: params.pageUrl,
          selectionText: params.selectionText,
        },
      )
    })
    .toMatchObject({ success: true })
}

async function installClipboardReadPermissionBridge(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await serviceWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    const browserApi = (globalThis as any).browser
    const originalChromeContains = chromeApi?.permissions?.contains?.bind(
      chromeApi.permissions,
    )
    const originalBrowserContains = browserApi?.permissions?.contains?.bind(
      browserApi.permissions,
    )

    const containsWithClipboardRead = (
      details: { permissions?: string[] },
      callback?: (result: boolean) => void,
    ) => {
      // Chromium does not resolve this optional-permission prompt reliably in the
      // headless extension harness; keep the test focused on the content read path.
      if (details.permissions?.includes("clipboardRead")) {
        callback?.(true)
        return Promise.resolve(true)
      }

      if (originalChromeContains) {
        return originalChromeContains(details, callback)
      }

      if (originalBrowserContains) {
        return originalBrowserContains(details, callback)
      }

      callback?.(false)
      return Promise.resolve(false)
    }

    if (chromeApi?.permissions) {
      chromeApi.permissions.contains = containsWithClipboardRead
    }
    if (browserApi?.permissions) {
      browserApi.permissions.contains = containsWithClipboardRead
    }
  })
}

test.beforeEach(async ({ context, page }, testInfo) => {
  installExtensionPageGuards(
    page,
    [
      "mobile settings sheet in the webpage workspace",
      "web context test keeps Stop accessible with the mobile list collapsed",
      "web needle test plans automatically, follows a context probe and restores its results",
      "keeps settings beside the conversation and preserves drafts when the responsive pane closes",
    ].includes(testInfo.title)
      ? {
          // Radix's development-only TitleWarning queries document.getElementById,
          // which cannot see titles inside Shadow DOM. These scenarios assert the
          // actual accessible Sheet name and visible heading in that root instead.
          ignoreConsoleErrorPatterns: [
            /^`DialogContent` requires a `DialogTitle` for the component to be accessible for screen reader users\./,
          ],
        }
      : undefined,
  )
  await forceExtensionLanguage(page, "en")

  await context.route(`${TEST_PAGE_URL}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html lang="en">
          <head>
            <title>API Console Fixture</title>
          </head>
          <body>
            <button id="copy-credentials">
              base_url=${API_BASE_URL}
              api_key=${API_KEY}
            </button>
            <button id="copy-from-clipboard" data-copy>
              Copy credentials
            </button>
          </body>
        </html>`,
    })
  })

  await context.route(`${API_BASE_URL}/v1/models`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: [{ id: "gpt-4o-mini" }],
      }),
    })
  })
})

test("mobile settings sheet in the webpage workspace", async ({
  page,
  context,
  extensionDir,
}) => {
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  const modal = page
    .locator("all-api-hub-redemption-toast")
    .getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  const workspace = modal.getByTestId("verification-workspace")
  await expectVerificationMobileEntry({
    page,
    workspace,
    dialog: modal.locator('[role="dialog"]').first(),
    open: async () => {
      await openApiCheckModalFromCopiedCredentials(page)
    },
    extensionDir,
    id: "webpage",
  })
  await expectVerificationMobileSheet({
    page,
    workspace,
    extensionDir,
    id: "webpage",
  })
})

test("webpage Q&A runs in background and can be stopped independently", async ({
  context,
  page,
}) => {
  let release!: () => void
  let hold = false
  let gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const fixture = createDrawingServer({
    textResponse: () => "FINAL_ANSWER: 21",
    afterStreamChunk: async () => {
      if (hold) await gate
    },
  })
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
  try {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1280, height: 960 })
    const { modal, contentHost } =
      await openApiCheckModalFromCopiedCredentials(page)
    await modal
      .getByRole("textbox", { name: "Base URL", exact: true })
      .fill(baseUrl)
    await modal.getByRole("combobox", { name: "Model ID", exact: true }).click()
    await contentHost
      .getByRole("option", { name: "gpt-quality", exact: true })
      .click()
    const panel = modal.getByRole("region", { name: "Q&A test", exact: true })
    await panel.getByRole("button", { name: "Q&A test", exact: true }).click()
    await expectVerificationComposerBelowIntroduction(
      panel,
      enVerification.verifyDialog.tools.questionAnswer.description,
    )
    const question = panel.getByRole("textbox", {
      name: "Question",
      exact: true,
    })
    await question.fill("Compute 7 × 3.")
    await question.press("Enter")
    await expect(
      panel.getByText("Matches reference", { exact: true }).first(),
    ).toBeVisible()
    expect(fixture.requests).toHaveLength(1)
    const activeTest = modal.locator("[data-verification-active-test]")
    await expect(activeTest).toContainText("Q&A test")
    await expect(activeTest).toContainText("Matches reference")
    await expect(panel.locator("[data-verification-summary]")).toContainText(
      "Matches reference",
    )
    await expect(
      activeTest.getByRole("button", { name: "Statistics", exact: true }),
    ).toBeVisible()
    await expect(
      panel.getByRole("heading", { name: "Execution result", exact: true }),
    ).toHaveCount(0)
    expect(fixture.prompts[0]).toContain("Compute 7 × 3.")
    await expect(
      panel.getByRole("region", { name: "Question used for this run" }),
    ).toHaveText("Compute 7 × 3.")
    await modal.screenshot({
      path: test.info().outputPath("qa-web-result.png"),
      animations: "disabled",
    })
    hold = true
    await panel
      .getByRole("button", { name: "Run Q&A test", exact: true })
      .click()
    await expect.poll(() => fixture.requests.length).toBe(2)
    await expect(
      panel.getByTestId("verification-generation-output"),
    ).toContainText("FINAL_ANSWER: 21")
    await expect(
      panel.getByText("Matches reference", { exact: true }),
    ).toHaveCount(0)
    await modal.screenshot({
      path: test.info().outputPath("qa-web-streaming.png"),
      animations: "disabled",
    })
    await panel
      .locator("[data-verification-summary]")
      .getByRole("button", { name: "Stop", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Q&A test", exact: true }),
    ).toHaveAccessibleDescription("Stopped")
    await expect(
      panel.getByTestId("verification-generation-output"),
    ).toContainText("FINAL_ANSWER: 21")
    await expect(
      panel.getByRole("button", { name: "Run Q&A test", exact: true }),
    ).toBeEnabled()
    release()
    await modal.screenshot({
      path: test.info().outputPath("qa-web-stopped.png"),
      animations: "disabled",
    })
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const concurrency = modal.getByRole("spinbutton", {
      name: "Tests at once",
      exact: true,
    })
    await concurrency.fill("2")
    await concurrency.press("Tab")
    await expect
      .poll(
        async () =>
          (await getStoredUserPreferences(await getServiceWorker(context)))
            .verificationConcurrency,
      )
      .toMatchObject({ routine: 2 })
    await modal
      .getByRole("button", { name: "Run routine tests", exact: true })
      .click()
    await expect.poll(() => fixture.requests.length).toBe(4)
    const textProbe = modal.getByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )
    await textProbe
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await expect(
      textProbe.getByTestId("verification-generation-output"),
    ).toContainText("FINAL_ANSWER: 21")
    await modal.screenshot({
      path: test.info().outputPath("web-routine-parallel.png"),
      animations: "disabled",
    })
    await modal.getByRole("button", { name: "Stop test", exact: true }).click()
    await expect(concurrency).toBeEnabled()
    await expect(textProbe).toContainText("Stopped")
    expect(fixture.requests).toHaveLength(4)
  } finally {
    release()
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("web context probe shows progress, measured bounds and cancellation", async ({
  context,
  page,
}) => {
  const requests: Record<string, any>[] = []
  let hold = false
  let release!: () => void
  let held = new Promise<void>((resolve) => {
    release = resolve
  })
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET") {
      response.end(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }))
      return
    }
    let raw = ""
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw)
    requests.push(body)
    expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`)
    // Hold later requests so the page must receive an intermediate measurement.
    if (requests.length === 2 || hold) await held
    if (JSON.stringify(body.messages).length > 16000) {
      response.statusCode = 400
      response.end(
        JSON.stringify({
          error: {
            code: "context_length_exceeded",
            message: "maximum context length exceeded",
          },
        }),
      )
    } else
      response.end(
        JSON.stringify({
          id: "context",
          object: "chat.completion",
          created: 1,
          model: "gpt-4o-mini",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "OK" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1000, completion_tokens: 1 },
        }),
      )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    const { modal, contentHost } =
      await openApiCheckModalFromCopiedCredentials(page)
    await modal
      .getByRole("textbox", { name: "Base URL", exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    await modal
      .getByRole("combobox", { name: "Test mode", exact: true })
      .click()
    await contentHost
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    await expect(
      modal.getByRole("combobox", { name: "Model ID", exact: true }),
    ).toContainText("gpt-4o-mini")
    await modal.getByRole("combobox", { name: "Model ID", exact: true }).click()
    await contentHost
      .getByRole("option", { name: "gpt-4o-mini", exact: true })
      .click()
    const panel = modal.getByRole("region", {
      name: "Context capacity test",
    })
    await expect(panel).toBeVisible()
    await test.info().attach("context-configuration", {
      body: await modal.ariaSnapshot(),
      contentType: "text/plain",
    })
    await expect(
      panel.getByRole("button", { name: "Run context probe" }),
    ).toBeEnabled()
    await expect(panel).toContainText("Pending")
    await expect(panel).not.toContainText("Not run yet")
    await expect(panel.getByRole("status")).toHaveCount(0)
    await expect(panel.getByRole("spinbutton")).toHaveCount(0)
    for (const width of [1280, 380]) {
      await page.setViewportSize({ width, height: 800 })
      await panel.scrollIntoViewIfNeeded()
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)
      await panel.screenshot({
        path: test.info().outputPath(`web-context-idle-${width}.png`),
        animations: "disabled",
      })
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    await panel
      .getByRole("button", { name: "Context capacity test", exact: true })
      .click()
    await panel.getByRole("button", { name: "Run context probe" }).click()
    await expect(
      panel.getByRole("button", { name: "Test details", exact: true }),
    ).toBeVisible({ timeout: 30000 })
    await expect(
      modal
        .getByRole("group")
        .getByRole("button", { name: "Run routine tests", exact: true }),
    ).toBeEnabled()
    release()
    await expect(
      modal.locator("[data-verification-active-test]"),
    ).toContainText("Context capacity:", { timeout: 30000 })
    await expect(panel).not.toContainText("Result saved")
    await expect(panel).not.toContainText("Tokenizer:")
    await panel.screenshot({
      path: test.info().outputPath("web-context-summary.png"),
      animations: "disabled",
    })
    const compactContextWidth = (await panel.boundingBox())!.width
    await panel
      .getByRole("button", { name: "Test details", exact: true })
      .click()
    await expect(panel).toContainText("Capacity rejection at:")
    const resultDetails = panel.getByRole("region", {
      name: "Test details",
      exact: true,
    })
    await expect(resultDetails).toBeVisible()
    expect((await panel.boundingBox())!.width).toBeCloseTo(
      compactContextWidth,
      0,
    )
    await panel
      .getByRole("button", { name: "Test details", exact: true })
      .click()
    await expect(resultDetails).toHaveCount(0)
    expect((await panel.boundingBox())!.width).toBeCloseTo(
      compactContextWidth,
      0,
    )
    await expect(
      modal.locator("[data-verification-active-test]"),
    ).toContainText("Context capacity:")
    await panel
      .getByRole("button", { name: "Test details", exact: true })
      .click()
    expect(
      requests.every(
        (body) =>
          !body.stream &&
          body.model === "gpt-4o-mini" &&
          body.max_tokens === 128,
      ),
    ).toBe(true)
    await panel.scrollIntoViewIfNeeded()
    await panel.screenshot({
      path: test.info().outputPath("web-context-capacity.png"),
      animations: "disabled",
    })
    hold = true
    held = new Promise<void>((resolve) => {
      release = resolve
    })
    const completedRequests = requests.length
    await panel.getByRole("button", { name: "Run context probe" }).click()
    await expect.poll(() => requests.length).toBeGreaterThan(completedRequests)
    await panel
      .locator("[data-verification-summary]")
      .getByRole("button", { name: "Stop", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run context probe" }),
    ).toBeEnabled()
    await expect(
      modal
        .locator("[data-verification-active-test]")
        .getByRole("status", { name: "Context capacity result" }),
    ).toContainText("Probe stopped")
    const sentBeforeReopen = requests.length
    const reopened = await openApiCheckModalFromCopiedCredentials(page)
    await reopened.modal
      .getByRole("textbox", { name: "Base URL", exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    await reopened.modal
      .getByRole("combobox", { name: "Test mode", exact: true })
      .click()
    await reopened.contentHost
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    await reopened.modal
      .getByRole("combobox", { name: "Model ID", exact: true })
      .click()
    await reopened.contentHost
      .getByRole("option", { name: "gpt-4o-mini", exact: true })
      .click()
    const restoredPanel = reopened.modal.getByRole("region", {
      name: "Context capacity test",
    })
    await restoredPanel.scrollIntoViewIfNeeded()
    await restoredPanel.screenshot({
      path: test.info().outputPath("web-context-history-row.png"),
      animations: "disabled",
    })
    // Restored status badges must leave the title visible and clickable.
    expect(
      (await restoredPanel
        .getByRole("button", { name: "Context capacity test", exact: true })
        .boundingBox())!.width,
    ).toBeGreaterThan(40)
    await restoredPanel
      .getByRole("button", { name: "Context capacity test", exact: true })
      .click()
    await expect(restoredPanel).toContainText("Non-streaming")
    await expect(
      reopened.modal
        .locator("[data-verification-active-test]")
        .getByRole("status", { name: "Context capacity result" }),
    ).toContainText("Context capacity:")
    expect(requests.length).toBe(sentBeforeReopen)
    await restoredPanel.screenshot({
      path: test.info().outputPath("web-context-history.png"),
      animations: "disabled",
    })
  } finally {
    release()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("web needle test plans automatically, follows a context probe and restores its results", async ({
  context,
  page,
  extensionDir,
}) => {
  // This scenario starts without metadata, even if a real catalog loaded at startup.
  const modelId = "e2e-needle-no-metadata"
  let capacityRequests = 0
  let needleRequests = 0
  let releaseRequest!: () => void
  const pendingRequest = new Promise<void>((resolve) => {
    releaseRequest = resolve
  })
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET") {
      response.end(JSON.stringify({ data: [{ id: modelId }] }))
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const prompt = body.messages.at(-1).content as string
    const key =
      /Question: Return only the archive code for record "([^"]+)"/.exec(
        prompt,
      )?.[1]
    let answer = "OK"
    if (key) {
      needleRequests++
      if (needleRequests === 2) await pendingRequest
      // The explicit column retest stays pending until its scoped stop reaches the background.
      if (needleRequests === 4) return
      answer = new RegExp(`Record "${key}" has archive code "([^"]+)"`).exec(
        prompt,
      )![1]!
    } else {
      capacityRequests++
      if (prompt.length > 14000) {
        response.statusCode = 400
        response.end(
          JSON.stringify({
            error: { message: "maximum context length exceeded" },
          }),
        )
        return
      }
    }
    response.end(
      JSON.stringify({
        id: "needle",
        object: "chat.completion",
        created: 1,
        model: modelId,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: answer },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1500,
          completion_tokens: 20,
          total_tokens: 1520,
        },
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    const open = async () => {
      const { modal, contentHost } =
        await openApiCheckModalFromCopiedCredentials(page)
      await modal
        .getByRole("textbox", { name: "Base URL", exact: true })
        .fill(baseUrl)
      await modal
        .getByRole("combobox", { name: "Test mode", exact: true })
        .click()
      await contentHost
        .getByRole("option", { name: "Non-streaming", exact: true })
        .click()
      await modal
        .getByRole("combobox", { name: "Model ID", exact: true })
        .click()
      await contentHost
        .getByRole("option", { name: modelId, exact: true })
        .click()
      const panel = modal.getByRole("region", {
        name: "Needle in a haystack",
        exact: true,
      })
      await panel
        .getByRole("button", { name: "Needle in a haystack", exact: true })
        .click()
      return { modal, panel }
    }
    const { modal, panel } = await open()
    await showVerificationSettings(page)
    await captureVisualViews({
      page,
      ready: page.locator("[data-verification-settings]:visible"),
      id: "web-needle-idle",
      extensionDir,
      views: [{ id: "desktop", theme: "light", width: 1280, height: 850 }],
    })
    await page.getByRole("button", { name: "How are lengths chosen?" }).click()
    const lengthHelp = page
      .getByRole("tooltip")
      .filter({ hasText: "How are lengths chosen?" })
    await expect(lengthHelp).toContainText("No usable model limits")
    await page.screenshot({
      path: test.info().outputPath("length-help.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(lengthHelp).toBeHidden()
    for (const [width, height] of [
      [380, 800],
      [320, 640],
      [1280, 500],
    ] as const) {
      await page.setViewportSize({ width, height })
      await showVerificationSettings(page)
      const sheet = page.locator('[data-slot="sheet-content"]:visible')
      if (await sheet.count()) {
        await expect(sheet).toHaveAccessibleName("Settings")
        expect(
          await sheet.evaluate((element) => {
            const titleId = element.getAttribute("aria-labelledby")!
            return (
              element.getRootNode() instanceof ShadowRoot &&
              (element.getRootNode() as ShadowRoot).getElementById(titleId)
                ?.textContent === "Settings"
            )
          }),
        ).toBe(true)
      }
      const helpButton = page.getByRole("button", {
        name: "How are lengths chosen?",
        exact: true,
      })
      await helpButton.scrollIntoViewIfNeeded()
      const workspace = page.getByTestId("verification-workspace")
      const before = (await workspace.boundingBox())!.height
      // Escape preserves focus, so explicitly activate the hint again after resizing.
      await helpButton.click()
      await expectTooltipUnobstructed(lengthHelp)
      expect((await workspace.boundingBox())!.height).toBeCloseTo(before, 0)
      await lengthHelp
        .getByText(enVerification.verifyDialog.tools.needle.tokenUnits, {
          exact: true,
        })
        .scrollIntoViewIfNeeded()
      await page.screenshot({
        path: test.info().outputPath(`length-help-${width}-${height}.png`),
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
      await expect(lengthHelp).toBeHidden()
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    await showVerificationSettings(page)
    expect(capacityRequests + needleRequests).toBe(0)
    await page
      .getByRole("button", { name: "Check available context", exact: true })
      .click()
    const limit = page.getByRole("combobox", {
      name: "Maximum text length (tokens)",
    })
    await expect(limit).toHaveAccessibleDescription(
      "Previously accepted: 2K input (maximum unknown)",
      { timeout: 30000 },
    )
    await expect(limit).toHaveText("Automatic (2K)")
    const runNeedle = panel
      .getByRole("region", { name: "Test preview" })
      .getByRole("button", { name: "Run", exact: true })
    await expect(runNeedle).toBeEnabled()
    expect(capacityRequests).toBeGreaterThan(0)
    expect(needleRequests).toBe(0)
    await runNeedle.click()
    await expect.poll(() => needleRequests).toBe(2)
    await expect(
      modal.locator("[data-verification-active-test]"),
    ).toContainText("Processed 1/3")
    await expect(
      panel.getByRole("button", { name: /tokens · 50%: Running\.\.\.$/ }),
    ).toBeVisible()
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      id: "needle-progress",
      extensionDir,
      views: [{ id: "desktop", theme: "light", width: 1280, height: 850 }],
    })
    const cells = panel.getByRole("table").getByRole("cell")
    await expect(cells.nth(0)).toHaveText("Match")
    await expect(
      cells.nth(1).getByText("Running...", { exact: true }),
    ).toBeVisible()
    await expect(
      cells.nth(2).getByText("Pending", { exact: true }),
    ).toBeVisible()
    releaseRequest()
    await expect(
      modal.locator("[data-verification-active-test]"),
    ).toContainText("3/3 matched", { timeout: 30000 })
    expect(needleRequests).toBe(3)
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      id: "needle-results",
      extensionDir,
      views: [{ id: "desktop", theme: "light", width: 1280, height: 850 }],
    })
    await page.setViewportSize({ width: 380, height: 800 })
    const configurationToggle = page
      .getByTestId("verification-workspace")
      .getByRole("button", {
        name: "Settings",
        exact: true,
      })
    if ((await configurationToggle.getAttribute("aria-expanded")) === "true")
      await configurationToggle.click()
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      id: "needle-results-narrow",
      extensionDir,
    })
    await page.setViewportSize({ width: 1280, height: 720 })
    await panel.getByRole("button", { name: /10%: Match/ }).click()
    await panel
      .getByRole("region", { name: "Cell details", exact: true })
      .getByRole("button", { name: "Request and answer details" })
      .click()
    await expect(
      panel.getByRole("region", { name: "Cell details", exact: true }),
    ).toContainText("Expected:")
    const stored = await getPlasmoStorageRawValue(
      await getServiceWorker(context),
      STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
    )
    expect(JSON.stringify(stored)).not.toContain(API_KEY)
    expect(JSON.stringify(stored)).not.toContain("archive-")
    const reopened = await open()
    await expect(
      reopened.modal.locator("[data-verification-active-test]"),
    ).toContainText("3/3 matched")
    await expect(
      reopened.modal.locator("[data-verification-active-test]"),
    ).toContainText("Previously: 3/3 matched")
    await expect(reopened.panel).not.toContainText("Saved result")
    await captureVisualViews({
      page,
      ready: reopened.modal.locator("[data-verification-active-test]"),
      extensionDir,
      id: "needle-history-header",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 850 },
        { id: "dark", theme: "dark", width: 1280, height: 850 },
      ],
    })
    await reopened.panel
      .getByRole("button", {
        name: "Test parameters and reproduction",
        exact: true,
      })
      .click()
    await expect(reopened.panel).not.toContainText(
      "Only measurements are saved",
    )
    await expect(
      reopened.modal
        .locator("[data-verification-header-status]:visible")
        .getByRole("button", { name: /^Previously:/ }),
    ).toHaveAccessibleDescription(/History keeps measurements/)
    const historyBadge = reopened.modal
      .locator("[data-verification-header-status]:visible")
      .getByRole("button", {
        name: /^Previously:/,
      })
    await historyBadge.scrollIntoViewIfNeeded()
    await reopened.panel.screenshot({
      path: test.info().outputPath("web-history-before-hover.png"),
      animations: "disabled",
    })
    const historyHint = page
      .getByRole("tooltip")
      .filter({ hasText: "History keeps measurements" })
    await historyBadge.hover()
    await expect(historyHint).toBeVisible()
    await expect(historyHint).toHaveCSS("opacity", "0.9")
    await expect(historyHint).toHaveCSS("font-size", "12px")
    expect(
      await historyHint.evaluate(
        (element) => element.getRootNode() instanceof ShadowRoot,
      ),
    ).toBe(true)
    await page.screenshot({
      path: test.info().outputPath("web-history-tooltip.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(historyHint).toBeHidden()
    await page.mouse.move(0, 0)
    await historyBadge.focus()
    await expect(historyHint).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(historyHint).toBeHidden()
    await historyBadge.click()
    await expect(historyHint).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(historyHint).toBeVisible()
    await reopened.panel
      .getByRole("button", {
        name: "Test parameters and reproduction",
        exact: true,
      })
      .click()
    await expect(historyHint).toBeHidden()
    await expect(reopened.panel).toBeVisible()
    await page.setViewportSize({ width: 380, height: 800 })
    if ((await configurationToggle.getAttribute("aria-expanded")) === "true")
      await configurationToggle.click()
    await reopened.panel
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await expect(historyBadge).toBeVisible()
    await captureVisualViews({
      page,
      ready: historyBadge,
      id: "needle-history-header-narrow",
      extensionDir,
    })
    await historyBadge.scrollIntoViewIfNeeded()
    const touch = await context.newCDPSession(page)
    try {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true })
      const bounds = (await historyBadge.boundingBox())!
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        ],
      })
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      })
      await expect(historyHint).toBeVisible()
      const hintBounds = (await historyHint.boundingBox())!
      expect(hintBounds.x).toBeGreaterThanOrEqual(0)
      expect(hintBounds.x + hintBounds.width).toBeLessThanOrEqual(380)
      await page.screenshot({
        path: test.info().outputPath("web-history-touch.png"),
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
      await expect(historyHint).toBeHidden()
    } finally {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false })
      await touch.detach()
    }
    expect(needleRequests).toBe(3)
    await reopened.panel.getByRole("button", { name: /50%: Match$/ }).click()
    const cellDetails = reopened.panel.getByRole("region", {
      name: "Cell details",
      exact: true,
    })
    await cellDetails
      .getByRole("button", {
        name: "Retest this cell",
        exact: true,
      })
      .click()
    await expect.poll(() => needleRequests).toBe(4)
    await cellDetails
      .getByRole("button", { name: /^Stop .*50%$/, exact: true })
      .click()
    await expect(
      cellDetails.getByRole("button", {
        name: "Retest this cell",
        exact: true,
      }),
    ).toBeEnabled()
    expect(needleRequests).toBe(4)
    await expect(
      reopened.panel.getByRole("button", { name: /50%: Cancelled$/ }),
    ).toBeVisible()
    await expect(
      reopened.panel.getByRole("table").getByRole("cell"),
    ).toHaveCount(3)
  } finally {
    releaseRequest()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("keeps web probe rows compact when inspecting process diagnostics", async ({
  context,
  page,
  extensionDir,
}) => {
  const fixture = createDrawingServer({})
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  try {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1920, height: 1000 })
    const { modal, contentHost } =
      await openApiCheckModalFromCopiedCredentials(page)
    await modal
      .getByRole("textbox", { name: "Base URL", exact: true })
      .fill(
        `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`,
      )
    await expect(
      modal.getByRole("combobox", { name: "Model ID", exact: true }),
    ).not.toHaveAttribute("aria-busy", "true")
    const models = modal.getByTestId(getWebAiApiCheckProbeTestId("models"))
    const textProbe = modal.getByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )
    await textProbe
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    const before = (await textProbe.boundingBox())!
    const modelsHeight = (await models.boundingBox())!.height
    await textProbe
      .locator("[data-verification-summary]")
      .getByRole("button", { name: "Run", exact: true })
      .click()
    await expect(
      textProbe.getByRole("region", { name: "Execution result", exact: true }),
    ).toBeVisible()
    await modal
      .locator("[data-verification-active-test]")
      .getByRole("button", { name: "Statistics", exact: true })
      .click()
    await contentHost
      .getByRole("dialog", { name: "Statistics", exact: true })
      .getByRole("button", { name: "About these metrics", exact: true })
      .click()
    await expect(
      contentHost.getByRole("tooltip", {
        name: enVerification.verifyDialog.generation.metricsHint,
      }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(
      contentHost.getByRole("tooltip", {
        name: enVerification.verifyDialog.generation.metricsHint,
      }),
    ).toBeHidden()
    await expect(modal).toBeVisible()
    await modal
      .locator("[data-verification-active-test]")
      .getByRole("button", { name: "Statistics", exact: true })
      .click()
    await captureVisualViews({
      page,
      ready: textProbe,
      // Keep scroll-driven fades at the current scroll position; reduced motion
      // already stabilizes ordinary transitions in this workflow.
      animations: "allow",
      id: "web-expanded",
      extensionDir,
    })
    const after = (await textProbe.boundingBox())!
    expect(after.width).toBeCloseTo(before.width, 0)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect((await models.boundingBox())!.height).toBeCloseTo(modelsHeight, 0)
    await textProbe
      .getByRole("button", { name: "Request details", exact: true })
      .click()
    expect((await textProbe.boundingBox())!.width).toBeCloseTo(before.width, 0)
    await expect(
      modal.getByRole("button", { name: "Request configuration", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await modal.getByRole("combobox", { name: "Model ID", exact: true }).click()
    await contentHost
      .getByRole("option", { name: "gpt-quality", exact: true })
      .click()
    await page
      .getByRole("textbox", { name: "Text generation prompt", exact: true })
      .fill("LongPrompt".repeat(80))
    const worker = await getServiceWorker(context)

    const requestsBeforeEditedPrompt = fixture.requests.length
    await textProbe
      .locator("[data-verification-composer]")
      .getByRole("button", { name: "Run", exact: true })
      .click()
    await expect
      .poll(() => fixture.requests.length)
      .toBe(requestsBeforeEditedPrompt + 1)
    expect(fixture.prompts.at(-1)).toBe("LongPrompt".repeat(80))
    await expect
      .poll(async () => {
        const preferences = await getStoredUserPreferences(worker)
        return (
          preferences.verificationProbePrompts as
            Record<string, string> | undefined
        )?.["text-generation"]
      })
      .toBe("LongPrompt".repeat(80))
    await expect(
      textProbe
        .locator("[data-verification-summary]")
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Fail" }),
    ).toBeVisible()
    await expect(
      modal.locator("[data-verification-active-test]"),
    ).toContainText("Unexpected response text.")
    await textProbe
      .getByRole("button", { name: "Request details", exact: true })
      .click()
    await expect(
      textProbe.getByRole("region", { name: "Execution result", exact: true }),
    ).toBeVisible()
    for (const width of [1280, 900, 380]) {
      await page.setViewportSize({ width, height: 800 })
      const left = (await models.boundingBox())!
      const right = (await textProbe.boundingBox())!
      expect(right.x).toBeCloseTo(left.x, 0)
      expect(right.y).toBeGreaterThanOrEqual(left.y + left.height)
      expect(right.y - (left.y + left.height)).toBeLessThanOrEqual(24)
      // Evidence stays in the detail pane; the test list does not move.
      expect(right.width).toBeCloseTo(left.width, 0)
      const scroll = modal.getByTestId(
        WEB_AI_API_CHECK_TEST_IDS.scrollContainer,
      )
      expect(
        await scroll.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
      ).toBeLessThanOrEqual(1)
      await captureVisualViews({
        page,
        ready: textProbe,
        // Keep scroll-driven fades at the current scroll position; reduced motion
        // already stabilizes ordinary transitions in this workflow.
        animations: "allow",
        id: `web-expanded-${width}`,
        extensionDir,
      })
    }
    const settingsToggle = modal
      .getByTestId("verification-workspace")
      .getByRole("button", {
        name: "Settings",
        exact: true,
      })
    if ((await settingsToggle.getAttribute("aria-expanded")) === "true")
      await settingsToggle.click()
    await page
      .getByRole("button", { name: "Reset this prompt", exact: true })
      .click()
    await expect
      .poll(async () => {
        const preferences = await getStoredUserPreferences(worker)
        return (
          preferences.verificationProbePrompts as
            Record<string, string> | undefined
        )?.["text-generation"]
      })
      .toBeUndefined()
    await textProbe.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(
      textProbe
        .locator("[data-verification-summary]")
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Pass" }),
    ).toBeVisible()
    await expect(
      textProbe.getByRole("region", { name: "Execution result", exact: true }),
    ).toContainText("OK")
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("prioritizes extraction until both URL and key are available", async ({
  context,
  extensionDir,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(worker)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(TEST_PAGE_URL)
  for (const width of [1440, 420]) {
    await page.setViewportSize({ width, height: 900 })
    await sendApiCheckContextMenuTrigger(worker, {
      pageUrl: TEST_PAGE_URL,
      selectionText: "",
    })
    const modal = page.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
    const source = modal.getByRole("textbox", {
      name: "Extraction source",
      exact: true,
    })
    const disclosure = modal.getByRole("button", {
      name: "Extraction source",
      exact: true,
    })
    const baseUrl = modal.getByRole("textbox", {
      name: "Base URL",
      exact: true,
    })
    const apiKey = modal.getByLabel("API key", { exact: true })
    const workspace = modal.getByTestId("verification-workspace")
    const save = modal.getByTestId(
      WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton,
    )
    const saveHint = modal.locator("#api-check-save-hint")
    await expect(save).toHaveAccessibleDescription(
      enApiCheck.modal.hints.saveWithoutTest,
    )
    await expect(
      modal.getByText("Text to extract from", { exact: true }),
    ).toHaveCount(0)
    expect((await saveHint.boundingBox())!.y).toBeGreaterThan(
      (await workspace.boundingBox())!.y,
    )
    expect(
      (await saveHint.boundingBox())!.y +
        (await saveHint.boundingBox())!.height,
    ).toBeLessThanOrEqual(
      (await save.boundingBox())!.y + (await save.boundingBox())!.height,
    )
    await baseUrl.clear()
    await apiKey.clear()
    for (const state of ["empty", "url-only", "key-only"] as const) {
      if (state === "url-only") await baseUrl.fill(API_BASE_URL)
      if (state === "key-only") {
        await baseUrl.clear()
        await apiKey.fill(API_KEY)
      }
      if (width === 1440) {
        expect(
          (await modal.getByRole("dialog").boundingBox())!.width,
        ).toBeLessThanOrEqual(960)
        const editorBounds = (await source.boundingBox())!
        const fieldBounds = (await baseUrl.boundingBox())!
        expect(
          fieldBounds.x - (editorBounds.x + editorBounds.width),
        ).toBeLessThanOrEqual(80)
      }
      await expect(source).toBeVisible()
      await source.scrollIntoViewIfNeeded()
      await captureVisualViews({
        page,
        ready: modal,
        id: `source-${state}-${width}`,
        extensionDir,
      })
      await expect(
        modal.getByRole("heading", {
          name: enApiCheck.modal.preparation.title,
        }),
      ).toBeVisible()
      await expect(workspace.locator("[data-verification-list]")).toBeHidden()
      await expect(baseUrl).toBeVisible()
      await expect(apiKey).toBeVisible()
      expect.soft(await disclosure.isDisabled()).toBe(true)
    }
    await baseUrl.fill(API_BASE_URL)
    await expect.soft(source).toBeHidden({ timeout: 500 })
    await expect(
      workspace.locator("[data-verification-workspace-bar]"),
    ).toBeVisible()
    if (width >= 832)
      await expect(workspace.locator("[data-verification-list]")).toBeVisible()
    await captureVisualViews({
      page,
      ready: modal,
      id: `source-ready-${width}`,
      extensionDir,
    })
    if ((await disclosure.getAttribute("aria-expanded")) === "false")
      await disclosure.click()
    await source.fill(
      `Base URL: ${API_BASE_URL}\nAPI Key: ${API_KEY}\nKeep this source draft`,
    )
    await expect(source).toBeFocused()
    await expect(apiKey).toHaveValue(API_KEY)
    await disclosure.click()
    await showVerificationSettings(page)
    await apiKey.clear()
    await expect.soft(source).toBeVisible({ timeout: 500 })
    await captureVisualViews({
      page,
      ready: modal,
      id: `source-key-cleared-${width}`,
      extensionDir,
    })
    await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()
    await expect(modal).toBeHidden()
  }
})

test("uses the available source space when save options expand", async ({
  context,
  extensionDir,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(worker)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(TEST_PAGE_URL)
  for (const width of [1440, 420]) {
    await page.setViewportSize({ width, height: 900 })
    await sendApiCheckContextMenuTrigger(worker, {
      pageUrl: TEST_PAGE_URL,
      selectionText: `Base URL: ${API_BASE_URL}`,
    })
    const modal = page.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
    const source = modal.getByRole("textbox", {
      name: "Extraction source",
      exact: true,
    })
    await source.fill("Keep this source draft")
    const options = modal.getByRole("button", {
      name: enApiCheck.modal.optionalProfileFields.title,
      exact: true,
    })
    if ((await options.getAttribute("aria-expanded")) === "true")
      await options.click()
    await expect(options).toHaveAttribute("aria-expanded", "false")
    const compactTop =
      (await source.boundingBox())!.y -
      (await modal.getByRole("dialog").boundingBox())!.y
    await options.click()
    await expect(
      modal.getByLabel(enApiCheck.modal.fields.notes, { exact: true }),
    ).toBeVisible()
    await captureVisualViews({
      page,
      ready: modal,
      id: `source-options-expanded-${width}`,
      extensionDir,
    })
    if (width === 1440) {
      expect(
        Math.abs(
          (await source.boundingBox())!.y -
            (await modal.getByRole("dialog").boundingBox())!.y -
            compactTop,
        ),
      ).toBeLessThanOrEqual(2)
      const notes = (await modal
        .getByLabel(enApiCheck.modal.fields.notes, { exact: true })
        .boundingBox())!
      const sourcePage = (await modal
        .getByLabel(enApiCheck.modal.fields.sourceUrl, { exact: true })
        .boundingBox())!
      expect(notes.width).toBeGreaterThan(350)
      expect(Math.abs(notes.y - sourcePage.y)).toBeLessThanOrEqual(2)
      expect((await options.boundingBox())!.y).toBeGreaterThan(
        (await source.boundingBox())!.y + (await source.boundingBox())!.height,
      )
    }
    if (width === 420) {
      await modal
        .getByLabel(enApiCheck.modal.fields.notes, { exact: true })
        .scrollIntoViewIfNeeded()
      await captureVisualViews({
        page,
        ready: modal,
        id: "source-options-fields-420",
        extensionDir,
      })
      await expect(
        modal.getByLabel(enApiCheck.modal.fields.sourceUrl, { exact: true }),
      ).toBeVisible()
    }
    await options.click()
    await expect(options).toHaveAttribute("aria-expanded", "false")
    await source.scrollIntoViewIfNeeded()
    await captureVisualViews({
      page,
      ready: modal,
      id: `source-options-collapsed-${width}`,
      extensionDir,
    })
    await expect(source).toHaveValue("Keep this source draft")
    await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()
    await expect(modal).toBeHidden()
  }
})

test("keeps settings beside the conversation and preserves drafts when the responsive pane closes", async ({
  context,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1920, height: 900 })
  const { modal } = await openApiCheckModalFromCopiedCredentials(page)
  const settings = modal.locator("[data-verification-settings]:visible")
  await expect(settings).toBeVisible()
  const list = modal.locator("[data-verification-list]")
  const detail = modal.locator("[data-verification-detail]:visible")
  const left = (await list.boundingBox())!
  const middle = (await detail.boundingBox())!
  const right = (await settings.boundingBox())!
  const workspaceBar = modal.locator("[data-verification-workspace-bar]")
  const barBefore = (await workspaceBar.boundingBox())!
  const rightBottomBefore = right.y + right.height
  expect(left.x + left.width).toBeCloseTo(middle.x, 0)
  expect(middle.x + middle.width).toBeCloseTo(right.x, 0)
  expect(middle.width).toBeGreaterThanOrEqual(480)
  expect(
    (await modal
      .getByRole("dialog", { name: "API Testing", exact: true })
      .boundingBox())!.width,
  ).toBeGreaterThan(1400)
  await modal
    .getByRole("button", { name: "Extraction source", exact: true })
    .click()
  const source = modal.getByRole("textbox", {
    name: "Extraction source",
    exact: true,
  })
  await source.fill("Keep this source draft")
  expect((await workspaceBar.boundingBox())!.y).toBeGreaterThan(barBefore.y)
  const rightAfter = (await settings.boundingBox())!
  expect(rightAfter.y + rightAfter.height).toBeCloseTo(rightBottomBefore, 0)
  await modal
    .getByRole("dialog", { name: "API Testing", exact: true })
    .screenshot({
      path: test.info().outputPath("three-column-wide.png"),
      animations: "disabled",
    })
  await page.setViewportSize({ width: 1000, height: 800 })
  await expect(settings).toBeHidden()
  const toggle = modal
    .getByTestId("verification-workspace")
    .getByRole("button", {
      name: "Settings",
      exact: true,
    })
  await toggle.click()
  await expect(source).toHaveValue("Keep this source draft")
  await settings.focus()
  await page.keyboard.press("Escape")
  await expect(settings).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(modal).toBeVisible()
  await page.setViewportSize({ width: 380, height: 800 })
  await toggle.click()
  const settingsSheet = modal.getByRole("dialog", {
    name: "Settings",
    exact: true,
  })
  await expect(settingsSheet).toHaveAccessibleName("Settings")
  expect(
    await settingsSheet.evaluate(
      (element) =>
        (element.getRootNode() as ShadowRoot).getElementById(
          element.getAttribute("aria-labelledby")!,
        )?.textContent,
    ),
  ).toBe("Settings")
  await expect(source).toHaveValue("Keep this source draft")
  await source.fill("Keep this source draft")
  await expect(workspaceBar).toBeInViewport({ ratio: 1 })
  await expect(settings).toBeInViewport({ ratio: 1 })
  expect(
    await settings.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await modal
    .getByRole("dialog", { name: "API Testing", exact: true })
    .screenshot({
      path: test.info().outputPath("three-column-narrow-settings.png"),
      animations: "disabled",
    })
  await settings
    .getByRole("button", { name: "Save options (optional)", exact: true })
    .click()
  const notes = settings.getByRole("textbox", { name: "Notes", exact: true })
  await notes.fill("Keep this save-only note")
  const expiration = settings.getByRole("textbox", {
    name: "Expiration date",
    exact: true,
  })
  await expiration.fill("2030-06-15")
  await expiration.press("Enter")
  await settings
    .getByRole("button", {
      name: "Expiration date: Open calendar",
      exact: true,
    })
    .click()
  const calendar = page.locator('[data-slot="popover-content"]')
  await expect(calendar.getByRole("grid")).toBeVisible()
  const calendarBounds = (await calendar.boundingBox())!
  expect(calendarBounds.x).toBeGreaterThanOrEqual(0)
  expect(calendarBounds.x + calendarBounds.width).toBeLessThanOrEqual(380)
  expect(calendarBounds.y).toBeGreaterThanOrEqual(0)
  expect(calendarBounds.y + calendarBounds.height).toBeLessThanOrEqual(800)
  await modal.screenshot({
    path: test.info().outputPath("web-save-options-calendar-narrow.png"),
    animations: "disabled",
  })
  await calendar.getByRole("grid").press("Escape")
  await expect(calendar).toBeHidden()
  await expect(settings).toBeVisible()
  await settings
    .getByRole("button", {
      name: "Expiration date: Open calendar",
      exact: true,
    })
    .click()
  await calendar
    .getByRole("button", { name: "No expiration", exact: true })
    .click()
  await expect(expiration).toHaveValue("")
  await notes.press("Escape")
  await expect(settings).toBeHidden()
  await toggle.click()
  await expect(notes).toHaveValue("Keep this save-only note")
})

test("collapses the sidebars completely while preserving the active test and drafts", async ({
  context,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1920, height: 900 })
  const { modal } = await openApiCheckModalFromCopiedCredentials(page)
  const settings = modal.getByRole("complementary", {
    name: "Settings",
    exact: true,
  })
  const bar = modal.locator("[data-verification-workspace-bar]")
  const detail = modal.locator("[data-verification-detail]:visible")
  const originalWidth = (await detail.boundingBox())!.width
  await modal
    .getByRole("button", { name: "Extraction source", exact: true })
    .click()
  const source = modal.getByRole("textbox", {
    name: "Extraction source",
    exact: true,
  })
  await source.fill("Retain this sidebar draft")
  await bar
    .getByRole("button", { name: /Collapse test list/, exact: true })
    .click()
  await expect(
    bar.getByRole("button", { name: /Expand test list/, exact: true }),
  ).toHaveAttribute("aria-expanded", "false")
  await expect(settings).toBeVisible()
  await expect(
    detail.getByRole("heading", { name: "Model list", exact: true }),
  ).toBeVisible()
  await expect
    .poll(async () => (await detail.boundingBox())!.width)
    .toBeGreaterThan(originalWidth + 250)
  const leftCollapsedWidth = (await detail.boundingBox())!.width
  const capture = async (name: string) =>
    modal.getByRole("dialog", { name: "API Testing", exact: true }).screenshot({
      path: test.info().outputPath(name),
      animations: "disabled",
    })
  await capture("sidebar-left-collapsed.png")
  await bar.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(settings).toBeHidden()
  await expect
    .poll(async () => (await detail.boundingBox())!.width)
    .toBeGreaterThan(leftCollapsedWidth + 250)
  const frame = (await modal
    .locator(".verification-workspace-frame")
    .boundingBox())!
  const fullResult = (await detail.boundingBox())!
  expect(fullResult.x).toBeCloseTo(frame.x, 0)
  expect(fullResult.width).toBeCloseTo(frame.width, 0)
  await capture("sidebar-both-collapsed.png")
  await bar
    .getByRole("button", { name: /Expand test list/, exact: true })
    .focus()
  await page.keyboard.press("Enter")
  await expect(
    bar.getByRole("button", { name: /Collapse test list/, exact: true }),
  ).toHaveAttribute("aria-expanded", "true")
  await expect(settings).toBeHidden()
  await capture("sidebar-right-collapsed.png")
  await bar.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(source).toHaveValue("Retain this sidebar draft")
  await expect
    .poll(async () =>
      Math.abs((await detail.boundingBox())!.width - originalWidth),
    )
    .toBeLessThanOrEqual(1)
  await expect(
    modal.getByRole("button", { name: "Model list", exact: true }),
  ).toHaveAttribute("aria-expanded", "true")
  await capture("sidebar-expanded.png")
})

test("keeps page verification actions visible while scrolling at desktop and narrow widths", async ({
  context,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1920, height: 800 })
  const { modal } = await openApiCheckModalFromCopiedCredentials(page)
  const profileHelp = modal.getByRole("button", {
    name: "Client simulation",
    exact: true,
  })
  const profileSelector = modal.getByRole("combobox", {
    name: "Client simulation",
    exact: true,
  })
  await profileHelp.scrollIntoViewIfNeeded()
  const profileBoundsBeforeHelp = (await profileSelector.boundingBox())!
  await profileHelp.hover()
  const profileHint = modal
    .getByRole("tooltip")
    .filter({ hasText: "Selecting a client" })
  await expect(profileHint).toBeVisible()
  await expect(profileHint).toContainText("Selecting a client")
  await expectTooltipUnobstructed(profileHint)
  await modal
    .getByRole("dialog", { name: "API Testing", exact: true })
    .screenshot({
      path: test.info().outputPath("profile-help-open.png"),
      animations: "disabled",
    })
  await expectVerificationWorkspaceFlush(
    modal.getByTestId("verification-workspace"),
  )
  const profileBoundsWithHelp = (await profileSelector.boundingBox())!
  expect(
    Math.abs(profileBoundsWithHelp.y - profileBoundsBeforeHelp.y),
  ).toBeLessThanOrEqual(2)
  await profileSelector.click({ trial: true })
  await profileHelp.press("Escape")
  await expect(profileHint).toBeHidden()
  await expect(modal).toBeVisible()
  await profileHelp.click()
  await expect(profileHint).toBeVisible()
  await profileSelector.click()
  await expect(profileSelector).toHaveAttribute("aria-expanded", "true")
  await modal.getByRole("option", { name: "Ordinary API", exact: true }).click()
  await expect(profileSelector).toHaveAttribute("aria-expanded", "false")
  await profileSelector.focus()
  await modal
    .getByRole("button", { name: "Extraction source", exact: true })
    .click()
  const sourceEditor = modal.getByRole("textbox", {
    name: "Extraction source",
    exact: true,
  })
  await expect(sourceEditor).toBeVisible()
  const originalText = await sourceEditor.inputValue()
  const initialHeight = (await sourceEditor.boundingBox())!.height
  await sourceEditor.fill(
    Array.from({ length: 6 }, (_, i) => `Source note ${i}`).join("\n"),
  )
  await modal.getByRole("dialog").screenshot({
    path: test.info().outputPath("source-text-six-lines.png"),
    animations: "disabled",
  })
  expect((await sourceEditor.boundingBox())!.height).toBeGreaterThan(
    initialHeight,
  )
  await sourceEditor.fill(
    Array.from({ length: 30 }, (_, i) => `Source note ${i}`).join("\n"),
  )
  expect((await sourceEditor.boundingBox())!.height).toBeLessThanOrEqual(192)
  await sourceEditor.fill(originalText)
  expect((await sourceEditor.boundingBox())!.height).toBe(initialHeight)
  for (const width of [1920, 1280, 900, 380]) {
    await page.setViewportSize({ width, height: 800 })
    await showVerificationSettings(page)
    await expectVerificationWorkspaceFlush(
      modal.getByTestId("verification-workspace"),
    )
    const scroll = modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.scrollContainer)
    await scroll.evaluate((element) => {
      element.scrollTop = 0
      for (const child of element.querySelectorAll<HTMLElement>("*")) {
        if (child.scrollTop) child.scrollTop = 0
      }
    })
    await modal.getByRole("dialog").screenshot({
      path: test.info().outputPath(`layout-${width}.png`),
      animations: "disabled",
    })
    const config = await modal.getByTestId("verification-config").boundingBox()
    if (width < 1280)
      await modal
        .getByTestId("verification-workspace")
        .getByRole("button", { name: "Settings", exact: true })
        .click()
    const models = await modal
      .getByTestId(getWebAiApiCheckProbeTestId("models"))
      .boundingBox()
    expect(config).not.toBeNull()
    expect(models).not.toBeNull()
    if (width >= 1280)
      expect(config!.x).toBeGreaterThan(models!.x + models!.width)
    const textProbe = await modal
      .getByTestId(getWebAiApiCheckProbeTestId("text-generation"))
      .boundingBox()
    expect(textProbe).not.toBeNull()
    if (width >= 1024) {
      expect(textProbe!.y).toBeGreaterThanOrEqual(models!.y + models!.height)
      expect(textProbe!.x).toBeCloseTo(models!.x, 0)
      const controls = await Promise.all(
        ["API type", "Model ID", "Test mode", "Client simulation"].map((name) =>
          modal.getByRole("combobox", { name, exact: true }).boundingBox(),
        ),
      )
      expect(
        Math.max(...controls.map((box) => box!.x)) -
          Math.min(...controls.map((box) => box!.x)),
      ).toBeLessThanOrEqual(2)
    } else {
      expect(textProbe!.y).toBeGreaterThanOrEqual(models!.y + models!.height)
    }
    const source = modal.getByRole("textbox", {
      name: "Extraction source",
      exact: true,
    })
    await showVerificationSettings(page)
    await source.scrollIntoViewIfNeeded()
    await expect(source).toBeInViewport()
    const sourceBounds = await source.boundingBox()
    const dialogBounds = await modal.getByRole("dialog").boundingBox()
    expect(sourceBounds!.x).toBeGreaterThanOrEqual(dialogBounds!.x)
    expect(sourceBounds!.x + sourceBounds!.width).toBeLessThanOrEqual(
      dialogBounds!.x + dialogBounds!.width,
    )
    if (width >= 1280)
      expect(sourceBounds!.width).toBeGreaterThan(
        (await modal.locator("[data-verification-settings]").boundingBox())!
          .width,
      )
    if (width >= 1280) expect(dialogBounds!.width).toBeGreaterThanOrEqual(1000)
    const drawing = modal.getByRole("button", {
      name: "Run drawing test",
      exact: true,
    })
    if (width < 1280)
      await modal
        .getByTestId("verification-workspace")
        .getByRole("button", { name: "Settings", exact: true })
        .click()
    await drawing.scrollIntoViewIfNeeded()
    await expect(drawing).toBeInViewport()
    const drawingBounds = await modal
      .getByTestId("verification-tools-panel")
      .boundingBox()
    expect(drawingBounds!.width).toBeCloseTo(models!.width, 0)
    await modal.getByRole("dialog").screenshot({
      path: test.info().outputPath(`layout-${width}-drawing.png`),
      animations: "disabled",
    })
    const save = modal.getByTestId(
      WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton,
    )
    const before = await save.boundingBox()
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const after = await save.boundingBox()
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1)
    await expect(save).toBeInViewport()
    expect(
      await modal
        .getByRole("dialog")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    if (width === 380) {
      await showVerificationSettings(page)
      await profileHelp.scrollIntoViewIfNeeded()
      // Settle Playwright's scroll preparation before measuring tooltip reflow.
      await profileHelp.click({ trial: true })
      const beforeHelp = (await profileSelector.boundingBox())!
      await profileHelp.click()
      await expect(profileHint).toBeVisible()
      await expectTooltipUnobstructed(profileHint)
      const hintBounds = (await profileHint.boundingBox())!
      expect(hintBounds.x).toBeGreaterThanOrEqual(0)
      expect(hintBounds.x + hintBounds.width).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: test.info().outputPath("profile-help-narrow.png"),
        animations: "disabled",
      })
      const withHelp = (await profileSelector.boundingBox())!
      expect(Math.abs(withHelp.y - beforeHelp.y)).toBeLessThanOrEqual(2)
      await profileSelector.click({ trial: true })
      await profileHelp.press("Escape")
      await expect(profileHint).toBeHidden()
      await expect(modal).toBeVisible()
      await profileHelp.click()
      await expect(profileHint).toBeVisible()
      await profileSelector.click()
      await expect(profileSelector).toHaveAttribute("aria-expanded", "true")
      await modal
        .getByRole("option", { name: "Ordinary API", exact: true })
        .click()
      await expect(profileSelector).toHaveAttribute("aria-expanded", "false")
    }
  }
})

test.describe("verification help on touch screens", () => {
  test.use({ hasTouch: true })

  test("opens client and test explanations on tap without closing the workspace", async ({
    context,
    page,
  }) => {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1440, height: 840 })
    const { modal } = await openApiCheckModalFromCopiedCredentials(page)
    await page.setViewportSize({ width: 420, height: 840 })
    // Wait for the responsive default to close the desktop settings pane.
    await expect(
      modal
        .getByTestId("verification-workspace")
        .getByRole("button", { name: "Settings", exact: true }),
    ).toHaveAttribute("aria-expanded", "false")
    await showVerificationSettings(page)
    const clientHelp = modal.getByRole("button", {
      name: "Client simulation",
      exact: true,
    })
    await clientHelp.scrollIntoViewIfNeeded()
    await clientHelp.tap()
    const tooltip = modal
      .getByRole("tooltip")
      .filter({ hasText: "Selecting a client" })
    await expect(tooltip).toBeVisible()
    await page.screenshot({
      path: test.info().outputPath("client-help-touch.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(tooltip).toBeHidden()
    await expect(modal).toBeVisible()
    await modal
      .getByRole("button", {
        name: enVerification.verifyDialog.about,
        exact: true,
      })
      .tap()
    await expect(modal.getByRole("tooltip")).toContainText(
      enVerification.verifyDialog.warning,
    )
    await page.screenshot({
      path: test.info().outputPath("test-help-touch.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(modal.getByRole("tooltip")).toBeHidden()
    await expect(modal).toBeVisible()
    await modal
      .getByTestId("verification-workspace")
      .getByRole("button", { name: "Settings", exact: true })
      .tap()
    await modal
      .getByRole("region", { name: "Needle in a haystack", exact: true })
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .tap()
    await showVerificationSettings(page)
    const planHelp = modal.getByRole("button", {
      name: "How are lengths chosen?",
      exact: true,
    })
    await planHelp.scrollIntoViewIfNeeded()
    await planHelp.tap()
    const planTooltip = modal
      .getByRole("tooltip")
      .filter({ hasText: "How are lengths chosen?" })
    await expectTooltipUnobstructed(planTooltip)
    await expect(planTooltip).toContainText("Exact lengths:")
    await page.screenshot({
      path: test.info().outputPath("length-help-touch.png"),
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(planTooltip).toBeHidden()
    await expect(planHelp).toBeFocused()
    await expect(
      modal
        .getByTestId("verification-workspace")
        .getByRole("button", { name: "Settings", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
  })
})

test("keeps empty model recovery compact and allows a manual model", async ({
  context,
  page,
}) => {
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  let fetched = false
  let failFetch = false
  await context.route(`${API_BASE_URL}/v1/models`, async (route) => {
    fetched = true
    await route.fulfill({
      contentType: "application/json",
      status: failFetch ? 401 : 200,
      body: JSON.stringify(
        failFetch ? { error: { message: "Access denied" } } : { data: [] },
      ),
    })
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  const selector = modal.getByRole("combobox", {
    name: "Model ID",
    exact: true,
  })
  await expect.poll(() => fetched).toBe(true)
  await expect(selector).not.toHaveAttribute("aria-busy", "true")
  await selector.click()
  const dropdown = contentHost.locator('[data-slot="popover-content"]')
  await expect(dropdown.getByRole("status")).toContainText(
    "The request succeeded but returned no models.",
  )
  const refresh = dropdown.getByRole("button", {
    name: "Fetch models",
    exact: true,
  })
  // Radix can finish its initial placement between the two geometry reads.
  await expect(async () => {
    const searchBounds = await dropdown
      .getByPlaceholder("Search...")
      .boundingBox()
    const refreshBounds = await refresh.boundingBox()
    expect(
      Math.abs(
        refreshBounds!.y +
          refreshBounds!.height / 2 -
          searchBounds!.y -
          searchBounds!.height / 2,
      ),
    ).toBeLessThanOrEqual(2)
    expect(refreshBounds!.x).toBeGreaterThanOrEqual(
      searchBounds!.x + searchBounds!.width,
    )
  }).toPass({ timeout: 10_000 })
  await dropdown.screenshot({
    path: test.info().outputPath("empty-model-picker.png"),
    animations: "disabled",
  })
  expect((await dropdown.boundingBox())!.height).toBeLessThanOrEqual(120)
  await expect(dropdown).not.toContainText("Type to create one")
  const search = dropdown.getByPlaceholder("Search...")
  await expect(
    dropdown.getByRole("button", { name: "Enter manually", exact: true }),
  ).toHaveCount(0)
  await search.click()
  await expect(search).toBeFocused()
  failFetch = true
  await refresh.click()
  await expect(dropdown.getByRole("alert")).toContainText("Access denied")
  await expect(selector.getByLabel("Failed to fetch the list.")).toBeVisible()
  await dropdown.screenshot({
    path: test.info().outputPath("failed-model-picker.png"),
    animations: "disabled",
  })
  await search.fill("custom-empty-model")
  await dropdown
    .getByRole("option", { name: 'Use "custom-empty-model"', exact: true })
    .click()
  await expect(selector).toContainText("custom-empty-model")
})

test("refreshes models inside the dropdown without changing the selection", async ({
  context,
  page,
}) => {
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  const selector = modal.getByRole("combobox", {
    name: "Model ID",
    exact: true,
  })
  await expect(selector).toContainText("gpt-4o-mini")
  await expect(
    modal.getByRole("button", { name: "Fetch models", exact: true }),
  ).toHaveCount(0)
  let finishFetch!: () => void
  const fetchGate = new Promise<void>((resolve) => {
    finishFetch = resolve
  })
  await context.route(`${API_BASE_URL}/v1/models`, async (route) => {
    await fetchGate
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: "gpt-4o-mini" }, { id: "new-model" }],
      }),
    })
  })
  await selector.click()
  const refresh = contentHost.getByRole("button", {
    name: "Fetch models",
    exact: true,
  })
  const search = contentHost.getByPlaceholder("Search...")
  await search.click()
  const searchBox = await search.boundingBox()
  const actionBox = await refresh.boundingBox()
  expect(
    Math.abs(
      actionBox!.y +
        actionBox!.height / 2 -
        searchBox!.y -
        searchBox!.height / 2,
    ),
  ).toBeLessThanOrEqual(2)
  await expect(search).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(refresh).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(
    contentHost.getByRole("button", { name: "Fetching…", exact: true }),
  ).toBeDisabled()
  await expect(selector).toHaveAttribute("aria-expanded", "true")
  await expect(selector).toHaveAttribute("aria-busy", "true")
  finishFetch()
  await expect(
    contentHost.getByRole("option", { name: "new-model", exact: true }),
  ).toBeVisible()
  await expect(
    contentHost.locator('[data-slot="popover-content"]').getByRole("status"),
  ).toContainText("Fetched 2 models.")
  await expect(selector).toContainText("gpt-4o-mini")
  await page.screenshot({
    path: test.info().outputPath("model-select-actions.png"),
    animations: "disabled",
  })
  await contentHost
    .getByRole("option", { name: "new-model", exact: true })
    .click()
  await expect(selector).toContainText("new-model")
  await expect(selector).toHaveAttribute("aria-expanded", "false")
})

test("selects CLI simulation inside the page API check shadow portal", async ({
  context,
  page,
  extensionDir,
}) => {
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  const header = modal.getByTestId("verification-header")
  await expect(
    header.getByRole("heading", {
      name: "API Testing",
      exact: true,
    }),
  ).toBeVisible()
  await expect(header.getByRole("note")).toHaveCount(0)
  const help = header.getByRole("button", {
    name: "Test information",
    exact: true,
  })
  await expect(help).toHaveAttribute(
    "title",
    "Results apply only to the API, model and request configuration used in this test.",
  )
  await help.click()
  const helpPanel = contentHost.getByRole("dialog", {
    name: "Test information",
    exact: true,
  })
  await expect(helpPanel).toHaveText(
    "Results apply only to the API, model and request configuration used in this test.",
  )
  await expect(helpPanel).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await captureVisualViews({
    page,
    ready: helpPanel,
    id: "web-test-information",
    extensionDir,
  })
  await help.press("Escape")
  await expect(helpPanel).toHaveCount(0)
  await expect(header).toBeVisible()
  await expect(header.getByTestId("verification-config")).toHaveCount(0)
  const selector = modal.getByRole("combobox", {
    name: "Client simulation",
    exact: true,
  })
  await expect(selector).toContainText("Ordinary API")
  await selector.click()
  await contentHost
    .getByRole("option", { name: "Codex CLI", exact: true })
    .click()
  await expect(selector).toContainText("Codex CLI")
  await expect(
    modal.getByRole("combobox", { name: "API type", exact: true }),
  ).toContainText("OpenAI")
  await expect(
    modal.getByRole("combobox", { name: "Model ID", exact: true }),
  ).toContainText("gpt-4o-mini")
  const enhanced = modal.getByRole("switch", {
    name: "Enhanced CLI simulation",
    exact: true,
  })
  await expect(enhanced).toHaveCount(0)
  await modal
    .getByRole("button", { name: "Enhanced CLI simulation", exact: true })
    .click()
  await expect(enhanced).not.toBeChecked()
  await enhanced.click()
  await expect(enhanced).toBeChecked()
  await selector.scrollIntoViewIfNeeded()
  await modal.screenshot({
    path: test.info().outputPath("page-verification-header.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: selector,
    id: "page-client-simulation",
    extensionDir,
  })
  const modelsProbe = modal.getByTestId(getWebAiApiCheckProbeTestId("models"))
  await expect(modelsProbe.getByText("Pending", { exact: true })).toBeVisible()
  await modelsProbe
    .locator("[data-verification-summary]")
    .getByRole("button", { name: "Run", exact: true })
    .click()
  await expect(modelsProbe).toContainText("Fetched 1 model.")

  const listWidth = (await modelsProbe.boundingBox())!.width
  expect(listWidth).toBeLessThan(360)
  await modelsProbe
    .getByRole("button", { name: "Model list", exact: true })
    .click()
  await expect(
    modelsProbe.getByRole("region", { name: "Execution result", exact: true }),
  ).toBeVisible()
  await modal.getByRole("dialog").screenshot({
    path: test.info().outputPath("page-models-expanded-grid.png"),
    animations: "disabled",
  })
  expect((await modelsProbe.boundingBox())!.width).toBeCloseTo(listWidth, 0)
  const modelsSummary = modelsProbe.locator("[data-verification-summary]")
  const duration = modelsSummary.getByText(/^\d+(?:\.\d+)?(?:ms|s)$/)
  await expect(duration).toHaveCount(1)
  await expect(
    modelsSummary
      .locator('[data-slot="badge"]')
      .getByText(/^\d+(?:\.\d+)?(?:ms|s)$/),
  ).toHaveCount(1)
  await modelsProbe.screenshot({
    path: test.info().outputPath("page-models-result.png"),
    animations: "disabled",
  })

  await context.route(`${API_BASE_URL}/v1/chat/completions`, (route) => {
    const request = route.request().postDataJSON()
    const completion = {
      id: "chatcmpl-ui-fixture",
      created: 0,
      model: "gpt-4o-mini",
    }
    return request.stream
      ? route.fulfill({
          contentType: "text/event-stream",
          body:
            [
              {
                ...completion,
                object: "chat.completion.chunk",
                choices: [
                  {
                    index: 0,
                    delta: { role: "assistant", content: "OK" },
                    finish_reason: null,
                  },
                ],
              },
              {
                ...completion,
                object: "chat.completion.chunk",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              },
            ]
              .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
              .join("") + "data: [DONE]\n\n",
        })
      : route.fulfill({
          json: {
            ...completion,
            object: "chat.completion",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "OK" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
          },
        })
  })
  await selector.click()
  await contentHost
    .getByRole("option", { name: "Ordinary API", exact: true })
    .click()
  const apiType = modal.getByRole("combobox", { name: "API type", exact: true })
  await apiType.click()
  await contentHost
    .getByRole("option", { name: "OpenAI-compatible", exact: true })
    .click()
  const textProbe = modal.getByTestId(
    getWebAiApiCheckProbeTestId("text-generation"),
  )
  await textProbe
    .getByRole("button", { name: "Text generation", exact: true })
    .click()
  for (const mode of ["Streaming", "Non-streaming"]) {
    await modal
      .getByRole("combobox", { name: "Test mode", exact: true })
      .click()
    await contentHost.getByRole("option", { name: mode, exact: true }).click()
    await textProbe
      .locator("[data-verification-summary]")
      .getByRole("button", { name: /^(Run|Retry)$/ })
      .click()
    const badge = textProbe
      .locator("[data-verification-summary]")
      .locator('[data-slot="badge"]')
      .filter({ hasText: mode })
    await expect(badge).toContainText("Pass")
    await expect(badge.getByText(/^\d+(?:\.\d+)?(?:ms|s)$/)).toHaveCount(1)
    await expect(
      textProbe.getByRole("heading", {
        name: "Execution result",
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      textProbe.getByRole("region", {
        name: "Execution result",
        exact: true,
      }),
    ).toBeVisible()
    await textProbe.screenshot({
      path: test.info().outputPath(`page-${mode.toLowerCase()}-result.png`),
      animations: "disabled",
    })
  }
  await apiType.click()
  await contentHost
    .getByRole("option", { name: "Anthropic", exact: true })
    .click()
  await expect(apiType).toContainText("Anthropic")
  const modelPicker = modal.getByRole("combobox", {
    name: "Model ID",
    exact: true,
  })
  await modelPicker.click()
  await contentHost
    .getByPlaceholder("Search...", { exact: true })
    .fill("claude-ui-fixture")
  await contentHost
    .getByRole("option", { name: 'Use "claude-ui-fixture"', exact: true })
    .click()
  await expect(modelPicker).toContainText("claude-ui-fixture")
  const searchProbe = modal.getByTestId(
    getWebAiApiCheckProbeTestId("web-search"),
  )
  await searchProbe
    .locator("[data-verification-summary]")
    .getByRole("button", { name: "Run", exact: true })
    .click()
  await expect(
    searchProbe
      .locator("[data-verification-summary]")
      .getByText("Unsupported", { exact: true }),
  ).toBeVisible()
  await searchProbe.screenshot({
    path: test.info().outputPath("page-unsupported-result.png"),
    animations: "disabled",
  })
})

for (const includeLink of [true, false]) {
  test(`reviews a decoded web key ${includeLink ? "with a selected API link" : "without a URL"}`, async ({
    context,
    page,
  }, testInfo) => {
    const serviceWorker = await getServiceWorker(context)
    await seedUserPreferences(serviceWorker, {
      language: "en",
      webAiApiCheck: {
        enabled: true,
        autoDetect: {
          enabled: true,
          enhanced: { enabled: true },
          urlWhitelist: {
            patterns: ["^https://api-console\\.example\\.test/console"],
          },
        },
      },
    })
    const requests: string[] = []
    context.on("request", (request) => requests.push(request.url()))
    await page.goto(TEST_PAGE_URL)
    const selectionPoints = await page.locator("#copy-credentials").evaluate(
      (target, { includeLink, apiKey, baseUrl }) => {
        const post = document.createElement("article")
        post.id = "credential-post"
        post.innerHTML = `${includeLink ? `<p>API URL：<br><a href="${baseUrl}">AI API Gateway</a></p>` : ""}<p>API KEY(base64加密)： <span>${btoa(apiKey)}</span></p>`
        target.replaceWith(post)
        const firstText = post.querySelector("p")!.firstChild!
        const lastText = post.querySelector("span")!.firstChild!
        const startRange = document.createRange()
        startRange.setStart(firstText, 0)
        startRange.setEnd(firstText, 1)
        const endRange = document.createRange()
        endRange.selectNodeContents(lastText)
        const start = startRange.getBoundingClientRect()
        const end = endRange.getBoundingClientRect()
        return {
          start: { x: start.left, y: start.top + start.height / 2 },
          end: { x: end.right + 1, y: end.top + end.height / 2 },
        }
      },
      { includeLink, apiKey: API_KEY, baseUrl: API_BASE_URL },
    )
    await page.mouse.move(selectionPoints.start.x, selectionPoints.start.y)
    await page.mouse.down()
    await page.mouse.move(selectionPoints.end.x, selectionPoints.end.y, {
      steps: 12,
    })
    await page.mouse.up()
    expect(
      await page.evaluate(() => window.getSelection()?.toString()),
    ).toContain(Buffer.from(API_KEY).toString("base64"))
    const host = page.locator("all-api-hub-redemption-toast")
    if (!includeLink) {
      await expect(
        host.getByText("API Key Detected", { exact: true }),
      ).toBeVisible()
      await expect(
        host.getByText(
          "A likely API key was decoded, but no API URL was found. Open the test panel to add the URL before testing?",
        ),
      ).toBeVisible()
      await expect(host).not.toContainText(API_KEY)
      await host
        .locator("section")
        .screenshot({ path: testInfo.outputPath("key-only-toast.png") })
    }
    await host.getByRole("button", { name: "Open", exact: true }).click()
    const modal = host.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
    await expect(modal).toBeVisible()
    await expect(
      modal.getByRole("textbox", { name: /^API key$/i }),
    ).toHaveValue(API_KEY)
    await expect(
      modal.getByRole("textbox", { name: "Base URL", exact: true }),
    ).toHaveValue(includeLink ? API_BASE_URL : "")
    if (!includeLink) {
      await expect(
        modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton),
      ).toBeDisabled()
      expect(requests.filter((url) => url.includes("/v1/models"))).toEqual([])
    }
  })
}

test("controls website participation from the webpage and autosaving settings", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, { language: "en" })
  await page.emulateMedia({ reducedMotion: "reduce" })
  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  const siteSwitch = modal.getByRole("switch", {
    name: "Auto-detect on this website",
  })
  await expect(siteSwitch).toHaveCount(0)
  await modal.getByRole("button", { name: "Settings", exact: true }).click()
  const siteSettings = contentHost.getByRole("region", {
    name: "Settings",
    exact: true,
  })
  await expect(
    siteSettings.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible()
  await expect(
    siteSettings.getByText("api-console.example.test", { exact: true }),
  ).toBeVisible()
  await siteSettings.screenshot({
    path: testInfo.outputPath("website-settings-panel.png"),
    animations: "disabled",
  })
  await expect(siteSwitch).toBeChecked()
  await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()
  await sendApiCheckContextMenuTrigger(serviceWorker, {
    pageUrl: TEST_PAGE_URL,
    selectionText: `base_url=${API_BASE_URL}\napi_key=${API_KEY}`,
  })
  await modal.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(siteSwitch).toBeChecked()
  await siteSwitch.click()
  await expect(siteSwitch).not.toBeChecked()
  const readScope = async () => {
    const raw = await getPlasmoStorageRawValue<string>(
      serviceWorker,
      STORAGE_KEYS.USER_PREFERENCES,
    )
    return JSON.parse(raw).webAiApiCheck.autoDetect.siteAccess
  }
  await expect
    .poll(async () => (await readScope()).exclude)
    .toEqual([TEST_PAGE_ORIGIN])
  await modal.screenshot({
    path: testInfo.outputPath("website-control-disabled.png"),
    animations: "disabled",
  })
  await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()
  await page.reload()
  await sendApiCheckContextMenuTrigger(serviceWorker, {
    pageUrl: TEST_PAGE_URL,
    selectionText: `base_url=${API_BASE_URL}\napi_key=${API_KEY}`,
  })
  await modal.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(siteSwitch).not.toBeChecked()
  await siteSwitch.click()
  await expect(siteSwitch).toBeChecked()
  await expect.poll(async () => (await readScope()).exclude).toEqual([])
  await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()
  // The notice also provides a one-click way to exclude this website.
  await page.reload()
  await page.locator("#copy-credentials").evaluate((target) => {
    const range = document.createRange()
    range.selectNodeContents(target)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    target.dispatchEvent(new ClipboardEvent("copy", { bubbles: true }))
  })
  await expect(
    contentHost.getByRole("button", {
      name: "Stop auto-detect on this website",
    }),
  ).toBeVisible()
  await contentHost.locator("section").screenshot({
    path: testInfo.outputPath("website-pause-toast.png"),
    animations: "disabled",
  })
  await contentHost
    .getByRole("button", { name: "Stop auto-detect on this website" })
    .click()
  await expect
    .poll(async () => (await readScope()).exclude)
    .toEqual([TEST_PAGE_ORIGIN])
  await expect(
    contentHost.getByRole("button", { name: "Open", exact: true }),
  ).toHaveCount(0)

  const settings = await context.newPage()
  await settings.setViewportSize({ width: 1920, height: 1080 })
  await settings.emulateMedia({ reducedMotion: "reduce" })
  installExtensionPageGuards(settings)
  await forceExtensionLanguage(settings, "en")
  await settings.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=webAiApiCheck#basic`,
  )
  await waitForExtensionRoot(settings)
  const section = settings.locator("#web-ai-api-check")
  await expect(
    section.getByText(TEST_PAGE_ORIGIN, { exact: true }),
  ).toBeVisible()
  await settings
    .getByRole("button", { name: "Add to blacklist", exact: true })
    .click()
  const editor = settings.getByRole("dialog", {
    name: "Add to blacklist",
    exact: true,
  })
  await editor
    .getByRole("textbox", { name: "Rule content", exact: true })
    .fill("*.example.org\nhttps://example.com/private")
  await editor.getByRole("button", { name: "Add", exact: true }).click()
  await expect(editor).toHaveCount(0)
  const readRules = async () => {
    const raw = await getPlasmoStorageRawValue<string>(
      serviceWorker,
      STORAGE_KEYS.USER_PREFERENCES,
    )
    return JSON.parse(raw).webAiApiCheck.autoDetect.siteRules
  }
  await expect
    .poll(async () => (await readRules()).blacklist)
    .toEqual([
      { syntax: "legacy", pattern: TEST_PAGE_ORIGIN },
      { syntax: "wildcard", pattern: "*://*.example.org/*" },
      { syntax: "wildcard", pattern: "https://example.com/private" },
    ])
  await settings.reload()
  await expect(
    section.getByText("*://*.example.org/*", { exact: true }),
  ).toBeVisible()
  await settings
    .getByRole("button", { name: "Add to whitelist", exact: true })
    .click()
  const whiteEditor = settings.getByRole("dialog", {
    name: "Add to whitelist",
    exact: true,
  })
  await whiteEditor
    .getByRole("textbox", { name: "Rule content", exact: true })
    .fill("linux.do")
  await whiteEditor.getByRole("button", { name: "Add", exact: true }).click()
  await expect
    .poll(async () => (await readRules()).whitelist)
    .toEqual([{ syntax: "wildcard", pattern: "*://linux.do/*" }])
  await settings.locator("#web-ai-api-check").screenshot({
    path: testInfo.outputPath("website-scope-settings.png"),
    animations: "disabled",
  })
})

test("turns selected web API credentials into a verified profile and model catalog source", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(serviceWorker)

  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  await saveCredentialProfileFromModal(contentHost, modal)

  const rawProfiles = await getPlasmoStorageRawValue<string>(
    serviceWorker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )
  const profileConfig = JSON.parse(rawProfiles) as {
    profiles: Array<{
      id: string
      name: string
      baseUrl: string
      apiKey: string
    }>
  }

  expect(profileConfig.profiles).toEqual([
    expect.objectContaining({
      name: "api-console.example.test",
      baseUrl: API_BASE_URL,
      apiKey: API_KEY,
    }),
  ])

  const profileId = atIndex(profileConfig.profiles, 0).id
  expect(profileId).toBeTruthy()

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await popupPage.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    popupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    popupPage.getByRole("heading", { name: "api-console.example.test" }),
  ).toBeVisible()

  await popupPage.getByRole("button", { name: "Test API" }).click()
  const verificationDialog = popupPage
    .getByRole("heading", { name: "API Testing" })
    .locator("xpath=ancestor::*[.//button[normalize-space()='Close']][1]")
  const modelsProbe = popupPage.getByTestId(
    getApiCredentialProfileVerifyProbeTestId("models"),
  )
  await expect(
    popupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
  ).toBeVisible()
  await modelsProbe
    .locator("[data-verification-summary]")
    .getByRole("button", { name: "Run" })
    .click()
  await expect(modelsProbe).toContainText("Pass")
  await expect(popupPage.getByTestId("verification-active-test")).toContainText(
    "Fetched 1 model.",
  )
  await verificationDialog.getByText("Close", { exact: true }).click()
  await expect(verificationDialog).toHaveCount(0)

  const modelsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: { profileId },
  })

  await popupPage
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const modelsPage = await modelsPagePromise
  installExtensionPageGuards(modelsPage)
  await waitForExtensionRoot(modelsPage)

  const targetUrl = new URL(modelsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("profileId")).toBe(profileId)

  await expect(
    modelsPage.getByRole("heading", { name: "Model List" }),
  ).toBeVisible()
  await expect(modelsPage.getByText("gpt-4o-mini")).toBeVisible()
  await expect(
    modelsPage
      .getByText("Credential: api-console.example.test", { exact: false })
      .first(),
  ).toBeVisible()
})

test("opens the API check modal from the background context-menu message path", async ({
  context,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    language: "en",
    webAiApiCheck: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      autoDetect: {
        enabled: false,
        urlWhitelist: {
          patterns: [],
        },
      },
    },
  })

  await page.goto(TEST_PAGE_URL)

  const selectedCredentialText = `base_url=${API_BASE_URL}\napi_key=${API_KEY}`
  await sendApiCheckContextMenuTrigger(serviceWorker, {
    pageUrl: TEST_PAGE_URL,
    selectionText: selectedCredentialText,
  })

  const contentHost = page.locator("all-api-hub-redemption-toast")
  const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(modal.getByRole("textbox", { name: "Base URL" })).toHaveValue(
    API_BASE_URL,
  )

  await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()
  await expect(modal).toBeHidden()
  await sendApiCheckContextMenuTrigger(serviceWorker, {
    pageUrl: TEST_PAGE_URL,
    selectionText: "",
  })
  await expect(modal).toBeVisible()
  // Existing URL history may prefill the address, but never the previous key.
  await expect(modal.getByRole("textbox", { name: "Base URL" })).toHaveValue(
    API_BASE_URL,
  )
  await expect(modal.getByLabel("API key", { exact: true })).toHaveValue("")
})

test("closes the API check modal with detected credentials in one click", async ({
  context,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(serviceWorker)

  const { modal } = await openApiCheckModalFromCopiedCredentials(page)
  await expect(modal.getByRole("textbox", { name: "API key" })).toHaveValue(
    API_KEY,
  )

  await modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.closeButton).click()

  await expect(modal).toHaveCount(0)
})

test("reads copied web API credentials from the clipboard after clicking a copy-like control", async ({
  context,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(serviceWorker)
  await installClipboardReadPermissionBridge(serviceWorker)

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: TEST_PAGE_ORIGIN,
  })

  const { modal } = await openApiCheckModalFromClipboardRead(page)
  await expect(modal.getByRole("textbox", { name: "API key" })).toHaveValue(
    API_KEY,
  )
})

test("opens API credential profiles from the content save success toast", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(serviceWorker)

  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  await saveCredentialProfileFromModal(contentHost, modal)

  const profilesPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  })

  await contentHost
    .getByTestId(WEB_AI_API_CHECK_TEST_IDS.openApiProfilesToastButton)
    .click()

  const profilesPage = await profilesPagePromise
  installExtensionPageGuards(profilesPage)
  await waitForExtensionRoot(profilesPage)

  const targetUrl = new URL(profilesPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`)

  await expect(
    profilesPage.getByRole("heading", { name: "API credential library" }),
  ).toBeVisible()
  await expect(
    profilesPage.getByRole("heading", { name: "api-console.example.test" }),
  ).toBeVisible()
})

for (const state of [
  "unrequested",
  "loading",
  "refresh-loading",
  "refresh-failure",
  "retry-success",
  "success",
  "empty",
  "failure",
  "generic-failure",
  "long-failure",
  "no-match",
  "custom-value",
] as const) {
  test(`model selector comparison: ${state}`, async ({ context, page }) => {
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    let requests = 0
    let hold = state === "loading" || state === "unrequested"
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await context.route(`${API_BASE_URL}/v1/models`, async (route) => {
      requests += 1
      if (hold) await gate
      const failed =
        ["failure", "generic-failure", "long-failure"].includes(state) ||
        (state === "refresh-failure" && requests > 1) ||
        (state === "retry-success" && requests === 1)
      const message =
        state === "long-failure"
          ? "The model catalog cannot be retrieved. Check the server configuration and retry. ".repeat(
              5,
            )
          : "Access denied"
      await route.fulfill({
        status: failed ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          failed
            ? state === "generic-failure"
              ? {}
              : { error: { message } }
            : {
                data:
                  state === "empty"
                    ? []
                    : [{ id: "gpt-4o-mini" }, { id: "other-model" }],
              },
        ),
      })
    })
    const { contentHost, modal } =
      await openApiCheckModalFromCopiedCredentials(page)
    const selector = modal.getByRole("combobox", {
      name: "Model ID",
      exact: true,
    })
    await expect.poll(() => requests).toBeGreaterThan(0)
    if (state === "unrequested") await modal.getByPlaceholder("sk-...").fill("")
    else if (state === "loading")
      await expect(selector).toHaveAttribute("aria-busy", "true")
    else await expect(selector).not.toHaveAttribute("aria-busy", "true")
    await selector.click()
    const dropdown = contentHost.locator('[data-slot="popover-content"]')
    const refresh = dropdown.getByRole("button", {
      name: state === "loading" ? "Fetching…" : "Fetch models",
      exact: true,
    })
    if (state === "refresh-loading") {
      hold = true
      await refresh.click()
      await expect.poll(() => requests).toBe(2)
      await expect(selector).toHaveAttribute("aria-busy", "true")
      await expect(selector).toContainText("gpt-4o-mini")
    }
    if (state === "refresh-failure" || state === "retry-success") {
      await expect(refresh).toBeEnabled()
      await refresh.click()
      await expect.poll(() => requests).toBe(2)
      await expect(refresh).toBeEnabled()
      await expect(selector).toContainText("gpt-4o-mini")
      await expect(
        dropdown.getByRole("option", { name: "other-model", exact: true }),
      ).toBeVisible()
      if (state === "retry-success") {
        await expect(
          dropdown.getByText("Access denied", { exact: true }),
        ).toHaveCount(0)
        await refresh.click()
        await expect.poll(() => requests).toBe(3)
        await expect(refresh).toBeEnabled()
        await expect(selector).toContainText("gpt-4o-mini")
      } else {
        await expect(
          dropdown.getByText("Access denied", { exact: true }),
        ).toBeVisible()
      }
    }
    if (["failure", "generic-failure", "long-failure"].includes(state)) {
      // Assert the original search-row control remains available after failure.
      await expect(refresh).toBeEnabled()
      await refresh.click()
      await expect.poll(() => requests).toBe(2)
      await expect(refresh).toBeEnabled()
    }
    if (state === "no-match" || state === "custom-value")
      await dropdown.getByPlaceholder("Search...").fill("manual-unlisted-model")
    if (state === "no-match")
      await expect(
        dropdown.getByText("No results found", { exact: true }).first(),
      ).toBeVisible()
    if (state === "custom-value") {
      await dropdown
        .getByRole("option", {
          name: 'Use "manual-unlisted-model"',
          exact: true,
        })
        .click()
      await expect(selector).toContainText("manual-unlisted-model")
      await selector.click()
    }
    await modal.screenshot({
      path: test.info().outputPath(`${state}__expanded.png`),
      animations: "disabled",
    })
    await dropdown.screenshot({
      path: test.info().outputPath(`${state}__dropdown.png`),
      animations: "disabled",
    })
    if (state === "long-failure") {
      const details = dropdown.locator("details")
      await expect(details).toHaveCount(1)
      await details.locator("summary").click()
      await dropdown.screenshot({
        path: test.info().outputPath(`${state}__details.png`),
        animations: "disabled",
      })
    }
    await dropdown.getByPlaceholder("Search...").press("Escape")
    await expect(dropdown).not.toBeVisible()
    await modal.screenshot({
      path: test.info().outputPath(`${state}__closed.png`),
      animations: "disabled",
    })
    release()
  })
}

test("runs webpage context and needle requests concurrently with independent cancellation", async ({
  context,
  page,
}) => {
  const requests: string[] = []
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    if (request.method === "GET") {
      response.setHeader("Content-Type", "application/json")
      response.end(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }))
      return
    }
    let input = ""
    for await (const chunk of request) input += chunk.toString()
    requests.push(input)
    // Keep both provider requests pending until their own stop actions abort them.
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    const { modal, contentHost } =
      await openApiCheckModalFromCopiedCredentials(page)
    await modal
      .getByRole("textbox", { name: "Base URL", exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    await modal
      .getByRole("combobox", { name: "Test mode", exact: true })
      .click()
    await contentHost
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    await modal.getByRole("combobox", { name: "Model ID", exact: true }).click()
    await contentHost
      .getByRole("option", { name: "gpt-4o-mini", exact: true })
      .click()
    const capacity = modal.getByRole("region", {
      name: "Context capacity test",
    })
    const needle = modal.getByRole("region", { name: "Needle in a haystack" })
    await capacity
      .getByRole("button", { name: "Context capacity test", exact: true })
      .click()
    await capacity.getByRole("button", { name: "Run context probe" }).click()
    await expect.poll(() => requests.length).toBe(1)
    await needle
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    const runNeedle = needle.getByRole("button", { name: "Run needle test" })
    await runNeedle.waitFor({ state: "visible" })
    await needle.screenshot({
      path: test.info().outputPath("needle-during-context.png"),
      animations: "disabled",
    })
    await modal.screenshot({
      path: test.info().outputPath("needle-workspace-during-context.png"),
      animations: "disabled",
    })
    await expect(runNeedle).toBeEnabled()
    await runNeedle.click()
    await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2)
    expect(requests[1]).not.toBe(requests[0])
    await expect(
      needle.getByRole("button", { name: "Stop", exact: true }),
    ).toBeEnabled()
    await capacity
      .getByRole("button", { name: "Context capacity test", exact: true })
      .click()
    await capacity.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(
      capacity.getByRole("button", { name: "Run context probe" }),
    ).toBeEnabled()
    await needle
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await expect(
      needle.getByRole("button", { name: "Stop", exact: true }),
    ).toBeEnabled()
    await needle.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(runNeedle).toBeEnabled()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("recovers an interrupted webpage context request after its worker stops without replaying it", async ({
  context,
  page,
  extensionId,
}) => {
  let requests = 0
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    if (request.method === "GET") {
      response.setHeader("Content-Type", "application/json")
      response.end(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }))
      return
    }
    for await (const _chunk of request) {
      /* consume the input, leave the provider response pending */
    }
    requests++
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const cdp = await context.newCDPSession(page)
  const versions: Array<{
    versionId: string
    scriptURL: string
    runningStatus: string
  }> = []
  cdp.on("ServiceWorker.workerVersionUpdated", ({ versions: updates }) => {
    for (const version of updates) {
      const index = versions.findIndex(
        (entry) => entry.versionId === version.versionId,
      )
      if (index >= 0) versions[index] = version
      else versions.push(version)
    }
  })
  await cdp.send("ServiceWorker.enable")
  try {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    const { modal, contentHost } =
      await openApiCheckModalFromCopiedCredentials(page)
    await modal
      .getByRole("textbox", { name: "Base URL", exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    await modal
      .getByRole("combobox", { name: "Test mode", exact: true })
      .click()
    await contentHost
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    await modal.getByRole("combobox", { name: "Model ID", exact: true }).click()
    await contentHost
      .getByRole("option", { name: "gpt-4o-mini", exact: true })
      .click()
    const panel = modal.getByRole("region", { name: "Context capacity test" })
    await panel
      .getByRole("button", { name: "Context capacity test", exact: true })
      .click()
    const checkpointWorker = await getServiceWorker(context)
    const abandoned = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `abandoned-${index}`,
        {
          inFlightTarget: 1024,
          result: {
            lowerBoundTokens: 0,
            reason: "test-limit",
            attempts: [],
            inputLimit: 1024,
            counter: { encoding: "o200k_base", estimated: true },
          },
        },
      ]),
    )
    await setPlasmoStorageValue(
      checkpointWorker,
      STORAGE_KEYS.CONTEXT_CHECKPOINTS,
      abandoned,
      { lock: STORAGE_LOCKS.WEB_AI_API_CHECK },
    )
    await panel.getByRole("button", { name: "Run context probe" }).click()
    await expect(panel.getByRole("alert")).toContainText(
      "charge status is unknown",
    )
    expect(requests).toBe(0)
    await expect(
      panel.getByRole("button", { name: "Run context probe" }),
    ).toBeDisabled()
    for (const width of [1280, 380]) {
      await page.setViewportSize({ width, height: 800 })
      await panel.scrollIntoViewIfNeeded()
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)
      await panel.screenshot({
        path: test.info().outputPath(`web-context-discard-${width}.png`),
        animations: "disabled",
      })
    }
    await panel
      .getByRole("button", { name: "Discard interrupted tests" })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run context probe" }),
    ).toBeEnabled()
    await expect(panel.getByRole("alert")).toHaveCount(0)
    await page.setViewportSize({ width: 1280, height: 720 })
    await panel.getByRole("button", { name: "Run context probe" }).click()
    await expect.poll(() => requests).toBe(1)
    const worker = await getServiceWorker(context)
    const stored = await getPlasmoStorageRawValue(
      worker,
      STORAGE_KEYS.CONTEXT_CHECKPOINTS,
    )
    expect(JSON.stringify(stored)).not.toContain(API_KEY)
    expect(JSON.stringify(stored)).toContain("inFlightTarget")
    await expect
      .poll(() =>
        versions.some(
          (version) =>
            version.scriptURL.startsWith(
              `chrome-extension://${extensionId}/`,
            ) && version.runningStatus === "running",
        ),
      )
      .toBe(true)
    const version = versions.find(
      (entry) =>
        entry.scriptURL.startsWith(`chrome-extension://${extensionId}/`) &&
        entry.runningStatus === "running",
    )!
    await cdp.send("ServiceWorker.stopWorker", { versionId: version.versionId })
    await expect(
      panel.getByRole("status", { name: "Context capacity result" }),
    ).toContainText("charge status is unknown", { timeout: 30000 })
    expect(requests).toBe(1)
    await panel.screenshot({
      path: test.info().outputPath("web-context-worker-interrupted.png"),
      animations: "disabled",
    })
    await page.setViewportSize({ width: 380, height: 800 })
    await panel.scrollIntoViewIfNeeded()
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await panel.screenshot({
      path: test.info().outputPath("web-context-worker-interrupted-narrow.png"),
      animations: "disabled",
    })
  } finally {
    await cdp.detach()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("recovers an interrupted webpage needle request after its worker stops without replaying it", async ({
  context,
  page,
  extensionId,
}) => {
  let requests = 0
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    if (request.method === "GET") {
      response.setHeader("Content-Type", "application/json")
      response.end(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }))
      return
    }
    for await (const _chunk of request) {
      /* consume the input, leave the provider response pending */
    }
    requests++
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const cdp = await context.newCDPSession(page)
  const versions: Array<{
    versionId: string
    scriptURL: string
    runningStatus: string
  }> = []
  cdp.on("ServiceWorker.workerVersionUpdated", ({ versions: updates }) => {
    for (const version of updates) {
      const index = versions.findIndex(
        (entry) => entry.versionId === version.versionId,
      )
      if (index >= 0) versions[index] = version
      else versions.push(version)
    }
  })
  await cdp.send("ServiceWorker.enable")
  try {
    await stubLlmMetadataIndex(context)
    await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
    await page.emulateMedia({ reducedMotion: "reduce" })
    const { modal, contentHost } =
      await openApiCheckModalFromCopiedCredentials(page)
    await modal
      .getByRole("textbox", { name: "Base URL", exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    await modal
      .getByRole("combobox", { name: "Test mode", exact: true })
      .click()
    await contentHost
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    await modal.getByRole("combobox", { name: "Model ID", exact: true }).click()
    await contentHost
      .getByRole("option", { name: "gpt-4o-mini", exact: true })
      .click()
    const panel = modal.getByRole("region", { name: "Needle in a haystack" })
    await panel
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await panel.getByRole("button", { name: "Run needle test" }).click()
    await expect.poll(() => requests).toBe(1)
    const worker = await getServiceWorker(context)
    const stored = await getPlasmoStorageRawValue(
      worker,
      STORAGE_KEYS.NEEDLE_CHECKPOINTS,
    )
    expect(JSON.stringify(stored)).not.toContain(API_KEY)
    expect(JSON.stringify(stored)).toContain("inFlight")
    await expect
      .poll(() =>
        versions.some(
          (version) =>
            version.scriptURL.startsWith(
              `chrome-extension://${extensionId}/`,
            ) && version.runningStatus === "running",
        ),
      )
      .toBe(true)
    const version = versions.find(
      (entry) =>
        entry.scriptURL.startsWith(`chrome-extension://${extensionId}/`) &&
        entry.runningStatus === "running",
    )!
    await cdp.send("ServiceWorker.stopWorker", { versionId: version.versionId })
    await expect(panel).toContainText("Interrupted; outcome unknown", {
      timeout: 30000,
    })
    expect(requests).toBe(1)
    await panel.screenshot({
      path: test.info().outputPath("web-needle-worker-interrupted.png"),
      animations: "disabled",
    })
    await page.setViewportSize({ width: 380, height: 800 })
    await panel.scrollIntoViewIfNeeded()
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await panel.screenshot({
      path: test.info().outputPath("web-needle-worker-interrupted-narrow.png"),
      animations: "disabled",
    })
  } finally {
    await cdp.detach()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
