/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { expect, request as playwrightRequest } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
} from "../../../src/features/AccountManagement/testIds.ts"
import {
  getApiCredentialProfileRowTestId,
  API_CREDENTIAL_PROFILES_TEST_IDS as profiles,
} from "../../../src/features/ApiCredentialProfiles/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../../../src/features/KeyManagement/testIds.ts"
import { TOKEN_PROVISIONING_TEST_IDS as provisioning } from "../../../src/features/TokenProvisioning/testIds.ts"
import { PMPLAN_WEB_ORIGIN as origin } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "../../../src/services/core/storageKeys.ts"
import { getAccounts, withUiCreatedAccount } from "../../cdp/sandbox.mjs"
import {
  configureExtensionPage,
  createUiCapture,
  dismissModals,
} from "../../cdp/ui-driver.mjs"
import { runUiScenarios } from "../../cdp/ui-scenarios.mjs"
import { readModelCatalog } from "../../flows/model-catalog.mjs"
import { openNativeKeyEditor } from "../../flows/native-key-editor.mjs"
import { revokePmplanKeys } from "./keyCleanup.mjs"
import { submitPmplanKeyCreation } from "./keyCreation.mjs"
import { openPmplanPage } from "./navigation.mjs"

const localDateTime = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
const parseStore = (value) =>
  typeof value === "string" ? JSON.parse(value) : value
async function readProfiles(worker) {
  return (
    parseStore(
      await worker.evaluate(
        (key) =>
          new Promise((resolve) =>
            chrome.storage.local.get(key, (result) => resolve(result[key])),
          ),
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      ),
    ) ?? { profiles: [], links: [] }
  )
}

