import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileRowTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import { acceptTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/acceptance"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialTelemetrySnapshot } from "~/types/apiCredentialProfiles"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("keeps a partial billing read's remaining budget visible with its original observation time", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const baseUrl = "https://partial-budget.invalid"
  let partial = false
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "partial-budget",
      name: "Partial billing budget",
      baseUrl,
      telemetryConfig: { mode: "openaiBilling" },
    }),
  ])
  await context.route(`${baseUrl}/**`, (route) =>
    route.fulfill({
      json: route.request().url().includes("subscription")
        ? { hard_limit_usd: partial ? "120" : "100" }
        : { total_usage: partial ? "invalid" : "3000" },
    }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getApiCredentialProfileRowTestId("partial-budget"),
  )
  await row
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
    .click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  const readBudget = async () => {
    const raw = await getPlasmoStorageRawValue<string>(
      worker,
      STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    )
    return typeof raw === "string"
      ? JSON.parse(raw).profiles[0].telemetrySnapshot?.facts?.budgets?.[0]
      : undefined
  }
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect
    .poll(readBudget)
    .toMatchObject({ remaining: { status: "known", value: "70" } })
  const original = await readBudget()
  partial = true
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect.poll(readBudget).toMatchObject({
    limit: { status: "known", value: "120" },
    used: {
      status: "stale",
      value: "30",
      observedAt: original.used.observedAt,
    },
    remaining: {
      status: "stale",
      value: "70",
      observedAt: original.remaining.observedAt,
    },
  })
  await expect(panel).toContainText(/USD\s*70/)
  await expect(panel).toContainText("Last known")
  await expect(
    panel
      .locator(
        `time[datetime="${new Date(original.remaining.observedAt).toISOString()}"]`,
      )
      .first(),
  ).toBeVisible()
  await expect(
    page.getByText("Credential usage refreshed", { exact: true }),
  ).toHaveCount(0)
  await captureVisualViews({
    page,
    extensionDir,
    ready: panel,
    captureTarget: panel,
    id: "credential-partial-billing",
    views: [
      { id: "light", width: 1440, height: 900, theme: "light" },
      { id: "dark", width: 390, height: 900, theme: "dark" },
    ],
  })
  await page.reload()
  await waitForExtensionRoot(page)
  if (
    (await row
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
      .getAttribute("aria-expanded")) === "false"
  )
    await row
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
      .click()
  await expect(panel).toContainText(/USD\s*70/)
})

test("shows a reported Sub2API cost separately in the credential popup", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { currencyType: "CNY" })
  const baseUrl = "https://credential-usage.invalid"
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "reported-cost",
      name: "Sub2API fixture",
      baseUrl,
      telemetryConfig: { mode: "sub2apiUsage" },
    }),
  ])
  await context.route(`${baseUrl}/**`, (route) =>
    route.fulfill({ json: { usage: { today: { cost: 2.5 } } } }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getApiCredentialProfileRowTestId("reported-cost"),
  )
  await row
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
    .click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect
    .poll(async () => {
      const raw = await getPlasmoStorageRawValue<string>(
        worker,
        STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      )
      return typeof raw === "string"
        ? JSON.parse(raw).profiles[0].telemetrySnapshot?.facts?.usage?.todayCost
            ?.value
        : undefined
    })
    .toBe("2.5")
  await page.setViewportSize({ width: 380, height: 780 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  for (const { mode, amount } of [
    { mode: "CNY", amount: "¥18.00" },
    { mode: "original", amount: "USD 2.5" },
    { mode: "USD", amount: "USD 2.5" },
  ] as const) {
    await seedUserPreferences(worker, {
      currencyDisplay: mode,
      currencyType: mode === "original" ? "CNY" : mode,
    })
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
    await expect(
      page.getByRole("listitem").getByText(amount, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage),
    ).toHaveText(/USD\s*2\.5/)
    await page.screenshot({
      path: testInfo.outputPath(`popup-reported-credential-cost-${mode}.png`),
      animations: "disabled",
    })
  }
})

test("shows native custom spend and a rough runway after a credential refresh", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const baseUrl = "https://credential-native-cost.invalid"
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "native-cost",
      name: "Native cost fixture",
      baseUrl,
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "/usage",
          jsonPaths: { balanceUsd: "balance", todayCostUsd: "cost" },
          financialMapping: {
            asset: { kind: "currency", code: "CNY" },
            role: "available",
            scope: "credential",
          },
        },
      },
    }),
  ])
  await context.route(`${baseUrl}/usage`, (route) =>
    route.fulfill({ json: { balance: 30, cost: 3 } }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(getApiCredentialProfileRowTestId("native-cost"))
  await row
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
    .click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(panel.getByText(/About 10 days left/)).toBeVisible()
  await page.setViewportSize({ width: 380, height: 780 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  const cost = page.getByText("CNY 3", { exact: true })
  await expect(cost).toBeVisible()
  await captureVisualViews({
    page,
    ready: cost,
    id: "credential-native-cost",
    extensionDir,
  })
})

test("keeps Kimi inference available and negative cash separate in the credential details", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "kimi-inference",
      name: "Kimi inference",
      baseUrl: "https://api.moonshot.cn",
      telemetryConfig: { mode: "kimiOpenPlatformBalance" },
    }),
  ])
  await context.route("https://api.moonshot.cn/**", (route) =>
    route.fulfill({
      json: {
        status: true,
        code: 0,
        data: {
          available_balance: "10",
          cash_balance: "-2",
          voucher_balance: "10",
        },
      },
    }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getApiCredentialProfileRowTestId("kimi-inference"),
  )
  await row
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
    .click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(panel).toContainText("cash balance")
  await expect(panel).toContainText("Voucher")
  await expect(panel).toContainText(/-.*2/)
  await expect(panel).toContainText("10")
  await expect(panel).not.toContainText("CNY 8")
  await expect(
    page.getByText("Credential usage refreshed", { exact: true }),
  ).toBeHidden({ timeout: 15000 })
  await captureVisualViews({
    page,
    ready: panel,
    captureTarget: panel,
    id: "kimi-inference-parts",
    extensionDir,
  })
  const raw = await getPlasmoStorageRawValue<string>(
    worker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )
  const stored = typeof raw === "string" ? JSON.parse(raw) : raw
  expect(
    stored.profiles[0].telemetrySnapshot.facts.balanceSnapshot.positions,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "available",
        amount: expect.objectContaining({ value: "10" }),
      }),
      expect.objectContaining({
        cashClassification: "reported-cash",
        amount: expect.objectContaining({ value: "-2" }),
      }),
    ]),
  )
})

