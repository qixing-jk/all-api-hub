/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { LAOZHANG_HOSTNAMES } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { connectDevExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { dismissModals, openExtensionPage } from "./cdp/ui-driver.mjs"
import { testModelCatalogFlow } from "./flows/model-catalog.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Prerequisites: current-worktree build mounted in the dedicated CDP browser,
// English extension UI; Cookie mode needs a logged-in target-origin session.
// Use existing browser:sync tooling to seed the dev profile when necessary.
// Default is read-only on the provider; --mutate exercises disposable key CRUD.
// --guide-only verifies automatic System token guidance and explicit Cookie fallback.
// LAOZHANG_ACCESS_TOKEN_FILE completes the guided System token flow; keep that file
// locally excluded. Requests then omit cookies to prove independent token access.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const mutate = process.argv.includes("--mutate")
const guideOnly = process.argv.includes("--guide-only")
if (guideOnly && mutate)
  throw new Error("--guide-only cannot be combined with --mutate")
const accessToken = process.env.LAOZHANG_ACCESS_TOKEN_FILE
  ? (await fs.readFile(process.env.LAOZHANG_ACCESS_TOKEN_FILE, "utf8")).trim()
  : ""
const authMode = accessToken || guideOnly ? "access_token" : "cookie"
if (process.env.LAOZHANG_ACCESS_TOKEN_FILE && !accessToken)
  throw new Error("LAOZHANG_ACCESS_TOKEN_FILE is empty")
const tokenUserId = process.env.LAOZHANG_USER_ID
if (accessToken && !tokenUserId)
  throw new Error(
    "LAOZHANG_USER_ID is required with LAOZHANG_ACCESS_TOKEN_FILE",
  )
const targetUrl = new URL(
  process.env.LAOZHANG_BASE_URL || "https://api2.laozhang.ai",
)
assert.ok(
  targetUrl.protocol === "https:" &&
    LAOZHANG_HOSTNAMES.includes(targetUrl.hostname) &&
    !targetUrl.port &&
    !targetUrl.username &&
    !targetUrl.password &&
    targetUrl.pathname === "/" &&
    !targetUrl.search &&
    !targetUrl.hash,
  "LAOZHANG_BASE_URL must be an official LaoZhang console origin",
)
const siteUrl = targetUrl.origin
const runId = randomUUID().slice(0, 8)
const accountName = `AAH LaoZhang ${runId}`
const keyName = `aah-lz-${runId}`
const renamedKey = `aah-lz-edit-${runId}`
const evidenceDir = path.resolve(
  process.env.LAOZHANG_EVIDENCE_DIR ||
    `.scratch/laozhang-adaptation/evidence/run-${Date.now()}`,
)
// Authenticated evidence must never be written to a tracked/public directory.
execFileSync("git", [
  "check-ignore",
  "--quiet",
  path.join(evidenceDir, "index.json"),
])
await fs.mkdir(evidenceDir, { recursive: true })
const dev = await connectDevExtension()
let site = await dev.context.newPage()
const ui = await openExtensionPage({
  context: dev.context,
  extensionId: dev.extensionId,
  route: "options.html#account",
})
const evidence = {
  runId,
  capturedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceHasChanges: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  extensionId: dev.extensionId,
  extensionVersion: await dev.serviceWorker.evaluate(
    () => chrome.runtime.getManifest().version,
  ),
  viewport: await ui.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  })),
  worktree: process.cwd(),
  siteUrl,
  mutate,
  authMode,
  guideOnly,
  checks: [],
  cleanup: {},
}
let accountId
const ownedKeyIds = new Set()
const ownedNames = new Set([keyName, renamedKey])
const cleanupErrors = []
const guideTabs = new Set()

