import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
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
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

import {
  checkAimlapiRejectedCredential,
  checkAimlapiSavedCredentials,
  openAimlapiAuthForm,
  runAimlapiAuthMatrix,
} from "../scripts/suites/aimlapi/auth.mjs"
import { runAimlapiUiTest } from "../scripts/suites/aimlapi/ui.mjs"

const primary = "e2e-management"
const regular = "e2e-regular"
const key = {
  name: "Management",
  prefix: "12345678",
  disabled: false,
  scopes: null,
  limit: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  expires_at: null,
  allowed_models: null,
  total_usage_usd: 0,
  monthly_usage_usd: 0,
}

test("live runner verifies pasted credentials, saves and cleans its onboarding account", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(120000)
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [])
  await seedUserPreferences(serviceWorker, {
    warnOnDuplicateAccountAdd: false,
    tempWindowFallback: { enabled: false },
  })
  await stubLlmMetadataIndex(context)
  await context.route("https://aimlapi.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><title>AI/ML API</title></html>",
    }),
  )
  const requests: { path: string; credential: string }[] = []
  await context.route("https://api.aimlapi.com/**", async (route) => {
    const request = route.request()
    expect(request.method()).toBe("GET")
    const path = new URL(request.url()).pathname
    const credential =
      request.headers().authorization?.replace("Bearer ", "") || ""
    requests.push({ path, credential })
    if (path === "/v1/key") return route.fulfill({ json: { data: key } })
    if (path === "/v2/billing/detail")
      return route.fulfill({
        json: {
          user_id: 123,
          email: "person@example.invalid",
          current_balance: 4,
          currency: "USD",
        },
      })
    if (path === "/v2/billing")
      return route.fulfill({ json: { current_balance: 4, currency: "USD" } })
    if (path === "/v2/usage/detail")
      return route.fulfill({ json: { spend: 1, requests: 2, groups: [] } })
    if (path === "/v2/logs")
      return route.fulfill({ json: { data: [], pagination: { total: 0 } } })
    throw new Error(`Unexpected onboarding request: ${path}`)
  })
  // This test owns the onboarding slice. Stop the runner when it opens the
  // separate fixture phase, before catalog/key tests can perform unrelated work.
  let formOpened = false
  const onboardingContext = new Proxy(context, {
    get(target, property) {
      if (property === "newPage")
        return async () => {
          if (formOpened) throw new Error("onboarding slice complete")
          formOpened = true
          return target.newPage()
        }
      const value = Reflect.get(target, property)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
  await expect(
    runAimlapiUiTest({
      context: onboardingContext,
      extensionId,
      serviceWorker,
      managementKey: primary,
      apiKey: regular,
    }),
  ).rejects.toThrow("onboarding slice complete")
  expect(requests).toContainEqual({ path: "/v1/key", credential: primary })
  expect(requests).toContainEqual({
    path: "/v2/billing/detail",
    credential: regular,
  })
  expect(requests).toContainEqual({ path: "/v2/billing", credential: regular })
  expect(await readStoredAccounts(serviceWorker)).toEqual([])
})

test("authentication matrix saves each supported combination and rejects invalid primary credentials", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(180000)
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [])
  await seedUserPreferences(serviceWorker, {
    warnOnDuplicateAccountAdd: false,
    tempWindowFallback: { enabled: false },
  })
  await stubLlmMetadataIndex(context)
  const requests: { path: string; credential: string }[] = []
  await context.route("https://api.aimlapi.com/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const credential =
      request.headers().authorization?.replace("Bearer ", "") || ""
    requests.push({ path, credential })
    expect(request.method()).toBe("GET")
    let status = 200
    let body: unknown
    if (credential === "aah-invalid-credential" || credential === "revoked") {
      status = 401
      body = { message: "upstream secret must not be echoed" }
    } else if (credential === "denied") {
      status = 403
      body = { message: "denied" }
    } else if (path === "/v1/key") body = { data: key }
    else if (path === "/v1/keys") body = { data: [key] }
    else if (path.startsWith("/v2/billing") && credential !== regular) {
      status = 403
      body = { message: "wrong scope" }
    } else if (path === "/v2/billing/detail")
      body = {
        user_id: 123,
        email: "user@example.invalid",
        current_balance: 4,
        currency: "USD",
      }
    else if (path === "/v2/billing")
      body = { current_balance: 4, currency: "USD" }
    else if (path === "/v2/usage/detail")
      body = { spend: 1, requests: 2, groups: [] }
    else {
      status = 404
      body = { message: "unexpected endpoint" }
    }
    await route.fulfill({ status, json: body })
  })
  const options = {
    context,
    extensionId,
    serviceWorker,
    managementKey: primary,
    apiKey: regular,
  }
  const results = await runAimlapiAuthMatrix(options)
  expect(results.every((r) => r.status === "passed")).toBe(true)
  await checkAimlapiSavedCredentials(options, {
    primary,
    regular,
    replacements: [
      { primary: "e2e-management-replacement", regular },
      { primary: "e2e-management-replacement", regular: "" },
    ],
  })
  for (const [credential, message] of [
    ["revoked", "The AI/ML API key is invalid or has expired."],
    [
      "denied",
      "This AI/ML API credential cannot perform that action. Key management needs a management key; balance and billing need a regular API key.",
    ],
  ] as const) {
    await checkAimlapiRejectedCredential(options, {
      primary: credential,
      message,
    })
  }
  expect(
    requests
      .filter((r) => r.path.startsWith("/v2/billing"))
      .every((r) => r.credential === regular),
  ).toBe(true)
  for (const supplemental of ["revoked", "denied"]) {
    await checkAimlapiRejectedCredential(options, {
      primary,
      regular: supplemental,
      message:
        supplemental === "revoked"
          ? "The AI/ML API key is invalid or has expired."
          : "This AI/ML API credential cannot perform that action. Key management needs a management key; balance and billing need a regular API key.",
    })
  }
  expect(
    requests.some((r) => r.path === "/v1/key" && r.credential === primary),
  ).toBe(true)
})

