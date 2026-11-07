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
import { createDrawingServer } from "~~/e2e/utils/verificationDrawingServer"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const TEST_PAGE_URL = "https://api-console.example.test/console"
const TEST_PAGE_ORIGIN = "https://api-console.example.test"
const API_BASE_URL = "https://api-console.example.test/api"
const API_KEY = "sk-e2e-content-api-check-key"

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
  await expect(modal.getByRole("textbox", { name: "Base URL" })).toHaveValue(
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

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
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
      name: "Model context test",
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
      .getByRole("button", { name: "Model context test", exact: true })
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
    await expect(panel).toContainText("Model context:", { timeout: 30000 })
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
    await expect(panel).toContainText("Model context:")
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
    await panel.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(
      panel.getByRole("button", { name: "Run context probe" }),
    ).toBeEnabled()
    await expect(
      panel.getByRole("status", { name: "Context capacity result" }),
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
      name: "Model context test",
    })
    await restoredPanel
      .getByRole("button", { name: "Model context test", exact: true })
      .click()
    await expect(restoredPanel).toContainText("Non-streaming")
    await expect(
      restoredPanel.getByRole("status", { name: "Context capacity result" }),
    ).toContainText("Model context:")
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

test("keeps web probe rows compact when execution results expand", async ({
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
    await textProbe.getByRole("button", { name: "Run", exact: true }).click()
    await expect(
      textProbe.getByRole("button", { name: "Execution result", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await captureVisualViews({
      page,
      ready: textProbe,
      id: "web-expanded",
      extensionDir,
    })
    const after = (await textProbe.boundingBox())!
    expect(after.width).toBeCloseTo(before.width, 0)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect((await models.boundingBox())!.height).toBeCloseTo(modelsHeight, 0)
    await textProbe
      .getByRole("button", { name: "Execution result", exact: true })
      .click()
    expect((await textProbe.boundingBox())!.width).toBeCloseTo(before.width, 0)
    await modal.getByRole("combobox", { name: "Model ID", exact: true }).click()
    await contentHost
      .getByRole("option", { name: "gpt-quality", exact: true })
      .click()
    await textProbe
      .getByRole("button", { name: "Text generation prompt", exact: true })
      .click()
    await textProbe
      .getByRole("textbox", { name: "Text generation prompt", exact: true })
      .fill("LongPrompt".repeat(80))
    const worker = await getServiceWorker(context)
    await expect
      .poll(async () => {
        const preferences = await getStoredUserPreferences(worker)
        return (
          preferences.verificationProbePrompts as
            | Record<string, string>
            | undefined
        )?.["text-generation"]
      })
      .toBe("LongPrompt".repeat(80))
    await textProbe
      .getByRole("button", { name: "Text generation prompt", exact: true })
      .click()
    await textProbe
      .getByRole("button", { name: /^(Run|Retry)$/, exact: true })
      .click()
    await expect.poll(() => fixture.requests.length).toBe(1)
    expect(fixture.prompts[0]).toBe("LongPrompt".repeat(80))
    await expect(
      textProbe.locator('[data-slot="badge"]').filter({ hasText: "Fail" }),
    ).toBeVisible()
    await expect(textProbe).toContainText("Unexpected response text.")
    await textProbe.getByRole("button", { name: "Input", exact: true }).click()
    await expect(
      textProbe.getByRole("button", { name: "Execution result", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
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
        id: `web-expanded-${width}`,
        extensionDir,
      })
    }
    await textProbe
      .getByRole("button", { name: "Text generation prompt", exact: true })
      .click()
    await textProbe
      .getByRole("button", { name: "Reset this prompt", exact: true })
      .click()
    await expect
      .poll(async () => {
        const preferences = await getStoredUserPreferences(worker)
        return (
          preferences.verificationProbePrompts as
            | Record<string, string>
            | undefined
        )?.["text-generation"]
      })
      .toBeUndefined()
    await textProbe.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(
      textProbe.locator('[data-slot="badge"]').filter({ hasText: "Pass" }),
    ).toBeVisible()
    await expect(
      textProbe.getByRole("region", { name: "Execution result", exact: true }),
    ).toContainText("OK")
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("keeps page verification actions visible while scrolling at desktop and narrow widths", async ({
  context,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  const { modal } = await openApiCheckModalFromCopiedCredentials(page)
  const profileHelp = modal.getByRole("button", {
    name: "Client simulation",
    exact: true,
  })
  await profileHelp.click()
  await expect(modal.getByRole("tooltip")).toContainText("Selecting a client")
  await modal
    .getByRole("combobox", { name: "Client simulation", exact: true })
    .focus()
  const sourceEditor = modal.getByRole("textbox", {
    name: "Text to extract from",
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
    const models = await modal
      .getByTestId(getWebAiApiCheckProbeTestId("models"))
      .boundingBox()
    expect(config).not.toBeNull()
    expect(models).not.toBeNull()
    expect(models!.y).toBeGreaterThan(config!.y + config!.height)
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
        Math.max(...controls.map((box) => box!.y)) -
          Math.min(...controls.map((box) => box!.y)),
      ).toBeLessThanOrEqual(2)
    } else {
      expect(textProbe!.y).toBeGreaterThanOrEqual(models!.y + models!.height)
    }
    const source = modal.getByRole("textbox", {
      name: "Text to extract from",
      exact: true,
    })
    await expect(source).toBeInViewport()
    const sourceBounds = await source.boundingBox()
    expect(sourceBounds!.y + sourceBounds!.height).toBeLessThanOrEqual(
      config!.y,
    )
    const dialogBounds = await modal.getByRole("dialog").boundingBox()
    if (width >= 1280) expect(dialogBounds!.width).toBeGreaterThanOrEqual(1000)
    const drawing = modal.getByRole("button", {
      name: "Run drawing test",
      exact: true,
    })
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
  }
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
  await modelsProbe.getByRole("button", { name: "Run", exact: true }).click()
  await expect(modelsProbe).toContainText("Fetched 1 model.")
  const configBounds = await modal
    .getByTestId("verification-config")
    .boundingBox()
  await expect
    .poll(async () => (await modelsProbe.boundingBox())!.width)
    .toBeLessThan(configBounds!.width * 0.6)
  const resultToggle = modelsProbe.getByRole("button", {
    name: "Execution result",
    exact: true,
  })
  await resultToggle.click()
  await expect
    .poll(async () => (await modelsProbe.boundingBox())!.width)
    .toBeLessThan(configBounds!.width * 0.6)
  await modelsProbe.scrollIntoViewIfNeeded()
  await modal.getByRole("dialog").screenshot({
    path: test.info().outputPath("page-models-collapsed-grid.png"),
    animations: "disabled",
  })
  await resultToggle.click()
  await modelsProbe.scrollIntoViewIfNeeded()
  await modal.getByRole("dialog").screenshot({
    path: test.info().outputPath("page-models-expanded-grid.png"),
    animations: "disabled",
  })
  const duration = modelsProbe.getByText(/^\d+(?:\.\d+)?(?:ms|s)$/)
  await expect(duration).toHaveCount(1)
  await expect(
    modelsProbe
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
    await textProbe.getByRole("button", { name: /^(Run|Retry)$/ }).click()
    const badge = textProbe
      .locator('[data-slot="badge"]')
      .filter({ hasText: mode })
    await expect(badge).toContainText("Pass")
    await expect(badge.getByText(/^\d+(?:\.\d+)?(?:ms|s)$/)).toHaveCount(1)
    const disclosure = textProbe.getByRole("button", {
      name: "Execution result",
      exact: true,
    })
    await expect(disclosure).toHaveAttribute("aria-expanded", "true")
    await disclosure.click()
    await expect(disclosure).toHaveAttribute("aria-expanded", "false")
    await disclosure.click()
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
  await searchProbe.getByRole("button", { name: "Run", exact: true }).click()
  await expect(
    searchProbe.getByText("Unsupported", { exact: true }),
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
  await modelsProbe.getByRole("button", { name: "Run" }).click()
  await expect(modelsProbe).toContainText("Pass")
  await expect(modelsProbe).toContainText("Fetched 1 model.")
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
    const panel = modal.getByRole("region", { name: "Model context test" })
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
