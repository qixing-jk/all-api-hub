import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION } from "~/services/verification/verificationResultHistory/types"
import { serializeVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/utils"
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
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const width of [390, 1600]) {
  test(`sidebar controls stay in the toolbar at ${width}px`, async ({
    context,
    page,
    extensionId,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width, height: 844 })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const baseUrl = "https://ux-sidebar.example.test"
    await context.route(`${baseUrl}/v1/models`, (route) =>
      route.fulfill({ json: { data: [{ id: "gpt-first" }] } }),
    )
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "ux-sidebar",
        name: "Sidebar fixture",
        baseUrl,
        apiKey: "synthetic-key",
        apiType: "openai-compatible",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    const workspace = page.getByTestId("verification-workspace")
    const listToggle = workspace.getByRole("button", {
      name: /Collapse test list/,
      exact: true,
    })
    await expect(listToggle).toHaveAttribute("aria-expanded", "true")
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("tests-sidebar.png"),
      animations: "disabled",
    })
    expect
      .soft(
        await workspace
          .getByRole("button", { name: "Close", exact: true })
          .count(),
      )
      .toBe(0)
    await listToggle.click()
    await expect(workspace).toHaveAttribute("data-list-collapsed", "true")
    const settingsToggle = workspace.getByRole("button", {
      name: "Settings",
      exact: true,
    })
    if ((await settingsToggle.getAttribute("aria-expanded")) === "false")
      await settingsToggle.click()
    await expect(
      workspace.getByLabel("API type", { exact: true }),
    ).toBeVisible()
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("configuration-sidebar.png"),
      animations: "disabled",
    })
    expect
      .soft(
        await workspace
          .getByRole("button", { name: "Close", exact: true })
          .count(),
      )
      .toBe(0)
    await expect(settingsToggle).toBeInViewport()
    await settingsToggle.click()
    await expect(workspace.getByLabel("API type", { exact: true })).toBeHidden()
    await settingsToggle.click()
    const model = workspace.getByRole("combobox", {
      name: "Model",
      exact: true,
    })
    await model.click()
    const search = page.locator('[data-slot="command-input"]:visible')
    await search.fill("Draft model")
    await search.press("Enter")
    await model.press("Escape")
    await expect(workspace.getByLabel("API type", { exact: true })).toBeHidden()
    await expect(settingsToggle).toBeFocused()
    await settingsToggle.click()
    await expect(model).toContainText("Draft model")
  })
}

