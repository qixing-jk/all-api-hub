import { writeFile } from "node:fs/promises"
import type { AddressInfo } from "node:net"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  getApiCredentialProfileVerifyProbeTestId,
  API_CREDENTIAL_PROFILES_TEST_IDS as IDS,
} from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  getStoredUserPreferences,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { createDrawingServer } from "~~/e2e/utils/verificationDrawingServer"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { buildNewApiToken } from "~~/tests/test-utils/newApiToken"

test("verification tests run concurrently and cancel independently", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  let releaseDrawing!: () => void
  let releaseCapacity!: () => void
  const drawingGate = new Promise<void>((resolve) => {
    releaseDrawing = resolve
  })
  const capacityGate = new Promise<void>((resolve) => {
    releaseCapacity = resolve
  })
  const fixture = createDrawingServer({
    beforeRespond: async (request) => {
      const prompt = String(request.messages.at(-1)?.content)
      if (prompt.includes("pelican")) await drawingGate
      if (prompt.startsWith("Read the following reference text."))
        await capacityGate
    },
  })
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  try {
    const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "concurrent-verification",
        name: "Concurrent verification",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await expect(page.getByTestId(IDS.verifyButton)).toHaveAttribute(
      "aria-label",
      "Test API",
    )
    await page.getByTestId(IDS.verifyButton).click()
    await expect(
      page
        .getByTestId("verification-header")
        .getByRole("heading", { name: "API Testing", exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByTestId("verification-header")
        .getByText("Not tested", { exact: true }),
    ).toBeVisible()
    await expect(page.getByTestId("verification-header")).toContainText(
      "Credential: Concurrent verification",
    )
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await captureVisualViews({
      page,
      ready: page.getByTestId("verification-config"),
      id: "credential-wide",
      extensionDir,
    })
    await expect(
      page.getByRole("heading", { name: "What this test checks", exact: true }),
    ).toHaveCount(0)
    await expect
      .poll(() =>
        page
          .locator("[data-verification-detail]:not([hidden])")
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)
    await captureVisualViews({
      page,
      ready: page.getByTestId("verification-config"),
      id: "credential-tall",
      extensionDir,
      views: [{ id: "tall", width: 1280, height: 1280, theme: "light" }],
    })
    expect(
      (await page.locator('[data-slot="modal-panel"]').boundingBox())!.width,
    ).toBeGreaterThanOrEqual(1000)
    const modelsBox = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("models"))
      .boundingBox())!
    const textBox = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("text-generation"))
      .boundingBox())!
    const routine = page.getByRole("region", {
      name: "Routine tests",
      exact: true,
    })
    const onDemand = page.getByRole("region", {
      name: "On-demand tests",
      exact: true,
    })
    await expect(routine).toContainText("Model list")
    await expect(onDemand).toContainText("Drawing test")
    await expect(onDemand).toContainText("Model context test")
    await expect(
      page.getByRole("button", { name: "Run routine tests", exact: true }),
    ).toBeEnabled()
    const toolBox = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("tool-calling"))
      .boundingBox())!
    expect(textBox.x).toBeCloseTo(modelsBox.x, 0)
    expect(textBox.y).toBeGreaterThanOrEqual(modelsBox.y + modelsBox.height)
    expect(toolBox.x).toBeCloseTo(textBox.x, 0)
    expect(toolBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height)
    expect(modelsBox.width).toBeCloseTo(textBox.width, 0)
    const routineBox = (await routine.boundingBox())!
    const onDemandBox = (await onDemand.boundingBox())!
    expect(onDemandBox.x).toBeCloseTo(routineBox.x, 0)
    expect(onDemandBox.y).toBeGreaterThanOrEqual(
      routineBox.y + routineBox.height,
    )
    expect(textBox.height).toBeLessThan(100)
    const textProbe = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    const titleBox = (await textProbe
      .locator("[data-verification-summary]")
      .getByText("Text generation", { exact: true })
      .boundingBox())!
    const statusBox = (await textProbe
      .getByText("Pending", { exact: true })
      .boundingBox())!
    expect(statusBox.x).toBeGreaterThan(titleBox.x + titleBox.width)
    expect(
      Math.abs(
        statusBox.y + statusBox.height / 2 - titleBox.y - titleBox.height / 2,
      ),
    ).toBeLessThanOrEqual(2)
    await captureVisualViews({
      page,
      ready: routine,
      id: "credential-dark",
      extensionDir,
      views: [{ id: "dark", width: 1280, height: 900, theme: "dark" }],
    })
    const drawing = page.getByTestId("verification-tools-panel")
    for (const [name, steps] of [
      ["Model list", ["Fetch list", "Inspect models", "Suggest model"]],
      ["Text generation", ["Send prompt", "Receive text", "Check reply"]],
      [
        "Tool/function calling",
        ["Define tool", "Request call", "Check arguments"],
      ],
      ["Structured output", ["Set schema", "Generate JSON", "Validate format"]],
      ["Web search", ["Run search", "Check search evidence", "View citations"]],
      ["Drawing test", ["Describe scene", "Generate SVG", "Review drawing"]],
      [
        "Model context test",
        ["Build long input", "Run probes", "Record bounds"],
      ],
    ] as const) {
      await page.getByRole("button", { name, exact: true }).click()
      await captureVisualViews({
        page,
        ready: page.getByTestId("verification-config"),
        id: `all-intros-${name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        extensionDir,
      })
      const selectedDetail = page.locator(
        "[data-verification-detail]:not([hidden])",
      )
      const flow = selectedDetail.getByRole("list", { name: "Test steps" })
      await expect(flow).toBeVisible()
      await expect(flow.getByRole("listitem")).toHaveText([...steps])
      const cardHeights = await flow
        .getByRole("listitem")
        .evaluateAll((items) =>
          items.map((item) => item.getBoundingClientRect().height),
        )
      expect(
        Math.max(...cardHeights) - Math.min(...cardHeights),
      ).toBeLessThanOrEqual(1)
      const title = selectedDetail.getByRole("heading", { name, exact: true })
      await expect(title).toHaveCount(1)
      await expect(title).toHaveCSS("text-align", "center")
      const titleBox = (await title.boundingBox())!
      const processBox = (await flow.boundingBox())!
      expect(titleBox.y + titleBox.height).toBeLessThan(processBox.y)
      const detailBox = (await selectedDetail.boundingBox())!
      expect(
        Math.abs(
          titleBox.x + titleBox.width / 2 - detailBox.x - detailBox.width / 2,
        ),
      ).toBeLessThanOrEqual(1)
      await expect
        .poll(() =>
          page
            .locator("[data-verification-detail]:not([hidden])")
            .evaluate((element) => element.scrollHeight - element.clientHeight),
        )
        .toBeLessThanOrEqual(1)
    }
    const drawingBox = (await drawing.boundingBox())!
    const idleCapacityBox = (await onDemand
      .getByRole("region", { name: "Model context test", exact: true })
      .boundingBox())!
    expect(idleCapacityBox.x).toBeCloseTo(drawingBox.x, 0)
    expect(idleCapacityBox.y).toBeGreaterThanOrEqual(
      drawingBox.y + drawingBox.height,
    )
    await page
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await drawing
      .getByRole("button", { name: "Run drawing test", exact: true })
      .click()
    await expect.poll(() => fixture.requests.length).toBe(1)
    const text = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await text
      .getByText("Select Run to start this test.", { exact: true })
      .getByRole("button", { name: "Run", exact: true })
      .click()
    await expect(
      text.locator('[data-slot="badge"]').filter({ hasText: "Pass" }),
    ).toBeVisible()
    await text
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    const resultTitle = text
      .locator("[data-verification-detail]")
      .getByRole("heading", { name: "Text generation", exact: true })
    await expect(resultTitle).toHaveCount(1)
    await expect(resultTitle).toHaveCSS("text-align", "left")
    const capacity = page.getByRole("region", {
      name: "Model context test",
      exact: true,
    })
    await capacity
      .getByRole("button", { name: "Model context test", exact: true })
      .click()
    await capacity
      .getByRole("button", { name: "Run context probe", exact: true })
      .click()
    await expect.poll(() => fixture.requests.length).toBe(3)
    await capacity.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(capacity).toContainText("Probe stopped")
    await expect(
      drawing.getByRole("button", { name: "Stop", exact: true }),
    ).toBeEnabled()
    await drawing.scrollIntoViewIfNeeded()
    await page.getByRole("dialog").screenshot({
      path: test.info().outputPath("concurrent-verification.png"),
      animations: "disabled",
    })
    releaseDrawing()
    await expect(page.getByTestId("pelican-svg-preview")).toBeHidden()
    await expect(
      capacity.getByRole("button", { name: "Model context test", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await drawing
      .getByRole("button", { name: "Drawing test", exact: true })
      .click()
    await expect(page.getByTestId("pelican-svg-preview")).toBeVisible()
    await page.setViewportSize({ width: 1920, height: 1200 })
    await captureVisualViews({
      page,
      ready: drawing,
      id: "drawing-room-to-expand",
      extensionDir,
    })
    await expect
      .poll(() =>
        drawing
          .locator("[data-verification-detail]")
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)
    expect((await drawing.boundingBox())!.width).toBeCloseTo(
      drawingBox.width,
      0,
    )
    const drawingDetail = (await drawing
      .locator("[data-verification-detail]")
      .boundingBox())!
    expect(drawingDetail.x).toBeGreaterThan(drawingBox.x + drawingBox.width)
    expect(drawingDetail.width).toBeGreaterThan(drawingBox.width)
    await captureVisualViews({
      page,
      ready: drawing,
      id: "credential-drawing-result",
      extensionDir,
    })
    await drawing
      .getByRole("button", { name: "Execution result", exact: true })
      .click()
    expect((await drawing.boundingBox())!.width).toBeCloseTo(
      drawingBox.width,
      0,
    )
    await page.setViewportSize({ width: 1280, height: 650 })
    const list = page.locator("[data-verification-list]")
    const detail = drawing.locator("[data-verification-detail]")
    // Resizing may clip the workspace in the modal body. Bring the list into
    // that outer viewport before exercising its independent inner scrolling.
    await list.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        page
          .locator('[data-slot="modal-body"]')
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)
    const beforeScroll = (await detail.boundingBox())!
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0,
    )
    expect((await detail.boundingBox())!.y).toBeCloseTo(beforeScroll.y, 0)
    expect((await detail.boundingBox())!.height).toBeCloseTo(
      beforeScroll.height,
      0,
    )
    await expect(
      capacity.getByRole("button", { name: "Run context probe", exact: true }),
    ).toBeInViewport()
    await expect(page.getByTestId(IDS.verifyDialogCloseButton)).toBeEnabled()
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId("pelican-history-summary")).toContainText(
      "Drawing generated",
    )
    await expect(
      page.getByTestId(
        getApiCredentialProfileVerifyProbeTestId("text-generation"),
      ),
    ).toContainText("Pass")
    await page.setViewportSize({ width: 380, height: 800 })
    await expect(
      page
        .locator("[data-verification-detail]:not([hidden])")
        .getByRole("heading", { name: "Model list", exact: true }),
    ).toHaveCount(0)
    await expect(
      page
        .locator("[data-verification-detail]:not([hidden])")
        .getByRole("list", { name: "Test steps" }),
    ).toBeHidden()
    const narrowModels = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("models"))
      .boundingBox())!
    const narrowText = (await text.boundingBox())!
    expect(narrowText.y).toBeGreaterThanOrEqual(
      narrowModels.y + narrowModels.height,
    )
    expect(
      await page
        .locator('[data-slot="modal-body"]')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await captureVisualViews({
      page,
      ready: text,
      id: "credential-narrow-result",
      extensionDir,
    })
  } finally {
    releaseDrawing()
    releaseCapacity()
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

for (const mode of ["Streaming", "Non-streaming"] as const) {
  test(`agent drawing executes JavaScript in the extension (${mode})`, async ({
    context,
    extensionId,
    page,
  }) => {
    const fixture = createDrawingServer()
    await new Promise<void>((resolve) =>
      fixture.server.listen(0, "127.0.0.1", resolve),
    )
    try {
      const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "en")
      await seedApiCredentialProfiles(await getServiceWorker(context), [
        createStoredApiCredentialProfile({
          id: "agent-drawing",
          name: "Agent drawing target",
          apiType: "openai-compatible",
          baseUrl,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
      )
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      await page.getByRole("combobox", { name: "Test mode" }).click()
      await page.getByRole("option", { name: mode, exact: true }).click()
      await expect(page.getByTestId("verification-tools-panel")).toBeVisible()
      expect(fixture.requests).toHaveLength(0)
      await page
        .getByRole("button", { name: "Drawing test", exact: true })
        .click()
      const agentSwitch = page.getByRole("switch", { name: "Agent test mode" })
      await expect(agentSwitch).not.toBeChecked()
      await agentSwitch.click()
      await page
        .getByRole("button", { name: "Run drawing test", exact: true })
        .click()
      const result = page.getByTestId("agent-test-result")
      await expect(result).toContainText("An SVG file was generated", {
        timeout: 30_000,
      })
      const preview = page.getByTestId("pelican-svg-preview")
      await expect
        .poll(() =>
          preview.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true)
      await agentSwitch.scrollIntoViewIfNeeded()
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("agent-summary.png"),
        animations: "disabled",
      })
      await preview.scrollIntoViewIfNeeded()
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("drawing-result.png"),
        animations: "disabled",
      })
      expect(fixture.requests).toHaveLength(2)
      expect(
        fixture.requests.every(
          (request) => Boolean(request.stream) === (mode === "Streaming"),
        ),
      ).toBe(true)
      const feedback = String(
        fixture.requests[1]?.messages.find((message) => message.role === "tool")
          ?.content,
      )
      expect(feedback).toContain("workspace checked")
      expect(feedback).toContain('"network":"undefined"')
      await page
        .getByRole("button", { name: "Tool activity", exact: true })
        .click()
      await expect(result).toContainText("execute_js")
      await expect(result).toContainText("workspace checked")
      await page
        .getByRole("button", { name: "Workspace files", exact: true })
        .click()
      await expect(
        page.getByRole("button", { name: "pelican.svg", exact: true }),
      ).toBeVisible()
      await result.scrollIntoViewIfNeeded()
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("agent-tools.png"),
        animations: "disabled",
      })
      await page.reload()
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      await expect(page.getByTestId("pelican-history-summary")).toContainText(
        "Drawing generated",
      )
      await expect(page.getByTestId("pelican-history-summary")).toContainText(
        "Only the run summary was saved",
      )
      await expect(page.getByTestId("pelican-svg-preview")).toHaveCount(0)
      expect(fixture.requests).toHaveLength(2)
      await page
        .getByRole("button", { name: "Drawing test", exact: true })
        .click()
      await page.getByTestId("pelican-history-summary").scrollIntoViewIfNeeded()
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("drawing-history-restored.png"),
        animations: "disabled",
      })
      await page
        .getByRole("button", { name: "Clear history", exact: true })
        .click()
      await expect(page.getByTestId("pelican-history-summary")).toHaveCount(0)
      await page.reload()
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      await expect(page.getByTestId("pelican-history-summary")).toHaveCount(0)
    } finally {
      fixture.server.closeAllConnections()
      await new Promise<void>((resolve) =>
        fixture.server.close(() => resolve()),
      )
    }
  })
}

test("the shared verification tools run an on-demand drawing test", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  const fixture = createDrawingServer()
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`

  try {
    const worker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(worker, [
      createStoredApiCredentialProfile({
        id: "drawing",
        name: "Drawing target",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    // The drawing test reuses the dialog's model, so wait for discovery.
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )

    // Discovery is visible, while inference still requires an explicit action.
    const sourceLink = page
      .getByTestId("verification-header")
      .getByRole("link", { name: baseUrl, exact: true })
    await expect(sourceLink).toHaveAttribute("href", baseUrl)
    const sourcePagePromise = context.waitForEvent("page")
    await sourceLink.click()
    const sourcePage = await sourcePagePromise
    await sourcePage.waitForURL(`${baseUrl}/`)
    await sourcePage.close()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByTestId("verification-tools-panel")).toBeVisible()
    expect(fixture.requests).toHaveLength(0)
    const drawingPanel = page.getByTestId("verification-tools")
    const onDemandGroup = page.getByRole("region", {
      name: "On-demand tests",
      exact: true,
    })
    await expect(onDemandGroup.getByTestId("verification-tools")).toBeVisible()
    await drawingPanel
      .getByRole("button", { name: "Drawing test", exact: true })
      .click()
    const promptToggle = drawingPanel.getByRole("button", {
      name: "Drawing test prompt",
      exact: true,
    })
    await expect(promptToggle).toHaveAttribute("aria-expanded", "false")
    await expect(drawingPanel.getByRole("textbox")).toHaveCount(0)
    await expect(
      drawingPanel.getByRole("button", {
        name: "Run drawing test",
        exact: true,
      }),
    ).toHaveText("Run")
    await captureVisualViews({
      page,
      ready: drawingPanel,
      id: "drawing-settings-collapsed",
      extensionDir,
    })
    await drawingPanel.screenshot({
      path: test.info().outputPath("drawing-settings-collapsed-panel.png"),
      animations: "disabled",
    })
    await promptToggle.click()
    await expect(drawingPanel.getByRole("textbox")).toBeVisible()
    await captureVisualViews({
      page,
      ready: drawingPanel,
      id: "drawing-settings-expanded",
      extensionDir,
    })
    await drawingPanel.screenshot({
      path: test.info().outputPath("drawing-settings-expanded-panel.png"),
      animations: "disabled",
    })
    await promptToggle.click()
    await page
      .getByRole("button", { name: "Run drawing test", exact: true })
      .click()

    const preview = page.getByTestId("pelican-svg-preview")
    await expect(preview).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole("heading", { name: "On-demand tests", exact: true }),
    ).toBeVisible()
    await expect(
      drawingPanel.getByRole("button", {
        name: "Execution result",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "true")
    // A visible <img> can still be a failed load; require decoded pixels.
    await expect
      .poll(
        () =>
          preview.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        { timeout: 10_000 },
      )
      .toBe(true)

    expect(fixture.prompts).toHaveLength(1)
    expect(fixture.prompts[0]).toContain("pelican")

    // Capture through the dialog body so the bottom save bar is included even
    // when the panel itself is clipped by the dialog viewport.
    const panel = page.getByTestId("verification-tools")
    await panel.scrollIntoViewIfNeeded()
    await panel.screenshot({
      path: test.info().outputPath("verification-tools-full.png"),
    })
    await test.info().attach("verification-tools-full", {
      path: test.info().outputPath("verification-tools-full.png"),
      contentType: "image/png",
    })

    await page.getByTestId("verification-tools-panel").screenshot({
      path: test.info().outputPath("verification-tools.png"),
    })
    await test.info().attach("verification-tools", {
      path: test.info().outputPath("verification-tools.png"),
      contentType: "image/png",
    })

    const chinesePage = await context.newPage()
    await forceExtensionLanguage(chinesePage, "zh-CN")
    await chinesePage.setViewportSize({ width: 1000, height: 1000 })
    await chinesePage.emulateMedia({ reducedMotion: "reduce" })
    await chinesePage.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(chinesePage)
    await chinesePage.getByTestId(IDS.verifyButton).click()
    await expect(chinesePage.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await chinesePage.getByRole("dialog").screenshot({
      path: test.info().outputPath("verification-config-boundary-zh-CN.png"),
      animations: "disabled",
    })
    const chineseDrawing = chinesePage.getByTestId("verification-tools")
    await chineseDrawing
      .getByRole("button", { name: "绘图测试", exact: true })
      .click()
    await chineseDrawing
      .getByRole("button", { name: "绘图测试 提示词", exact: true })
      .click()
    await expect(chineseDrawing.getByRole("textbox")).toBeVisible()
    await chineseDrawing.screenshot({
      path: test.info().outputPath("drawing-settings-expanded-zh-CN.png"),
      animations: "disabled",
    })
    await chinesePage.getByRole("dialog").screenshot({
      path: test.info().outputPath("verification-dialog-zh-CN.png"),
      animations: "disabled",
    })
    await chinesePage.setViewportSize({ width: 480, height: 1140 })
    await chinesePage
      .getByRole("button", { name: "工具/函数调用", exact: true })
      .click()
    await chinesePage.locator('[data-slot="modal-body"]').evaluate((body) => {
      body.scrollTop = 0
    })
    await captureVisualViews({
      page: chinesePage,
      ready: chinesePage.getByRole("button", {
        name: "工具/函数调用",
        exact: true,
      }),
      id: "narrow-idle-detail",
      extensionDir,
    })
    await captureVisualViews({
      page: chinesePage,
      ready: chinesePage.getByRole("button", {
        name: "工具/函数调用",
        exact: true,
      }),
      id: "narrow-single-column",
      extensionDir,
      views: [{ id: "narrow", width: 479, height: 1135, theme: "light" }],
    })
    const idleProbe = chinesePage.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("tool-calling"),
    )
    const spacingPath = test.info().outputPath("narrow-spacing.json")
    await writeFile(
      spacingPath,
      JSON.stringify({
        row: await idleProbe
          .locator("[data-verification-summary]")
          .boundingBox(),
        detail: await idleProbe
          .locator("[data-verification-detail]")
          .boundingBox(),
        actions: await chinesePage
          .getByRole("dialog")
          .getByRole("group")
          .locator("..")
          .boundingBox(),
      }),
    )
    await test.info().attach("narrow-spacing", {
      path: spacingPath,
      contentType: "application/json",
    })
    await chinesePage.close()
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("an edited probe prompt persists and is used by the next run", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  const fixture = createDrawingServer()
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`

  try {
    await page.emulateMedia({ reducedMotion: "reduce" })
    const worker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(worker, [
      createStoredApiCredentialProfile({
        id: "prompt",
        name: "Prompt target",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )

    const textGenerationRow = page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("text-generation"))
      .getByTestId("verification-prompt-text-generation")
    await page.setViewportSize({ width: 1280, height: 850 })
    await textGenerationRow
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await expect(textGenerationRow).toBeVisible()
    const promptToggle = textGenerationRow.getByRole("button", {
      name: "Text generation prompt",
      exact: true,
    })
    await expect(promptToggle).toHaveAttribute("aria-expanded", "true")
    await expect(textGenerationRow.getByRole("textbox")).toHaveValue(
      "Reply with exactly: OK",
    )
    await captureVisualViews({
      page,
      ready: textGenerationRow,
      id: "prompt-auto-wide",
      extensionDir,
    })
    const introFlow = textGenerationRow.getByRole("list", {
      name: "Test steps",
    })
    const measureFlow = () =>
      introFlow.evaluate((element) => {
        const card = element.querySelector('[role="listitem"]')!
        const icon = card.querySelector("svg")!.getBoundingClientRect()
        const label = card.querySelector("span")!.getBoundingClientRect()
        const box = card.getBoundingClientRect()
        return {
          width: element.getBoundingClientRect().width,
          cardWidth: box.width,
          cardHeight: box.height,
          iconWidth: icon.width,
          iconHeight: icon.height,
          labelHeight: label.height,
          gap: label.y - icon.bottom,
        }
      })
    await expect.poll(async () => (await measureFlow()).width).toBeLessThan(460)
    const compactFlow = await measureFlow()
    const title = textGenerationRow.getByRole("heading", {
      name: "Text generation",
      exact: true,
    })
    await expect(title).toHaveCSS("font-size", "20px")
    const compactTitle = (await title.boundingBox())!
    await page.setViewportSize({ width: 1280, height: 1280 })
    await expect
      .poll(async () => (await measureFlow()).width)
      .toBeGreaterThanOrEqual(480)
    await captureVisualViews({
      page,
      ready: textGenerationRow,
      id: "prompt-roomy-introduction",
      extensionDir,
    })
    const scaledFlow = await measureFlow()
    for (const key of Object.keys(
      compactFlow,
    ) as (keyof typeof compactFlow)[]) {
      expect(scaledFlow[key]).toBeCloseTo(compactFlow[key] * 1.1, 0)
    }
    const introTitle = (await title.boundingBox())!
    expect(introTitle.height).toBeCloseTo(compactTitle.height * 1.1, 0)
    const hint = textGenerationRow.getByText("Select Run to start this test.", {
      exact: true,
    })
    const introHint = (await hint.boundingBox())!
    const hintButton = (await hint
      .getByRole("button", { name: "Run", exact: true })
      .boundingBox())!
    // The small button stays within a single line of surrounding prose.
    expect(introHint.height).toBeGreaterThanOrEqual(hintButton.height)
    expect(introHint.height).toBeLessThan(compactFlow.labelHeight * 1.1 * 2)
    expect(hintButton.y).toBeGreaterThanOrEqual(introHint.y)
    expect(hintButton.y + hintButton.height).toBeLessThanOrEqual(
      introHint.y + introHint.height + 1,
    )
    expect(
      await textGenerationRow
        .locator("[data-verification-detail]")
        .evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeLessThanOrEqual(1)
    await page.setViewportSize({ width: 420, height: 850 })
    await expect(promptToggle).toHaveAttribute("aria-expanded", "false")
    await page.setViewportSize({ width: 1280, height: 850 })
    await expect(promptToggle).toHaveAttribute("aria-expanded", "true")
    await promptToggle.click()
    await expect(promptToggle).toHaveAttribute("aria-expanded", "false")
    await expect(textGenerationRow.getByRole("textbox")).toHaveCount(0)
    for (const width of [1280, 660, 420]) {
      await page.setViewportSize({ width, height: 850 })
      await textGenerationRow.scrollIntoViewIfNeeded()
      await captureVisualViews({
        page,
        ready: textGenerationRow,
        id: `probe-prompt-collapsed-${width}`,
        extensionDir,
      })
      await expect.soft(promptToggle).toHaveText("Prompt")
      const summary = (await textGenerationRow
        .locator("[data-verification-summary]")
        .boundingBox())!
      const detail = (await textGenerationRow
        .locator("[data-verification-detail]")
        .boundingBox())!
      if (width >= 1280)
        expect(detail.x).toBeGreaterThan(summary.x + summary.width)
      else {
        expect(detail.y).toBeGreaterThanOrEqual(summary.y + summary.height)
        const introduction = (await textGenerationRow
          .getByText(
            "Send a prompt, check text generation and inspect the returned content.",
            { exact: true },
          )
          .boundingBox())!
        const prompt = (await promptToggle.boundingBox())!
        expect.soft(Math.abs(introduction.x - prompt.x)).toBeLessThanOrEqual(1)
        expect(introduction.y + introduction.height).toBeLessThanOrEqual(
          prompt.y,
        )
      }
    }
    await page.setViewportSize({ width: 1280, height: 850 })
    await promptToggle.click()
    await expect(
      textGenerationRow.getByRole("textbox", { name: /Text generation/ }),
    ).toHaveValue("Reply with exactly: OK")
    await textGenerationRow.screenshot({
      path: test.info().outputPath("probe-prompt-preview.png"),
      animations: "disabled",
    })
    await textGenerationRow
      .getByRole("textbox", { name: /Text generation/ })
      .fill("Reply with exactly: EDITED")

    const textbox = textGenerationRow.getByRole("textbox", {
      name: /Text generation/,
    })
    const shortHeight = (await textbox.boundingBox())!.height
    await textbox.fill(Array(8).fill("A line of prompt content").join("\n"))
    await expect
      .poll(async () => (await textbox.boundingBox())!.height)
      .toBeGreaterThan(shortHeight + 60)
    await page.setViewportSize({ width: 1920, height: 1200 })
    const dialog = page.getByRole("dialog")
    // Resizing schedules the workspace measurement on the next animation frame.
    // Capture the baseline only after the dialog uses the new height budget.
    await expect
      .poll(() =>
        dialog
          .locator('[data-slot="modal-panel"]')
          .evaluate((panel) =>
            Math.abs(
              panel.getBoundingClientRect().height -
                Number.parseFloat(getComputedStyle(panel).maxHeight),
            ),
          ),
      )
      .toBeLessThanOrEqual(2)
    await captureVisualViews({
      page,
      ready: textbox,
      id: "stable-prompt-short",
      extensionDir,
    })
    const shortDialog = (await dialog.boundingBox())!
    await textbox.fill(Array(20).fill("A line of prompt content").join("\n"))
    await expect
      .poll(async () => (await textbox.boundingBox())!.height)
      .toBeGreaterThan(192)
    await expect
      .poll(() =>
        textbox.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(1)
    const textDetail = textGenerationRow.locator("[data-verification-detail]")
    await expect
      .poll(() =>
        textDetail.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(1)
    await captureVisualViews({
      page,
      ready: textbox,
      id: "prompt-room-to-expand",
      extensionDir,
    })
    const expandedDialog = (await dialog.boundingBox())!
    expect(expandedDialog.height).toBeCloseTo(shortDialog.height, 0)
    expect(expandedDialog.y).toBeCloseTo(shortDialog.y, 0)
    await textbox.fill(Array(80).fill("A line of prompt content").join("\n"))
    await expect
      .poll(() =>
        textDetail.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      )
      .toBeGreaterThan(0)
    await expect
      .poll(() =>
        textbox.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(1)
    await expect(page.getByTestId(IDS.verifyDialogCloseButton)).toBeInViewport()
    expect((await dialog.boundingBox())!.height).toBeCloseTo(
      shortDialog.height,
      0,
    )
    expect((await dialog.boundingBox())!.y).toBeCloseTo(shortDialog.y, 0)
    await textbox.fill("Reply with exactly: EDITED")
    await expect
      .poll(async () => (await textbox.boundingBox())!.height)
      .toBe(shortHeight)
    const resetBounds = await textGenerationRow
      .getByRole("button", { name: "Reset this prompt", exact: true })
      .boundingBox()
    const inputBounds = await textbox.boundingBox()
    expect(Math.abs(resetBounds!.y - inputBounds!.y)).toBeLessThan(2)
    await textGenerationRow.scrollIntoViewIfNeeded()
    await page.getByRole("dialog").screenshot({
      path: test.info().outputPath("probe-prompt-editor.png"),
      animations: "disabled",
    })

    await page
      .getByRole("button", { name: "Drawing test", exact: true })
      .click()
    await expect(textbox).toBeHidden()
    expect((await dialog.boundingBox())!.height).toBeCloseTo(
      shortDialog.height,
      0,
    )
    await page
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await expect(textbox).toHaveValue("Reply with exactly: EDITED")
    await page.setViewportSize({ width: 420, height: 840 })
    await expect(textGenerationRow.getByRole("textbox")).toBeVisible()
    await expect(textbox).toHaveValue("Reply with exactly: EDITED")
    expect(
      await textGenerationRow.evaluate(
        (el) => el.scrollWidth <= el.clientWidth,
      ),
    ).toBe(true)
    await textGenerationRow.scrollIntoViewIfNeeded()
    await page.getByRole("dialog").screenshot({
      path: test.info().outputPath("probe-prompt-mobile.png"),
      animations: "disabled",
    })
    await page.setViewportSize({ width: 1280, height: 720 })

    await expect
      .poll(async () => {
        const preferences = await getStoredUserPreferences(worker)
        return (
          preferences.verificationProbePrompts as
            | Record<string, string>
            | undefined
        )?.["text-generation"]
      })
      .toBe("Reply with exactly: EDITED")

    // Reload so the assertion proves persistence, not in-memory state.
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await page
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await expect(
      page
        .getByTestId("verification-prompt-text-generation")
        .getByRole("button", { name: "Text generation prompt", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await expect(
      page
        .getByTestId("verification-prompt-text-generation")
        .getByRole("textbox", { name: /Text generation/ }),
    ).toHaveValue("Reply with exactly: EDITED")

    const probeCard = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await expect(probeCard).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 1280 })
    const inlineRun = probeCard
      .getByText("Select Run to start this test.", { exact: true })
      .getByRole("button", { name: "Run", exact: true })
    await expect(inlineRun).toBeVisible()
    const beforeRun = (await page.getByRole("dialog").boundingBox())!
    const requestCount = fixture.prompts.length
    await inlineRun.focus()
    await inlineRun.press("Enter")

    await expect.poll(() => fixture.prompts.length).toBe(requestCount + 1)
    expect(fixture.prompts.at(-1)).toBe("Reply with exactly: EDITED")
    await expect(inlineRun).toHaveCount(0)
    await expect(
      probeCard.getByRole("region", { name: "Execution result", exact: true }),
    ).toBeVisible()
    await expect(
      probeCard.getByRole("region", { name: "Execution result", exact: true }),
    ).toContainText("svg")
    await expect(
      probeCard.getByRole("button", {
        name: "Text generation prompt",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "false")
    await expect(
      probeCard.getByRole("button", { name: "Input", exact: true }),
    ).toHaveAttribute("aria-expanded", "false")
    await expect(
      probeCard.getByRole("button", { name: "Output", exact: true }),
    ).toHaveAttribute("aria-expanded", "false")
    expect((await page.getByRole("dialog").boundingBox())!.height).toBeCloseTo(
      beforeRun.height,
      0,
    )
    expect((await page.getByRole("dialog").boundingBox())!.y).toBeCloseTo(
      beforeRun.y,
      0,
    )
    await captureVisualViews({
      page,
      ready: probeCard,
      id: "prompt-auto-result",
      extensionDir,
    })
    await promptToggle.click()
    await probeCard.scrollIntoViewIfNeeded()
    await page.getByRole("dialog").screenshot({
      path: test.info().outputPath("probe-execution-result.png"),
      animations: "disabled",
    })
    await expect(
      probeCard.getByRole("textbox", { name: /Text generation/ }),
    ).toHaveValue("Reply with exactly: EDITED")
    await expect(
      probeCard.getByRole("region", { name: "Execution result", exact: true }),
    ).toBeVisible()
    await probeCard
      .getByRole("button", { name: "Execution result", exact: true })
      .click()
    await expect(
      probeCard.getByRole("region", { name: "Execution result", exact: true }),
    ).toHaveCount(0)
    expect((await dialog.boundingBox())!.height).toBeCloseTo(
      beforeRun.height,
      0,
    )
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await page
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    const restored = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await expect(
      restored.getByRole("button", { name: "Execution result", exact: true }),
    ).toHaveCount(0)
    await expect(restored).not.toContainText(
      "This test returned no additional content",
    )
    const header = page.getByTestId("verification-header")
    const titleBounds = await header.getByRole("heading").boundingBox()
    const historyBounds = await header.locator("time").boundingBox()
    expect(Math.abs(titleBounds!.y - historyBounds!.y)).toBeLessThan(32)
    await header.screenshot({
      path: test.info().outputPath("compact-header.png"),
      animations: "disabled",
    })
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("account verification configuration aligns fields without empty grid cells", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "zh-CN")
  await stubNewApiSiteRoutes(context, {
    models: ["gpt-oss-20b"],
    initialTokens: [
      {
        id: 1,
        user_id: 1,
        key: "synthetic-key",
        status: 1,
        name: "default group (auto)",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 1000,
        unlimited_quota: true,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        used_quota: 0,
        group: "default",
      },
    ],
  })
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({ site_name: "12" }),
  ])
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=e2e-account-1#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  const verifyButton = page
    .getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton)
    .first()
  await expect(verifyButton).toBeVisible()
  await expect(verifyButton).toHaveAttribute("aria-label", "测试 API")
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.verifyCliSupportButton).first(),
  ).toHaveAttribute("aria-label", "CLI 兼容性测试")
  let releaseKeys!: () => void
  const keysReady = new Promise<void>((resolve) => {
    releaseKeys = resolve
  })
  await context.route("**/api/token/**", async (route) => {
    await keysReady
    await route.fallback()
  })
  await verifyButton.click()
  const header = page.getByTestId("verification-header")
  await expect(header.getByText("账号：12", { exact: true })).toBeVisible()
  await expect(header.getByRole("note")).toHaveCount(0)
  const help = header.getByRole("button", { name: "测试说明", exact: true })
  await expect(help).toHaveAttribute(
    "title",
    "结果仅适用于本次测试的接口、模型和请求配置。",
  )
  await help.focus()
  await help.press("Enter")
  await expect(
    page.getByRole("dialog", { name: "测试说明", exact: true }),
  ).toHaveText("结果仅适用于本次测试的接口、模型和请求配置。")
  await help.press("Escape")
  await expect(help).toHaveAttribute("aria-expanded", "false")
  await expect(
    page.getByRole("dialog", { name: "测试说明", exact: true }),
  ).toHaveCount(0)
  await expect(header).toBeVisible()
  await expect(header.getByTestId("verification-config")).toHaveCount(0)
  const config = page.getByTestId("verification-config")
  await expect(config).toBeVisible()
  const key = config.getByRole("combobox", { name: "密钥", exact: true })
  const api = config.getByRole("combobox", { name: "接口类型", exact: true })
  const model = config.getByRole("textbox", { name: "模型", exact: true })
  const mode = config.getByRole("combobox", { name: "测试方式", exact: true })
  const profile = config.getByRole("combobox", {
    name: "客户端模拟",
    exact: true,
  })
  await expect(key).toHaveText("正在加载密钥...")
  await expect(key).toHaveAttribute("aria-busy", "true")
  await expect(key).toBeDisabled()
  await expect(page.getByText("正在加载密钥...", { exact: true })).toHaveCount(
    1,
  )
  await page.getByRole("dialog").screenshot({
    path: test.info().outputPath("account-key-loading.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: config,
    id: "account-key-loading",
    extensionDir,
  })
  releaseKeys()
  await expect(model).toHaveValue("gpt-oss-20b")
  await expect(key).toBeEnabled()
  await header.getByText("API 测试", { exact: true }).click()
  await page.getByRole("button", { name: "绘图测试", exact: true }).click()
  await captureVisualViews({
    page,
    ready: config,
    id: "account-wide",
    extensionDir,
  })
  expect(
    (await page.locator('[data-slot="modal-panel"]').boundingBox())!.width,
  ).toBeGreaterThanOrEqual(1000)
  const modelsBox = (await page
    .getByTestId("verify-probe-models")
    .boundingBox())!
  const textBox = (await page
    .getByTestId("verify-probe-text-generation")
    .boundingBox())!
  expect(textBox.x).toBeCloseTo(modelsBox.x, 0)
  expect(textBox.y).toBeGreaterThanOrEqual(modelsBox.y + modelsBox.height)
  expect(modelsBox.width).toBeCloseTo(textBox.width, 0)
  const desktop = await Promise.all(
    [key, api, model, mode, profile].map((field) => field.boundingBox()),
  )
  expect(
    Math.max(...desktop.map((box) => box!.y)) -
      Math.min(...desktop.map((box) => box!.y)),
  ).toBeLessThanOrEqual(2)
  expect(desktop[2]!.width).toBeGreaterThan(desktop[3]!.width)
  const modelsProbe = page.getByTestId("verify-probe-models")
  const titleBounds = await modelsProbe
    .locator("[data-verification-summary]")
    .getByText("模型列表", { exact: true })
    .boundingBox()
  const runBounds = await modelsProbe
    .locator("[data-verification-summary]")
    .getByRole("button", { name: "运行", exact: true })
    .boundingBox()
  expect(
    Math.abs(
      titleBounds!.y +
        titleBounds!.height / 2 -
        (runBounds!.y + runBounds!.height / 2),
    ),
  ).toBeLessThanOrEqual(2)
  await config.screenshot({
    path: test.info().outputPath("account-config-desktop.png"),
    animations: "disabled",
  })
  await page.locator('[data-slot="modal-panel"]').screenshot({
    path: test.info().outputPath("account-dialog-desktop.png"),
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1280, height: 1280 })
  await page.getByRole("button", { name: "文本生成", exact: true }).click()
  const inlineRun = page
    .getByText("点击 运行 开始本项测试。", { exact: true })
    .getByRole("button", { name: "运行", exact: true })
  await expect(inlineRun).toBeEnabled()
  await captureVisualViews({
    page,
    ready: inlineRun,
    id: "inline-run-chinese",
    extensionDir,
    views: [
      { id: "light", width: 1280, height: 1280, theme: "light" },
      { id: "dark", width: 1280, height: 1280, theme: "dark" },
    ],
  })
  await inlineRun.focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Shift+Tab")
  await expect(inlineRun).toBeFocused()
  expect(
    await inlineRun.evaluate((button) => button.matches(":focus-visible")),
  ).toBe(true)
  await captureVisualViews({
    page,
    ready: inlineRun,
    id: "inline-run-keyboard-focus",
    extensionDir,
  })
  const contextPanel = page.getByRole("region", {
    name: "模型上下文测试",
    exact: true,
  })
  const contextSelection = contextPanel.getByRole("button", {
    name: "模型上下文测试",
    exact: true,
  })
  const contextHelp = contextPanel.getByRole("button", {
    name: "模型上下文测试说明",
    exact: true,
  })
  const contextSummary = contextPanel.locator("[data-verification-summary]")
  const contextStatus = contextSummary.getByText("待运行", { exact: true })
  for (const [width, height] of [
    [1280, 1280],
    [660, 1280],
    [420, 1280],
    [1280, 480],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.getByRole("button", { name: "文本生成", exact: true }).click()
    await contextHelp.click()
    const contextTooltip = page.getByRole("tooltip")
    await expect(contextTooltip).toContainText("每批累计输入预算约 8M tokens")
    // Tooltip text can be mounted before its floating position is calculated.
    await expect
      .poll(async () => {
        const tooltip = await contextTooltip.boundingBox()
        const anchor = await contextHelp.boundingBox()
        if (!tooltip || !anchor) return false
        const gapAbove = anchor.y - tooltip.y - tooltip.height
        const gapBelow = tooltip.y - anchor.y - anchor.height
        const gapLeft = anchor.x - tooltip.x - tooltip.width
        const gapRight = tooltip.x - anchor.x - anchor.width
        const overlapsX =
          tooltip.x < anchor.x + anchor.width &&
          tooltip.x + tooltip.width > anchor.x
        const overlapsY =
          tooltip.y < anchor.y + anchor.height &&
          tooltip.y + tooltip.height > anchor.y
        return (
          (overlapsX &&
            ((gapAbove >= 0 && gapAbove <= 16) ||
              (gapBelow >= 0 && gapBelow <= 16))) ||
          (overlapsY &&
            ((gapLeft >= 0 && gapLeft <= 16) ||
              (gapRight >= 0 && gapRight <= 16)))
        )
      })
      .toBe(true)
    await expect
      .poll(() =>
        contextTooltip.evaluate((tooltip) => {
          const box = tooltip.getBoundingClientRect()
          const root = tooltip.getRootNode() as Document | ShadowRoot
          return (
            [
              [box.left + 6, box.top + 6],
              [box.right - 6, box.bottom - 6],
            ] as const
          ).every(([x, y]) => {
            const hit = root.elementFromPoint(x, y)
            return hit !== null && tooltip.contains(hit)
          })
        }),
      )
      .toBe(true)
    await expect(contextSelection).toHaveAttribute("aria-expanded", "false")
    await captureVisualViews({
      page,
      ready: contextHelp,
      id: `context-help-${width}-${height}`,
      extensionDir,
    })
    await expect
      .poll(() =>
        page
          .locator("[data-verification-list]")
          .evaluate((list) => list.scrollWidth - list.clientWidth),
      )
      .toBeLessThanOrEqual(1)
    const tooltipBox = (await contextTooltip.boundingBox())!
    expect(tooltipBox.x).toBeGreaterThanOrEqual(0)
    expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(width)
    expect(tooltipBox.y).toBeGreaterThanOrEqual(0)
    expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(height)
    const labelBox = (await contextSelection.boundingBox())!
    const helpBox = (await contextHelp.boundingBox())!
    const badgeBox = (await contextStatus.boundingBox())!
    expect(helpBox.x - labelBox.x - labelBox.width).toBeGreaterThanOrEqual(0)
    expect(helpBox.x - labelBox.x - labelBox.width).toBeLessThanOrEqual(10)
    expect(
      badgeBox.x >= helpBox.x + helpBox.width ||
        badgeBox.y >= helpBox.y + helpBox.height,
    ).toBe(true)
    await contextSelection.focus()
    // Keep the status click valid when the viewport moves the dialog after its
    // geometry checks, as can happen while responsive layout settles.
    await page.setViewportSize({ width, height: height - 48 })
    await expect(contextTooltip).toHaveCount(0)
    await contextSummary.scrollIntoViewIfNeeded()
    // Target the selection button's hit area over the status, so Playwright
    // checks that the button receives the click instead of accepting any
    // descendant of the summary (such as the adjacent help control).
    await contextSelection.click({
      position: await contextStatus.evaluate((badge) => {
        const summary = badge.closest("[data-verification-summary]")!
        const selection = summary.querySelector("button[aria-expanded]")!
        const selectionBox = selection.getBoundingClientRect()
        const statusBox = badge.getBoundingClientRect()
        return {
          x: statusBox.x + statusBox.width / 2 - selectionBox.x,
          y: statusBox.y + statusBox.height / 2 - selectionBox.y,
        }
      }),
    })
    await expect(contextSelection).toHaveAttribute("aria-expanded", "true")
  }
  await page.getByRole("button", { name: "绘图测试", exact: true }).click()
  await page.setViewportSize({ width: 420, height: 840 })
  await help.click()
  const helpPanel = page.getByRole("dialog", {
    name: "测试说明",
    exact: true,
  })
  await expect(helpPanel).toBeVisible()
  const helpBounds = (await helpPanel.boundingBox())!
  expect(helpBounds.x).toBeGreaterThanOrEqual(0)
  expect(helpBounds.x + helpBounds.width).toBeLessThanOrEqual(420)
  await captureVisualViews({
    page,
    ready: helpPanel,
    id: "account-narrow-help",
    extensionDir,
  })
  await help.press("Escape")
  await expect(helpPanel).toHaveCount(0)
  const narrowModels = (await modelsProbe.boundingBox())!
  const narrowText = (await page
    .getByTestId("verify-probe-text-generation")
    .boundingBox())!
  expect(narrowText.y).toBeGreaterThanOrEqual(
    narrowModels.y + narrowModels.height,
  )
  await expect
    .poll(
      async () =>
        (await mode.boundingBox())!.y - (await profile.boundingBox())!.y,
    )
    .toBeGreaterThan(20)
  expect(await config.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await config.screenshot({
    path: test.info().outputPath("account-config-mobile.png"),
    animations: "disabled",
  })
  const shortcutHint = page.getByText(
    "已选择 Claude Code，你可以直接运行测试，或切换其他客户端。",
    { exact: true },
  )
  await expect(shortcutHint).toHaveCount(0)
  await page
    .getByRole("button", { name: "关闭", exact: true })
    .filter({ hasText: "关闭" })
    .click()
  await page.setViewportSize({ width: 1280, height: 850 })
  const cliShortcut = page
    .getByTestId(MODEL_LIST_TEST_IDS.verifyCliSupportButton)
    .first()
  await cliShortcut.hover()
  await expect(
    page.getByRole("tooltip", {
      name: "测试此 API 对 CLI 客户端的支持情况",
      exact: true,
    }),
  ).toBeVisible()
  await cliShortcut.click()
  await expect(shortcutHint).toBeVisible()
  await captureVisualViews({
    page,
    ready: shortcutHint,
    extensionDir,
    id: "account-cli-shortcut",
    views: [
      { id: "wide", width: 1280, height: 850, theme: "light" },
      { id: "narrow", width: 420, height: 840, theme: "light" },
      { id: "dark", width: 1280, height: 850, theme: "dark" },
    ],
  })
  await page.setViewportSize({ width: 420, height: 840 })
  await expect(shortcutHint).toBeVisible()
  const hintBox = (await shortcutHint.boundingBox())!
  expect(hintBox.x).toBeGreaterThanOrEqual(0)
  expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(420)
  await profile.click()
  await page.getByRole("option", { name: "Codex CLI", exact: true }).click()
  await expect(shortcutHint).toHaveCount(0)
  await page
    .getByRole("button", { name: "关闭", exact: true })
    .filter({ hasText: "关闭" })
    .click()
  await cliShortcut.click()
  await expect(shortcutHint).toBeVisible()
})

for (const outcome of ["timeout", "empty"] as const) {
  test(`verification result badges explain ${outcome} without opening details`, async ({
    context,
    extensionId,
    page,
  }) => {
    const fixture = createDrawingServer({ contextOutcome: outcome })
    await new Promise<void>((resolve) =>
      fixture.server.listen(0, "127.0.0.1", resolve),
    )
    try {
      const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "zh-CN")
      await seedApiCredentialProfiles(await getServiceWorker(context), [
        createStoredApiCredentialProfile({
          id: "result-badges",
          name: "Result badge fixture",
          apiType: "openai-compatible",
          baseUrl,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
      )
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      const textProbe = page.getByTestId(
        getApiCredentialProfileVerifyProbeTestId("text-generation"),
      )
      await textProbe
        .locator("[data-verification-summary]")
        .getByRole("button", { name: "运行", exact: true })
        .click()
      await expect(
        textProbe.locator('[data-slot="badge"]').filter({ hasText: "通过" }),
      ).toBeVisible()
      await textProbe.screenshot({
        path: test.info().outputPath("passed-badge.png"),
        animations: "disabled",
      })
      const panel = page.getByRole("region", {
        name: "模型上下文测试",
        exact: true,
      })
      await panel
        .getByRole("button", { name: "探测上下文", exact: true })
        .click()
      await expect(
        panel.locator('[data-slot="badge"]').filter({
          hasText: outcome === "timeout" ? "请求超时" : "未返回正文",
        }),
      ).toBeVisible({ timeout: 30_000 })
      await panel
        .getByRole("button", { name: "模型上下文测试", exact: true })
        .click()
      await expect(panel.getByRole("status")).toContainText(
        outcome === "timeout"
          ? "超时不能证明输入超过模型容量"
          : "接口正常结束但未返回正文",
      )
      await expect(panel.getByRole("region", { name: "测试详情" })).toHaveCount(
        0,
      )
      await panel.screenshot({
        path: test.info().outputPath(`context-${outcome}.png`),
        animations: "disabled",
      })
      await panel.getByRole("button", { name: "测试详情", exact: true }).click()
      await expect(
        panel.getByRole("region", { name: "测试详情" }),
      ).toContainText("已发送 1 次请求")
      expect(fixture.requests).toHaveLength(2)
      await page.setViewportSize({ width: 420, height: 840 })
      await panel.screenshot({
        path: test.info().outputPath(`context-${outcome}-narrow.png`),
        animations: "disabled",
      })
    } finally {
      fixture.server.closeAllConnections()
      await new Promise<void>((resolve) =>
        fixture.server.close(() => resolve()),
      )
    }
  })
}

test("restores masked account context history without another key reveal", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://masked-history.example.test"
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "en")
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    models: ["gpt-quality"],
    initialTokens: [buildNewApiToken({ key: "sk-visible****suffix" })],
  })
  let reveals = 0
  let generations = 0
  await context.route(`${baseUrl}/api/token/1/key`, async (route) => {
    reveals++
    await route.fulfill({
      json: { success: true, data: { key: "resolved-context-secret" } },
    })
  })
  await context.route("**/chat/completions", async (route) => {
    generations++
    expect(route.request().headers().authorization).toBe(
      "Bearer sk-resolved-context-secret",
    )
    await route.fulfill({
      json: {
        id: "capacity",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 1,
          total_tokens: 1001,
        },
      },
    })
  })
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [createStoredAccount({ site_url: baseUrl })])
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=e2e-account-1#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  const verify = page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton).first()
  await verify.click()
  const mode = page.getByRole("combobox", { name: "Test mode", exact: true })
  await mode.click()
  await page.getByRole("option", { name: "Non-streaming", exact: true }).click()
  const panel = page.getByRole("region", {
    name: "Model context test",
    exact: true,
  })
  await panel
    .getByRole("button", { name: "Model context test", exact: true })
    .click()
  const run = panel.getByRole("button", { name: "Run context probe" })
  await expect(run).toBeEnabled()
  expect(reveals).toBe(0)
  await run.click()
  await expect(panel).toContainText("Model context:", { timeout: 30000 })
  await expect
    .poll(async () => {
      const config = (await getPlasmoStorageJsonValue(
        worker,
        STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      )) as { contextSummaries?: { inventoryKey?: string }[] }
      return (
        config?.contextSummaries?.some((summary) =>
          Boolean(summary.inventoryKey),
        ) ?? false
      )
    })
    .toBe(true)
  expect(reveals).toBe(1)
  expect(generations).toBe(1)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .filter({ hasText: "Close" })
    .click()
  await verify.click()
  await mode.click()
  await page.getByRole("option", { name: "Non-streaming", exact: true }).click()
  await panel
    .getByRole("button", { name: "Model context test", exact: true })
    .click()
  await expect(panel).toContainText("Saved measurement for this masked key")
  await expect(
    panel.locator('[data-slot="badge"]').filter({ hasText: "Not tested" }),
  ).toBeVisible()
  await expect(
    panel.locator('[data-slot="badge"]').filter({ hasText: /\bPass\b/ }),
  ).toHaveCount(0)
  expect(reveals).toBe(1)
  expect(generations).toBe(1)
  for (const width of [1280, 420]) {
    await page.setViewportSize({ width, height: 850 })
    await panel.scrollIntoViewIfNeeded()
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await panel.screenshot({
      path: test
        .info()
        .outputPath(`masked-account-context-history-${width}.png`),
      animations: "disabled",
    })
  }
})
