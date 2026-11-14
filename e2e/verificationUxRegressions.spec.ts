import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
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
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { buildNewApiToken } from "~~/tests/test-utils/newApiToken"

test("retains the SVG and discloses a truncated drawing response", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://gemini-review.example.test"
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(`${baseUrl}/v1/models`, (r) =>
    r.fulfill({ json: { data: [{ id: "gpt-first" }] } }),
  )
  await context.route(`${baseUrl}/v1/chat/completions`, (r) =>
    r.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ id: "drawing", object: "chat.completion.chunk", created: 0, model: "gpt-first", choices: [{ index: 0, delta: { role: "assistant", content: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>\n\n' + "Truncated drawing explanation.\n\n".repeat(100) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "drawing", object: "chat.completion.chunk", created: 0, model: "gpt-first", choices: [{ index: 0, delta: {}, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`,
    }),
  )
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      id: "gemini-review",
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
  await workspace
    .getByRole("button", { name: "Drawing test", exact: true })
    .click()
  await workspace
    .locator("[data-verification-composer]")
    .getByRole("button", { name: "Run", exact: true })
    .click()
  await expect(workspace.getByTestId("verification-active-test")).toContainText(
    "Drawing generated",
  )
  const scroller = workspace.locator(
    '[data-slot="message-scroller-viewport"]:visible',
  )
  await scroller.hover()
  await page.mouse.wheel(0, -20000)
  await expect(
    workspace.getByRole("button", {
      name: "Jump to latest",
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole("dialog").screenshot({
    path: test.info().outputPath("truncated-drawing.png"),
    animations: "disabled",
  })
  await expect(
    workspace.getByTestId("verification-generation-output"),
  ).toContainText("Partial output retained; the response did not complete.")
})

test("renders a valid SVG even when accompanying text is truncated", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://gemini-review.example.test"
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await context.route(`${baseUrl}/v1/models`, (r) =>
    r.fulfill({ json: { data: [{ id: "gpt-first" }] } }),
  )
  await context.route(`${baseUrl}/v1/chat/completions`, (r) =>
    r.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ id: "drawing", object: "chat.completion.chunk", created: 0, model: "gpt-first", choices: [{ index: 0, delta: { role: "assistant", content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>\n\n' + "Truncated drawing explanation.\n\n".repeat(100) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "drawing", object: "chat.completion.chunk", created: 0, model: "gpt-first", choices: [{ index: 0, delta: {}, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`,
    }),
  )
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      id: "gemini-review",
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
  await workspace
    .getByRole("button", { name: "Drawing test", exact: true })
    .click()
  await workspace
    .locator("[data-verification-composer]")
    .getByRole("button", { name: "Run", exact: true })
    .click()
  await expect(workspace.getByTestId("verification-active-test")).toContainText(
    "Drawing generated",
  )
  await expect(
    workspace.locator('img[src^="data:image/svg+xml"]'),
  ).toBeVisible()
  await expect
    .poll(() =>
      workspace
        .locator('img[src^="data:image/svg+xml"]')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)
  const scroller = workspace.locator(
    '[data-slot="message-scroller-viewport"]:visible',
  )
  await scroller.hover()
  await page.mouse.wheel(0, -20000)
  await expect(
    workspace.getByRole("button", {
      name: "Jump to latest",
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole("dialog").screenshot({
    path: test.info().outputPath("valid-truncated-drawing.png"),
    animations: "disabled",
  })
  await expect(
    workspace.getByTestId("verification-generation-output"),
  ).toContainText("Partial output retained; the response did not complete.")
})

test("locks the account model across tests and unlocks after stopping", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://gemini-account.example.test"
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    models: ["gpt-first", "gpt-second"],
    initialTokens: [buildNewApiToken({ key: "synthetic-key" })],
  })
  let requestedModel = ""
  let releaseRequest: (() => void) | undefined
  await context.route(`${baseUrl}/v1/chat/completions`, async (route) => {
    requestedModel = route.request().postDataJSON().model
    await new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    await route.abort().catch(() => {})
  })
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "gemini-account",
      site_name: "UX account",
      site_url: baseUrl,
    }),
  ])
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/options.html?accountId=gemini-account#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton).first().click()
  const workspace = page.getByTestId("verification-workspace")
  await workspace
    .getByRole("button", { name: "Text generation", exact: true })
    .click()
  await workspace
    .locator("[data-verification-composer]")
    .getByRole("button", { name: "Run", exact: true })
    .click()
  await expect.poll(() => requestedModel).toBe("gpt-first")
  await workspace.getByRole("button", { name: "Q&A test", exact: true }).click()
  const picker = workspace.locator(
    '[data-slot="model-selector-trigger"]:visible',
  )
  await page.getByRole("dialog").screenshot({
    path: test.info().outputPath("account-unlocked-model.png"),
    animations: "disabled",
  })
  await expect(picker).toBeDisabled()
  await expect(picker).toContainText("gpt-first")
  await workspace
    .getByRole("button", { name: "Text generation", exact: true })
    .click()
  await workspace
    .locator("[data-verification-composer]")
    .getByRole("button", { name: "Stop", exact: true })
    .click()
  releaseRequest?.()
  await workspace.getByRole("button", { name: "Q&A test", exact: true }).click()
  await expect(picker).toBeEnabled()
})