test("clearing the primary key blocks saving even when a regular key remains", async ({
  context,
  extensionId,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [])
  await seedUserPreferences(serviceWorker)
  const form = await openAimlapiAuthForm({ context, extensionId })
  try {
    await form.primary.fill(primary)
    await form.regular.fill(regular)
    await expect(form.save).toHaveCount(0)
    await form.primary.clear()
    await expect(form.save).toHaveCount(0)
    await expect(form.regular).toHaveValue(regular)
  } finally {
    await form.page.close()
  }
})

test("logged-in automatic onboarding fills identity and both credentials before save", async ({
  context,
  extensionId,
  page,
}) => {
  test.setTimeout(180000)
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [])
  await seedUserPreferences(serviceWorker, {
    warnOnDuplicateAccountAdd: false,
    tempWindowFallback: { enabled: true },
  })
  await stubLlmMetadataIndex(context)
  await context.addCookies([
    {
      url: "https://aimlapi.com",
      name: "playground.token",
      value: encodeURIComponent(JSON.stringify({ key: "console-session" })),
    },
  ])
  await context.route("https://aimlapi.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><head><title>AI/ML API</title></head><body>AI/ML API console</body></html>",
    }),
  )
  let creations = 0
  await context.route("https://app.aimlapi.com/**", async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    expect(req.headers().authorization).toBe("Bearer console-session")
    if (path === "/v1/users/me")
      return route.fulfill({
        json: { id: "123", email: "person@example.invalid" },
      })
    if (path === "/v1/keys" && req.method() === "POST") {
      creations++
      const management = req.postDataJSON().isManagement
      return route.fulfill({
        status: 201,
        json: {
          id: management ? "1" : "2",
          prefix: management ? "12345678" : "87654321",
          userId: "123",
          isManagement: management,
          key: management ? primary : regular,
        },
      })
    }
    throw new Error("Unexpected console request")
  })
  await context.route("https://api.aimlapi.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    const regularRow = {
      ...key,
      prefix: "87654321",
      name: "All API Hub regular",
    }
    if (path === "/v1/key")
      return route.fulfill({
        json: {
          data:
            route.request().headers().authorization === `Bearer ${regular}`
              ? regularRow
              : key,
        },
      })
    if (path === "/v1/keys")
      return route.fulfill({ json: { data: [regularRow] } })
    if (path === "/v2/billing/detail")
      return route.fulfill({
        json: {
          user_id: 123,
          email: "person@example.invalid",
          current_balance: 4,
          currency: "USD",
        },
      })
    if (path === "/v2/billing")
      return route.fulfill({ json: { current_balance: 4, currency: "USD" } })
    if (path === "/v2/usage/detail")
      return route.fulfill({ json: { spend: 1, requests: 2, groups: [] } })
    return route.fulfill({ json: { data: [] } })
  })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await page
    .getByTestId("account-management-add-account-button")
    .first()
    .click()
  const dialog = page.getByTestId("account-management-account-dialog")
  await dialog
    .getByTestId("account-management-site-url-input")
    .fill("https://aimlapi.com")
  await dialog.getByTestId("account-management-auto-detect-button").click()
  await expect(
    dialog.getByTestId("account-management-username-input"),
  ).toHaveValue("person@example.invalid", { timeout: 60000 })
  await expect(
    dialog.getByTestId("account-management-user-id-input"),
  ).toHaveValue("123")
  await expect(
    dialog.getByTestId("account-management-access-token-input"),
  ).toHaveValue(primary)
  await expect(
    dialog.getByTestId("account-management-aiml-api-key-input"),
  ).toHaveValue(regular)
  expect(creations).toBe(2)
  await dialog.getByTestId("account-management-confirm-add-button").click()
  await expect(dialog).toBeHidden({ timeout: 30000 })
  const saved = (await readStoredAccounts(serviceWorker)).find(
    (account) => account.site_type === "aimlapi",
  )!
  await page.goto(
    `chrome-extension://${extensionId}/options.html#keys?accountId=${saved.id}`,
  )
  const regularRow = page
    .getByTestId("key-management-native-key-row")
    .filter({ hasText: "All API Hub regular" })
  await expect(regularRow).toBeVisible({ timeout: 30000 })
  await expect(
    regularRow.getByText("Used by this account", { exact: true }),
  ).toBeVisible()
  await expect(
    regularRow.getByText("Current account management key", { exact: true }),
  ).toHaveCount(0)
  await expect(regularRow).not.toContainText(
    "This site shows the full key only when it is created",
  )
  await page.screenshot({
    path: ".scratch/aimlapi-integration/artifacts/account-key-badge.png",
    animations: "disabled",
  })
  await regularRow
    .getByRole("button", { name: "Show Key", exact: true })
    .click()
  await expect(regularRow).toContainText(regular)
  await expect(regularRow).not.toContainText(primary)
})

