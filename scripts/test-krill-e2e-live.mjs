/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { API_CREDENTIAL_PROFILES_TEST_IDS as profiles } from "../src/features/ApiCredentialProfiles/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { TOKEN_PROVISIONING_TEST_IDS as secrets } from "../src/features/TokenProvisioning/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "../src/services/accounts/keys/accountKeyNames.ts"
import { KRILL_WEB_ORIGIN as origin } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import { connectDevBrowser, connectExtensionById } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Read-only by default. --mutate exercises disposable key CRUD through the UI.
// Requires a verified logged-in dev profile; never logs in or redeems a grant.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const mutate = process.argv.includes("--mutate")
const evidenceDir = path.resolve(
  process.env.KRILL_EVIDENCE_DIR ||
    `.scratch/krill-ai-adaptation/evidence/cdp-${Date.now()}`,
)
execFileSync("git", [
  "check-ignore",
  "-q",
  path.join(evidenceDir, "index.json"),
])
await fs.mkdir(evidenceDir, { recursive: true })
const discovery = await connectDevBrowser()
let extensionId
try {
  extensionId = await findInstalledDevExtension(
    discovery.browser,
    path.resolve(".output/chrome-mv3"),
  )
} finally {
  await discovery.close()
}
assert.ok(extensionId, "Current-worktree production extension is not installed")
const dev = await connectExtensionById({ extensionId })
dev.context.setDefaultTimeout(30000)
dev.context.setDefaultNavigationTimeout(45000)
let site = await dev.context.newPage()
const ui = await dev.context.newPage()
const uiErrors = []
const pageErrors = []
ui.on("pageerror", (error) => {
  pageErrors.push(String(error.stack))
  uiErrors.push(String(error.stack))
})
ui.on("console", (message) => {
  if (message.type() === "error") uiErrors.push(message.text())
})
await ui.setViewportSize({ width: 1440, height: 1000 })
await ui.addInitScript(() =>
  localStorage.setItem("all-api-hub-i18nextLng", "en"),
)
await ui.addLocatorHandler(ui.getByTestId(updateLog.root), () =>
  ui.getByTestId(updateLog.closeButton).click(),
)
const runName = `AAH Krill ${randomUUID().slice(0, 8)}`
const useDefaultName = process.argv.includes("--default-name")
const createdName = useDefaultName ? DEFAULT_AUTO_PROVISION_KEY_NAME : runName
let accountId, identity, createdKeyId, originalKeyIds, createdProfileId
const originalAccountIds = new Set(
  (await getAccounts(dev.serviceWorker)).map((account) => account.id),
)
const evidence = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worktree: process.cwd(),
  extensionId,
  mutate,
  checks: [],
  cleanup: {},
  limits: [
    "No paid plan on the test account",
    "No successful redemption without an authorized unused code",
    "No billable inference or key rotation",
  ],
}
const stored = () => getAccounts(dev.serviceWorker)
const storedProfiles = () =>
  dev.serviceWorker.evaluate(async () => {
    const stored = (await chrome.storage.local.get("api_credential_profiles"))
      .api_credential_profiles
    const data = typeof stored === "string" ? JSON.parse(stored) : stored
    if (data === undefined) return []
    if (!Array.isArray(data.profiles))
      throw new Error("Invalid credential profile storage")
    return data.profiles
  })
const removeCreatedProfile = async () => {
  if (!createdProfileId) return
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#apiCredentialProfiles`,
  )
  await dismissModals(ui)
  const profile = ui.getByTestId(
    `api-credential-profile-row-${encodeURIComponent(createdProfileId)}`,
  )
  await profile.getByTestId(profiles.deleteTriggerButton).click()
  await ui.getByTestId(profiles.deleteConfirmButton).click()
  await expect
    .poll(async () =>
      (await storedProfiles()).some((item) => item.id === createdProfileId),
    )
    .toBe(false)
  evidence.cleanup.createdCredentialRemoved = true
  createdProfileId = undefined
}
const card = () =>
  ui.getByTestId(`account-management-account-list-item-${accountId}`)
