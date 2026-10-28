import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { FOXCODE_WEB_ORIGIN } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import {
  configureExtensionPage,
  createUiCapture,
  dismissModals,
} from "./cdp/ui-driver.mjs"
import { testModelCatalogFlow } from "./flows/model-catalog.mjs"
import {
  openNativeKeyEditor,
  submitNativeKeyEditor,
} from "./flows/native-key-editor.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Defaults to read-only provider probes and a temporary local account.
// --mutate creates, edits and deletes one run-owned key without inference or credit writes.
// FOXCODE_SESSION_FILE is an optional, ignored, origin-scoped authorized source export:
// { identity: verifiedSourceUserId, cookies: [...] }. No automatic login or refresh POST.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const origin = FOXCODE_WEB_ORIGIN
const mutate = process.argv.includes("--mutate")
const suffix = randomUUID().slice(0, 8)
const accountName = `AAH FoxCode ${suffix}`
const keyName = `AAH FoxCode key ${suffix}`
const evidenceDir = path.resolve(
  process.env.FOXCODE_EVIDENCE_DIR ||
    `.scratch/foxcode-adaptation/evidence/ui-${Date.now()}`,
)
execFileSync("git", [
  "check-ignore",
  "-q",
  path.join(evidenceDir, "index.json"),
])
await fs.mkdir(evidenceDir, { recursive: true })
const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(".output/chrome-mv3"),
})
const { extensionId } = dev
const captures = new Set()
const networkErrors = []
const extensionProviderRequests = []
const trackExtensionRequest = (request) => {
  if (!request.url().startsWith(`${origin}/api/`)) return
  const source = request.serviceWorker()?.url() ?? request.frame().url()
  if (source.startsWith(`chrome-extension://${extensionId}/`))
    extensionProviderRequests.push(request.url())
}
dev.context.on("request", trackExtensionRequest)
const captureResponse = (response) => {
  if (!response.url().startsWith(`${origin}/api/`)) return
  const pending = (async () => {
    await fs.writeFile(
      path.join(evidenceDir, `network-${randomUUID()}.json`),
      JSON.stringify(
        {
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          capturedAt: new Date().toISOString(),
          timing: response.request().timing(),
          body: await response.text(),
        },
        null,
        2,
      ),
    )
  })()
    .catch((error) => networkErrors.push(String(error)))
    .finally(() => captures.delete(pending))
  captures.add(pending)
}
dev.context.on("response", captureResponse)
let site = await dev.context.newPage()
const ui = await dev.context.newPage()
await configureExtensionPage(ui, {
  viewport: { width: 1440, height: 1000 },
  language: "en",
  dismissUpdateLog: true,
})
let accountId, createdKeyId, initialIdentity
let clipboardPermissionOverride = false
const evidence = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worktree: process.cwd(),
  extensionId,
  capturedAt: new Date().toISOString(),
  viewport: ui.viewportSize(),
  mutate,
  checks: [],
  screenshots: [],
  cleanup: {},
}
let sequence = 0
const stored = () => getAccounts(dev.serviceWorker)
const card = () =>
  ui.getByTestId(`account-management-account-list-item-${accountId}`)
const capture = createUiCapture({
  page: ui,
  directory: evidenceDir,
  bringToFront: true,
  screenshots: evidence.screenshots,
})
async function request(endpoint, method = "GET") {
  const response = await site.evaluate(
    async ({ endpoint, method }) => {
      const r = await fetch(endpoint, {
        method,
        credentials: "include",
        cache: "no-store",
      })
      return { endpoint, method, status: r.status, body: await r.json() }
    },
    { endpoint, method },
  )
  await fs.writeFile(
    path.join(evidenceDir, `probe-${sequence++}.json`),
    JSON.stringify(response, null, 2),
  )
  assert.ok(
    response.status >= 200 && response.status < 300,
    `Unexpected ${endpoint} status: ${response.status}`,
  )
  assert.equal(response.body.success, true, `Unsuccessful ${endpoint}`)
  return response.body.data
}
const probe = () =>
  probePageSession(site, {
    endpoint: `${origin}/api/auth/me`,
    readIdentity: (body) =>
      typeof body?.data?.user?.id === "string" ? body.data.user.id : undefined,
  })