async function request(endpoint, method = "GET", body) {
  const result = await site.evaluate(
    async ({ endpoint, method, body, accessToken, tokenUserId }) => {
      const response = await fetch(endpoint, {
        method,
        credentials: accessToken ? "omit" : "include",
        headers: {
          ...(accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
                "New-Api-User": tokenUserId,
              }
            : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
            }),
      })
      return {
        endpoint,
        method,
        requestBody: body,
        status: response.status,
        headers: Object.fromEntries(response.headers),
        text: await response.text(),
      }
    },
    { endpoint, method, body, accessToken, tokenUserId },
  )
  await fs.writeFile(
    path.join(
      evidenceDir,
      `request-${Date.now()}-${randomUUID().slice(0, 6)}.json`,
    ),
    JSON.stringify(result, null, 2),
  )
  const envelope = JSON.parse(result.text)
  assert.equal(result.status, 200, `HTTP failure at ${endpoint}`)
  assert.equal(envelope.success, true, `Business failure at ${endpoint}`)
  return envelope.data
}

async function inventory() {
  const rows = []
  for (let page = 0; page < 20; page++) {
    const items = await request(`/api/token/?p=${page}&pageSize=100`)
    assert.ok(Array.isArray(items))
    if (!items.length) return rows
    rows.push(...items)
  }
  throw new Error("Token inventory did not reach an empty completion page")
}

async function storedAccounts() {
  return dev.serviceWorker.evaluate(async () => {
    const value = (await chrome.storage.local.get("site_accounts"))
      .site_accounts
    const envelope = typeof value === "string" ? JSON.parse(value) : value
    return (envelope?.accounts || []).map((account) => ({
      id: account.id,
      name: account.site_name,
      type: account.site_type,
      userId: account.account_info.id,
      quota: account.account_info.quota,
      health: account.health?.status,
      authType: account.authType,
      lastSync: account.last_sync_time,
    }))
  })
}