const capture = async (name) => {
  await ui.bringToFront()
  await ui.screenshot({
    path: path.join(evidenceDir, `${name}.png`),
    animations: "disabled",
  })
}
const request = async (endpoint, method = "GET", body) => {
  if (site.isClosed()) site = await dev.context.newPage()
  if (new URL(site.url()).origin !== origin)
    await site.goto(`${origin}/app`, { waitUntil: "domcontentloaded" })
  const result = await site.evaluate(
    async ({ endpoint, method, body }) => {
      const response = await fetch(endpoint, {
        method,
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("krill_jwt")}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return { status: response.status, body: await response.json() }
    },
    { endpoint, method, body },
  )
  await fs.writeFile(
    path.join(evidenceDir, `response-${randomUUID()}.json`),
    JSON.stringify({ endpoint, method, requestBody: body, ...result }, null, 2),
  )
  assert.equal(
    result.status,
    200,
    `${method} ${endpoint}: HTTP ${result.status}`,
  )
  assert.equal(
    result.body.success,
    true,
    `${method} ${endpoint}: business failure`,
  )
  return result.body.data
}
const inventory = () => request("/api/tokens")
try {
  await site.goto(`${origin}/app`, { waitUntil: "domcontentloaded" })
  evidence.session = await preflightSession({
    expectedIdentity: process.env.KRILL_USER_ID || undefined,
    probeTarget: () =>
      probePageSession(site, {
        endpoint: "/api/auth/me",
        readIdentity: (body) =>
          body.success && body.data?.id ? String(body.data.id) : undefined,
      }),
  })
  assert.equal(
    evidence.session.status,
    "ready",
    "Check authorized source sessions before requesting login",
  )
  identity = await request("/api/auth/me")
  originalKeyIds = (await inventory()).map((key) => key.id).sort()
  const subscription = await request("/api/subscription")
  const models = await request("/api/model-pricing")
  const channels = await request("/api/my/channels")
  const endpointSettings = await request("/api/endpoint-settings/me")
  const modelRoutes = await request("/api/my/model-routes")
  const invite = await request("/api/invite/me")
  await capture("00-before-onboarding")
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
  await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
    String(identity.id),
    { timeout: 45000 },
  )
  // Detection can discover identity through a site tab before the Cookie
  // transport permissions are available to finish the account draft.
  if (await grant.isVisible()) {
    await grant.click()
    await ui.getByTestId(accounts.autoDetectButton).click()
  }
  await expect(ui.getByTestId(accounts.confirmAddButton)).toBeEnabled({
    timeout: 45000,
  })
  await ui.getByTestId(accounts.siteNameInput).fill(runName)
  await capture("01-detection")
  await ui.getByTestId(accounts.confirmAddButton).click()
  if (
    (await stored()).some(
      (account) =>
        originalAccountIds.has(account.id) &&
        account.site_type === "krill" &&
        String(account.account_info.id) === String(identity.id),
    )
  ) {
    const continueDuplicate = ui.getByRole("button", {
      name: "Continue",
      exact: true,
    })
    await expect
      .poll(
        async () =>
          (await continueDuplicate.isVisible()) ||
          (await stored()).some(
            (account) =>
              !originalAccountIds.has(account.id) &&
              account.site_type === "krill",
          ),
        { timeout: 45000 },
      )
      .toBe(true)
    if (await continueDuplicate.isVisible()) await continueDuplicate.click()
  }
  const createdAccount = async () =>
    (await stored()).find(
      (account) =>
        !originalAccountIds.has(account.id) && account.site_type === "krill",
    )
  await expect
    .poll(async () => (await createdAccount())?.id, { timeout: 45000 })
    .toBeTruthy()
  accountId = (await createdAccount()).id
  await dismissModals(ui)
  const saved = (await stored()).find((account) => account.id === accountId)
  assert.equal(saved.site_type, "krill")
  assert.equal(saved.authType, "cookie")
  assert.equal(saved.site_url, origin)
  assert.equal(String(saved.account_info.id), String(identity.id))
  assert.equal(
    saved.account_info.quota,
    Number(subscription.credit_balance_usd) * 500000,
  )
  evidence.checks.push(
    "fresh form → Cookie default → automatic identity → save → cash balance",
  )
  await capture("02-account")
  for (const page of dev.context.pages())
    if (page.url().startsWith(`${origin}/`)) await page.close()
  assert.equal(
    dev.context.pages().filter((page) => page.url().startsWith(`${origin}/`))
      .length,
    0,
  )
  const before = saved.last_sync_time
  await card().getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByTestId(accounts.rowRefreshMenuItem).click()
  await expect
    .poll(
      async () =>
        (await stored()).find((account) => account.id === accountId)
          ?.last_sync_time,
      { timeout: 45000 },
    )
    .toBeGreaterThan(before)
  evidence.checks.push("refresh with no same-origin site tabs open")
  const refreshed = (await stored()).find((account) => account.id === accountId)
  for (const metric of ["consumption", "requests", "tokens"])
    assert.equal(
      refreshed.account_info.todayStatsAvailability?.[metric]?.status,
      "complete",
      `Today ${metric} was not collected`,
    )
  evidence.checks.push(
    "today consumption, requests and token metrics collected through the extension",
  )
  await dev.context.grantPermissions(["clipboard-read", "clipboard-write"])
  await ui.bringToFront()
  await card().getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByRole("menuitem", { name: "Share", exact: true }).hover()
  await ui.getByTestId(accounts.rowCopyInviteLinkMenuItem).click()
  await expect
    .poll(() => ui.evaluate(() => navigator.clipboard.readText()), {
      timeout: 45000,
    })
    .toBe(`${origin}/register?invite=${invite.invite_code}`)
  evidence.checks.push("native invitation link retrieved and copied")
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#models?accountId=${accountId}`,
  )
  await dismissModals(ui)
  const display = ui.getByTestId("model-list-display")
  await expect(display.locator("h3").first()).toBeVisible({ timeout: 45000 })
  await expect(display).toContainText(models[0].model_name)
  const sonnet = models.find(
    (model) => model.model_name === "claude-sonnet-5-5",
  )
  assert.ok(sonnet, "reference Sonnet price is available")
  await ui
    .getByRole("textbox", { name: "Search Models", exact: true })
    .fill(sonnet.model_name)
  await expect(
    display.getByRole("heading", { name: sonnet.model_name, exact: true }),
  ).toBeVisible()
  const route =
    endpointSettings.routes.find((route) => route.name === "海外线路") ??
    endpointSettings.routes[0]
  const providerIds = modelRoutes
    .filter((item) => item.model_name === sonnet.model_name)
    .map((item) => item.provider_id)
  const channel = channels
    .filter((channel) => providerIds.includes(channel.id))
    .sort(
      (a, b) => Number(b.billing_multiplier) - Number(a.billing_multiplier),
    )[0]
  assert.ok(channel, "Sonnet billing channel exists")
  const multiplier = Number(
    (
      Number(sonnet.route_multipliers[route.key] ?? "1") *
      Number(channel.billing_multiplier)
    ).toFixed(4),
  )
  const priceCard = display
    .locator('[data-slot="card"]')
    .filter({
      has: ui.getByRole("heading", { name: sonnet.model_name, exact: true }),
    })
    .last()
  await priceCard.getByTestId("model-list-model-expand-button").click()
  await expect(priceCard).toContainText(`Multiplier ${multiplier}`)
  await expect(priceCard).toContainText(route.name)
  await expect(priceCard).toContainText("1-hour cache write")
  for (const field of [
    "input_token_price",
    "output_token_price",
    "cache_read_input_token_price",
    "cache_creation_5m_token_price",
    "cache_creation_1h_token_price",
  ]) {
    const expected = (Number(sonnet[field]) * multiplier).toFixed(4)
    await expect(priceCard).toContainText(`USD: $${expected}`)
  }
  await expect(priceCard).toContainText("1,000,000 tokens")
  await expect(priceCard).toContainText("128,000 tokens")
  await expect(priceCard).not.toContainText("Group multiplier")
  await priceCard.scrollIntoViewIfNeeded()
  await capture("03-pricing")
  evidence.pricing = {
    model: sonnet.model_name,
    route: route.key,
    multiplier,
    cacheWrite1h: Number(sonnet.cache_creation_1h_token_price) * multiplier,
  }
  evidence.checks.push(
    "native default-route/channel prices and separate 5-minute/1-hour cache rates through the built extension",
  )
  const notices = await ui.evaluate(
    async (accountId) =>
      chrome.runtime.sendMessage({
        type: "siteAnnouncements:checkNow",
        id: Date.now(),
        timestamp: Date.now(),
        data: { accountIds: [accountId] },
      }),
    accountId,
  )
  assert.equal(notices.res?.success, true)
  assert.equal(notices.res?.data?.failed, 0)
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#siteAnnouncements`,
  )
  await dismissModals(ui)
  await capture("04-announcements")
  evidence.checks.push("public announcements fetched through the extension")
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#keys?accountId=${accountId}`,
  )
  await dismissModals(ui)
  await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
    originalKeyIds.length,
    { timeout: 45000 },
  )
  if (originalKeyIds.length) {
    const existing = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${originalKeyIds[0]}"]`))
    const selection = await request(`/api/tokens/${originalKeyIds[0]}/channels`)
    await existing.getByRole("button", { name: /details/i }).click()
    await expect(existing).toContainText("Channels", { timeout: 30000 })
    await expect(existing).not.toContainText("Follows account group")
    if (selection.channel_ids.length === 0)
      await expect(existing).toContainText("Default channels")
    for (const channel of channels.filter((channel) =>
      selection.channel_ids.length
        ? selection.channel_ids.includes(channel.id)
        : channel.default_routed,
    ))
      await expect(existing).toContainText(channel.name)
    await capture("04-key-channel-details")
    evidence.checks.push(
      "existing key details show native billing channels and site defaults without account-group semantics",
    )
    await existing.getByRole("button", { name: /details/i }).click()
  }
  await ui
    .getByTestId(
      originalKeyIds.length
        ? keys.addTokenButton
        : keys.emptyStateAddTokenButton,
    )
    .click()
  const editor = ui.getByTestId(keys.nativeEditor)
  await expect(editor.getByLabel("Token Name", { exact: true })).toBeEditable({
    timeout: 30000,
  })
  await expect(editor.getByLabel("Token Name", { exact: true })).toHaveValue(
    DEFAULT_AUTO_PROVISION_KEY_NAME,
  )
  if (!useDefaultName)
    await editor.getByLabel("Token Name", { exact: true }).fill(runName)
  await capture("05-create")
  if (mutate) {
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    // Capture the attributable native id even when a later UI assertion fails.
    await expect
      .poll(
        async () =>
          (await inventory()).find(
            (key) =>
              key.name === createdName && !originalKeyIds.includes(key.id),
          )?.id,
        { timeout: 45000 },
      )
      .toBeTruthy()
    createdKeyId = (await inventory()).find(
      (key) => key.name === createdName && !originalKeyIds.includes(key.id),
    ).id
    if (useDefaultName)
      evidence.checks.push(
        "untouched creation defaults produce a named native key",
      )
    await expect(ui.getByTestId(secrets.oneTimeKeyInput)).toHaveValue(/^nb_/, {
      timeout: 30000,
    })
    const createdSecret = await ui
      .getByTestId(secrets.oneTimeKeyInput)
      .inputValue()
    await ui.getByTestId(secrets.oneTimeKeyCopyButton).click()
    await expect
      .poll(
        async () =>
          (await ui.evaluate(() => navigator.clipboard.readText())) ===
          createdSecret,
      )
      .toBe(true)
    const inferenceModels = await fetch("https://api.krill-ai.net/v1/models", {
      headers: { Authorization: `Bearer ${createdSecret}` },
      signal: AbortSignal.timeout(30000),
    })
    assert.equal(
      inferenceModels.status,
      200,
      "Created key cannot read inference models",
    )
    const inferenceBody = await inferenceModels.json()
    assert.ok(
      Array.isArray(inferenceBody.data) && inferenceBody.data.length > 0,
    )
    evidence.checks.push(
      "one-time secret copied and authenticated inference model list fetched without billable inference",
    )
    await capture("06-one-time-secret")
    await ui.getByTestId(secrets.oneTimeKeySaveButton).click()
    await expect
      .poll(
        async () =>
          (await storedProfiles()).find(
            (profile) => profile.apiKey === createdSecret,
          )?.id,
      )
      .toBeTruthy()
    const savedProfile = (await storedProfiles()).find(
      (profile) => profile.apiKey === createdSecret,
    )
    createdProfileId = savedProfile.id
    assert.equal(savedProfile.baseUrl, "https://api.krill-ai.net")
    await ui.goto(
      `chrome-extension://${extensionId}/options.html#apiCredentialProfiles`,
    )
    await dismissModals(ui)
    const savedProfileRow = ui.getByTestId(
      `api-credential-profile-row-${encodeURIComponent(createdProfileId)}`,
    )
    await savedProfileRow.getByTestId(profiles.exportMenuButton).click()
    await ui.getByTestId(profiles.copyKelivoImportCodeMenuItem).click()
    await ui
      .getByRole("button", { name: "Copy mobile import code", exact: true })
      .click()
    await expect
      .poll(async () =>
        (await ui.evaluate(() => navigator.clipboard.readText())).startsWith(
          "ai-provider:v1:",
        ),
      )
      .toBe(true)
    const shareCode = await ui.evaluate(() => navigator.clipboard.readText())
    const exported = JSON.parse(
      Buffer.from(shareCode.slice("ai-provider:v1:".length), "base64").toString(
        "utf8",
      ),
    )
    assert.ok(
      exported.apiKey === createdSecret,
      "Export changed the created credential",
    )
    assert.equal(exported.baseUrl, "https://api.krill-ai.net/v1")
    evidence.checks.push(
      "one-time secret saved to credential library with canonical host and Kelivo import code copied",
    )
    await removeCreatedProfile()
    await ui.goto(
      `chrome-extension://${extensionId}/options.html#keys?accountId=${accountId}`,
    )
    await dismissModals(ui)
    const row = () =>
      ui
        .getByTestId(keys.nativeKeyRow)
        .and(ui.locator(`[data-resource-id="${createdKeyId}"]`))
    await expect(row()).toContainText(createdName, { timeout: 30000 })
    await row()
      .getByRole("button", { name: /details/i })
      .click()
    await expect(row()).toContainText("Channels", { timeout: 30000 })
    await expect(row()).toContainText("Default channels")
    await expect(row()).not.toContainText("Follows account group")
    await capture("06-key-channel-details")
    await row().getByRole("button", { name: "Edit key", exact: true }).click()
    await expect(editor.getByLabel("Token Name", { exact: true })).toBeEditable(
      { timeout: 30000 },
    )
    await editor
      .getByLabel("Token Name", { exact: true })
      .fill(`${runName} edited`)
    const removedChannel = channels.find((channel) => channel.default_routed)
    assert.ok(removedChannel)
    await editor
      .getByRole("combobox", { name: "Channels", exact: true })
      .click()
    await ui
      .getByRole("option", { name: removedChannel.name, exact: true })
      .click()
    await editor.getByLabel("Token Name", { exact: true }).click()
    const fallback = editor.getByRole("switch").first()
    await fallback.uncheck()
    await editor
      .getByLabel("IP Limits", { exact: true })
      .fill("203.0.113.4, 198.51.100.0/24")
    await capture("07-edit")
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    await expect(editor).toHaveCount(0, { timeout: 45000 })
    const edited = (await inventory()).find((key) => key.id === createdKeyId)
    assert.equal(edited.name, `${runName} edited`)
    assert.equal(edited.allow_balance_fallback, false)
    const savedChannels = await request(`/api/tokens/${createdKeyId}/channels`)
    assert.deepEqual(
      [...savedChannels.channel_ids].sort(),
      channels
        .filter(
          (channel) =>
            channel.default_routed && channel.id !== removedChannel.id,
        )
        .map((channel) => channel.id)
        .sort(),
    )
    assert.equal(
      edited.ip_whitelist.replace(/\s/g, ""),
      "203.0.113.4,198.51.100.0/24",
    )
    await row().getByRole("button", { name: "Edit key", exact: true }).click()
    await expect(editor.getByLabel("Token Name", { exact: true })).toHaveValue(
      `${runName} edited`,
      { timeout: 30000 },
    )
    await expect(editor.getByLabel("IP Limits", { exact: true })).toHaveValue(
      "203.0.113.4, 198.51.100.0/24",
    )
    await editor.getByLabel("Token Name", { exact: true }).fill("")
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    await expect(editor).toHaveCount(0, { timeout: 45000 })
    assert.equal(
      (await inventory()).find((key) => key.id === createdKeyId).name,
      null,
    )
    await expect(row()).toContainText(`Krill #${createdKeyId}`)
    evidence.checks.push(
      "channel selection persisted and nullable native key name remains manageable",
    )
    await row().getByRole("button", { name: "Revoke key", exact: true }).click()
    await expect(ui.getByRole("dialog")).toContainText("Its record remains")
    await capture("08-revoke-confirmation")
    await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
    await expect
      .poll(
        async () =>
          (await inventory()).find((key) => key.id === createdKeyId)
            ?.revoked_at,
        { timeout: 30000 },
      )
      .toBeTruthy()
    await expect(row()).toContainText("Disabled", { timeout: 30000 })
    await expect(row().getByRole("button", { name: /details/i })).toHaveCount(0)
    await expect(row()).toContainText(
      channels.find(
        (channel) => channel.default_routed && channel.id !== removedChannel.id,
      ).name,
    )
    await expect(
      row().getByRole("button", { name: "Revoke key", exact: true }),
    ).toHaveCount(0)
    await expect(
      row().getByRole("button", { name: "Edit key", exact: true }),
    ).toHaveCount(0)
    await expect(
      row().getByRole("button", { name: "Delete key", exact: true }),
    ).toBeVisible()
    await capture("09-revoked-key")
    evidence.checks.push(
      "UI revoke retained the native record, confirmed revoked_at, disabled status and permanent delete remained available",
    )
    await row().getByRole("button", { name: "Delete key", exact: true }).click()
    await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
    await expect
      .poll(
        async () => (await inventory()).some((key) => key.id === createdKeyId),
        { timeout: 30000 },
      )
      .toBe(false)
    evidence.checks.push(
      "UI name-only create → one-time secret → edit → native readback → reopen → delete",
    )
  } else {
    await ui.keyboard.press("Escape")
    evidence.checks.push(
      "native key inventory and name-only creation dialog; writes not requested",
    )
  }
  assert.deepEqual(pageErrors, [], "Extension UI crashed during acceptance")
} catch (error) {
  evidence.failure = String(error)
  await capture("failure").catch(() => {})
  process.exitCode = 1
} finally {
  try {
    await removeCreatedProfile()
  } catch (error) {
    evidence.cleanup.credentialFailure = String(error)
    process.exitCode = 1
  }
  try {
    if (identity && mutate) {
      const currentIdentity = await request("/api/auth/me")
      assert.equal(currentIdentity.id, identity.id)
      const owned = (await inventory()).filter(
        (key) =>
          key.id === createdKeyId ||
          (!originalKeyIds.includes(key.id) && key.name === createdName) ||
          key.name === runName ||
          key.name === `${runName} edited`,
      )
      for (const key of owned)
        await request(`/api/tokens/${key.id}/destroy`, "DELETE")
      assert.deepEqual(
        (await inventory()).map((key) => key.id).sort(),
        originalKeyIds,
      )
      evidence.cleanup.originalKeyInventoryRestored = true
    }
    const account = (await stored()).find(
      (account) =>
        !originalAccountIds.has(account.id) && account.site_type === "krill",
    )
    if (account) {
      accountId = account.id
      await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
      await ui.reload()
      await dismissModals(ui)
      await card().getByTestId(accounts.rowMoreActionsButton).click()
      await ui.getByTestId(accounts.rowDeleteMenuItem).click()
      await ui.getByTestId(accounts.deleteConfirmButton).click()
      await expect
        .poll(async () =>
          (await stored()).some((account) => account.id === accountId),
        )
        .toBe(false)
    }
    evidence.cleanup.localAccountRemoved = true
  } catch (error) {
    evidence.cleanup.failure = String(error)
    process.exitCode = 1
  }
  await fs.writeFile(
    path.join(evidenceDir, "index.json"),
    JSON.stringify(evidence, null, 2),
  )
  await fs.writeFile(
    path.join(evidenceDir, "ui-errors.json"),
    JSON.stringify(uiErrors, null, 2),
  )
  await ui.close().catch(() => {})
  await site.close().catch(() => {})
  await dev.close()
  console.log(
    JSON.stringify({
      evidenceDir,
      checks: evidence.checks,
      cleanup: evidence.cleanup,
      failure: evidence.failure,
    }),
  )
}
