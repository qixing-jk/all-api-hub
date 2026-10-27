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
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
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

test("keeps page verification actions visible while scrolling at desktop and narrow widths", async ({
  context,
  page,
}) => {
  await seedAutoDetectApiCheckPreferences(await getServiceWorker(context))
  await page.emulateMedia({ reducedMotion: "reduce" })
  const { modal } = await openApiCheckModalFromCopiedCredentials(page)
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
      expect(Math.abs(textProbe!.y - models!.y)).toBeLessThanOrEqual(2)
      expect(Math.abs(textProbe!.height - models!.height)).toBeLessThanOrEqual(
        2,
      )
      expect(textProbe!.x).toBeGreaterThan(models!.x + models!.width)
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
      expect(textProbe!.y).toBeGreaterThan(models!.y + models!.height)
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
    expect(drawingBounds!.width).toBeGreaterThanOrEqual(config!.width - 2)
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
  await context.route(`${API_BASE_URL}/v1/models`, async (route) => {
    fetched = true
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
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
      name: "AI API Functionality Availability Test",
      exact: true,
    }),
  ).toBeVisible()
  await expect(header.getByRole("note")).toContainText(
    "Tests apply to the current API",
  )
  await expect(header.getByTestId("verification-config")).toHaveCount(0)
  const selector = modal.getByRole("combobox", {
    name: "Client simulation",
    exact: true,
  })
  await expect(selector).toContainText("None (ordinary request)")
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
  await modelsProbe.getByRole("button", { name: "Test", exact: true }).click()
  await expect(modelsProbe).toContainText("Fetched 1 model.")
  const configBounds = await modal
    .getByTestId("verification-config")
    .boundingBox()
  await expect
    .poll(async () => (await modelsProbe.boundingBox())!.width)
    .toBeGreaterThanOrEqual(configBounds!.width - 2)
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
    .getByRole("option", { name: "None (ordinary request)", exact: true })
    .click()
  const apiType = modal.getByRole("combobox", { name: "API type", exact: true })
  await apiType.click()
  await contentHost
    .getByRole("option", { name: "OpenAI-compatible", exact: true })
    .click()
  const textProbe = modal.getByTestId(
    getWebAiApiCheckProbeTestId("text-generation"),
  )
  for (const mode of ["Streaming", "Non-streaming"]) {
    await modal
      .getByRole("combobox", { name: "Test mode", exact: true })
      .click()
    await contentHost.getByRole("option", { name: mode, exact: true }).click()
    await textProbe.getByRole("button", { name: /^(Test|Retry)$/ }).click()
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
  await searchProbe.getByRole("button", { name: "Test", exact: true }).click()
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

  await popupPage.getByRole("button", { name: "Verify API" }).click()
  const verificationDialog = popupPage
    .getByRole("heading", { name: "API Verification" })
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