try {
  await site.goto(`${siteUrl}/account/profile`)
  const user = await request("/api/user/self")
  assert.ok(
    user.id && user.username,
    "Log into the target account in the dev browser first",
  )
  if (process.env.LAOZHANG_USER_ID)
    assert.equal(String(user.id), process.env.LAOZHANG_USER_ID)
  const status = await request("/api/status")
  assert.equal(status.quota_per_unit, 500000)
  const originalKeys = await inventory()
  evidence.version = status.version
  evidence.userId = user.id
  evidence.originalKeyIds = originalKeys.map((key) => key.id)

  await ui.goto(`chrome-extension://${dev.extensionId}/options.html#account`)
  await dismissModals(ui)
  await ui.getByTestId(accounts.addAccountButton).click()
  await ui.getByTestId(accounts.siteUrlInput).fill(siteUrl)
  const grant = ui.getByTestId(accounts.cookiePermissionGrantButton)
  if (await grant.isVisible()) await grant.click()
  await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
    "data-auth-type",
    "access_token",
  )
  if (authMode === "cookie") {
    await ui.getByTestId(accounts.authTypeTrigger).click()
    await ui
      .getByRole("option", { name: "Cookie Authentication", exact: true })
      .click()
  }
  await ui.getByTestId(accounts.autoDetectButton).click()
  const tabChoice = ui
    .getByText(`LaoZhang API — ${siteUrl}`, { exact: true })
    .first()
  await Promise.race([
    tabChoice.waitFor({ state: "visible", timeout: 30000 }),
    ui
      .getByTestId(accounts.siteTypeTrigger)
      .waitFor({ state: "visible", timeout: 30000 }),
  ])
  if (await tabChoice.isVisible()) {
    // URL suggestions disappear when automatic detection finishes; do not
    // mistake that successful form transition for a lost tab selection.
    try {
      await tabChoice.click({ force: true, timeout: 2000 })
    } catch (error) {
      if (!(await ui.getByTestId(accounts.siteTypeTrigger).isVisible()))
        throw error
    }
  }
  await expect(ui.getByTestId(accounts.siteTypeTrigger)).toContainText(
    "laozhang",
    { timeout: 30000 },
  )
  await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
    String(user.id),
  )
  if (authMode === "access_token") {
    const openProfile = ui.getByRole("button", {
      name: "Open LaoZhang profile",
      exact: true,
    })
    await expect(openProfile).toBeVisible()
    await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
      "data-auth-type",
      "access_token",
    )
    await expect(ui.getByTestId(accounts.usernameInput)).toHaveValue(
      user.username,
    )
    await expect(ui.getByPlaceholder("Please enter exchange rate")).toHaveValue(
      String(status.price),
    )
    await expect(ui.getByTestId(accounts.accessTokenInput)).toBeVisible()
    await ui.screenshot({ path: path.join(evidenceDir, "00-token-guide.png") })
    const [profile] = await Promise.all([
      dev.context.waitForEvent("page"),
      openProfile.click(),
    ])
    guideTabs.add(profile)
    await profile.waitForURL(`${siteUrl}/account/profile`)
    await profile.close()
    guideTabs.delete(profile)
    await ui.bringToFront()
    await expect(ui.getByTestId(accounts.accessTokenInput)).toBeFocused()
    await ui.screenshot({ path: path.join(evidenceDir, "00-token-entry.png") })
    evidence.checks.push(
      "automatic System token guidance preserves identity/rate and opens profile with token field focused",
    )
  }
  if (guideOnly) {
    await ui.getByTestId(accounts.authTypeTrigger).click()
    await ui
      .getByRole("option", { name: "Cookie Authentication", exact: true })
      .click()
    await expect(
      ui.getByRole("button", { name: "Open LaoZhang profile", exact: true }),
    ).toBeHidden()
    await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
      String(user.id),
    )
    await expect(
      ui.getByText("Import from current login", { exact: true }),
    ).toBeVisible()
    await ui.screenshot({
      path: path.join(evidenceDir, "01-cookie-alternative.png"),
    })
    assert.deepEqual(
      (await inventory()).map((key) => key.id).sort(),
      evidence.originalKeyIds.sort(),
    )
    evidence.checks.push(
      "Cookie is an explicit alternative without losing detected identity",
    )
    evidence.cleanup.providerKeys = true
  } else {
    if (accessToken) {
      await ui.getByTestId(accounts.accessTokenInput).fill(accessToken)
    } else
      await expect(ui.getByTestId(accounts.authTypeTrigger)).toContainText(
        "Cookie",
      )
    await ui.getByTestId(accounts.siteNameInput).fill(accountName)
    if (
      accessToken &&
      (await ui.getByTestId(accounts.manualAddButton).isVisible())
    )
      await ui.getByTestId(accounts.manualAddButton).click()
    await ui.getByTestId(accounts.confirmAddButton).click()
    await expect
      .poll(
        async () =>
          (await storedAccounts()).find(
            (account) => account.name === accountName,
          )?.id,
      )
      .toBeTruthy()
    accountId = (await storedAccounts()).find(
      (account) => account.name === accountName,
    ).id
    assert.equal(
      (await storedAccounts()).find((account) => account.id === accountId)
        .authType,
      authMode,
    )
    const card = ui.getByTestId(
      `account-management-account-list-item-${accountId}`,
    )
    await card
      .getByRole("button", { name: "Click to refresh balance", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await storedAccounts()).find((account) => account.id === accountId)
            ?.health,
        { timeout: 30000 },
      )
      .toBe("healthy")
    assert.equal(
      (await storedAccounts()).find((account) => account.id === accountId)
        .quota,
      user.quota,
    )
    await card.screenshot({ path: path.join(evidenceDir, "01-account.png") })
    evidence.checks.push(
      `detected/saved/refreshed matching ${authMode} account and USD quota`,
    )

    const code = await request("/api/user/aff/")
    assert.equal(typeof code, "string")
    await card.getByTestId(accounts.rowMoreActionsButton).click()
    await ui.getByRole("menuitem", { name: "Share", exact: true }).hover()
    await ui.getByTestId(accounts.rowCopyInviteLinkMenuItem).click()
    await expect(
      ui.getByText("Invite link copied", { exact: false }),
    ).toBeVisible({ timeout: 15000 })
    await ui.screenshot({ path: path.join(evidenceDir, "02-invite.png") })
    evidence.checks.push("native invitation link copy feedback")

    await testModelCatalogFlow({
      page: ui,
      extensionId: dev.extensionId,
      accountName,
      accountId,
    })
    await ui.screenshot({ path: path.join(evidenceDir, "03-models.png") })
    evidence.checks.push("live model rows and prices")

    await ui.goto(
      `chrome-extension://${dev.extensionId}/options.html#keys?accountId=${accountId}`,
    )
    await expect(ui.getByTestId(keys.addTokenButton)).toBeVisible({
      timeout: 30000,
    })
    await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
      originalKeys.length,
      { timeout: 30000 },
    )
    await ui.screenshot({ path: path.join(evidenceDir, "04-keys.png") })
    evidence.checks.push("complete native key inventory")

    if (mutate) {
      await ui.getByTestId(keys.addTokenButton).click()
      await ui.locator("#resource-editor-name").fill(keyName)
      await ui.getByTestId(keys.nativeEditorSubmitButton).click()
      await expect
        .poll(
          async () =>
            (await inventory()).find((key) => key.name === keyName)?.id,
          { timeout: 30000 },
        )
        .toBeTruthy()
      const created = (await inventory()).find((key) => key.name === keyName)
      ownedKeyIds.add(created.id)
      const secret = await request(`/api/token/${created.id}/key`, "POST", {})
      assert.ok(
        typeof secret.key === "string" &&
          secret.key &&
          !secret.key.includes("*"),
      )
      const createdRow = ui
        .getByTestId(keys.nativeKeyRow)
        .filter({ hasText: keyName })
      await createdRow
        .getByRole("button", { name: "Show Key", exact: true })
        .click()
      await expect
        .poll(async () =>
          (
            await createdRow
              .getByTestId(keys.keyResourceSecretDisplay)
              .innerText()
          ).includes(secret.key),
        )
        .toBe(true)
      await createdRow
        .getByRole("button", { name: "Hide Key", exact: true })
        .click()
      const baseline = await request(`/api/token/${created.id}`)
      const nativeFields = [
        "id",
        "name",
        "remain_quota",
        "unlimited_quota",
        "expired_time",
        "group",
        "billing_type",
        "models",
        "ip_whitelist",
        "subnet",
        "remark",
        "fallback_groups",
        "advertisement",
        "ad_position",
        "rate_limit_duration",
        "rate_limit_num",
        "rate_limit_exceeded_message",
        "retry_keep_billing_type_enabled",
        "activate_on_first_use",
        "valid_duration",
      ]
      const models = await request("/api/user/available_model/")
      const groups = await request("/api/groupPro/selectable?p=0&pageSize=1000")
      const marker = {
        ...Object.fromEntries(
          nativeFields
            .filter((field) => field in baseline)
            .map((field) => [field, baseline[field]]),
        ),
        remark: "aah-keep-note",
        fallback_groups:
          groups.find((group) => group.name !== baseline.group)?.name || "",
        models: models[0],
        ip_whitelist: "203.0.113.0/24",
      }
      await request("/api/token/", "PUT", marker)
      await ui
        .getByRole("button", { name: "Refresh Key List", exact: true })
        .click()
      const row = ui.getByTestId(keys.nativeKeyRow).filter({ hasText: keyName })
      await row.getByRole("button", { name: "Edit Key", exact: true }).click()
      await ui.locator("#resource-editor-name").fill(renamedKey)
      await ui.getByTestId(keys.nativeEditorSubmitButton).click()
      await expect
        .poll(async () => (await request(`/api/token/${created.id}`)).name, {
          timeout: 30000,
        })
        .toBe(renamedKey)
      const updated = await request(`/api/token/${created.id}`)
      for (const field of [
        "remark",
        "fallback_groups",
        "billing_type",
        "models",
        "ip_whitelist",
      ])
        assert.deepEqual(updated[field], marker[field], `Edit reset ${field}`)
      await expect(ui.getByTestId(keys.nativeEditorSubmitButton)).toBeHidden({
        timeout: 30000,
      })
      await ui.screenshot({ path: path.join(evidenceDir, "05-edited-key.png") })
      const editedRow = ui
        .getByTestId(keys.nativeKeyRow)
        .filter({ hasText: renamedKey })
      await editedRow
        .getByRole("button", { name: "Delete Key", exact: true })
        .click()
      await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
      await expect
        .poll(
          async () => (await inventory()).some((key) => key.id === created.id),
          { timeout: 30000 },
        )
        .toBe(false)
      ownedKeyIds.delete(created.id)
      evidence.checks.push(
        "UI key create/reveal/edit with setting preservation/delete",
      )
    }
    assert.deepEqual(
      (await inventory()).map((key) => key.id).sort(),
      evidence.originalKeyIds.sort(),
    )
    evidence.cleanup.providerKeys = true
    // Prove that the saved account credential remains usable after the website tab
    // closes. A pre-existing target tab would weaken that evidence, so fail
    // explicitly rather than closing an operator-owned page.
    await site.close()
    try {
      assert.equal(
        dev.context
          .pages()
          .some((page) => page.url().startsWith(`${siteUrl}/`)),
        false,
        "Close other LaoZhang dev tabs before the after-tab-close check",
      )
      await ui.goto(
        `chrome-extension://${dev.extensionId}/options.html#account`,
      )
      const beforeSync = (await storedAccounts()).find(
        (account) => account.id === accountId,
      ).lastSync
      const card = ui.getByTestId(
        `account-management-account-list-item-${accountId}`,
      )
      await card
        .getByRole("button", { name: "Click to refresh balance", exact: true })
        .click()
      await expect
        .poll(
          async () =>
            (await storedAccounts()).find((account) => account.id === accountId)
              .lastSync,
          { timeout: 30000 },
        )
        .toBeGreaterThan(beforeSync)
      const refreshed = (await storedAccounts()).find(
        (account) => account.id === accountId,
      )
      assert.equal(refreshed.health, "healthy")
      assert.equal(refreshed.quota, user.quota)
      evidence.checks.push(
        `background ${authMode} refresh after the last provider tab closes`,
      )
    } finally {
      site = await dev.context.newPage()
      await site.goto(`${siteUrl}/account/profile`)
    }
  }
} catch (error) {
  await ui
    .screenshot({ path: path.join(evidenceDir, "failure.png"), timeout: 10000 })
    .catch((screenshotError) => {
      evidence.screenshotFailure = String(screenshotError)
    })
  evidence.failure = String(error)
  throw error
} finally {
  // Recover uncertain writes by the unique run names, without replaying creation.
  try {
    if (mutate) {
      const rows = await inventory()
      for (const key of rows)
        if (ownedKeyIds.has(key.id) || ownedNames.has(key.name))
          await request(`/api/token/${key.id}/`, "DELETE")
      evidence.cleanup.noOwnedKeysRemain = !(await inventory()).some(
        (key) => ownedKeyIds.has(key.id) || ownedNames.has(key.name),
      )
      assert.equal(evidence.cleanup.noOwnedKeysRemain, true)
    }
  } catch (error) {
    cleanupErrors.push(error)
  }
  try {
    accountId ||= (await storedAccounts()).find(
      (account) => account.name === accountName,
    )?.id
    if (accountId) {
      await ui.goto(
        `chrome-extension://${dev.extensionId}/options.html#account`,
      )
      const card = ui.getByTestId(
        `account-management-account-list-item-${accountId}`,
      )
      await card.getByTestId(accounts.rowMoreActionsButton).click()
      await ui.getByTestId(accounts.rowDeleteMenuItem).click()
      await ui.getByTestId(accounts.deleteConfirmButton).click()
      await expect
        .poll(async () =>
          (await storedAccounts()).some((account) => account.id === accountId),
        )
        .toBe(false)
      evidence.cleanup.account = true
    }
  } catch (error) {
    cleanupErrors.push(error)
  }
  evidence.cleanup.errors = cleanupErrors.map(String)
  try {
    await fs.writeFile(
      path.join(evidenceDir, "index.json"),
      JSON.stringify(evidence, null, 2),
    )
  } finally {
    await Promise.all(
      [...guideTabs].map((page) => page.close().catch(() => {})),
    )
    await ui.close().catch(() => {})
    await site.close().catch(() => {})
    await dev.close()
  }
}
if (cleanupErrors.length)
  throw new AggregateError(
    cleanupErrors,
    "LaoZhang cleanup failed; inspect retained evidence",
  )
console.log(
  JSON.stringify(
    { checks: evidence.checks, cleanup: evidence.cleanup, evidenceDir },
    null,
    2,
  ),
)