/** Use a fresh automatic UI save; clean only confirmed run-owned keys, profiles and accounts. */
export async function runPmplanUi({
  context,
  serviceWorker,
  extensionId,
  evidenceDir,
  write,
}) {
  let ui, site, privateFields, capture
  const evidence = {
    capturedAt: new Date().toISOString(),
    extensionId,
    screenshots: [],
    cleanup: {},
    scenarios: [],
  }

  const captureFailure = async () => {
    try {
      await ui.bringToFront()
      await ui.screenshot({
        path: path.join(evidenceDir, "failure.png"),
        animations: "disabled",
        mask: privateFields,
        timeout: 10000,
      })
    } catch (error) {
      evidence.captureError = error.message
    }
    try {
      await fs.writeFile(
        path.join(evidenceDir, "failure-dom.txt"),
        await ui.locator("body").innerText(),
      )
    } catch (error) {
      evidence.domCaptureError = error.message
    }
  }
  const nativeRead = async (endpoint) => {
    if (site.isClosed()) throw Error("Native read page closed")
    return site.evaluate(async (endpoint) => {
      const response = await fetch(endpoint, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw Error(`Native read failed: ${response.status}`)
      return response.json()
    }, endpoint)
  }
  let accountId, createdSecret, createdProfileId, profileSecret
  const confirmedIds = new Set()
  const ownedNativeTabIds = new Set()
  const navigate = async (hash) => {
    await ui.goto(`chrome-extension://${extensionId}/options.html#${hash}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    })
    await ui
      .getByTestId("options-app")
      .waitFor({ state: "visible", timeout: 120000 })
    await dismissModals(ui)
  }
  const selectExpiry = async (label) => {
    await ui.locator("#resource-editor-expiry").click()
    await ui.getByRole("option", { name: label, exact: true }).click()
  }
  const card = () =>
    ui.getByTestId(getAccountManagementListItemTestId(accountId))
  const row = (id) =>
    ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${id}"]`))
  const closeEditor = async () => {
    await ui
      .getByTestId(keys.nativeEditor)
      .getByRole("button", { name: "Cancel", exact: true })
      .click()
    const discard = ui.getByRole("button", {
      name: "Discard changes",
      exact: true,
    })
    if (
      await discard.waitFor({ state: "visible", timeout: 1500 }).then(
        () => true,
        () => false,
      )
    )
      await discard.click()
    await expect(ui.getByTestId(keys.nativeEditor)).toBeHidden()
  }
  const removeProfile = async () => {
    if (!createdProfileId) return
    const data = await readProfiles(serviceWorker)
    const owned = data.profiles.find(
      (profile) => profile.id === createdProfileId,
    )
    if (!owned) {
      evidence.cleanup.profileRemoved = true
      return
    }
    assert.ok(
      owned.apiKey === profileSecret,
      "Refuse to remove an altered profile",
    )
    await navigate("apiCredentialProfiles")
    const profileRow = ui.getByTestId(
      getApiCredentialProfileRowTestId(createdProfileId),
    )
    await profileRow.getByTestId(profiles.deleteTriggerButton).click()
    await ui.getByTestId(profiles.deleteConfirmButton).click()
    await expect
      .poll(async () =>
        (await readProfiles(serviceWorker)).profiles.some(
          (profile) => profile.id === createdProfileId,
        ),
      )
      .toBe(false)
    evidence.cleanup.profileRemoved = true
  }
  const revokeOwned = async () => {
    if (!write) return
    await revokePmplanKeys({
      site,
      ids: confirmedIds,
      readKeys: async () => (await nativeRead("/api/keys")).keys,
    })
    evidence.cleanup.revokedIds = [...confirmedIds]
  }
  return runScenarioWithCleanup({
    run: async () => {
      ui = await context.newPage()
      site = await context.newPage()
      privateFields = [
        ui.locator("#account-session-cookie"),
        ui.getByTestId(provisioning.oneTimeKeyInput),
      ]
      capture = createUiCapture({
        page: ui,
        directory: evidenceDir,
        screenshots: evidence.screenshots,
        mask: privateFields,
        bringToFront: true,
        timeoutMs: 10000,
      })
      ui.setDefaultTimeout(30000)
      await ui.emulateMedia({ reducedMotion: "reduce" })
      await configureExtensionPage(ui, {
        language: "en",
        viewport: { width: 1440, height: 1000 },
        dismissUpdateLog: true,
      })
      // Capture the copy result in this owned page without changing the user's clipboard.
      await ui.addInitScript(() => {
        Object.defineProperty(navigator.clipboard, "writeText", {
          configurable: true,
          value: async (value) => {
            window.__aahPmplanClipboard = value
          },
        })
      })

      await site.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
      const initial = await nativeRead("/api/me")
      const nativeCatalog = await nativeRead("/api/model-square")
      const nativeModels = (await nativeRead("/api/models")).models
      assert.ok(
        Number.isSafeInteger(initial.user?.id) && initial.user.id > 0,
        "PM-Plan login required",
      )
      if (process.env.PMPLAN_USER_ID)
        assert.equal(String(initial.user.id), process.env.PMPLAN_USER_ID)
      const baselineKeys = (await nativeRead("/api/keys")).keys
      const baselineProfiles = await readProfiles(serviceWorker)
      return withUiCreatedAccount(
        serviceWorker,
        async (name) => {
          await navigate("account")
          await ui.getByTestId(accounts.addAccountButton).click()
          await ui.getByTestId(accounts.siteUrlInput).fill(origin)
          const grant = ui.getByTestId(accounts.cookiePermissionGrantButton)
          if (await grant.isVisible()) await grant.click()
          await expect(
            ui.getByTestId(accounts.authTypeTrigger),
          ).toHaveAttribute("data-auth-type", "cookie")
          await ui.getByTestId(accounts.autoDetectButton).click()
          await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
            String(initial.user.id),
            { timeout: 60000 },
          )
          await expect(ui.getByTestId(accounts.siteTypeTrigger)).toContainText(
            "pmplan",
          )
          await expect(ui.getByTestId(accounts.usernameInput)).toHaveValue(
            initial.user.username,
          )
          await ui.getByTestId(accounts.siteNameInput).fill(name)
          await expect(ui.getByTestId(accounts.confirmAddButton)).toBeEnabled()
          await capture(
            "01-onboarding.png",
            ui.getByTestId(accounts.accountDialog),
          )
          await ui.getByTestId(accounts.confirmAddButton).click()
          const duplicate = ui.getByTestId(
            accounts.duplicateWarningContinueButton,
          )
          if (
            await duplicate.waitFor({ state: "visible", timeout: 3000 }).then(
              () => true,
              () => false,
            )
          )
            await duplicate.click()
        },
        async (saved) => {
          accountId = saved.id
          // Account saves intentionally defer their first refresh. Preserve the
          // mounted page until that refresh has persisted before reopening it.
          await expect
            .poll(
              async () => {
                saved = (await getAccounts(serviceWorker)).find(
                  (account) => account.id === accountId,
                )
                evidence.onboardingRefresh = {
                  healthStatus: saved?.health?.status,
                  hasNativeAllowance: Boolean(
                    saved?.account_info.allowances?.entries.length,
                  ),
                }
                return evidence.onboardingRefresh
              },
              { timeout: 60000 },
            )
            .toEqual({ healthStatus: "healthy", hasNativeAllowance: true })
          evidence.account = {
            id: accountId,
            siteType: saved.site_type,
            userId: String(saved.account_info.id),
          }
          assert.equal(saved.site_type, "pmplan")
          assert.equal(saved.authType, "cookie")
          assert.equal(saved.account_info.access_token, "")
          assert.equal(String(saved.account_info.id), String(initial.user.id))
          const scenarios = [
            {
              id: "onboarding-reopen",
              covers: ["account.type.identity.persist", "checkin.default-off"],
              run: async () => {
                await navigate("account")
                await card().getByTestId(accounts.rowEditButton).click()
                await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
                  String(initial.user.id),
                )
                await expect(
                  ui.getByTestId(accounts.authTypeTrigger),
                ).toHaveAttribute("data-auth-type", "cookie")
                await expect(
                  ui.getByTestId(accounts.siteTypeTrigger),
                ).toContainText("pmplan")
                assert.equal(saved.checkIn.automaticExecutionEnabled, false)
                await ui
                  .getByTestId(accounts.accountDialog)
                  .getByRole("button", { name: "Cancel", exact: true })
                  .click()
              },
            },
            {
              id: "allowances-and-today",
              covers: [
                "allowances.native-units",
                "today.server-day",
                "checkin.status",
              ],
              run: async () => {
                await expect(card()).toBeVisible()
                const nativeBefore = await nativeRead("/api/me")
                const previousSync = (await getAccounts(serviceWorker)).find(
                  (a) => a.id === accountId,
                ).last_sync_time
                await card().hover()
                await card().getByTestId(accounts.rowMoreActionsButton).click()
                await ui.getByTestId(accounts.rowRefreshMenuItem).click()
                await expect
                  .poll(
                    async () =>
                      (await getAccounts(serviceWorker)).find(
                        (a) => a.id === accountId,
                      )?.last_sync_time,
                  )
                  .toBeGreaterThan(previousSync)
                const observed = await nativeRead("/api/me")
                assert.equal(
                  observed.user.id,
                  initial.user.id,
                  "Native console identity changed",
                )
                const usageFacts = ({ usage, daily_usage, checkin }) => ({
                  usage,
                  daily_usage,
                  today: checkin.today,
                })
                if (
                  !isDeepStrictEqual(
                    usageFacts(nativeBefore),
                    usageFacts(observed),
                  )
                )
                  return {
                    skipped: true,
                    reason:
                      "Native usage changed during refresh; repeat with a stable fixture",
                  }
                const windows = [
                  ["h5", "5H"],
                  ["weekly", "7D"],
                  ["monthly", "30D"],
                ]
                const finite = windows.filter(
                  ([scope]) => observed.usage[`${scope}_limit`] !== null,
                )
                const expected = finite.length
                  ? Math.min(
                      ...finite.map(
                        ([scope]) =>
                          Math.max(
                            0,
                            observed.usage[`${scope}_limit`] -
                              observed.usage[`${scope}_used`],
                          ) / 1e6,
                      ),
                    )
                  : 0
                const current = (await getAccounts(serviceWorker)).find(
                  (a) => a.id === accountId,
                )
                assert.equal(
                  finite.length
                    ? Number(
                        current.account_info.allowances.entries[0].constraint
                          .remaining.value,
                      )
                    : 0,
                  expected,
                )
                await card()
                  .getByRole("button", {
                    name: "Balance details",
                    exact: true,
                  })
                  .click()
                const popover = ui
                  .getByRole("dialog")
                  .filter({ hasText: "Balance details" })
                await expect(popover).toContainText("Rolling")
                for (const [, scope] of windows)
                  await expect(popover).toContainText(scope)
                await capture("02-allowances.png", popover)
                await ui.keyboard.press("Escape")
                await capture("03-account.png", card())
                const daily = observed.daily_usage.find(
                  (point) => point.day === observed.checkin.today.slice(5),
                )
                assert.ok(daily)
                assert.equal(
                  current.account_info.today_requests_count,
                  daily.requests,
                )
                assert.equal(
                  current.account_info.todayStatsAvailability.tokens.reason,
                  "unsupported",
                )
                assert.equal(
                  current.checkIn.methodKnowledge.methods[
                    "pmplan:daily-checkin"
                  ].status.requiresManualVerification,
                  true,
                )
              },
            },
            {
              id: "refresh-no-site-tab",
              covers: ["saved-cookie.background-independence"],
              run: async () => {
                const consoleOpen = () =>
                  context
                    .pages()
                    .some(
                      (candidate) =>
                        candidate !== ui &&
                        candidate !== site &&
                        !candidate.isClosed() &&
                        candidate.url().startsWith(`${origin}/`),
                    )
                if (consoleOpen())
                  return {
                    skipped: true,
                    reason:
                      "Other PM-Plan tabs belong to the operator; close them to establish tab-free refresh",
                  }
                await site.close()
                let consoleAppeared = false
                const observeConsole = (candidate) => {
                  if (candidate.url().startsWith(`${origin}/`))
                    consoleAppeared = true
                  candidate.on("framenavigated", onNavigation)
                }
                const onNavigation = (frame) => {
                  if (frame.url().startsWith(`${origin}/`))
                    consoleAppeared = true
                }
                context.on("page", observeConsole)
                for (const candidate of context.pages())
                  candidate.on("framenavigated", onNavigation)
                try {
                  const before = (await getAccounts(serviceWorker)).find(
                    (a) => a.id === accountId,
                  ).last_sync_time
                  await card()
                    .getByTestId(accounts.rowMoreActionsButton)
                    .click()
                  await ui.getByTestId(accounts.rowRefreshMenuItem).click()
                  await expect
                    .poll(
                      async () => {
                        const current = (await getAccounts(serviceWorker)).find(
                          (a) => a.id === accountId,
                        )
                        return {
                          advanced: current?.last_sync_time > before,
                          healthy: current?.health?.status === "healthy",
                          hasNativeAllowance: Boolean(
                            current?.account_info.allowances?.entries.length,
                          ),
                        }
                      },
                      { timeout: 60000 },
                    )
                    .toEqual({
                      advanced: true,
                      healthy: true,
                      hasNativeAllowance: true,
                    })
                  if (consoleAppeared || consoleOpen())
                    return {
                      skipped: true,
                      reason:
                        "A console tab appeared during refresh; tab-free coverage is unverified",
                    }
                } finally {
                  context.off("page", observeConsole)
                  for (const candidate of context.pages())
                    candidate.off("framenavigated", onNavigation)
                  site = await context.newPage()
                  await site.goto(`${origin}/`, {
                    waitUntil: "domcontentloaded",
                  })
                }
              },
            },
            {
              id: "navigation-and-action-gates",
              covers: [
                "navigation.keys",
                "navigation.native-usage",
                "navigation.unsupported-actions",
              ],
              run: async () => {
                await navigate("account")
                await card().getByTestId(accounts.rowMoreActionsButton).click()
                await expect(
                  ui.getByTestId(accounts.rowKeyManagementMenuItem),
                ).toBeVisible()
                await ui.getByTestId(accounts.rowKeyManagementMenuItem).click()
                await expect(ui.getByTestId(keys.addTokenButton)).toBeVisible()
                await navigate("account")
                await card().getByTestId(accounts.rowMoreActionsButton).click()
                await ui
                  .getByRole("menuitem", {
                    name: "Related pages",
                    exact: true,
                  })
                  .hover()
                await expect(
                  ui.getByTestId(accounts.rowRedeemMenuItem),
                ).toHaveCount(0)
                const usageTabId = await openPmplanPage({
                  page: ui,
                  url: `${origin}/#/usage`,
                  action: () =>
                    ui.getByTestId(accounts.rowUsageLogMenuItem).click(),
                  ownedTabIds: ownedNativeTabIds,
                })
                await serviceWorker.evaluate(
                  (id) => chrome.tabs.remove(id),
                  usageTabId,
                )
                ownedNativeTabIds.delete(usageTabId)
                await ui.keyboard.press("Escape")
                await card().getByTestId(accounts.rowMoreActionsButton).click()
                await ui
                  .getByRole("menuitem", { name: "Share", exact: true })
                  .hover()
                await expect(
                  ui.getByTestId(accounts.rowCopyInviteLinkMenuItem),
                ).toHaveAttribute("aria-disabled", "true")
                await ui.keyboard.press("Escape")
                await ui.keyboard.press("Escape")
              },
            },
            {
              id: "editor-defaults-presets-models-cancel",
              covers: [
                "keys.editor.expiry-presets",
                "keys.editor.custom-validation",
                "keys.editor.models.clear",
                "keys.editor.cancel",
              ],
              run: async () => {
                await navigate(`keys?accountId=${accountId}`)
                const editor = await openNativeKeyEditor(ui, {
                  trigger: ui.getByTestId(keys.addTokenButton),
                  readyField: ui.locator("#resource-editor-expiry"),
                })
                await expect(
                  ui.locator("#resource-editor-expiry"),
                ).toContainText("Never expires")
                await expect(
                  editor.getByRole("textbox", {
                    name: "Token Name",
                    exact: true,
                  }),
                ).toHaveCount(0)
                await expect(
                  editor.getByLabel("Available Models", { exact: true }),
                ).toBeVisible()
                await capture("04-default-key-editor.png", editor)
                const labels = [
                  "+7 days",
                  "30 days",
                  "90 days",
                  "Never expires",
                  "Custom time",
                ]
                for (let index = 0; index < labels.length; index++) {
                  await selectExpiry(labels[index])
                  await expect(
                    ui.locator("#resource-editor-expiry"),
                  ).toContainText(labels[index])
                  await expect(
                    editor.locator('input[type="datetime-local"]'),
                  ).toHaveCount(index === 4 ? 1 : 0)
                }
                const invalidExpiry = localDateTime(
                  new Date(Date.now() - 86400000),
                )
                await editor
                  .locator('input[type="datetime-local"]')
                  .fill(invalidExpiry)
                if (write) {
                  await submitPmplanKeyCreation({
                    page: ui,
                    write,
                    input: {
                      expires_at: new Date(invalidExpiry).toISOString(),
                      models: [],
                    },
                    confirmedIds,
                    existingIds: new Set(baselineKeys.map((key) => key.id)),
                    evidenceDir,
                    expectValidationError: true,
                  })
                }
                await editor
                  .locator('input[type="datetime-local"]')
                  .fill(localDateTime(new Date(Date.now() + 2 * 86400000)))
                await expect(editor).not.toContainText("Enter a valid value.")
                const modelInput = editor.getByRole("combobox", {
                  name: "Available Models",
                  exact: true,
                })
                const modelName = nativeModels[0]?.name
                assert.ok(
                  modelName,
                  "A native account-available model is required for selection coverage",
                )
                await modelInput.fill(modelName)
                await ui
                  .getByRole("option", { name: modelName, exact: true })
                  .click()
                await editor
                  .getByRole("button", {
                    name: "Cancel selection",
                    exact: true,
                  })
                  .click()
                await expect(
                  editor.getByRole("button", {
                    name: "Cancel selection",
                    exact: true,
                  }),
                ).toBeDisabled()
                await capture("04-key-editor.png", editor)
                await closeEditor()
                if (!write)
                  return {
                    skipped: true,
                    reason:
                      "Custom expiry submission is checked only in --write mode",
                  }
                await openNativeKeyEditor(ui, {
                  trigger: ui.getByTestId(keys.addTokenButton),
                  readyField: ui.locator("#resource-editor-expiry"),
                })
                await expect(
                  ui.locator("#resource-editor-expiry"),
                ).toContainText("Never expires")
                await closeEditor()
              },
            },
            {
              id: "account-model-square",
              covers: [
                "models.account-scope",
                "models.eligibility",
                "pricing.catalog-names",
              ],
              run: async () => {
                await navigate("account")
                await card().getByTestId(accounts.rowMoreActionsButton).click()
                await ui
                  .getByTestId(accounts.rowModelManagementMenuItem)
                  .click()
                const { modelDisplay } = await readModelCatalog({
                  page: ui,
                  accountId,
                  requirePrices: false,
                  timeoutMs: 60000,
                })
                await ui
                  .getByRole("button", {
                    name: "Copy All Model Names",
                    exact: true,
                  })
                  .click()
                await expect
                  .poll(() => ui.evaluate(() => window.__aahPmplanClipboard))
                  .toBeTruthy()
                const names = (
                  await ui.evaluate(() => window.__aahPmplanClipboard)
                )
                  .split(",")
                  .filter(Boolean)
                assert.equal(names.length, nativeCatalog.total)
                assert.deepEqual(
                  names.map((name) => name.trim()).sort(),
                  nativeCatalog.models.map((model) => model.name).sort(),
                )
                await capture("05-account-models.png", modelDisplay)
              },
            },
            {
              id: "key-create-save-reopen-runtime-revoke",
              covers: [
                "keys.disposable.create.readback",
                "one-time-secret.copy.save",
                "local-profile.link.reload",
                "runtime-key.models.no-cookie",
                "keys.revoke.readback",
              ],
              prerequisite: () =>
                write
                  ? undefined
                  : "Pass --write to authorize disposable key creation and revocation",
              run: async () => {
                const create = async ({ never = false } = {}) => {
                  await navigate(`keys?accountId=${accountId}`)
                  const editor = await openNativeKeyEditor(ui, {
                    trigger: ui.getByTestId(keys.addTokenButton),
                    readyField: ui.locator("#resource-editor-expiry"),
                  })
                  await selectExpiry(never ? "Never expires" : "Custom time")
                  const expectedExpiry = localDateTime(
                    new Date(Date.now() + 2 * 86400000),
                  )
                  const selectedModel = nativeModels[0].name
                  if (!never) {
                    await editor
                      .locator('input[type="datetime-local"]')
                      .fill(expectedExpiry)
                    await editor
                      .getByRole("combobox", {
                        name: "Available Models",
                        exact: true,
                      })
                      .fill(selectedModel)
                    await ui
                      .getByRole("option", {
                        name: selectedModel,
                        exact: true,
                      })
                      .click()
                  }
                  const { id: createdId, key: responseSecret } =
                    await submitPmplanKeyCreation({
                      page: ui,
                      write,
                      input: {
                        expires_at: never
                          ? null
                          : new Date(expectedExpiry).toISOString(),
                        models: never ? [] : [selectedModel],
                      },
                      confirmedIds,
                      existingIds: new Set(baselineKeys.map((key) => key.id)),
                      evidenceDir,
                    })
                  await expect(
                    ui.getByTestId(provisioning.oneTimeKeyInput),
                  ).toBeVisible({ timeout: 60000 })
                  createdSecret = await ui
                    .getByTestId(provisioning.oneTimeKeyInput)
                    .inputValue()
                  assert.ok(
                    /^sk-pm-/.test(createdSecret),
                    "Unexpected native key format",
                  )
                  assert.equal(createdSecret, responseSecret)
                  assert.ok(
                    createdId && confirmedIds.has(createdId),
                    "Creation response must confirm the cleanup ID; do not replay a dispatched create",
                  )
                  const item = (await nativeRead("/api/keys")).keys.find(
                    (key) => key.id === createdId,
                  )
                  assert.ok(
                    item && !baselineKeys.some((key) => key.id === createdId),
                  )
                  assert.equal(item.status, "active")
                  assert.equal(item.all_models, never)
                  assert.deepEqual(item.models, never ? [] : [selectedModel])
                  if (never) assert.equal(item.expires_at, null)
                  else
                    assert.equal(
                      Date.parse(item.expires_at),
                      new Date(expectedExpiry).getTime(),
                    )
                  await expect
                    .poll(() =>
                      ui.evaluate(
                        (expected) => window.__aahPmplanClipboard === expected,
                        createdSecret,
                      ),
                    )
                    .toBe(true)
                  return {
                    id: createdId,
                    secret: createdSecret,
                    selectedModel,
                  }
                }
                const active = await create()
                const isolated = await playwrightRequest.newContext()
                let runtimeIds
                try {
                  const response = await isolated.get(`${origin}/v1/models`, {
                    headers: { Authorization: `Bearer ${active.secret}` },
                    timeout: 15000,
                    maxRedirects: 0,
                  })
                  const bodyText = await response.text()
                  await fs.writeFile(
                    path.join(evidenceDir, "runtime-models.json"),
                    JSON.stringify(
                      { status: response.status(), bodyText },
                      null,
                      2,
                    ),
                  )
                  assert.equal(
                    response.status(),
                    200,
                    "Runtime model discovery must work without a console login",
                  )
                  const body = JSON.parse(bodyText)
                  runtimeIds = body.data.map((model) => model.id)
                  assert.ok(runtimeIds.includes(active.selectedModel))
                } finally {
                  await isolated.dispose()
                }
                profileSecret = active.secret
                await expect(
                  ui.getByTestId(provisioning.oneTimeKeySaveButton),
                ).toBeEnabled()
                await ui.getByTestId(provisioning.oneTimeKeySaveButton).click()
                await expect
                  .poll(
                    async () => {
                      const data = await readProfiles(serviceWorker)
                      const profile = data.profiles.find(
                        (profile) =>
                          profile.apiKey === active.secret &&
                          !baselineProfiles.profiles.some(
                            (old) => old.id === profile.id,
                          ),
                      )
                      createdProfileId = profile?.id
                      return Boolean(profile)
                    },
                    { timeout: 30000 },
                  )
                  .toBe(true)
                const savedProfile = (
                  await readProfiles(serviceWorker)
                ).profiles.find((profile) => profile.id === createdProfileId)
                assert.equal(savedProfile.baseUrl, origin)
                assert.equal(savedProfile.apiType, "openai-compatible")
                assert.ok(
                  (await readProfiles(serviceWorker)).links.some(
                    (link) =>
                      link.profileId === createdProfileId &&
                      link.state === "active" &&
                      link.locator.ref?.accountId === accountId &&
                      link.locator.ref?.resourceId === String(active.id),
                  ),
                )
                await ui.getByTestId(provisioning.oneTimeKeyCloseButton).click()
                await ui.reload({ waitUntil: "domcontentloaded" })
                const inventoryFailure = ui.getByText("Failed to load keys", {
                  exact: true,
                })
                await expect
                  .poll(
                    async () =>
                      Boolean(await row(active.id).count()) ||
                      (await inventoryFailure.isVisible()),
                    { timeout: 30000 },
                  )
                  .toBe(true)
                if (await inventoryFailure.isVisible()) {
                  await capture(
                    "06-reload-error.png",
                    ui.getByTestId("options-app"),
                  )
                  evidence.inventoryReadRetried = true
                  await ui
                    .getByRole("button", {
                      name: "Refresh Key List",
                      exact: true,
                    })
                    .last()
                    .click()
                }
                await expect(
                  row(active.id).getByTestId(
                    keys.linkedProfileExportMenuButton,
                  ),
                ).toBeVisible({ timeout: 45000 })
                await expect(
                  row(active.id).getByRole("button", {
                    name: "Revoke key",
                    exact: true,
                  }),
                ).toBeEnabled()
                await expect(
                  row(active.id).getByRole("button", {
                    name: "Edit key",
                    exact: true,
                  }),
                ).toBeEnabled()
                await capture("06-created-associated-key.png", row(active.id))
                await navigate("apiCredentialProfiles")
                const profileRow = ui.getByTestId(
                  getApiCredentialProfileRowTestId(createdProfileId),
                )
                await profileRow.getByTestId(profiles.copyBundleButton).click()
                const bundle = await ui.evaluate(
                  () => window.__aahPmplanClipboard,
                )
                assert.ok(
                  bundle.includes(origin) && bundle.includes(active.secret),
                )
                await profileRow
                  .getByTestId(profiles.openModelManagementButton)
                  .click()
                await expect(ui.getByTestId("model-list-page")).toHaveAttribute(
                  "data-model-source",
                  `profile:${createdProfileId}`,
                  { timeout: 60000 },
                )
                const modelDisplay = ui.getByTestId("model-list-display")
                await expect(modelDisplay.locator("h3").first()).toBeVisible({
                  timeout: 60000,
                })
                await ui
                  .getByRole("button", {
                    name: "Copy All Model Names",
                    exact: true,
                  })
                  .click()
                await expect
                  .poll(
                    async () =>
                      JSON.stringify(
                        (await ui.evaluate(() => window.__aahPmplanClipboard))
                          .split(",")
                          .filter(Boolean)
                          .sort(),
                      ) === JSON.stringify([...runtimeIds].sort()),
                  )
                  .toBe(true)
                await capture("07-runtime-models.png", modelDisplay)
                const revoke = async (id) => {
                  await navigate(`keys?accountId=${accountId}`)
                  await row(id)
                    .getByRole("button", { name: "Revoke key", exact: true })
                    .click()
                  const acknowledge = ui.getByTestId(
                    keys.nativeDeleteCredentialAcknowledge,
                  )
                  if (await acknowledge.isVisible()) await acknowledge.check()
                  await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
                  await expect
                    .poll(
                      async () =>
                        (await nativeRead("/api/keys")).keys.find(
                          (key) => key.id === id,
                        )?.status,
                      { timeout: 30000 },
                    )
                    .toBe("revoked")
                  await expect(
                    row(id).getByRole("button", {
                      name: "Revoke key",
                      exact: true,
                    }),
                  ).toHaveCount(0)
                }
                await revoke(active.id)
                // Null expiry and dynamic models are the other native payload branch.
                const dynamic = await create({ never: true })
                await ui.getByTestId(provisioning.oneTimeKeyCloseButton).click()
                await revoke(dynamic.id)
                await capture(
                  "08-revoked-keys.png",
                  ui.getByTestId(keys.nativeKeyRow).first(),
                )
                const final = (await nativeRead("/api/keys")).keys
                for (const key of baselineKeys)
                  assert.deepEqual(
                    final.find((item) => item.id === key.id),
                    key,
                    "An existing native key changed",
                  )
                assert.deepEqual(
                  final
                    .filter(
                      (item) => !baselineKeys.some((old) => old.id === item.id),
                    )
                    .map((item) => item.id)
                    .sort(),
                  [...confirmedIds].sort(),
                )
                evidence.nativeKeys = {
                  createdIds: [...confirmedIds],
                  revoked: true,
                  existingKeysUnchanged: true,
                  runtimeModelIds: runtimeIds,
                }
              },
            },
          ]
          const result = await runUiScenarios({
            scenarios,
            selected: scenarios.map(({ id }) => id),
          })
          evidence.scenarios = result.scenarios
          if (!result.ok) {
            await captureFailure()
          }
          return { ok: result.ok }
        },
      ).catch(async (error) => {
        evidence.error = {
          message: error.message,
          causes: error.errors?.map((error) => error.message),
        }
        await captureFailure()
        throw error
      })
    },
    finalizers: [
      ...[
        revokeOwned,
        removeProfile,
        async () => {
          const errors = []
          for (const id of ownedNativeTabIds) {
            try {
              await serviceWorker.evaluate((id) => chrome.tabs.remove(id), id)
            } catch (error) {
              errors.push(error)
            }
          }
          if (errors.length)
            throw new AggregateError(
              errors,
              "Owned navigation tab cleanup failed",
            )
        },
        () => ui?.close(),
        () => site?.close(),
      ].map((finalizer) => async () => {
        try {
          await finalizer()
        } catch (error) {
          evidence.cleanup.errors ??= []
          evidence.cleanup.errors.push(error.message)
          throw error
        }
      }),
      async () => {
        await fs.mkdir(evidenceDir, { recursive: true })
        await fs.writeFile(
          path.join(evidenceDir, "ui-report.json"),
          JSON.stringify(evidence, null, 2),
        )
      },
    ],
    cleanupMessage: "PM-Plan resource cleanup failed",
    failureMessage: "PM-Plan UI execution and cleanup failed",
  })
}
