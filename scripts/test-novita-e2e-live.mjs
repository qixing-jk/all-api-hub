#!/usr/bin/env node
/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
  getAccountManagementSiteTypeOptionTestId,
} from "../src/features/AccountManagement/testIds.ts"
import { API_CREDENTIAL_PROFILES_TEST_IDS as profiles } from "../src/features/ApiCredentialProfiles/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { MODEL_LIST_TEST_IDS as models } from "../src/features/ModelList/testIds.ts"
import { TOKEN_PROVISIONING_TEST_IDS as provisioning } from "../src/features/TokenProvisioning/testIds.ts"
import { NOVITA_CONSOLE_CREDENTIAL_PREFIX } from "../src/services/apiService/novita/constants.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts, withTemporaryAccount } from "./cdp/sandbox.mjs"
import {
  configureExtensionPage,
  createUiCapture,
  dismissModals,
} from "./cdp/ui-driver.mjs"
import { readModelCatalog } from "./flows/model-catalog.mjs"
import {
  openNativeKeyEditor,
  submitNativeKeyEditor,
} from "./flows/native-key-editor.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

/**
 * Novita AI account-site CDP verification.
 *
 * Drives ordinary onboarding using the verified console bearer by default.
 * NOVITA_API_KEY explicitly exercises limited OpenAPI authentication instead.
 * --mutate exercises native CRUD on a disposable target and OpenAPI policy
 * writes through a separate disposable actor, with readback and cleanup.
 *
 * The temporary extension account and both run-owned provider keys are removed.
 *
 * Usage:
 *   NOVITA_API_KEY=sk_... pnpm e2e:cdp:novita -- --isolate
 *   pnpm e2e:cdp:novita -- --isolate --require-session --mutate
 *   pnpm e2e:cdp:novita -- --isolate --detect-only
 *   pnpm e2e:cdp:novita -- --isolate --credential-guide-only [--baseline]
 *   pnpm e2e:cdp:novita -- --isolate --credential-hint-only
 */
await loadLocalEnv()
applyIsolateFlag(process.argv)
const apiKey = (process.env.NOVITA_API_KEY || "").trim()
const detectOnly = process.argv.includes("--detect-only")
const mutate = process.argv.includes("--mutate")
const evidenceDir = path.resolve(
  process.env.NOVITA_EVIDENCE_DIR ||
    `.scratch/novita-adaptation/artifacts/cdp-${Date.now()}`,
)
await fs.mkdir(evidenceDir, { recursive: true })

/** Kept in sync with `src/constants/money.ts`; the runner is plain JS. */
const QUOTA_PER_USD = 500_000
const SITE_ORIGIN = "https://novita.ai"
const NOVITA_USER_INFO_URL = "https://api.novita.ai/openapi/v1/user/info"
const NOVITA_BALANCE_URL =
  "https://api.novita.ai/openapi/v1/billing/balance/detail"
const NOVITA_KEYS_URL =
  "https://api.novita.ai/openapi/v2/user/key?includePolicySummary=true&includeIpAccessPolicy=true"

