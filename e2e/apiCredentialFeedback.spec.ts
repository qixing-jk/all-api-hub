import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileRowTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import { acceptTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/acceptance"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import { parseDeepSeekBalance } from "~/services/apiCredentialProfiles/telemetry/parsers"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { SiteHealthStatus } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const views = [
  { id: "light", width: 1440, height: 900, theme: "light" },
  { id: "dark", width: 390, height: 900, theme: "dark" },
] as const

test("keeps a fresh native component visible beside a retained legacy wallet reading", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const observedAt = now - 3600000
  const baseUrl = "https://legacy-components.invalid"
  const previous = {
    lastSyncTime: observedAt,
    health: { status: SiteHealthStatus.Healthy },
    attempts: [],
    facts: {
      balances: [
        {
          amount: 42,
          unit: { kind: "money" as const, currency: "USD", decimalPlaces: 2 },
          semantics: "legacy" as const,
          observedAt,
        },
      ],
    },
  }
  const snapshot = acceptTelemetrySnapshot(previous, {
    schemaVersion: 2,
    lastSyncTime: now,
    health: { status: SiteHealthStatus.Warning },
    attempts: [],
    facts: normalizeTelemetryPatchToFacts(
      parseDeepSeekBalance({
        balance_infos: [{ currency: "USD", granted_balance: "3" }],
      }),
      "deepSeekBalance",
      { profileId: "legacy-components", baseUrl, observedAt: now },
    ),
  })
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "legacy-components",
      name: "Legacy and native observations",
      baseUrl,
      telemetryConfig: { mode: "disabled" },
      telemetrySnapshot: snapshot,
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(
    getApiCredentialProfileRowTestId("legacy-components"),
  )
  const toggle = row.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle,
  )
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  await expect(panel).toContainText("$42.00")
  await expect(panel).toContainText(/USD\s*3/)
  await expect(panel).toContainText("Gift")
  await expect(panel).toContainText("Last known")
  await expect(
    panel.locator(`time[datetime="${new Date(observedAt).toISOString()}"]`),
  ).toBeVisible()
  const raw = await getPlasmoStorageRawValue<string>(
    worker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )
  const stored = typeof raw === "string" ? JSON.parse(raw) : raw
  expect(
    stored.profiles[0].telemetrySnapshot.facts.balanceSnapshot.positions[0]
      .amount,
  ).toMatchObject({ status: "unavailable" })
  await captureVisualViews({
    page,
    ready: panel,
    captureTarget: panel,
    id: "feedback-legacy-components",
    extensionDir,
    views: [...views],
  })
})

test("retains omitted quota operands with original times after an actual partial refresh", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const baseUrl = "https://feedback-plan.invalid"
  const resetTime = new Date(Date.now() + 7 * 86400000).toISOString()
  let partial = false
  await seedApiCredentialProfiles(worker, [
    createStoredApiCredentialProfile({
      id: "plan",
      name: "Partial plan observation",
      baseUrl,
      telemetryConfig: { mode: "kimiQuota" },
    }),
  ])
  await context.route(`${baseUrl}/**`, (route) =>
    route.fulfill({
      json: {
        usage: partial
          ? { remaining: 20, resetTime }
          : { limit: 100, remaining: 30, resetTime },
      },
    }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(getApiCredentialProfileRowTestId("plan"))
  await row
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle)
    .click()
  const panel = row.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel)
  const readWindow = async () => {
    const raw = await getPlasmoStorageRawValue<string>(
      worker,
      STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    )
    return typeof raw === "string"
      ? JSON.parse(raw).profiles[0].telemetrySnapshot?.facts?.quota
          ?.windows?.[0]
      : undefined
  }
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect.poll(readWindow).toMatchObject({ limit: 100, remaining: 30 })
  const original = await readWindow()
  await expect(
    page.getByText("Credential usage refreshed", { exact: true }),
  ).toHaveCount(0, { timeout: 15000 })
  await captureVisualViews({
    page,
    ready: panel,
    captureTarget: panel,
    id: "feedback-quota-before-partial",
    extensionDir,
    views: [...views],
  })
  partial = true
  await panel.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect.poll(readWindow).toMatchObject({
    remaining: 20,
    retainedAmounts: {
      limit: { status: "stale", value: 100, observedAt: original.observedAt },
    },
  })
  await expect(panel).toContainText("20 Quota left")
  await expect(panel).toContainText("Last known limit: 100")
  await expect(
    panel
      .locator(
        `time[datetime="${new Date(original.observedAt).toISOString()}"]`,
      )
      .first(),
  ).toBeVisible()
  await expect(panel.getByRole("progressbar")).toHaveCount(0)
  await expect(
    page.getByText("Credential usage refreshed", { exact: true }),
  ).toHaveCount(0, { timeout: 15000 })
  await captureVisualViews({
    page,
    ready: panel,
    captureTarget: panel,
    id: "feedback-quota-retained",
    extensionDir,
    views: [...views],
  })
})