for (const width of [390, 1000]) {
  test(`account without runtime keys explains recovery at ${width}px`, async ({
    context,
    page,
    extensionId,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const baseUrl = "https://ux-account.example.test"
    await stubNewApiSiteRoutes(context, {
      baseUrl,
      models: ["gpt-first"],
      initialTokens: [],
    })
    await seedStoredAccounts(await getServiceWorker(context), [
      createStoredAccount({
        id: "ux-account",
        site_name: "UX account",
        site_url: baseUrl,
      }),
    ])
    await page.setViewportSize({ width, height: 844 })
    await page.goto(
      `chrome-extension://${extensionId}/options.html?accountId=ux-account#${MENU_ITEM_IDS.MODELS}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton).first().click()
    const workspace = page.getByTestId("verification-workspace")
    await workspace
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await expect(
      workspace.getByText("Select an API key in configuration to run tests."),
    ).toBeInViewport()
    const recovery = workspace.getByRole("button", {
      name: "Expand configuration",
      exact: true,
    })
    await expect(recovery).toBeInViewport()
    const warning = workspace.locator('[data-slot="alert"]')
    const bounds = (await warning.boundingBox())!
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("account-missing-key.png"),
      animations: "disabled",
    })
    await recovery.click()
    await expect(
      workspace.getByRole("button", {
        name: "Open model key setup",
        exact: true,
      }),
    ).toBeVisible()
  })
}

test("collapsed unsupported result retains its actual status", async ({
  context,
  page,
  extensionId,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const baseUrl = "https://ux-review.example.test"
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(`${baseUrl}/v1/models`, (route) =>
    route.fulfill({ json: { data: [{ id: "gpt-first" }] } }),
  )
  const worker = await getServiceWorker(context)
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "ux-review",
      name: "UX review",
      apiType: "openai-compatible",
      baseUrl,
      apiKey: "synthetic-key",
      telemetryConfig: { mode: "disabled" },
    }),
  ])
  const verifiedAt = Date.now() - 1000
  const targets = [
    { kind: "profile" as const, profileId: "ux-review" },
    {
      kind: "profile-model" as const,
      profileId: "ux-review",
      modelId: "gpt-first",
    },
  ]
  await setPlasmoStorageValue(
    worker,
    STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
    {
      version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
      lastUpdated: verifiedAt,
      lastOrphanSweepAt: Date.now(),
      summaries: targets.map((target) => ({
        target,
        targetKey: serializeVerificationHistoryTarget(target),
        verifiedAt,
        apiType: "openai-compatible",
        status: "unsupported",
        resolvedModelId: "gpt-first",
        probes: [
          {
            id: "structured-output",
            status: "unsupported",
            latencyMs: 100,
            summary: "Saved unsupported result",
          },
        ],
      })),
    },
    { lock: STORAGE_LOCKS.API_VERIFICATION_HISTORY },
  )
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(IDS.verifyButton).first().click()
  const workspace = page.getByTestId("verification-workspace")
  await workspace
    .getByRole("button", { name: "Structured output", exact: true })
    .click()
  await expect(workspace.getByTestId("verification-active-test")).toContainText(
    "Unsupported",
  )
  await workspace
    .getByRole("button", { name: /Collapse test list/, exact: true })
    .click()
  await workspace
    .getByRole("button", { name: "Structured output", exact: true })
    .hover()
  const tooltip = page.getByRole("tooltip")
  await expect(tooltip).toBeVisible()
  await page.getByRole("dialog").screenshot({
    path: test.info().outputPath("unsupported-collapsed.png"),
    animations: "disabled",
  })
  await expect(tooltip).toContainText("Unsupported")
})

test("truncated Q&A output discloses incomplete response", async ({
  context,
  page,
  extensionId,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const baseUrl = "https://ux-review.example.test"
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(`${baseUrl}/v1/models`, (route) =>
    route.fulfill({ json: { data: [{ id: "gpt-first" }] } }),
  )
  await context.route(`${baseUrl}/v1/chat/completions`, (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ id: "repro", object: "chat.completion.chunk", created: 0, model: "gpt-first", choices: [{ index: 0, delta: { role: "assistant", content: "Incomplete response.\n\n".repeat(100) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "repro", object: "chat.completion.chunk", created: 0, model: "gpt-first", choices: [{ index: 0, delta: {}, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`,
    }),
  )
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      id: "ux-review",
      name: "UX review",
      apiType: "openai-compatible",
      baseUrl,
      apiKey: "synthetic-key",
      telemetryConfig: { mode: "disabled" },
    }),
  ])
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(IDS.verifyButton).first().click()
  const workspace = page.getByTestId("verification-workspace")
  await workspace.getByRole("button", { name: "Q&A test", exact: true }).click()
  await workspace
    .getByRole("textbox", { name: "Question", exact: true })
    .press("Enter")
  await expect(workspace.getByTestId("verification-active-test")).toContainText(
    "Incomplete",
  )
  const scroller = workspace.locator(
    '[data-slot="message-scroller-viewport"]:visible',
  )
  await scroller.hover()
  await page.mouse.wheel(0, -20000)
  await expect(
    workspace.getByRole("button", { name: "Jump to latest", exact: true }),
  ).toBeVisible()
  await page.getByRole("dialog").screenshot({
    path: test.info().outputPath("truncated-qa.png"),
    animations: "disabled",
  })
  await expect(
    workspace.getByTestId("verification-generation-output"),
  ).toContainText("Partial output retained; the response did not complete.")
})

for (const width of [390, 1600]) {
  test(`context test keeps its stop action visible with the list collapsed at ${width}px`, async ({
    context,
    page,
    extensionId,
  }) => {
    const baseUrl = "https://ux-review.example.test"
    await page.emulateMedia({ reducedMotion: "reduce" })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await context.route(`${baseUrl}/v1/models`, (route) =>
      route.fulfill({ json: { data: [{ id: "gpt-first" }] } }),
    )
    let requests = 0
    await context.route(`${baseUrl}/v1/chat/completions`, async () => {
      requests++
      await new Promise(() => {})
    })
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "ux-review",
        name: "UX review",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.setViewportSize({ width, height: 844 })
    await page.goto(
      `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).first().click()
    const workspace = page.getByTestId("verification-workspace")
    await workspace
      .getByRole("button", { name: "Context capacity test", exact: true })
      .click()
    await workspace
      .locator('[data-testid="probe-intro-run-button"]:visible')
      .click()
    await expect.poll(() => requests).toBe(1)
    if (width === 1600)
      await workspace
        .getByRole("button", { name: /Collapse test list/, exact: true })
        .click()
    const stop = workspace
      .getByTestId("verification-active-test")
      .getByRole("button", { name: "Stop", exact: true })
    await expect(stop).toBeInViewport()
    await page.getByRole("dialog").screenshot({
      path: test.info().outputPath(`context-stop-${width}.png`),
      animations: "disabled",
    })
    await stop.click()
    await expect(
      workspace.getByTestId("verification-active-test"),
    ).toContainText("Stopped")
  })
}