const inventory = async () =>
  (await request("/api/keys?page=1&limit=100")).apiKeys
try {
  await site.goto(`${origin}/auth/login`)
  const imported = process.env.FOXCODE_SESSION_FILE
    ? JSON.parse(await fs.readFile(process.env.FOXCODE_SESSION_FILE, "utf8"))
    : undefined
  const expectedIdentity = process.env.FOXCODE_USER_ID || imported?.identity
  let readiness = await preflightSession({
    probeTarget: probe,
    expectedIdentity,
  })
  if (readiness.status === "source-check-required" && imported) {
    assert.ok(typeof imported.identity === "string" && imported.identity.trim())
    assert.equal(imported.identity, expectedIdentity)
    const allowed = [
      "auth_token",
      "auth_user",
      "browser_login_device_id",
      "cf_clearance",
    ]
    assert.ok(
      Array.isArray(imported.cookies) &&
        imported.cookies.some((c) => c.name === "auth_token"),
    )
    assert.ok(
      imported.cookies.every(
        (c) =>
          allowed.includes(c.name) &&
          ["foxcode.rjj.cc", ".rjj.cc"].includes(c.domain) &&
          c.secure,
      ),
    )
    const previous = (await dev.context.cookies(origin)).filter((c) =>
      imported.cookies.some(
        (item) => item.name === c.name && item.domain === c.domain,
      ),
    )
    await dev.context.addCookies(imported.cookies)
    await site.goto(`${origin}/dashboard`)
    readiness = await preflightSession({ probeTarget: probe, expectedIdentity })
    if (readiness.status !== "ready") {
      for (const c of imported.cookies)
        await dev.context.clearCookies({ name: c.name, domain: c.domain })
      await dev.context.addCookies(previous)
    }
  }
  evidence.session = readiness
  assert.equal(
    readiness.status,
    "ready",
    "Inspect authorized source sessions or diagnose identity before proceeding",
  )
  const initial = await request("/api/auth/me")
  initialIdentity = initial.user.id
  const originalKeys = await inventory()
  const dashboard = await request("/api/user/dashboard")
  const nativeConfig = await request(
    "/api/system-config/public/model_square_config",
  )
  const referral = await request("/api/user/referral")
  await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
  await dismissModals(ui)
  await ui.getByTestId(accounts.addAccountButton).click()
  await ui.getByTestId(accounts.siteUrlInput).fill(origin)
  const grant = ui.getByTestId(accounts.cookiePermissionGrantButton)
  if (await grant.isVisible()) await grant.click()
  await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
    "data-auth-type",
    "cookie",
  )
  await ui.getByTestId(accounts.autoDetectButton).click()
  await expect(ui.getByTestId(accounts.siteTypeTrigger)).toContainText(
    "foxcode",
    { timeout: 30000 },
  )
  await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
    initialIdentity,
    { timeout: 30000 },
  )
  if (await grant.isVisible()) await grant.click()
  await expect(ui.getByTestId(accounts.confirmAddButton)).toBeVisible({
    timeout: 30000,
  })
  await ui.getByTestId(accounts.siteNameInput).fill(accountName)
  await capture("00-onboarding.png")
  await ui.getByTestId(accounts.confirmAddButton).click()
  await expect
    .poll(
      async () => {
        // Keep the user's existing saved account; this duplicate is run-owned.
        const duplicate = ui.getByTestId(
          accounts.duplicateWarningContinueButton,
        )
        if (await duplicate.isVisible()) await duplicate.click()
        return (await stored()).find((a) => a.site_name === accountName)?.id
      },
      { timeout: 30000 },
    )
    .toBeTruthy()
  const saved = (await stored()).find((a) => a.site_name === accountName)
  accountId = saved.id
  assert.equal(saved.authType, "cookie")
  assert.equal(saved.site_type, "foxcode")
  assert.equal(String(saved.account_info.id), initialIdentity)
  await dismissModals(ui)
  await capture("01-account.png")
  evidence.checks.push("fresh default Cookie onboarding, CUID identity, save")
  await site.close()
  const before = (await stored()).find((a) => a.id === accountId).last_sync_time
  await card().getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByTestId(accounts.rowRefreshMenuItem).click()
  await expect
    .poll(
      async () =>
        (await stored()).find((a) => a.id === accountId)?.last_sync_time,
      { timeout: 30000 },
    )
    .toBeGreaterThan(before)
  evidence.checks.push("saved Cookie refresh with no console tab")
  // Chromium cannot scope clipboard permission overrides to opaque extension origins.
  await dev.context.grantPermissions(["clipboard-read"])
  clipboardPermissionOverride = true
  await ui.bringToFront()
  await card().getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByRole("menuitem", { name: "Share", exact: true }).hover()
  await ui.getByTestId(accounts.rowCopyInviteLinkMenuItem).click()
  if (referral.enabled && referral.referralCode) {
    const expected = `${origin}/auth/register?aff=${encodeURIComponent(referral.referralCode)}`
    await expect
      .poll(() => ui.evaluate(() => navigator.clipboard.readText()), {
        timeout: 15000,
      })
      .toBe(expected)
    await capture("02-invitation.png")
    evidence.checks.push("native referral link copied to clipboard")
  }
  // Native Cookie header rules serialize the identity/config/pricing requests.
  await testModelCatalogFlow({
    page: ui,
    extensionId,
    accountName,
    accountId,
    timeoutMs: 30000,
  })
  await capture("03-models.png")
  evidence.checks.push("native provider models and USD channel prices")
  site = await dev.context.newPage()
  await site.goto(`${origin}/api-keys`)
  if (dashboard.announcements.length) {
    await ui.goto(
      `chrome-extension://${extensionId}/options.html#siteAnnouncements`,
    )
    await dismissModals(ui)
    const filter = ui.getByRole("combobox", { name: "Site", exact: true })
    await filter.click()
    // The site filter merges historical account sources at the same origin.
    await ui
      .getByRole("option")
      .and(ui.locator('[data-value*="foxcode.rjj.cc"]'))
      .click()
    // Both the page header and empty state offer the same check action.
    await ui
      .getByRole("button", { name: "Check now", exact: true })
      .first()
      .click()
    await expect(ui.locator("body")).toContainText(
      dashboard.announcements[0].title.replace(/[-*_`~>]/g, " ").trim(),
      { timeout: 30000 },
    )
    await capture("03a-announcements.png")
    evidence.checks.push(
      "native dashboard announcements refreshed in the selected site UI",
    )
  }
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#keys?accountId=${accountId}`,
  )
  await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
    originalKeys.length,
    { timeout: 30000 },
  )
  const assertLocalDetails = async (row, nativeKey) => {
    const trigger = row.getByRole("button", {
      name: `View details for ${nativeKey.name}`,
      exact: true,
    })
    const beforeDetails = extensionProviderRequests.length
    if (nativeKey.description) {
      await trigger.click()
      await expect(row.getByRole("region")).toContainText(nativeKey.description)
      await expect(row.getByRole("region")).not.toContainText("Used Quota")
      await trigger.click()
    } else {
      await expect(trigger).toHaveCount(0)
    }
    assert.equal(extensionProviderRequests.length, beforeDetails)
  }
  if (originalKeys.length) {
    const original = originalKeys[0]
    const row = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${original.id}"]`))
    const beforeDisclosure = extensionProviderRequests.length
    await row.getByRole("button", { name: "Show Key", exact: true }).click()
    await expect
      .poll(async () => (await row.textContent()).includes(original.key))
      .toBe(true)
    assert.equal(extensionProviderRequests.length, beforeDisclosure)
    await row.getByRole("button", { name: "Hide Key", exact: true }).click()
    await row.getByRole("button", { name: "Copy Key", exact: true }).click()
    await expect
      .poll(() =>
        ui.evaluate(
          (secret) =>
            navigator.clipboard.readText().then((text) => text === secret),
          original.key,
        ),
      )
      .toBe(true)
    assert.equal(extensionProviderRequests.length, beforeDisclosure)
    evidence.checks.push(
      "existing inventory key show/copy performs zero provider requests",
    )
    await assertLocalDetails(row, original)
    evidence.checks.push(
      "complete inventory rows hide empty detail disclosures or reveal only additional facts without provider requests",
    )
    const beforeEdit = extensionProviderRequests.length
    await row.getByRole("button", { name: "Edit Key", exact: true }).click()
    await expect(ui.locator("#resource-editor-name")).toHaveValue(
      original.name,
      { timeout: 30000 },
    )
    await expect(ui.locator("#resource-editor-channelKey")).toBeEnabled({
      timeout: 30000,
    })
    const editReads = extensionProviderRequests
      .slice(beforeEdit)
      .map((url) => new URL(url).pathname)
    assert.equal(editReads.filter((path) => path === "/api/keys").length, 0)
    assert.equal(
      editReads.filter((path) => path.endsWith("api_endpoint_config")).length,
      0,
    )
    assert.equal(
      editReads.filter((path) => path.endsWith("model_square_config")).length,
      1,
    )
    evidence.checks.push(
      "existing key editor reuses the accepted native record and inference address, loading channel choices only once",
    )
    await capture(
      "03b-existing-key-editor.png",
      ui.getByTestId(keys.nativeEditor),
    )
    await ui
      .getByTestId(keys.nativeEditor)
      .getByRole("button", { name: "Cancel", exact: true })
      .click()
    await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0)
  }
  const editor = await openNativeKeyEditor(ui, {
    trigger: ui.getByTestId(keys.addTokenButton),
    readyField: ui.locator("#resource-editor-name"),
  })
  const name = ui.locator("#resource-editor-name")
  const description = ui.locator("#resource-editor-description")
  const channel = ui.locator("#resource-editor-channelKey")
  const unlimited = ui.locator("#resource-editor-unlimited")
  const quota = ui.locator("#resource-editor-quotaUsd")
  await expect(name).toBeEditable({ timeout: 30000 })
  const selectChannel = async (channelKey) => {
    await channel.click()
    await ui
      .getByRole("option")
      .filter({
        hasText: nativeConfig.config.channels.find((c) => c.key === channelKey)
          .name,
      })
      .first()
      .click()
  }
  await selectChannel("codex")
  await expect(name).toHaveValue(
    `${nativeConfig.config.channels.find((c) => c.key === "codex").name} group (auto)`,
  )
  await capture("04a-automatic-name.png", editor)
  await selectChannel("anthropic")
  await expect(name).toHaveValue(
    `${nativeConfig.config.channels.find((c) => c.key === "anthropic").name} group (auto)`,
  )
  await name.fill(keyName)
  await selectChannel("codex")
  await expect(name).toHaveValue(keyName)
  await selectChannel("anthropic")
  await expect(name).toHaveValue(keyName)
  evidence.checks.push(
    "channel display names follow selection until a custom key name is entered",
  )
  await description.fill("Created by the FoxCode live integration runner")
  await unlimited.click()
  await quota.fill("0.01")
  await capture("04-create-editor.png", editor)
  if (mutate) {
    const createRequestStart = extensionProviderRequests.length
    await submitNativeKeyEditor(ui, { waitForClose: false })
    await expect(editor).toHaveCount(0, { timeout: 30000 })
    assert.equal(
      extensionProviderRequests
        .slice(createRequestStart)
        .filter((url) => new URL(url).pathname === "/api/keys").length,
      1,
    )
    evidence.checks.push(
      "creation adopts the native POST record without an inventory refresh",
    )
    await expect
      .poll(
        async () => (await inventory()).find((k) => k.name === keyName)?.id,
        { timeout: 30000 },
      )
      .toBeTruthy()
    const created = (await inventory()).find((k) => k.name === keyName)
    createdKeyId = created.id
    assert.equal(created.quotaLimit, 10000)
    assert.equal(
      created.description,
      "Created by the FoxCode live integration runner",
    )
    await expect(editor).toHaveCount(0, { timeout: 30000 })
    const row = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${createdKeyId}"]`))
    await expect(row).toContainText(keyName, { timeout: 30000 })
    await assertLocalDetails(row, created)
    await row.getByRole("button", { name: "Show Key", exact: true }).click()
    await expect
      .poll(async () => (await row.textContent()).includes(created.key), {
        timeout: 30000,
      })
      .toBe(true)
    await row.getByRole("button", { name: "Hide Key", exact: true }).click()
    await row.getByRole("button", { name: "Edit Key", exact: true }).click()
    await expect(name).toHaveValue(keyName, { timeout: 30000 })
    await expect(description).toHaveValue(created.description)
    await expect(quota).toHaveValue("0.01")
    const automaticName = (channelKey) =>
      `${nativeConfig.config.channels.find((c) => c.key === channelKey).name} group (auto)`
    await name.fill(automaticName("anthropic"))
    await submitNativeKeyEditor(ui, { waitForClose: false })
    await expect(editor).toHaveCount(0, { timeout: 30000 })
    await row.getByRole("button", { name: "Edit Key", exact: true }).click()
    await expect(name).toHaveValue(automaticName("anthropic"), {
      timeout: 30000,
    })
    await expect(channel).toBeEnabled({ timeout: 30000 })
    await selectChannel("codex")
    await expect(name).toHaveValue(automaticName("codex"))
    // Common automatic names may already exist: verify following in the draft,
    // then save this run's unique name to respect the provider's uniqueness rule.
    await selectChannel("anthropic")
    await expect(name).toHaveValue(automaticName("anthropic"))
    evidence.checks.push(
      "existing automatic key names follow channel changes after reopening the editor",
    )
    await name.fill(`${keyName} edited`)
    await description.fill("Edited and reopened by the live runner")
    await channel.click()
    await ui
      .getByRole("option")
      .filter({
        hasText: nativeConfig.config.channels.find((c) => c.key === "codex")
          .name,
      })
      .first()
      .click()
    await expect(name).toHaveValue(`${keyName} edited`)
    await quota.fill("0.02")
    await ui.locator("#resource-editor-enabled").click()
    const updateRequestStart = extensionProviderRequests.length
    await submitNativeKeyEditor(ui, { waitForClose: false })
    // Channel edits validate the selected channel before the native PATCH.
    await expect(editor).toHaveCount(0, { timeout: 90000 })
    assert.equal(
      extensionProviderRequests
        .slice(updateRequestStart)
        .filter((url) => new URL(url).pathname === "/api/keys").length,
      0,
    )
    evidence.checks.push(
      "acknowledged edit completes without a preflight or follow-up inventory refresh",
    )
    await expect
      .poll(
        async () =>
          (await inventory()).find((k) => k.id === createdKeyId)?.isActive,
        { timeout: 30000 },
      )
      .toBe(false)
    const edited = (await inventory()).find((k) => k.id === createdKeyId)
    assert.equal(edited.name, `${keyName} edited`)
    assert.equal(edited.quotaLimit, 20000)
    assert.equal(edited.description, "Edited and reopened by the live runner")
    assert.equal(edited.channelKey, "codex")
    await row.getByRole("button", { name: "Edit Key", exact: true }).click()
    await expect(name).toHaveValue(edited.name, { timeout: 30000 })
    await expect(description).toHaveValue(edited.description)
    await expect(quota).toHaveValue("0.02")
    await expect(channel).toBeEnabled({ timeout: 30000 })
    await expect(channel).toContainText(
      nativeConfig.config.channels.find((c) => c.key === "codex").name,
    )
    await expect(ui.locator("#resource-editor-enabled")).toHaveAttribute(
      "aria-checked",
      "false",
    )
    await capture("05-reopened-editor.png", editor)
    await ui.keyboard.press("Escape")
    await site.reload()
    await expect(site.locator("body")).toContainText(edited.name, {
      timeout: 30000,
    })
    await site.screenshot({
      path: path.join(evidenceDir, "06-native-readback.png"),
      animations: "disabled",
    })
    evidence.screenshots.push("06-native-readback.png")
    const deleteRequestStart = extensionProviderRequests.length
    await row.getByRole("button", { name: /delete/i }).click()
    await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
    await expect
      .poll(
        async () => (await inventory()).some((k) => k.id === createdKeyId),
        { timeout: 30000 },
      )
      .toBe(false)
    await expect(row).toHaveCount(0, { timeout: 60000 })
    const deleteRequests = extensionProviderRequests.slice(deleteRequestStart)
    assert.equal(
      deleteRequests.filter((url) => new URL(url).pathname === "/api/keys")
        .length,
      0,
      "Acknowledged delete does not reload inventory",
    )
    assert.equal(
      deleteRequests.filter((url) => url.includes("/api/system-config/"))
        .length,
      0,
      "Acknowledged delete does not reload runtime configuration",
    )
    evidence.checks.push(
      "acknowledged delete performs no inventory or configuration reads",
    )
    evidence.checks.push(
      "native key create/edit/channel/description/USD quota/status/reopen/website readback/delete",
    )
  } else {
    await ui.keyboard.press("Escape")
    evidence.checks.push(
      "native inventory and configured create form; mutation skipped",
    )
  }
} catch (error) {
  evidence.failure = String(error)
  await fs.writeFile(
    path.join(evidenceDir, "failure-ui.txt"),
    await ui
      .locator("body")
      .innerText()
      .catch(() => "unavailable"),
  )
  await capture("failure.png").catch((error) => {
    evidence.captureFailure = String(error)
  })
  throw error
} finally {
  try {
    // Recover an owned successful creation even if later UI/readback failed before ID assignment.
    if (mutate && initialIdentity && !createdKeyId) {
      if (site.isClosed()) site = await dev.context.newPage()
      await site.goto(`${origin}/api-keys`)
      assert.equal((await request("/api/auth/me")).user.id, initialIdentity)
      createdKeyId = (await inventory()).find(
        (k) => k.name === keyName && k.userId === initialIdentity,
      )?.id
    }
    if (createdKeyId) {
      if (site.isClosed()) site = await dev.context.newPage()
      await site.goto(`${origin}/api-keys`)
      assert.equal((await request("/api/auth/me")).user.id, initialIdentity)
      if ((await inventory()).some((k) => k.id === createdKeyId))
        await request(`/api/keys/${encodeURIComponent(createdKeyId)}`, "DELETE")
      assert.ok(!(await inventory()).some((k) => k.id === createdKeyId))
      evidence.cleanup.ownedKeyDeleted = true
    }
    const account = (await stored()).find((a) => a.site_name === accountName)
    if (account) {
      accountId = account.id
      await ui.keyboard.press("Escape")
      await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
      await dismissModals(ui)
      await card().getByTestId(accounts.rowMoreActionsButton).click()
      await ui.getByTestId(accounts.rowDeleteMenuItem).click()
      await ui.getByTestId(accounts.deleteConfirmButton).click()
      await expect
        .poll(async () => (await stored()).some((a) => a.id === accountId))
        .toBe(false)
    }
    evidence.cleanup.localAccountRemoved = true
  } catch (error) {
    evidence.cleanup.failure = String(error)
    process.exitCode = 1
  }
  dev.context.off("response", captureResponse)
  dev.context.off("request", trackExtensionRequest)
  await Promise.all(captures)
  if (networkErrors.length) {
    evidence.captureFailure = networkErrors.join("; ")
    process.exitCode = 1
  }
  await fs.writeFile(
    path.join(evidenceDir, "index.json"),
    JSON.stringify(evidence, null, 2),
  )
  if (clipboardPermissionOverride) await dev.context.clearPermissions()
  await ui.close()
  await site.close().catch(() => {})
  await dev.close()
  console.log(
    JSON.stringify({
      evidenceDir,
      checks: evidence.checks,
      cleanup: evidence.cleanup,
    }),
  )
}
