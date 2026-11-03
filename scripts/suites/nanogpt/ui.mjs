import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"
import { QUOTA_PER_USD } from "../../../src/constants/money.ts"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
} from "../../../src/features/AccountManagement/testIds.ts"
import { NANOGPT_WEB_ORIGIN } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { connectWorktreeExtension } from "../../cdp/client.mjs"
import { reloadRunningExtension } from "../../cdp/reload.mjs"
import {
  getAccounts,
  withTemporaryAccount,
  withUiCreatedAccount,
} from "../../cdp/sandbox.mjs"
import {
  createUiCapture,
  navigateExtensionPage,
  openExtensionPage,
} from "../../cdp/ui-driver.mjs"
import {
  assertAccountDetectionOutcome,
  closeAccountDraft,
  openAccountAddDialog,
} from "../../flows/auto-detect.mjs"
import { readModelCatalog } from "../../flows/model-catalog.mjs"
import { readNanoGptCredential } from "./probe.mjs"

/** Exercise the current-tab UI against a native session across extension and page reloads. */
export async function runNanoGptCurrentTabDetection(options) {
  const identity = await readNativeIdentity(options)
  if (!identity)
    return { skipped: true, reason: "missing_authenticated_console_session" }
  const site = await options.context.newPage()
  const stages = []
  let replacement
  return runScenarioWithCleanup({
    run: async () => {
      await site.goto(NANOGPT_WEB_ORIGIN, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })
      for (const stage of [
        "fresh-tab",
        "extension-reloaded",
        "page-refreshed",
      ]) {
        if (stage === "extension-reloaded") {
          await reloadRunningExtension(
            Number(new URL(options.cdpUrl).port),
            options.extensionPath,
          )
          replacement = await connectWorktreeExtension(options)
        }
        if (stage === "page-refreshed")
          await site.reload({ waitUntil: "domcontentloaded" })
        const page = await openExtensionPage({
          ...(replacement ?? options),
          route: "popup.html",
          language: "en",
          viewport: { width: 520, height: 960 },
          dismissUpdateLog: true,
        })
        const events = []
        const pending = []
        page.on("console", (message) => {
          if (!message.text().includes("[AccountDetection]")) return
          pending.push(
            (async () => {
              const details = await message.args()[1]?.jsonValue()
              if (details) {
                for (const entry of details.events ?? [details])
                  events.push({
                    event:
                      entry.event ??
                      message
                        .text()
                        .split("[AccountDetection] ")[1]
                        ?.split(" ")[0],
                    success: entry.success,
                    strategy: entry.strategy,
                    reason: entry.reason,
                  })
              }
            })(),
          )
        })
        const capture = createUiCapture({
          page,
          directory: options.evidenceDir,
        })
        try {
          await site.bringToFront()
          await page
            .getByTestId(accounts.addAccountButton)
            .or(page.getByTestId(accounts.emptyStateAddAccountButton))
            .first()
            .click()
          const dialog = page.getByTestId(accounts.accountDialog)
          await expect(dialog.getByTestId(accounts.siteUrlInput)).toHaveValue(
            NANOGPT_WEB_ORIGIN,
          )
          await dialog.getByTestId(accounts.autoDetectButton).click()
          await assertAccountDetectionOutcome({
            page,
            expectedType: "nanogpt",
            fields: {
              usernameInput: identity.username,
              userIdInput: identity.depositAddress,
              accessTokenInput: "",
            },
            saveState: "absent",
            guidance: "Complete NanoGPT credentials",
            timeoutMs: 60000,
          })
          await expect
            .poll(
              async () => {
                await Promise.all(pending)
                return events.some(
                  (event) =>
                    event.event === "site_detection_finished" &&
                    event.success === true &&
                    event.strategy === "current_tab",
                )
              },
              {
                message: "Popup must read the current tab session",
                timeout: 10000,
              },
            )
            .toBe(true)
          await capture(`${stage}-passed`, dialog)
          stages.push({ stage, status: "passed", events })
        } catch (error) {
          stages.push({ stage, status: "failed", error: error.message, events })
          await capture(`${stage}-failed`).catch((captureError) => {
            stages.at(-1).captureError = captureError.message
          })
        } finally {
          await Promise.all(pending)
          await fs.writeFile(
            path.join(options.evidenceDir, "current-tab.json"),
            JSON.stringify(stages, null, 2),
          )
          await page.close()
        }
      }
      assert.equal(
        stages.filter((stage) => stage.status === "failed").length,
        0,
        "Current-tab detection failed; inspect current-tab.json",
      )
      return { ok: true }
    },
    finalizers: [() => site.close(), () => replacement?.close()],
    cleanupMessage: "Current-tab detection cleanup failed",
    failureMessage: "Current-tab detection and cleanup failed",
  })
}