test("AIMLAPI budget details preserve unknown and independently reported counters", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1600, height: 1100 })
  await stubLlmMetadataIndex(context)
  const counters = [
    {},
    { spent_usd: 2 },
    { remaining_usd: 3 },
    { spent_usd: 2, remaining_usd: 3 },
  ]
  const records = counters.map((values, index) => ({
    ...key,
    name: [
      "Unknown counters",
      "Known spend",
      "Known remaining",
      "Reported counters",
    ][index],
    prefix: `budget0${index}`,
    limit: {
      retention: "month",
      threshold: 9,
      window_start: "2026-11-01T00:00:00Z",
      ...values,
    },
  }))
  await context.route("https://api.aimlapi.com/**", async (route) => {
    const request = route.request()
    expect(request.method()).toBe("GET")
    const path = new URL(request.url()).pathname
    if (path === "/v1/keys") return route.fulfill({ json: { data: records } })
    if (path.startsWith("/v1/keys/")) {
      const record = records.find((item) => path.endsWith(item.prefix))
      expect(record).toBeDefined()
      return route.fulfill({ json: { data: record } })
    }
    if (path === "/v1/key") return route.fulfill({ json: { data: key } })
    if (path === "/v2/usage/detail")
      return route.fulfill({ json: { spend: 0, requests: 0, groups: [] } })
    if (path === "/v2/logs")
      return route.fulfill({ json: { data: [], pagination: { total: 0 } } })
    return route.fulfill({
      status: 403,
      json: { message: "Regular API key required" },
    })
  })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    refreshOnOpen: false,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "aimlapi-budget-e2e",
      site_name: "AIMLAPI budget fixture",
      site_type: SITE_TYPES.AIMLAPI,
      site_url: "https://aimlapi.com",
      account_info: { id: "123", username: "fixture", access_token: primary },
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/options.html#keys?accountId=aimlapi-budget-e2e`,
  )
  await waitForExtensionRoot(page)
  const rows = page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow)
  await expect(rows).toHaveCount(4)
  for (const record of records) {
    const row = rows.filter({ hasText: record.name })
    await expect(row).toContainText("$9")
    await expect(row).not.toContainText("Used $0")
  }
  const unknown = rows.filter({ hasText: "Unknown counters" })
  await expect(unknown).toContainText("$9 · Monthly")
  await expect(unknown).not.toContainText("remaining $")
  const knownSpend = rows.filter({ hasText: "Known spend" })
  await expect(knownSpend).toContainText("$2 / $9 · Monthly")
  await expect(knownSpend).not.toContainText("remaining $")
  const knownRemaining = rows.filter({ hasText: "Known remaining" })
  await expect(knownRemaining).toContainText("$9 · Monthly")
  await expect(knownRemaining).toContainText("$3")
  await expect(knownRemaining).not.toContainText("Used $")
  const reported = rows.filter({ hasText: "Reported counters" })
  await expect(reported).toContainText("Used $2 / $9 · remaining $3")
  await expect(reported).not.toContainText("remaining $7")
  await expect(reported).toContainText("Resets")
  await expect(reported).not.toContainText("Rolling window")
  await unknown.screenshot({
    path: testInfo.outputPath("unknown-budget.png"),
    animations: "disabled",
  })
  await knownRemaining.screenshot({
    path: testInfo.outputPath("known-remaining-budget.png"),
    animations: "disabled",
  })
  await reported.screenshot({
    path: testInfo.outputPath("reported-budget.png"),
    animations: "disabled",
  })
  await page.screenshot({
    path: testInfo.outputPath("budget-states.png"),
    animations: "disabled",
  })
})