test("retains remaining-only plan capacity without inventing a total or healthy percentage", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "remaining-only",
      name: "Remaining-only plan",
      baseUrl: "https://api.kimi.com",
      telemetryConfig: { mode: "kimiQuota" },
    }),
  ])
  await context.route("https://api.kimi.com/**", (route) =>
    route.fulfill({ json: { usage: { remaining: 20 } } }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getApiCredentialProfileRowTestId("remaining-only"),
  )
  await row
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
    .click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(panel.getByText("Kimi quota", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Credential usage refreshed", { exact: true }),
  ).toBeHidden({ timeout: 15000 })
  await captureVisualViews({
    page,
    ready: panel,
    captureTarget: panel,
    id: "remaining-only-plan",
    extensionDir,
  })
  await expect(panel).toContainText("20")
  await expect(panel.getByText("20 Quota left", { exact: true })).toBeVisible()
  await expect(panel).toContainText("Total allowance not provided")
  await expect(panel).not.toContainText("100%")
  await expect(panel.getByRole("progressbar")).toHaveCount(0)
  const readSnapshot = async () => {
    const raw = await getPlasmoStorageRawValue<string>(
      worker,
      STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    )
    const stored = typeof raw === "string" ? JSON.parse(raw) : raw
    return stored?.profiles?.[0]?.telemetrySnapshot as
      ApiCredentialTelemetrySnapshot | undefined
  }
  await expect
    .poll(async () => (await readSnapshot())?.facts?.quota?.windows?.[0])
    .toMatchObject({ remaining: 20 })
  expect(
    (await readSnapshot())?.facts?.quota?.windows?.[0]?.remainingPercent,
  ).toBeUndefined()
  await page.reload()
  await waitForExtensionRoot(page)
  const toggle = row.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle,
  )
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click()
  await expect(panel).toContainText("20")
  await expect(panel).not.toContainText("100%")
})

test("keeps a failed refresh's percentage visible without a current quota meter", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const observedAt = Date.now() - 3_600_000
  const previous = {
    schemaVersion: 2 as const,
    health: { status: SiteHealthStatus.Healthy },
    lastSyncTime: observedAt,
    attempts: [],
    facts: normalizeTelemetryPatchToFacts(
      {
        quota: {
          windows: [
            { type: "fiveHour", unit: "percent", percentRemaining: 62 },
          ],
        },
      },
      "glmQuota",
      {
        profileId: "stale-percent",
        baseUrl: "https://quota.example",
        observedAt,
      },
    ),
  }
  const telemetrySnapshot = acceptTelemetrySnapshot(previous, {
    schemaVersion: 2,
    health: { status: SiteHealthStatus.Error },
    lastSyncTime: Date.now(),
    attempts: [],
    lastError: "Refresh failed",
  })
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "stale-percent",
      name: "Retained plan percentage",
      baseUrl: "https://quota.example",
      telemetrySnapshot,
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getApiCredentialProfileRowTestId("stale-percent"),
  )
  const telemetryToggle = row.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle,
  )
  if ((await telemetryToggle.getAttribute("aria-expanded")) === "false")
    await telemetryToggle.click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  await expect(panel.getByText("62% left", { exact: true })).toBeVisible()
  await expect(panel).toContainText("Last known")
  await expect(
    panel.locator(`time[datetime="${new Date(observedAt).toISOString()}"]`),
  ).toBeVisible()
  await expect(panel.getByRole("progressbar")).toHaveCount(0)
  await captureVisualViews({
    page,
    extensionDir,
    ready: panel,
    captureTarget: panel,
    id: "credential-stale-percentage",
    views: [
      { id: "light", width: 1280, height: 900, theme: "light" },
      { id: "dark", width: 390, height: 900, theme: "dark" },
    ],
  })
})