async function openOptions(options, route = "options.html#account") {
  const page = await openExtensionPage({
    ...options,
    route,
    language: "en",
    viewport: { width: 1280, height: 960 },
    dismissUpdateLog: true,
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page
    .getByTestId("options-app")
    .waitFor({ state: "visible", timeout: 90000 })
  return page
}

/** The authenticated native session, not a saved extension fixture, is the independent identity. */
async function readNativeIdentity({ context, expectedUserId, evidenceDir }) {
  const page = await context.newPage()
  try {
    await page.goto(NANOGPT_WEB_ORIGIN, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })
    const native = await page.evaluate(async () => {
      const read = async (endpoint) => {
        const response = await fetch(endpoint, {
          credentials: "include",
          cache: "no-store",
        })
        if (!response.ok) return null
        try {
          return await response.json()
        } catch {
          return null
        }
      }
      const [session, local] = await Promise.all([
        read("/api/auth/session"),
        read("/api/auth/local-session"),
      ])
      return { session, local }
    })
    const user = native.session?.user
    const depositAddress = native.local?.data?.nanoDepositAddress
    if (!user?.id || !depositAddress) return null
    if (expectedUserId)
      assert.equal(
        user.id,
        expectedUserId,
        "Unexpected console identity; do not replace session",
      )
    await fs.writeFile(
      path.join(evidenceDir, "native-session.json"),
      JSON.stringify(native, null, 2),
    )
    return {
      userId: String(user.id),
      depositAddress,
      username: user.name?.trim() || user.email?.trim() || "",
    }
  } finally {
    await page.close()
  }
}

/** A real empty-key detection draft, retained through the key-page handoff. */
async function detectDraft(options, page, identity, capture) {
  const before = await getAccounts(options.serviceWorker)
  if (
    before.some(
      (account) =>
        account.site_type === "nanogpt" && account.account_info?.access_token,
    )
  )
    throw new Error(
      "Existing saved NanoGPT credential would bypass the empty-key onboarding scenario",
    )
  const dialog = await openAccountAddDialog({
    page,
    targetUrl: NANOGPT_WEB_ORIGIN,
  })
  await dialog.getByTestId(accounts.autoDetectButton).click()
  await expect(
    dialog.getByTestId(accounts.autoDetectButton),
  ).not.toHaveAttribute("aria-busy", "true", { timeout: 60000 })
  await expect(dialog.getByTestId(accounts.usernameInput)).toHaveValue(
    identity.username,
    { timeout: 60000 },
  )
  await expect(
    dialog.getByTestId(accounts.nanoGptManagementTokenInput),
  ).toHaveValue("")
  await capture("01-detected-draft", dialog)
  await assertAccountDetectionOutcome({
    page,
    expectedType: "nanogpt",
    fields: {
      siteUrlInput: NANOGPT_WEB_ORIGIN,
      siteNameInput: "NanoGPT",
      usernameInput: identity.username,
      userIdInput: identity.depositAddress,
      accessTokenInput: "",
      exchangeRateInput: "7.2",
    },
    saveState: "absent",
    guidance: "Complete NanoGPT credentials",
    timeoutMs: 60000,
  })
  const nativePagePromise = options.context.waitForEvent("page")
  await dialog
    .getByRole("button", { name: "Open NanoGPT API keys", exact: true })
    .click()
  const nativePage = await nativePagePromise
  try {
    await nativePage.waitForURL(`${NANOGPT_WEB_ORIGIN}/api`, { timeout: 60000 })
    await nativePage.waitForLoadState("domcontentloaded")
    await capture("02-native-key-page", nativePage)
  } finally {
    await nativePage.close()
  }
  await assertAccountDetectionOutcome({
    page,
    expectedType: "nanogpt",
    fields: {
      usernameInput: identity.username,
      userIdInput: identity.depositAddress,
      accessTokenInput: "",
      exchangeRateInput: "7.2",
    },
    saveState: "absent",
    guidance: "Complete NanoGPT credentials",
  })
  await expect(
    dialog.getByTestId(accounts.nanoGptManagementTokenInput),
  ).toHaveValue("")
  assert.deepEqual(
    (await getAccounts(options.serviceWorker)).map((account) => account.id),
    before.map((account) => account.id),
    "Guidance must not save an account",
  )
  return dialog
}

export async function runNanoGptDetection(options) {
  const identity = await readNativeIdentity(options)
  if (!identity)
    return {
      skipped: true,
      reason:
        "missing_authenticated_console_session; assess authorized source sessions",
    }
  const page = await openOptions(options)
  const capture = createUiCapture({ page, directory: options.evidenceDir })
  try {
    await detectDraft(options, page, identity, capture)
    await closeAccountDraft(page)
    return { ok: true }
  } finally {
    await page.close()
  }
}

/** Clearly classified fixture coverage: real public models, not real saved balance/onboarding. */
export async function runNanoGptCatalog(options) {
  return withTemporaryAccount(
    options.serviceWorker,
    {
      site_type: "nanogpt",
      site_url: NANOGPT_WEB_ORIGIN,
      site_name: "NanoGPT public catalog fixture",
    },
    async (fixture) => {
      const page = await openOptions(
        options,
        `options.html#models?accountId=${encodeURIComponent(fixture.id)}`,
      )
      const capture = createUiCapture({ page, directory: options.evidenceDir })
      try {
        const { names, modelDisplay } = await readModelCatalog({
          page,
          accountId: fixture.id,
          timeoutMs: 90000,
        })
        assert.ok(names.length, "No rendered public models")
        await expect(page.getByTestId("model-list-page")).toContainText(
          /provider|catalog/i,
        )
        await capture("03-public-model-catalog")
        await fs.writeFile(
          path.join(options.evidenceDir, "rendered-models.json"),
          JSON.stringify(
            {
              evidenceClass: "local_account_fixture_with_live_public_catalog",
              names,
              hasPrices: /\$/.test(await modelDisplay.innerText()),
            },
            null,
            2,
          ),
        )
        return { ok: true }
      } finally {
        await page.close()
      }
    },
  )
}

/** No manual-add fallback or account injection: one draft through detection, verify, save, reopen, refresh. */
export async function runNanoGptOnboarding(options) {
  if (!options.apiKey)
    return {
      skipped: true,
      reason: "missing_api_key; no credential is issued by the runner",
    }
  const identity = await readNativeIdentity(options)
  if (!identity)
    return { skipped: true, reason: "missing_authenticated_console_session" }
  const credential = await readNanoGptCredential(options.apiKey)
  assert.equal(
    credential.balance.nanoDepositAddress,
    identity.depositAddress,
    "Inference key belongs to another native account",
  )
  const page = await openOptions(options)
  const capture = createUiCapture({ page, directory: options.evidenceDir })
  try {
    const dialog = await detectDraft(options, page, identity, capture)
    await withUiCreatedAccount(
      options.serviceWorker,
      async (name) => {
        await dialog.getByTestId(accounts.accessTokenInput).fill(options.apiKey)
        await dialog.getByTestId(accounts.siteNameInput).fill(name)
        const save = dialog.getByTestId(accounts.confirmAddButton)
        await expect(save).toBeEnabled()
        await save.click() // dispatched exactly once; uncertain outcomes are never replayed
        await dialog.waitFor({ state: "hidden", timeout: 60000 })
      },
      async (saved) => {
        assert.equal(saved.site_type, "nanogpt")
        assert.equal(saved.authType, "access_token")
        assert.equal(saved.account_info.id, identity.depositAddress)
        assert.ok(
          saved.account_info.access_token === options.apiKey,
          "Saved credential class/value changed",
        )
        const row = page.getByTestId(
          getAccountManagementListItemTestId(saved.id),
        )
        await expect(row).toBeVisible()
        await capture("04-saved-account", row)
        await row.getByTestId(accounts.rowEditButton).click()
        const editor = page.getByTestId(accounts.accountDialog)
        await expect(editor.getByTestId(accounts.userIdInput)).toHaveValue(
          identity.depositAddress,
        )
        assert.ok(
          (await editor.getByTestId(accounts.accessTokenInput).inputValue()) ===
            options.apiKey,
          "Reopened key was not retained",
        )
        await closeAccountDraft(page)
        await row.getByTestId(accounts.rowMoreActionsButton).click()
        await page.getByTestId(accounts.rowRefreshMenuItem).click()
        await expect
          .poll(
            async () =>
              (await getAccounts(options.serviceWorker)).find(
                (account) => account.id === saved.id,
              )?.last_sync_time,
            { timeout: 60000 },
          )
          .toBeGreaterThan(saved.last_sync_time)
        const refreshed = (await getAccounts(options.serviceWorker)).find(
          (account) => account.id === saved.id,
        )
        assert.equal(refreshed.account_info.id, identity.depositAddress)
        assert.equal(refreshed.health.status, "healthy")
        assert.equal(
          refreshed.account_info.quota,
          Math.round(Number(credential.balance.usd_balance) * QUOTA_PER_USD),
        )
        await capture("05-refreshed-account", row)
        await navigateExtensionPage(
          page,
          `chrome-extension://${options.extensionId}/options.html#models?accountId=${encodeURIComponent(saved.id)}`,
        )
        await readModelCatalog({ page, accountId: saved.id, timeoutMs: 60000 })
      },
      { timeoutMs: 60000 },
    )
    return { ok: true }
  } finally {
    await page.close()
  }
}