test("renders stale native costs, exact decimals and captured quota scales in credential details", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const observedAt = Date.now() - 3600000
  const entries = [
    {
      id: "stale-cost",
      value: "3",
      asset: { kind: "currency", code: "CNY" },
      stale: true,
    },
    {
      id: "exact-cost",
      value: "9007199254740993.00000001",
      asset: { kind: "currency", code: "USD" },
      stale: false,
    },
    {
      id: "scaled-cost",
      value: "250",
      asset: {
        kind: "quota",
        id: "credits",
        label: "Raw credits",
        displayScale: 100,
        displayLabel: "Credits",
      },
      stale: false,
    },
  ] as const
  await seedApiCredentialProfiles(
    worker,
    entries.map((entry) => {
      const baseUrl = `https://${entry.id}.invalid`
      const original = {
        schemaVersion: 2 as const,
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: observedAt,
        lastSuccessTime: observedAt,
        attempts: [],
        source: "customReadOnlyEndpoint" as const,
        facts: normalizeTelemetryPatchToFacts(
          {
            todayCostUsd: entry.value,
            financialMapping: {
              asset: entry.asset,
              role: "available",
              scope: "credential",
            },
          },
          "customReadOnlyEndpoint",
          { profileId: entry.id, baseUrl, observedAt },
        ),
      }
      return createStoredApiCredentialProfile({
        id: entry.id,
        name: entry.id,
        baseUrl,
        telemetrySnapshot: entry.stale
          ? acceptTelemetrySnapshot(original, {
              lastSyncTime: Date.now(),
              attempts: [],
              health: { status: SiteHealthStatus.Warning },
            })
          : original,
      })
    }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  for (const entry of entries) {
    await page
      .getByPlaceholder("Search by name, base URL, tag, source page, or notes")
      .fill(entry.id)
    const row = page.getByTestId(getApiCredentialProfileRowTestId(entry.id))
    const toggle = row.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle,
    )
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click()
    const panel = row.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel,
    )
    if (entry.id === "stale-cost") {
      await expect(panel).toContainText(/CNY\s*3/)
      await expect(panel).toContainText("Last known")
      await expect(
        panel.locator(`time[datetime="${new Date(observedAt).toISOString()}"]`),
      ).toBeVisible()
    } else if (entry.id === "exact-cost") {
      await expect(panel).toContainText("9,007,199,254,740,993.00000001")
    } else {
      await expect(panel).toContainText("2.5 Credits")
    }
    await captureVisualViews({
      page,
      ready: panel,
      captureTarget: panel,
      id: `feedback-${entry.id}`,
      extensionDir,
      views: [...views],
    })
  }
})

test("shows translated coverage and duplicate warnings in the Chinese credential summary", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const now = Date.now()
  const baseUrl = "https://duplicate-wallet.invalid"
  await seedApiCredentialProfiles(
    worker,
    ["first", "second"].map((id) =>
      createStoredApiCredentialProfile({
        id,
        name: id,
        apiKey: `synthetic-${id}`,
        baseUrl,
        telemetrySnapshot: {
          schemaVersion: 2,
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: now,
          attempts: [],
          facts: normalizeTelemetryPatchToFacts(
            parseDeepSeekBalance({
              balance_infos: [{ currency: "USD", total_balance: "10" }],
            }),
            "deepSeekBalance",
            { profileId: id, baseUrl, observedAt: now },
          ),
        },
      }),
    ),
  )
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  const warning = page.getByText("可能重复的余额：1 项", { exact: true })
  await expect(warning).toBeVisible()
  await expect(page.getByText("可用余额", { exact: true })).toBeVisible()
  await expect(page.getByText(/部分覆盖/).first()).toBeVisible()
  await expect(
    page.getByText("account:financial.potentialDuplicates", { exact: true }),
  ).toHaveCount(0)
  const coverageBox = await page
    .getByText(/部分覆盖/)
    .first()
    .boundingBox()
  const warningBox = await warning.boundingBox()
  expect(warningBox!.y).toBeGreaterThanOrEqual(
    coverageBox!.y + coverageBox!.height - 1,
  )
  await captureVisualViews({
    page,
    ready: warning,
    id: "feedback-chinese-summary",
    extensionDir,
  })
})
