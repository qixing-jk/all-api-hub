import type { AddressInfo } from "node:net"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  getApiCredentialProfileVerifyProbeTestId,
  API_CREDENTIAL_PROFILES_TEST_IDS as IDS,
} from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
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
  getServiceWorker,
  getStoredUserPreferences,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { createDrawingServer } from "~~/e2e/utils/verificationDrawingServer"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

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
    // The modal body owns the final inset; the last test must not add another.
    expect(
      await drawingPanel.evaluate((element) =>
        parseFloat(getComputedStyle(element).paddingBottom),
      ),
    ).toBe(0)
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
    await chinesePage.close()
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("an edited probe prompt persists and is used by the next run", async ({
  context,
  extensionId,
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
    await expect(textGenerationRow).toBeVisible()
    const promptToggle = textGenerationRow.getByRole("button", {
      name: "Text generation prompt",
      exact: true,
    })
    await expect(promptToggle).toHaveAttribute("aria-expanded", "false")
    await expect(textGenerationRow.getByRole("textbox")).toHaveCount(0)
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
    await textbox.fill(Array(80).fill("A line of prompt content").join("\n"))
    expect((await textbox.boundingBox())!.height).toBeLessThanOrEqual(192)
    expect(
      await textbox.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true)
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

    await page.setViewportSize({ width: 420, height: 840 })
    await expect(textGenerationRow.getByRole("textbox")).toBeVisible()
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
    await expect(
      page
        .getByTestId("verification-prompt-text-generation")
        .getByRole("button", { name: "Text generation prompt", exact: true }),
    ).toHaveAttribute("aria-expanded", "false")
    await page
      .getByTestId("verification-prompt-text-generation")
      .getByRole("button", { name: "Text generation prompt", exact: true })
      .click()
    await expect(
      page
        .getByTestId("verification-prompt-text-generation")
        .getByRole("textbox", { name: /Text generation/ }),
    ).toHaveValue("Reply with exactly: EDITED")

    const probeCard = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await expect(probeCard).toBeVisible()
    await probeCard.getByTestId(IDS.verifyProbeRunButton).click()

    await expect.poll(() => fixture.prompts.length).toBeGreaterThan(0)
    expect(fixture.prompts.at(-1)).toBe("Reply with exactly: EDITED")
    await expect(
      probeCard.getByRole("region", { name: "Execution result", exact: true }),
    ).toBeVisible()
    await expect(
      probeCard.getByRole("region", { name: "Execution result", exact: true }),
    ).toContainText("svg")
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
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
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
    createStoredAccount(),
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
  await expect(header.getByRole("note")).toContainText("测试仅反映当前接口")
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
  const desktop = await Promise.all(
    [key, api, model, mode, profile].map((field) => field.boundingBox()),
  )
  expect(Math.abs(desktop[0]!.y - desktop[1]!.y)).toBeLessThan(2)
  expect(desktop[2]!.width).toBeGreaterThan(desktop[0]!.width * 1.8)
  expect(desktop[2]!.y).toBeGreaterThan(desktop[0]!.y)
  expect(desktop[3]!.y).toBeGreaterThan(desktop[2]!.y)
  expect(Math.abs(desktop[3]!.y - desktop[4]!.y)).toBeLessThan(2)
  const modelsProbe = page.getByTestId("verify-probe-models")
  const titleBounds = await modelsProbe
    .getByText("模型列表", { exact: true })
    .boundingBox()
  const runBounds = await modelsProbe
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
  await page.getByRole("dialog").screenshot({
    path: test.info().outputPath("account-dialog-desktop.png"),
    animations: "disabled",
  })
  await page.setViewportSize({ width: 420, height: 840 })
  await expect
    .poll(
      async () =>
        (await profile.boundingBox())!.y - (await mode.boundingBox())!.y,
    )
    .toBeGreaterThan(20)
  expect(await config.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await config.screenshot({
    path: test.info().outputPath("account-config-mobile.png"),
    animations: "disabled",
  })
})
