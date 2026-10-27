import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementSiteTypeOptionTestId,
} from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "~/features/KeyManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("Novita API-key onboarding explains scope, verifies the supplied key and gates creation", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  installExtensionPageGuards(page, {
    ignoreConsoleError: (message) =>
      message.location().url === "https://api.novita.ai/openapi/v1/user/info" &&
      /401 \(Unauthorized\)/.test(message.text()),
  })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const requests: string[] = []
  let allowedIps: string[] = []
  let modelPolicy = {
    schemaVersion: 1,
    productScope: "model_api",
    mode: "all_enabled",
    allowedModels: [] as { type: string; id: string }[],
    excludedModels: [] as { type: string; id: string }[],
  }
  let consoleEnabled = false
  let publicHintReads = 0
  let releaseConsoleIdentity: (() => void) | undefined
  const consoleIdentityGate = new Promise<void>((resolve) => {
    releaseConsoleIdentity = resolve
  })
  await context.route("https://api.novita.ai/openai/v1/models", (route) => {
    publicHintReads++
    expect(route.request().headers().authorization).toBeUndefined()
    return route.fulfill({
      json: {
        data: [
          { id: "moonshotai/kimi-k3", display_name: "Kimi K3" },
          { id: "moonshotai/kimi-k3-p", display_name: "Kimi K3" },
          { id: "unrelated/model", display_name: "Unrelated model" },
        ],
      },
    })
  })
  await context.route("https://api-server.novita.ai/**", async (route) => {
    if (!consoleEnabled) {
      requests.push("unexpected-console")
      return route.fulfill({ status: 401, json: {} })
    }
    await consoleIdentityGate
    expect(route.request().headers().authorization).toBe(
      "Bearer fixture-console",
    )
    expect(route.request().method()).toBe("GET")
    return route.fulfill({
      json: { uuid: "novita-fixture-user", email: "fixture@example.com" },
    })
  })
  await context.route("https://api.novita.ai/openapi/**", async (route) => {
    const request = route.request()
    requests.push(request.method() + " " + new URL(request.url()).pathname)
    if (request.headers().authorization === "Bearer sk_invalid-fixture")
      return route.fulfill({
        status: 401,
        json: { reason: "UNAUTHORIZED", message: "key not found" },
      })
    expect(request.headers().authorization).toBe("Bearer sk_fixture-key")
    const path = new URL(request.url()).pathname
    if (path.endsWith("/ip-access-policy")) {
      if (request.method() === "PUT")
        allowedIps = request.postDataJSON().allowedIps
      return route.fulfill({
        json: { stringId: "fixture-key", policy: { allowedIps } },
      })
    }
    if (path.endsWith("/model-access-policy")) {
      if (request.method() === "PUT") modelPolicy = request.postDataJSON()
      return route.fulfill({
        json: {
          stringId: "fixture-key",
          policy: modelPolicy,
        },
      })
    }
    expect(request.method()).toBe("GET")
    if (path.endsWith("/available-llm-models"))
      return route.fulfill({ status: 404, body: "" })
    if (path === "/openapi/v1/user/info")
      return route.fulfill({
        json: { uuid: "novita-fixture-user", email: "fixture@example.com" },
      })
    if (path === "/openapi/v2/user/key")
      return route.fulfill({
        json: {
          keys: [
            {
              name: "Fixture key",
              stringId: "fixture-key",
              maskedKey: "sk_fi****-key",
              expireTime: "",
              modelAccessPolicy: {
                mode: modelPolicy.mode,
                excludedModelCount: modelPolicy.excludedModels.length,
                allowedModelCount: modelPolicy.allowedModels.length,
              },
            },
          ],
        },
      })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await page.getByTestId(accounts.addAccountButton).click()
  await page.getByTestId(accounts.siteUrlInput).fill("https://novita.ai")
  await page.getByTestId(accounts.manualAddButton).click()
  await page.getByTestId(accounts.siteTypeTrigger).click()
  await page
    .getByTestId(getAccountManagementSiteTypeOptionTestId(SITE_TYPES.NOVITA))
    .click()
  const dialog = page.getByTestId(accounts.accountDialog)
  await expect(
    dialog.getByText(/Cannot create, rename or delete keys/),
  ).toBeVisible()
  const verify = dialog.getByRole("button", {
    name: "Verify API Key",
    exact: true,
  })
  await expect(verify).toBeDisabled()
  await expect(dialog.getByRole("status")).toHaveCount(0)
  await page.getByTestId(accounts.accountFormSectionAuth).screenshot({
    path: testInfo.outputPath("api-key-idle.png"),
    animations: "disabled",
  })
  await dialog.getByTestId(accounts.accessTokenInput).fill("sk_fixture-key")
  await expect(dialog.getByTestId(accounts.usernameInput)).toHaveValue(
    "fixture@example.com",
  )
  await expect(dialog.getByTestId(accounts.userIdInput)).toHaveValue(
    "novita-fixture-user",
  )
  await expect(dialog.getByRole("status")).toHaveText(
    /API Key verified for fixture@example.com/,
  )
  const input = dialog.getByTestId(accounts.accessTokenInput)
  await expect(input).toHaveAttribute("aria-describedby", /.+/)
  await page.getByTestId(accounts.accountFormSectionAuth).screenshot({
    path: testInfo.outputPath("api-key-guide.png"),
    animations: "disabled",
  })
  await input.fill("sk_invalid-fixture")
  await expect(dialog.getByRole("status")).toHaveCount(0)
  await expect(input).toHaveAttribute("aria-invalid", "true")
  await expect(dialog.getByRole("status")).toHaveText(/invalid or expired/)
  await expect(dialog.getByTestId(accounts.autoDetectErrorMessage)).toHaveCount(
    0,
  )
  await input.fill("sk_fixture-key")
  await expect(dialog.getByRole("status")).toHaveCount(0)
  await expect(input).not.toHaveAttribute("aria-invalid", "true")
  await expect(dialog.getByRole("status")).toHaveText(
    /API Key verified for fixture@example.com/,
  )
  consoleEnabled = true
  await context.route("https://novita.ai/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Novita fixture</body></html>",
    }),
  )
  await context.addCookies([
    {
      name: "token",
      value: "fixture-console",
      domain: "novita.ai",
      path: "/",
      secure: true,
    },
  ])
  const website = await context.newPage()
  await website.goto("https://novita.ai/settings/key-management")
  await page.bringToFront()
  await dialog
    .getByRole("button", { name: "Get console credential", exact: true })
    .click()
  const consoleInput = dialog.getByLabel("Console token", { exact: true })
  await expect(consoleInput).toHaveAttribute("aria-busy", "true")
  await expect(input).not.toHaveAttribute("aria-busy", "true")
  await page.getByTestId(accounts.accountFormSectionAuth).screenshot({
    path: testInfo.outputPath("console-acquisition-only.png"),
    animations: "disabled",
  })
  releaseConsoleIdentity?.()
  await expect(dialog.getByLabel("Console token", { exact: true })).toHaveValue(
    "fixture-console",
  )
  await expect(dialog.getByTestId(accounts.accessTokenInput)).toHaveValue(
    "sk_fixture-key",
  )
  await expect(dialog.getByRole("status")).toHaveText(
    /Console token verified for fixture@example.com/,
  )
  await expect(
    dialog.getByRole("button", { name: "Show API Key", exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "Show console token", exact: true }),
  ).toBeVisible()
  await page.getByTestId(accounts.accountFormSectionAuth).screenshot({
    path: testInfo.outputPath("paired-credentials.png"),
    animations: "disabled",
  })
  await input.fill("")
  await dialog
    .getByRole("button", { name: "Get console credential", exact: true })
    .click()
  await expect(dialog.getByRole("status")).toHaveText(
    /Console token verified for fixture@example.com/,
  )
  await expect(input).toHaveValue("")
  await expect(input).not.toHaveAttribute("aria-describedby")
  await expect(verify).toBeDisabled()
  await page.getByTestId(accounts.accountFormSectionAuth).screenshot({
    path: testInfo.outputPath("console-only-verified.png"),
    animations: "disabled",
  })
  await input.fill("sk_fixture-key")
  await expect(dialog.getByRole("status")).toHaveText(
    /API Key verified for fixture@example.com/,
  )
  await dialog.getByLabel("Console token", { exact: true }).fill("")
  await expect(dialog.getByLabel("Console token", { exact: true })).toHaveValue(
    "",
  )
  await expect(dialog.getByTestId(accounts.accessTokenInput)).toHaveValue(
    "sk_fixture-key",
  )
  await website.close()
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "novita-api-key",
      site_type: SITE_TYPES.NOVITA,
      site_url: "https://novita.ai",
      site_name: "Novita API-key account",
      account_info: {
        id: "novita-fixture-user",
        username: "fixture@example.com",
        access_token: "sk_fixture-key",
      },
    }),
  ])
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      name: "Novita authentication key",
      apiKey: "sk_fixture-key",
      baseUrl: "https://api.novita.ai/openai",
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/options.html?accountId=novita-api-key#keys`,
  )
  await expect(page.getByText("Fixture key", { exact: true })).toBeVisible()
  await expect(page.getByTestId(keys.addTokenButton)).toBeDisabled()
  await page.getByRole("group", { name: "Add API Key", exact: true }).focus()
  await expect(page.getByRole("tooltip")).toContainText(
    "Creating keys requires console authorization",
  )
  const row = page
    .getByTestId(keys.nativeKeyRow)
    .filter({ hasText: "Fixture key" })
  await expect(
    row.getByText("Possibly used for account authentication", { exact: true }),
  ).toBeVisible()
  await row.screenshot({
    path: testInfo.outputPath("account-credential-candidate.png"),
    animations: "disabled",
  })
  await row.getByTestId(keys.apiCredentialAssociationButton).click()
  await page.getByTestId(keys.associateCredentialProfileSelect).click()
  await page.getByRole("option", { name: /Novita authentication key/ }).click()
  await page.getByTestId(keys.associateCredentialConfirmButton).click()
  await expect(
    row.getByText("Used by this account", { exact: true }),
  ).toBeVisible()
  await expect(
    row.getByText("Used by this account", { exact: true }),
  ).toHaveClass(/bg-info-soft/)
  await expect(
    row.getByText("Possibly used for account authentication", { exact: true }),
  ).toHaveCount(0)
  await row.screenshot({
    path: testInfo.outputPath("account-credential-confirmed.png"),
    animations: "disabled",
  })
  await expect(row.getByRole("button", { name: /delete/i })).toHaveCount(0)
  await row.getByRole("button", { name: /edit/i }).click()
  const editor = page.getByTestId(keys.nativeEditor)
  await expect(editor.locator("#resource-editor-model_mode")).toBeVisible()
  await expect(editor.locator("#resource-editor-name")).toHaveCount(0)
  await expect(editor.getByRole("alert")).toHaveCount(0)
  await editor.locator("#resource-editor-model_mode").click()
  await page
    .getByRole("option", { name: "Selected models only", exact: true })
    .click()
  const allowedModels = editor.getByRole("combobox", {
    name: "Allowed models",
    exact: true,
  })
  await expect(allowedModels).toBeEnabled()
  await allowedModels.fill("kimi-k3")
  await expect(
    page.getByRole("option", { name: "unrelated/model", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("option", { name: "moonshotai/kimi-k3", exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("api-key-model-hints.png"),
    animations: "disabled",
  })
  await page
    .getByRole("option", { name: "moonshotai/kimi-k3", exact: true })
    .click()
  await expect(
    editor.getByText("moonshotai/kimi-k3", { exact: true }),
  ).toBeVisible()
  await allowedModels.pressSequentially("example/manual-model")
  await expect(allowedModels).toHaveValue("example/manual-model")
  await allowedModels.press("Enter")
  await expect(
    editor.getByText("example/manual-model", { exact: true }),
  ).toBeVisible()
  await expect(
    editor.getByText("moonshotai/kimi-k3", { exact: true }),
  ).toBeVisible()
  await editor.locator("#resource-editor-ip_restricted").click()
  await editor.locator("#resource-editor-allowed_ips").fill("192.0.2.1")
  await expect(
    editor.getByText("moonshotai/kimi-k3", { exact: true }),
  ).toBeVisible()
  await page.getByTestId(keys.nativeEditorSubmitButton).click()
  await expect(editor).toHaveCount(0)
  await row.getByRole("button", { name: /edit/i }).click()
  await expect(editor.locator("#resource-editor-allowed_ips")).toHaveValue(
    "192.0.2.1",
  )
  await expect(
    editor.getByText("example/manual-model", { exact: true }),
  ).toBeVisible()
  expect(modelPolicy.allowedModels).toEqual([
    { type: "llm", id: "moonshotai/kimi-k3" },
    { type: "llm", id: "example/manual-model" },
  ])
  await editor.screenshot({
    path: testInfo.outputPath("api-key-policy-editor.png"),
    animations: "disabled",
  })
  await editor.locator("#resource-editor-model_mode").click()
  await page
    .getByRole("option", { name: "All enabled models", exact: true })
    .click()
  const excludedModels = editor.getByRole("combobox", {
    name: "Excluded models",
    exact: true,
  })
  await excludedModels.fill("example/excluded-model")
  await excludedModels.press("Enter")
  await page.getByTestId(keys.nativeEditorSubmitButton).click()
  await expect(editor).toHaveCount(0)
  expect(modelPolicy.allowedModels).toEqual([])
  expect(modelPolicy.excludedModels).toEqual([
    { type: "llm", id: "example/excluded-model" },
  ])
  expect(requests).toContain("GET /openapi/v1/user/info")
  expect(
    requests.some((request) => request.includes("available-llm-models")),
  ).toBe(false)
  expect(requests).not.toContain("unexpected-console")
  expect(publicHintReads).toBeGreaterThan(0)
})