const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(
    process.argv.includes("--dev")
      ? ".output/chrome-mv3-dev"
      : ".output/chrome-mv3",
  ),
})
const { extensionId } = dev
// Deterministic current-build badge acceptance; never issue or delete provider keys.
if (process.argv.includes("--credential-hint-only")) {
  const ui = await dev.context.newPage()
  let fixtureAccountId
  try {
    await ui.setViewportSize({ width: 1440, height: 1000 })
    await ui.emulateMedia({ reducedMotion: "reduce" })
    await ui.route("https://api.novita.ai/openapi/**", (route) => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/v2/user/key"))
        return route.fulfill({
          json: {
            keys: [
              {
                name: "Authentication candidate",
                stringId: "hint-fixture-key",
                maskedKey: "sk_hint****last",
                expireTime: "",
                modelAccessPolicy: {
                  mode: "all_enabled",
                  excludedModelCount: 0,
                },
              },
            ],
          },
        })
      return route.fulfill({ status: 404, json: {} })
    })
    await withTemporaryAccount(
      dev.serviceWorker,
      {
        site_type: "novita",
        site_url: SITE_ORIGIN,
        site_name: "Novita hint fixture",
        account_info: {
          id: "hint-fixture-user",
          username: "hint@example.com",
          access_token: "sk_hint-fixture-last",
        },
      },
      async (fixture) => {
        fixtureAccountId = fixture.id
        await ui.goto(
          `chrome-extension://${extensionId}/options.html?accountId=${fixture.id}#keys`,
        )
        await dismissModals(ui)
        const row = ui
          .getByTestId(keys.nativeKeyRow)
          .filter({ hasText: "Authentication candidate" })
        await expect(
          row.getByText("Possibly used for account authentication", {
            exact: true,
          }),
        ).toBeVisible()
        await row.screenshot({
          path: path.join(evidenceDir, "account-credential-candidate.png"),
          animations: "disabled",
        })
        const profileName = `Novita hint profile ${fixture.id}`
        try {
          await ui.goto(
            `chrome-extension://${extensionId}/options.html#apiCredentialProfiles`,
          )
          await dismissModals(ui)
          await ui.getByTestId(profiles.addButton).click()
          await ui.locator("#api-credential-profile-name").fill(profileName)
          await ui
            .locator("#api-credential-profile-baseUrl")
            .fill("https://api.novita.ai/openai")
          await ui
            .locator("#api-credential-profile-apiKey")
            .fill("sk_hint-fixture-last")
          await ui.getByTestId(profiles.dialogSaveButton).click()
          await expect(
            ui.getByRole("heading", { name: profileName, exact: true }),
          ).toBeVisible()
          await ui.goto(
            `chrome-extension://${extensionId}/options.html?accountId=${fixture.id}#keys`,
          )
          await row.getByTestId(keys.apiCredentialAssociationButton).click()
          await ui.getByTestId(keys.associateCredentialProfileSelect).click()
          await ui.getByRole("option").filter({ hasText: profileName }).click()
          await ui.getByTestId(keys.associateCredentialConfirmButton).click()
          await expect(
            row.getByText("Used by this account", { exact: true }),
          ).toBeVisible()
          await expect(
            row.getByText("Possibly used for account authentication", {
              exact: true,
            }),
          ).toHaveCount(0)
          await row.screenshot({
            path: path.join(evidenceDir, "account-credential-confirmed.png"),
            animations: "disabled",
          })
        } finally {
          // Remove only this run's profile and its links under the normal owner lock.
          await dev.serviceWorker.evaluate(async (name) => {
            await navigator.locks.request(
              "all-api-hub:api-credential-profiles",
              async () => {
                const key = "api_credential_profiles"
                const raw = (await chrome.storage.local.get(key))[key]
                const config = typeof raw === "string" ? JSON.parse(raw) : raw
                if (!config) return
                const ids = new Set(
                  config.profiles
                    .filter(
                      (profile) =>
                        profile.name === name &&
                        profile.apiKey === "sk_hint-fixture-last",
                    )
                    .map((profile) => profile.id),
                )
                config.profiles = config.profiles.filter(
                  (profile) => !ids.has(profile.id),
                )
                config.links = (config.links ?? []).filter(
                  (link) => !ids.has(link.profileId),
                )
                config.lastUpdated = Date.now()
                await chrome.storage.local.set({
                  [key]:
                    typeof raw === "string" ? JSON.stringify(config) : config,
                })
                const savedRaw = (await chrome.storage.local.get(key))[key]
                const saved =
                  typeof savedRaw === "string" ? JSON.parse(savedRaw) : savedRaw
                if (
                  saved.profiles.some((profile) => ids.has(profile.id)) ||
                  saved.links.some((link) => ids.has(link.profileId))
                )
                  throw new Error("fixture_profile_cleanup_failed")
              },
            )
          }, profileName)
        }
      },
    )
    assert.ok(
      !(await getAccounts(dev.serviceWorker)).some(
        (account) => account.id === fixtureAccountId,
      ),
    )
    await fs.writeFile(
      path.join(evidenceDir, "evidence.json"),
      JSON.stringify(
        {
          ok: true,
          extensionId,
          buildPath: path.resolve(".output/chrome-mv3"),
          checkedAt: new Date().toISOString(),
          fixture: true,
          providerWrites: false,
          checks: [
            "masked match shows possible account authentication badge",
            "linked plaintext matching the account credential updates badge immediately",
            "run-owned profile and links removed",
            "temporary fixture removed",
          ],
        },
        null,
        2,
      ),
    )
    console.log(`Novita credential hint acceptance: passed; ${evidenceDir}`)
  } finally {
    await ui.close()
    await dev.close()
  }
  process.exit(0)
}
// Live, read-only console acquisition; never save the draft or create provider keys.
if (
  process.argv.includes("--acquire-console-only") ||
  process.argv.includes("--auto-detect-only")
) {
  const ui = await dev.context.newPage()
  const identityTimings = []
  const recordIdentity = (request) => {
    const url = new URL(request.url())
    if (
      url.hostname === "api-server.novita.ai" &&
      url.pathname === "/v1/user/info"
    )
      identityTimings.push({
        path: url.pathname,
        durationMs: Math.round(request.timing().responseEnd),
      })
  }
  dev.context.on("requestfinished", recordIdentity)
  try {
    await configureExtensionPage(ui, { language: "en" })
    await ui.setViewportSize({ width: 1440, height: 1000 })
    await ui.emulateMedia({ reducedMotion: "reduce" })
    await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
    await dismissModals(ui)
    await ui.getByTestId(accounts.addAccountButton).click()
    await ui.getByTestId(accounts.siteUrlInput).fill(SITE_ORIGIN)
    const startedAt = Date.now()
    const autoDetectOnly = process.argv.includes("--auto-detect-only")
    if (!autoDetectOnly) {
      await ui.getByTestId(accounts.manualAddButton).click()
      await ui.getByTestId(accounts.siteTypeTrigger).click()
      await ui
        .getByTestId(getAccountManagementSiteTypeOptionTestId("novita"))
        .click()
    }
    const dialog = ui.getByTestId(accounts.accountDialog)
    const acquire = autoDetectOnly
      ? ui.getByTestId(accounts.autoDetectButton)
      : dialog.getByRole("button", {
          name: "Get console credential",
          exact: true,
        })
    await acquire.click()
    if (autoDetectOnly) {
      await expect
        .poll(
          async () =>
            (await ui
              .getByTestId(accounts.confirmAddButton)
              .isVisible()
              .catch(() => false)) ||
            (await acquire.isEnabled().catch(() => false)),
          { timeout: 60000 },
        )
        .toBe(true)
    } else await expect(acquire).toBeEnabled({ timeout: 60000 })
    const recognitionMs = Date.now() - startedAt
    await ui.screenshot({
      path: path.join(evidenceDir, "console-before-readback.png"),
      animations: "disabled",
    })
    const consoleInput = dialog.getByLabel(/^Console token/)
    await fs.writeFile(
      path.join(evidenceDir, "field-state.json"),
      JSON.stringify(
        {
          labels: await dialog.locator("label").allTextContents(),
          status: await dialog.getByRole("status").allTextContents(),
          errors: await dialog.locator('[role="alert"]').allTextContents(),
        },
        null,
        2,
      ),
    )
    const consoleValue = await consoleInput.inputValue()
    const acquired = Boolean(consoleValue)
    if (autoDetectOnly) {
      assert.equal(
        (await ui.getByTestId(accounts.accessTokenInput).inputValue()).length,
        0,
        "Automatic console detection must leave API Key empty",
      )
      await expect(
        dialog.getByRole("button", { name: "Verify API Key", exact: true }),
      ).toBeDisabled()
      await expect(dialog.getByRole("status")).toHaveText(
        /^Console token verified for /,
      )
      await expect(
        dialog.getByRole("button", { name: "Show API Key", exact: true }),
      ).toBeVisible()
      await expect(
        dialog.getByRole("button", { name: "Show console token", exact: true }),
      ).toBeVisible()
    }
    await ui.screenshot({
      path: path.join(evidenceDir, "console-acquisition.png"),
      animations: "disabled",
    })
    await fs.writeFile(
      path.join(evidenceDir, "acquisition.json"),
      JSON.stringify(
        {
          acquired,
          durationMs: recognitionMs,
          autoDetectOnly,
          identityTimings,
          extensionId,
          checkedAt: new Date().toISOString(),
          accountSaved: false,
          providerWrites: false,
          fieldError: await dialog.getByRole("status").allTextContents(),
        },
        null,
        2,
      ),
    )
    assert.ok(
      acquired,
      "Console acquisition must succeed with the authenticated Novita browser session",
    )
    if (autoDetectOnly && process.argv.includes("--edit-recovery")) {
      const userId = await ui.getByTestId(accounts.userIdInput).inputValue()
      const username = await ui.getByTestId(accounts.usernameInput).inputValue()
      await dialog.getByRole("button", { name: "Close", exact: true }).click()
      await ui.route("https://api-server.novita.ai/v1/user/info", (route) =>
        route.request().headers().authorization ===
        "Bearer fixture-expired-console"
          ? route.fulfill({ status: 401, json: { message: "expired fixture" } })
          : route.continue(),
      )
      await withTemporaryAccount(
        dev.serviceWorker,
        {
          site_type: "novita",
          site_url: SITE_ORIGIN,
          site_name: "Novita automatic recovery",
          account_info: {
            id: userId,
            username,
            access_token: "novita-console:fixture-expired-console",
          },
        },
        async (fixture) => {
          await ui.goto(
            `chrome-extension://${extensionId}/options.html#account`,
          )
          await ui.reload()
          await dismissModals(ui)
          await ui.screenshot({
            path: path.join(evidenceDir, "temporary-account-list.png"),
            animations: "disabled",
          })
          const row = ui.getByTestId(
            getAccountManagementListItemTestId(fixture.id),
          )
          await row.hover()
          await row.getByTestId(accounts.rowEditButton).click()
          const editDialog = ui.getByTestId(accounts.accountDialog)
          const token = editDialog.getByLabel(/^Console token/)
          const recoveryStart = Date.now()
          await editDialog
            .getByRole("button", { name: "Re-detect", exact: true })
            .click()
          await expect
            .poll(
              async () => {
                const value = await token.inputValue()
                return Boolean(value) && value !== "fixture-expired-console"
              },
              { timeout: 15000 },
            )
            .toBe(true)
          assert.equal(
            await ui.getByTestId(accounts.userIdInput).inputValue(),
            userId,
            "Recovery must keep the same account",
          )
          await ui.screenshot({
            path: path.join(evidenceDir, "edit-recovery.png"),
            animations: "disabled",
          })
          await fs.writeFile(
            path.join(evidenceDir, "recovery.json"),
            JSON.stringify(
              {
                recovered: true,
                recoveryMs: Date.now() - recoveryStart,
                accountSaved: false,
                providerWrites: false,
              },
              null,
              2,
            ),
          )
          await editDialog
            .getByRole("button", { name: "Close", exact: true })
            .click()
        },
      )
    }
    console.log("Novita live console acquisition passed")
  } finally {
    dev.context.off("requestfinished", recordIdentity)
    await ui.close()
    await dev.close()
  }
  process.exit(0)
}
// Read-only UI acceptance needs no provider login, account save or key issuance.
if (process.argv.includes("--credential-guide-only")) {
  const ui = await dev.context.newPage()
  const baseline = process.argv.includes("--baseline")
  const opened = []
  try {
    await ui.setViewportSize({ width: 1440, height: 1000 })
    await ui.emulateMedia({ reducedMotion: "reduce" })
    await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
    await dismissModals(ui)
    await ui.getByTestId(accounts.addAccountButton).click()
    await ui.getByTestId(accounts.siteUrlInput).fill(SITE_ORIGIN)
    await ui.getByTestId(accounts.manualAddButton).click()
    await ui.getByTestId(accounts.siteTypeTrigger).click()
    await ui
      .getByTestId(getAccountManagementSiteTypeOptionTestId("novita"))
      .click()
    const dialog = ui.getByTestId(accounts.accountDialog)
    const auth = ui.getByTestId(accounts.accountFormSectionAuth)
    await auth.scrollIntoViewIfNeeded()
    if (!baseline) {
      const title = await auth.getByText(/^API Key\s*\*?$/).boundingBox()
      const link = await auth
        .getByRole("button", {
          name: "Open Novita Key Management",
          exact: true,
        })
        .boundingBox()
      assert.ok(
        title && link,
        "API Key title and key-management link are visible",
      )
      assert.ok(
        Math.abs(title.y + title.height / 2 - (link.y + link.height / 2)) < 4,
        "Key management belongs on the API Key title row",
      )
      assert.ok(
        link.x > title.x + title.width,
        "Key management follows the API Key title",
      )
    }
    await auth.screenshot({
      path: path.join(evidenceDir, "credential-console.png"),
      animations: "disabled",
    })
    if (!baseline) {
      const verify = ui.getByRole("button", {
        name: "Verify API Key",
        exact: true,
      })
      await expect(verify).toBeDisabled()
      // Isolated UI fixture: exercise auto-verification without sending dummy keys
      // to the provider or changing any real account.
      await ui.route("https://api.novita.ai/openapi/v1/user/info", (route) =>
        route.fulfill({
          json: { uuid: "guidance-fixture", email: "guidance@example.com" },
        }),
      )
      await ui
        .getByTestId(accounts.accessTokenInput)
        .fill("sk_ui-guidance-only")
      await expect(verify).toBeEnabled()
      await expect(dialog.getByRole("status")).toHaveText(
        /API Key verified for guidance@example.com/,
      )
      await auth.screenshot({
        path: path.join(evidenceDir, "credential-api-key.png"),
        animations: "disabled",
      })
      const popup = dev.context.waitForEvent("page")
      await ui
        .getByRole("button", {
          name: "Open Novita Key Management",
          exact: true,
        })
        .click()
      const site = await popup
      opened.push(site)
      await expect(site).toHaveURL(/^https:\/\/novita\.ai\//)
      await site.waitForLoadState("domcontentloaded")
      assert.equal(new URL(site.url()).hostname, "novita.ai")
      await ui.bringToFront()
      await expect(ui.getByTestId(accounts.accessTokenInput)).toHaveValue(
        "sk_ui-guidance-only",
      )
      await expect(ui.getByTestId(accounts.accessTokenInput)).toHaveValue(
        "sk_ui-guidance-only",
      )
      await expect(ui.getByLabel("Console token", { exact: true })).toHaveValue(
        "",
      )
      await expect(
        ui.getByRole("button", { name: "Get console credential", exact: true }),
      ).toBeEnabled()
    }
    await fs.writeFile(
      path.join(evidenceDir, "evidence.json"),
      JSON.stringify(
        {
          ok: true,
          baseline,
          extensionId,
          buildPath: path.resolve(".output/chrome-mv3"),
          checkedAt: new Date().toISOString(),
          providerWrites: false,
          accountSaved: false,
          checks: baseline
            ? ["pre-change credential form"]
            : [
                "complementary API key and console sections",
                "acquisition guide",
                "empty-key validation guard",
                "automatic identity verification (fixture, no manual click)",
                "external handoff preserves draft",
                "console acquisition is available without clearing the API key",
              ],
        },
        null,
        2,
      ),
    )
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .click()
      .catch(() => {})
    console.log(
      `Novita credential guide ${baseline ? "baseline" : "acceptance"}: passed; ${evidenceDir}`,
    )
  } finally {
    for (const page of opened) await page.close().catch(() => {})
    await ui.close()
    await dev.close()
  }
  process.exit(0)
}
// Verify website identity independently of saved extension accounts. Only the
// page-local console session is used; never export it into account storage.
const sessionPage = await dev.context.newPage()
let consoleIdentity
try {
  await sessionPage.goto(`${SITE_ORIGIN}/console`, {
    waitUntil: "domcontentloaded",
  })
  consoleIdentity = await sessionPage.evaluate(async () => {
    const encoded = document.cookie
      .split("; ")
      .find((part) => part.startsWith("token="))
      ?.slice(6)
    if (!encoded) return null
    const response = await fetch("https://api-server.novita.ai/v1/user/info", {
      headers: { Authorization: `Bearer ${decodeURIComponent(encoded)}` },
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const user = await response.json()
    return typeof user.uuid === "string" && typeof user.email === "string"
      ? { id: user.uuid, username: user.email }
      : null
  })
} finally {
  await sessionPage.close()
}
if (process.argv.includes("--require-session"))
  assert.ok(consoleIdentity, "Authenticated Novita website session is required")
const ui = await dev.context.newPage()
await ui.setViewportSize({ width: 1920, height: 1080 })
await ui.emulateMedia({ reducedMotion: "reduce" })
await configureExtensionPage(ui, { language: "en", dismissUpdateLog: true })

const accountName = `AAH Novita ${randomUUID().slice(0, 8)}`
const stored = () => getAccounts(dev.serviceWorker)
const evidence = {
  capturedAt: new Date().toISOString(),
  worktree: process.cwd(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  extensionId,
  modes: { detectOnly, hasCredential: Boolean(apiKey) },
  checks: [],
  screenshots: [],
  cleanup: {},
}
let accountId
let succeeded = false
let managementCredential = ""
let createdKeyId
let policyActorId
let startingKeyIds

const capture = createUiCapture({
  page: ui,
  directory: evidenceDir,
  screenshots: evidence.screenshots,
  fallbackToPage: true,
  timeoutMs: 8000,
})

/** Reads one Novita OpenAPI endpoint with the supplied key (read-only). */
const readProvider = async (url) => {
  const target = apiKey
    ? url
    : url.replace(
        "https://api.novita.ai/openapi",
        "https://api-server.novita.ai",
      )
  const response = await dev.context.request.get(target, {
    headers: { Authorization: `Bearer ${apiKey || managementCredential}` },
  })
  assert.ok(response.ok(), `${url} must answer 200 for the supplied key`)
  return await response.json()
}

const dialog = () => ui.getByTestId(accounts.accountDialog)

const readDetectionState = async () => {
  const dialogText = await dialog()
    .innerText()
    .catch(() => "")
  const errorVisible = await ui
    .getByTestId(accounts.autoDetectErrorMessage)
    .isVisible()
    .catch(() => false)
  const errorText = errorVisible
    ? await ui
        .getByTestId(accounts.autoDetectErrorMessage)
        .innerText()
        .catch(() => "")
    : ""
  const siteTypeText = await ui
    .getByTestId(accounts.siteTypeTrigger)
    .innerText()
    .catch(() => "")
  const tokenFieldVisible = await ui
    .getByTestId(accounts.accessTokenInput)
    .isVisible()
    .catch(() => false)
  return {
    dialogText,
    errorVisible,
    errorText,
    siteTypeText,
    tokenFieldVisible,
  }
}

try {
  await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
  await ui.waitForLoadState("domcontentloaded")
  await dismissModals(ui)

  // 1. Ordinary onboarding start: fresh add-account form.
  await ui.getByTestId(accounts.addAccountButton).click()
  await dialog().waitFor({ state: "visible", timeout: 10000 })
  await ui.getByTestId(accounts.siteUrlInput).fill(SITE_ORIGIN)

  const beforeDetect = await readDetectionState()
  evidence.entryState = {
    siteTypeText: beforeDetect.siteTypeText,
    tokenFieldVisible: beforeDetect.tokenFieldVisible,
  }
  await capture("00-add-account-form")

  // 2. Site-type detection for the token-only site.
  await ui.getByTestId(accounts.autoDetectButton).click()
  await expect
    .poll(
      async () =>
        (await ui
          .getByTestId(accounts.confirmAddButton)
          .isVisible()
          .catch(() => false)) ||
        (await ui
          .getByTestId(accounts.autoDetectButton)
          .isEnabled()
          .catch(() => false)),
      { timeout: 60000 },
    )
    .toBe(true)
  const afterDetect = await readDetectionState()
  evidence.detection = {
    siteTypeText: afterDetect.siteTypeText,
    errorVisible: afterDetect.errorVisible,
    errorText: afterDetect.errorText,
    tokenFieldVisible: afterDetect.tokenFieldVisible,
  }
  await capture("01-detection-result")

  assert.match(
    afterDetect.siteTypeText,
    /novita/i,
    "Detection must classify https://novita.ai as the novita site type",
  )
  await expect(ui.getByTestId(accounts.siteNameInput)).toHaveValue("Novita AI")
  if (consoleIdentity) {
    await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
      consoleIdentity.id,
    )
    await expect(ui.getByTestId(accounts.usernameInput)).toHaveValue(
      consoleIdentity.username,
    )
    await expect(ui.getByTestId(accounts.accessTokenInput)).toHaveValue(
      /^novita-console:/,
    )
    managementCredential = (
      await ui.getByTestId(accounts.accessTokenInput).inputValue()
    ).slice(NOVITA_CONSOLE_CREDENTIAL_PREFIX.length)
    evidence.checks.push(
      "signed-in website identity and console bearer acquired without creating an inference key",
    )
  }
  await expect(
    ui
      .getByTestId(accounts.accountFormSectionBalance)
      .locator('input[type="number"]')
      .first(),
  ).toHaveValue("7.2")
  if (!consoleIdentity) {
    const keyManagement = dialog().getByRole("button", {
      name: "Open Key Management",
      exact: true,
    })
    await expect(keyManagement).toBeVisible()
    const keyPagePromise = dev.context.waitForEvent("page")
    await keyManagement.click()
    const keyPage = await keyPagePromise
    try {
      await keyPage.waitForURL(
        (url) =>
          url.origin === SITE_ORIGIN &&
          (url.pathname === "/settings/key-management" ||
            (url.pathname === "/user/login" &&
              url.searchParams.get("redirect") === "/settings/key-management")),
        { timeout: 30000, waitUntil: "domcontentloaded" },
      )
      evidence.handoffRequiresLogin =
        new URL(keyPage.url()).pathname === "/user/login"
      await expect(ui.getByTestId(accounts.accessTokenInput)).toBeFocused()
    } finally {
      await keyPage.close()
      await ui.bringToFront()
    }
    evidence.checks.push(
      "provider name, API-key auth, default exchange rate and key-management handoff retained",
    )
    await capture("01-onboarding-guide")
  }
  evidence.checks.push(
    "hostname detection classified novita.ai; detection result captured",
  )

  // Novita guidance must tell the user how to obtain the key (console only).
  const guidancePresent =
    /novita/i.test(afterDetect.dialogText) &&
    /key-management|settings\/key|API key/i.test(afterDetect.dialogText)
  evidence.guidancePresent = guidancePresent

  if (detectOnly || (!apiKey && !consoleIdentity)) {
    evidence.checks.push(
      guidancePresent
        ? "novita-specific credential guidance visible in the ordinary form"
        : "NO novita-specific credential guidance: the form shows only the generic access-token field",
    )
    await capture("02-detection-only")
    // Detection-only mode succeeds once the site type and guidance are verified.
    succeeded = true
  } else {
    // 3. Verify the provider contract independently of the extension.
    const providerUser = await readProvider(NOVITA_USER_INFO_URL)
    const providerBalance = await readProvider(NOVITA_BALANCE_URL)
    const providerKeys = await readProvider(NOVITA_KEYS_URL)
    startingKeyIds = providerKeys.keys.map((key) => key.stringId)
    const availableUsd = Number(providerBalance.availableBalance) / 10_000
    evidence.provider = {
      uuid: providerUser.uuid,
      keyCount: Array.isArray(providerKeys.keys)
        ? providerKeys.keys.length
        : null,
      availableUsd,
    }

    // 4. Credential entry. Detection cannot obtain this credential, so the
    // footer keeps Auto Detect / Manual Add until the form becomes valid.
    const tokenField = ui.getByTestId(accounts.accessTokenInput)
    await tokenField.waitFor({ state: "visible", timeout: 20000 })
    if (apiKey) await tokenField.fill(apiKey)
    const siteName = ui.getByTestId(accounts.siteNameInput)
    if (await siteName.isVisible().catch(() => false)) {
      await siteName.fill(accountName)
    }
    // A manual add needs a valid exchange rate before the form becomes valid;
    // until then the footer keeps offering Auto Detect / Manual Add.
    const exchangeRate = ui
      .getByTestId(accounts.accountFormSectionBalance)
      .locator('input[type="number"]')
      .first()
    if (await exchangeRate.isVisible().catch(() => false)) {
      await exchangeRate.fill("7.2")
    }
    const manualAdd = ui.getByTestId(accounts.manualAddButton)
    if (await manualAdd.isVisible().catch(() => false)) {
      await manualAdd.click()
    }
    await ui
      .getByTestId(accounts.confirmAddButton)
      .waitFor({ state: "visible", timeout: 20000 })
    evidence.checks.push("credential entered and confirm action available")
    await capture("02-credential-entered")

    await ui.getByTestId(accounts.confirmAddButton).click()
    await expect
      .poll(
        async () => {
          const duplicate = ui.getByTestId(
            accounts.duplicateWarningContinueButton,
          )
          if (await duplicate.isVisible().catch(() => false)) {
            await duplicate.click()
          }
          return (await stored()).find(
            (account) => account.site_name === accountName,
          )?.id
        },
        { timeout: 60000 },
      )
      .toBeTruthy()

    const saved = (await stored()).find(
      (account) => account.site_name === accountName,
    )
    accountId = saved.id
    assert.equal(saved.site_type, "novita", "saved site type must be novita")
    assert.equal(saved.authType, "access_token")
    assert.equal(
      saved.account_info.id,
      providerUser.uuid,
      "saved identity must be the OpenAPI account uuid",
    )
    evidence.identity = saved.account_info.id

    // 5. Balance mapping: availableBalance (1/10000 USD) -> product quota.
    await expect
      .poll(
        async () =>
          (await stored()).find((account) => account.id === accountId)
            ?.account_info.quota,
        { timeout: 60000 },
      )
      .toBe(Math.round(availableUsd * QUOTA_PER_USD))
    evidence.checks.push(
      "save persisted site type, uuid identity and USD balance quota",
    )

    const card = ui.getByTestId(
      `account-management-account-list-item-${accountId}`,
    )
    await dismissModals(ui)
    await card.waitFor({ state: "visible", timeout: 30000 })
    await capture("03-account-card", card)

    // 6. Balance refresh through the account row.
    await card
      .getByTitle(/Click to refresh balance|点击刷新余额/)
      .click({ timeout: 15000 })
      .catch(async (error) => {
        evidence.checks.push(
          `refresh click unavailable: ${String(error).slice(0, 80)}`,
        )
        throw error
      })
    await expect
      .poll(
        async () =>
          (await stored()).find((account) => account.id === accountId)?.health
            ?.status,
        { timeout: 60000 },
      )
      .toBe("healthy")
    evidence.checks.push("account refresh completed with healthy status")
    await capture("04-account-refreshed", card)

    // 7. Read-only key inventory.
    await ui.goto(
      `chrome-extension://${extensionId}/options.html?accountId=${accountId}&workspace=account#keys`,
    )
    await dismissModals(ui)
    await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
      evidence.provider.keyCount,
      { timeout: 60000 },
    )
    const firstRowText = await ui
      .getByTestId(keys.nativeKeyRow)
      .first()
      .innerText()
      .catch(() => "")
    evidence.keyRowText = firstRowText.slice(0, 200)
    evidence.checks.push(
      `key inventory rendered ${evidence.provider.keyCount} masked row(s)`,
    )
    await capture("05-key-inventory")

    if (mutate) {
      assert.ok(
        !apiKey && managementCredential,
        "Mutation suite requires console onboarding",
      )
      const keyName = `aah-cdp-${randomUUID().slice(0, 8)}`
      const editor = await openNativeKeyEditor(ui, {
        trigger: ui.getByTestId(keys.addTokenButton),
        readyField: ui.locator("#resource-editor-name"),
      })
      await editor
        .locator("#resource-editor-name")
        .waitFor({ state: "visible", timeout: 30000 })
      await editor.locator("#resource-editor-name").fill(keyName)
      await editor.locator("#resource-editor-lifecycle").click()
      await ui.getByRole("option", { name: "24 hours", exact: true }).click()
      await editor.locator("#resource-editor-ip_restricted").click()
      await editor
        .locator("#resource-editor-allowed_ips")
        .fill("192.0.2.1\n198.51.100.0/24")
      const availableModels = await readProvider(
        "https://api.novita.ai/openapi/v1/user/whitelist/available-llm-models",
      )
      const excludedModel = availableModels.models[0].modelName
      const modelPicker = editor.getByRole("combobox", {
        name: "Excluded models",
        exact: true,
      })
      await expect(modelPicker).toBeEnabled({ timeout: 30000 })
      await modelPicker.click()
      await ui.getByRole("option", { name: excludedModel, exact: true }).click()
      if ((await modelPicker.getAttribute("aria-expanded")) === "true")
        await modelPicker.press("Escape")
      await editor.locator("#resource-editor-name").click()
      await capture("05a-key-create-editor", editor)
      await submitNativeKeyEditor(ui, { waitForClose: false })
      await expect
        .poll(
          async () => {
            const inventory = await readProvider(NOVITA_KEYS_URL)
            createdKeyId = inventory.keys.find(
              (key) => key.name === keyName,
            )?.stringId
            return createdKeyId
          },
          { timeout: 90000 },
        )
        .toBeTruthy()
      // A response-only secret must be shown for explicit acknowledgement.
      const secretDialog = ui
        .getByRole("dialog")
        .filter({ has: ui.getByTestId(provisioning.oneTimeKeyInput) })
      await expect(secretDialog).toBeVisible({ timeout: 20000 })
      await capture("05b-created-key-secret", secretDialog)
      await ui.getByTestId(provisioning.oneTimeKeyCloseButton).click()
      const discardSecret = ui.getByTestId(
        provisioning.oneTimeKeyConfirmCloseButton,
      )
      if (await discardSecret.isVisible().catch(() => false))
        await discardSecret.click()
      const row = ui.getByTestId(keys.nativeKeyRow).filter({ hasText: keyName })
      await row.getByRole("button", { name: /edit/i }).click()
      await expect(editor.locator("#resource-editor-name")).toHaveValue(
        keyName,
        { timeout: 30000 },
      )
      await expect(editor.locator("#resource-editor-allowed_ips")).toHaveValue(
        "192.0.2.1\n198.51.100.0/24",
      )
      await expect(editor.locator("#resource-editor-lifecycle")).toHaveCount(0)
      await expect(
        editor.getByText(excludedModel, { exact: true }),
      ).toBeVisible({ timeout: 30000 })
      await editor.locator("#resource-editor-model_mode").click()
      await ui
        .getByRole("option", { name: "Selected models only", exact: true })
        .click()
      const allowedPicker = editor.getByRole("combobox", {
        name: "Allowed models",
        exact: true,
      })
      await expect(allowedPicker).toBeEnabled({ timeout: 30000 })
      await allowedPicker.click()
      await ui.getByRole("option", { name: excludedModel, exact: true }).click()
      if ((await allowedPicker.getAttribute("aria-expanded")) === "true")
        await allowedPicker.press("Escape")
      await editor.locator("#resource-editor-name").fill(`${keyName}-renamed`)
      await capture("05c-key-edit-editor", editor)
      await submitNativeKeyEditor(ui, { waitForClose: false })
      const renamed = ui
        .getByTestId(keys.nativeKeyRow)
        .filter({ hasText: `${keyName}-renamed` })
      await expect(renamed).toBeVisible({ timeout: 90000 })
      await capture("05d-key-updated", renamed)
      const updated = (await readProvider(NOVITA_KEYS_URL)).keys.find(
        (key) => key.stringId === createdKeyId,
      )
      assert.equal(updated.name, `${keyName}-renamed`)
      const ips = await readProvider(
        `https://api.novita.ai/openapi/v2/user/key/${createdKeyId}/ip-access-policy`,
      )
      assert.deepEqual(ips.policy.allowedIps, ["192.0.2.1", "198.51.100.0/24"])
      const modelPolicy = await readProvider(
        `https://api.novita.ai/openapi/v2/user/key/${createdKeyId}/model-access-policy`,
      )
      assert.equal(modelPolicy.policy.mode, "selected")
      assert.deepEqual(modelPolicy.policy.allowedModels, [
        { type: "llm", id: excludedModel },
      ])
      assert.deepEqual(modelPolicy.policy.excludedModels, [])
      assert.ok(
        Date.parse(updated.expireTime.replace(" ", "T") + "Z") > Date.now(),
      )
      // The OpenAPI credential edits a different run-owned key so a test IP
      // allowlist cannot lock the actor out. Never mutate an original key.
      const actorResponse = await dev.context.request.post(
        "https://api-server.novita.ai/v2/user/key",
        {
          headers: { Authorization: `Bearer ${managementCredential}` },
          data: {
            name: `${keyName}-policy-actor`,
            expireTime: new Date(Date.now() + 86400000)
              .toISOString()
              .slice(0, 19)
              .replace("T", " "),
          },
        },
      )
      assert.ok(actorResponse.ok(), "Disposable OpenAPI actor creation failed")
      const actor = await actorResponse.json()
      policyActorId = actor.id
      assert.ok(policyActorId && actor.apiKey?.startsWith("sk_"))
      const openApiHeaders = { Authorization: `Bearer ${actor.apiKey}` }
      const policyUrl = `https://api.novita.ai/openapi/v2/user/key/${createdKeyId}`
      const selectedPolicy = {
        ...modelPolicy.policy,
        allowedModels: [
          { type: "llm", id: availableModels.models[1].modelName },
        ],
      }
      const policyWrite = await dev.context.request.put(
        `${policyUrl}/model-access-policy`,
        { headers: openApiHeaders, data: selectedPolicy },
      )
      assert.ok(policyWrite.ok(), "OpenAPI model-policy update failed")
      const ipWrite = await dev.context.request.put(
        `${policyUrl}/ip-access-policy`,
        { headers: openApiHeaders, data: { allowedIps: ["203.0.113.2"] } },
      )
      assert.ok(ipWrite.ok(), "OpenAPI IP-policy update failed")
      for (const [endpoint, expected] of [
        ["model-access-policy", selectedPolicy],
        ["ip-access-policy", { allowedIps: ["203.0.113.2"] }],
      ]) {
        const response = await dev.context.request.get(
          `${policyUrl}/${endpoint}`,
          { headers: openApiHeaders },
        )
        assert.ok(response.ok(), "OpenAPI policy readback failed")
        assert.deepEqual((await response.json()).policy, expected)
      }
      const afterPolicies = (await readProvider(NOVITA_KEYS_URL)).keys.find(
        (key) => key.stringId === createdKeyId,
      )
      assert.equal(afterPolicies.name, updated.name)
      assert.equal(afterPolicies.expireTime, updated.expireTime)
      const actorDelete = await dev.context.request.delete(
        `https://api-server.novita.ai/v2/user/key/${policyActorId}`,
        { headers: { Authorization: `Bearer ${managementCredential}` } },
      )
      assert.ok(actorDelete.ok(), "Disposable OpenAPI actor cleanup failed")
      assert.ok(
        !(await readProvider(NOVITA_KEYS_URL)).keys.some(
          (key) => key.stringId === policyActorId,
        ),
      )
      policyActorId = undefined
      evidence.checks.push(
        "real sk_ OpenAPI model/IP-policy writes and authoritative readback preserve name and expiry; disposable actor removed",
      )
      await renamed.getByRole("button", { name: /delete/i }).click()
      await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
      await expect(renamed).toHaveCount(0, { timeout: 30000 })
      const restored = await readProvider(NOVITA_KEYS_URL)
      assert.deepEqual(
        restored.keys.map((key) => key.stringId).sort(),
        startingKeyIds.slice().sort(),
      )
      createdKeyId = undefined
      evidence.checks.push(
        "console-key create (24h, model exclusion, IP/CIDR), one-time secret, reopen, rename/selected-model edit with IP preservation, and delete restored inventory",
      )
    }

    // 8. Provider model catalog with pricing.
    await ui.goto(
      `chrome-extension://${extensionId}/options.html?accountId=${accountId}#models`,
    )
    await dismissModals(ui)
    await readModelCatalog({ page: ui, accountId, timeoutMs: 60000 })
    await expect
      .poll(async () => ui.getByTestId(models.modelExpandButton).count(), {
        timeout: 60000,
      })
      .toBeGreaterThan(0)
    // The list is virtualized, so read the reported catalog total instead of
    // counting mounted rows.
    await expect
      .poll(
        async () => {
          const text = await ui
            .getByText(/Total \d+ models/)
            .first()
            .innerText()
            .catch(() => "")
          return Number(text.match(/(\d+)/)?.[1] ?? 0)
        },
        { timeout: 60000 },
      )
      .toBeGreaterThan(0)
    const totalText = await ui
      .getByText(/Total \d+ models/)
      .first()
      .innerText()
      .catch(() => "")
    evidence.modelRows = Number(totalText.match(/(\d+)/)?.[1] ?? 0)
    evidence.checks.push(
      `model catalog rendered ${evidence.modelRows} provider models with prices`,
    )
    await capture("06-model-catalog")
    succeeded = true
  }
} catch (error) {
  evidence.error = String(error?.message ?? error).slice(0, 500)
  await capture("99-failure")
  process.exitCode = 1
} finally {
  const cleanupErrors = []
  if (policyActorId) {
    try {
      const response = await dev.context.request.delete(
        `https://api-server.novita.ai/v2/user/key/${policyActorId}`,
        { headers: { Authorization: `Bearer ${managementCredential}` } },
      )
      assert.ok(response.ok(), "OpenAPI actor cleanup failed")
      assert.ok(
        !(await readProvider(NOVITA_KEYS_URL)).keys.some(
          (key) => key.stringId === policyActorId,
        ),
      )
      evidence.cleanup.removedPolicyActor = true
    } catch (error) {
      cleanupErrors.push(`policy-actor: ${String(error)}`)
    }
  }
  if (createdKeyId) {
    try {
      const response = await dev.context.request.delete(
        `https://api-server.novita.ai/v2/user/key/${encodeURIComponent(createdKeyId)}`,
        { headers: { Authorization: `Bearer ${managementCredential}` } },
      )
      assert.ok(response.ok(), "Disposable key cleanup failed")
      const restored = await readProvider(NOVITA_KEYS_URL)
      assert.deepEqual(
        restored.keys.map((key) => key.stringId).sort(),
        startingKeyIds.slice().sort(),
      )
      evidence.cleanup.removedProviderKey = true
    } catch (error) {
      cleanupErrors.push(`provider-key: ${String(error)}`)
    }
  }
  try {
    accountId ??= (await stored()).find(
      (account) => account.site_name === accountName,
    )?.id
    if (accountId) {
      await dev.serviceWorker.evaluate(async (id) => {
        await navigator.locks.request(
          "all-api-hub:account-storage",
          async () => {
            const raw = (await chrome.storage.local.get("site_accounts"))
              .site_accounts
            const envelope = typeof raw === "string" ? JSON.parse(raw) : raw
            envelope.accounts = envelope.accounts.filter(
              (account) => account.id !== id,
            )
            envelope.last_updated = Date.now()
            await chrome.storage.local.set({
              site_accounts: JSON.stringify(envelope),
            })
          },
        )
      }, accountId)
      assert.ok(!(await stored()).some((account) => account.id === accountId))
      evidence.cleanup.removedTemporaryAccount = true
    }
  } catch (error) {
    cleanupErrors.push(`account: ${String(error)}`)
  }
  if (cleanupErrors.length) {
    evidence.cleanup.error = cleanupErrors.join("; ")
    succeeded = false
    process.exitCode = 1
  }
  evidence.ok = succeeded
  evidence.finishedAt = new Date().toISOString()
  await fs.writeFile(
    path.join(evidenceDir, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        ok: evidence.ok,
        extensionId,
        detection: evidence.detection,
        guidancePresent: evidence.guidancePresent,
        providers: evidence.provider,
        checks: evidence.checks,
        evidenceDir,
      },
      null,
      1,
    ),
  )
  await ui.close().catch(() => {})
  await dev.close()
}
