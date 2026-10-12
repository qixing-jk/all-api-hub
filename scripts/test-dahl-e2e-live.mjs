import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { TOKEN_PROVISIONING_TEST_IDS as secrets } from "../src/features/TokenProvisioning/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import { DAHL_WEB_ORIGIN } from "../src/services/accountSiteDefinitions/identifiers.ts"
import {
  STORAGE_KEYS,
  STORAGE_LOCKS,
} from "../src/services/core/storageKeys.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import { connectDevBrowser, connectExtensionById } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { testModelCatalogFlow } from "./flows/model-catalog.mjs"
import {
  redactEvidence,
  redactEvidenceBody,
} from "./utils/evidence-redaction.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Default: read-only provider probes plus an isolated local account (removed).
// --mutate: create one zero-token key, allocate/return its credit, and revoke it.
// --names-only with --mutate skips funding writes for focused naming validation.
// No inference, login, grant issuance, checkout, redemption or account deletion.
// Optional DAHL_SESSION_FILE contains origin-scoped cookies obtained through an
// authorized live source. DAHL_USER_ID must identify that source before transfer.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const mutate = process.argv.includes("--mutate")
const namesOnly = process.argv.includes("--names-only")
const origin = DAHL_WEB_ORIGIN
const accountName = `AAH Dahl ${randomUUID().slice(0, 8)}`
const evidenceDir = path.resolve(
  process.env.DAHL_EVIDENCE_DIR ||
    `.scratch/dahl-adaptation/evidence/ui-${Date.now()}`,
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
const dev = await connectExtensionById({ extensionId })
const captures = new Set()
const captureErrors = []
const captureResponse = (response) => {
  if (!response.url().startsWith(`${origin}/v1/`)) return
  const pending = (async () => {
    const request = response.request()
    await fs.writeFile(
      path.join(evidenceDir, `network-${randomUUID()}.json`),
      JSON.stringify(
        {
          url: response.url(),
          method: request.method(),
          requestHeaders: redactEvidence(await request.allHeaders()),
          requestBody: redactEvidenceBody(request.postData()),
          status: response.status(),
          responseHeaders: redactEvidence(await response.allHeaders()),
          body: redactEvidenceBody(await response.text()),
        },
        null,
        2,
      ),
    )
  })()
    .catch((error) => captureErrors.push(String(error)))
    .finally(() => captures.delete(pending))
  captures.add(pending)
}
dev.context.on("response", captureResponse)
let providerRequestCount = 0
const countProviderRequest = (request) => {
  if (request.url().startsWith(`${origin}/v1/`)) providerRequestCount += 1
}
dev.context.on("request", countProviderRequest)
let site = await dev.context.newPage()
const ui = await dev.context.newPage()
await ui.addInitScript(() =>
  localStorage.setItem("all-api-hub-i18nextLng", "en"),
)
await ui.addLocatorHandler(ui.getByTestId(updateLog.root), () =>
  ui.getByTestId(updateLog.closeButton).click(),
)
let accountId
let createdKeyId
let originalWebsiteNames
let initial
const evidence = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worktree: process.cwd(),
  extensionId: dev.extensionId,
  capturedAt: new Date().toISOString(),
  mutate,
  namesOnly,
  checks: [],
  cleanup: {},
}
const capture = async (name) => {
  await ui.bringToFront()
  await ui.screenshot({
    path: path.join(evidenceDir, name),
    animations: "disabled",
    mask: [ui.getByTestId(secrets.oneTimeKeyInput)],
  })
}
const stored = () => getAccounts(dev.serviceWorker)
const card = () =>
  ui.getByTestId(`account-management-account-list-item-${accountId}`)
let sequence = 0
async function request(endpoint, method = "GET") {
  const response = await site.evaluate(
    async ({ endpoint, method }) => {
      const response = await fetch(endpoint, {
        method,
        credentials: "include",
        cache: "no-store",
      })
      return {
        endpoint,
        method,
        status: response.status,
        body: await response.json(),
      }
    },
    { endpoint, method },
  )
  await fs.writeFile(
    path.join(evidenceDir, `probe-${sequence++}.json`),
    JSON.stringify(redactEvidence(response), null, 2),
  )
  assert.ok(
    response.status >= 200 && response.status < 300,
    `Unexpected status for ${endpoint}: ${response.status}`,
  )
  return response.body
}
const probe = () =>
  probePageSession(site, {
    endpoint: `${origin}/v1/account`,
    readIdentity: (body) =>
      typeof body?.user?.user_id === "string" ? body.user.user_id : undefined,
  })
const inventory = async () => (await request("/v1/account/keys")).keys
try {
  await site.goto(`${origin}/account`)
  let readiness = await preflightSession({
    probeTarget: probe,
    expectedIdentity: process.env.DAHL_USER_ID,
  })
  if (
    readiness.status === "source-check-required" &&
    process.env.DAHL_SESSION_FILE
  ) {
    assert.ok(
      process.env.DAHL_USER_ID,
      "Scoped session transfer requires the verified source user ID",
    )
    const imported = JSON.parse(
      await fs.readFile(process.env.DAHL_SESSION_FILE, "utf8"),
    )
    const cookies = imported.filter((cookie) =>
      ["dahl_session", "cf_clearance"].includes(cookie.name),
    )
    assert.ok(cookies.some((cookie) => cookie.name === "dahl_session"))
    assert.ok(
      cookies.every(
        (cookie) =>
          ["inference.dahl.global", ".dahl.global"].includes(cookie.domain) &&
          cookie.secure,
      ),
    )
    const previous = (await dev.context.cookies(origin)).filter((cookie) =>
      cookies.some(
        (item) => item.name === cookie.name && item.domain === cookie.domain,
      ),
    )
    await dev.context.addCookies(cookies)
    await site.reload()
    readiness = await preflightSession({
      probeTarget: probe,
      expectedIdentity: process.env.DAHL_USER_ID,
    })
    if (readiness.status !== "ready") {
      for (const cookie of cookies)
        await dev.context.clearCookies({
          name: cookie.name,
          domain: cookie.domain,
        })
      await dev.context.addCookies(previous)
    }
  }
  evidence.session = readiness
  assert.equal(
    readiness.status,
    "ready",
    "Check authorized source sessions or diagnose the identity probe before requesting login",
  )
  initial = await request("/v1/account")
  originalWebsiteNames = await site.evaluate(() =>
    JSON.parse(localStorage.getItem("dahl_key_labels") ?? "{}"),
  )
  const originalKeys = (await inventory()).filter(
    (key) => key.status !== "revoked",
  )
  await ui.goto(`chrome-extension://${dev.extensionId}/options.html#account`)
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
  await expect(ui.getByTestId(accounts.siteTypeTrigger)).toContainText("dahl", {
    timeout: 30000,
  })
  await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
    initial.user.user_id,
  )
  if (
    !(await ui.evaluate(() =>
      globalThis.chrome.permissions.contains({ permissions: ["cookies"] }),
    ))
  ) {
    await expect(grant).toBeVisible()
    await grant.click()
    await expect
      .poll(() =>
        ui.evaluate(() =>
          globalThis.chrome.permissions.contains({ permissions: ["cookies"] }),
        ),
      )
      .toBe(true)
    await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
      initial.user.user_id,
    )
  }
  await expect(ui.getByTestId(accounts.confirmAddButton)).toBeVisible({
    timeout: 30000,
  })
  await ui.getByTestId(accounts.siteNameInput).fill(accountName)
  await capture("00-onboarding.png")
  await ui.getByTestId(accounts.confirmAddButton).click()
  await expect
    .poll(
      async () =>
        (await stored()).find((account) => account.site_name === accountName)
          ?.id,
      { timeout: 30000 },
    )
    .toBeTruthy()
  accountId = (await stored()).find(
    (account) => account.site_name === accountName,
  ).id
  await dismissModals(ui)
  const saved = (await stored()).find((account) => account.id === accountId)
  assert.equal(saved.authType, "cookie")
  assert.equal(saved.site_type, "dahl")
  assert.equal(String(saved.account_info.id), initial.user.user_id)
  await expect
    .poll(
      async () =>
        (await stored()).find((account) => account.id === accountId)
          ?.account_info.quota,
      { timeout: 30000 },
    )
    .toBe(Math.round((initial.token_balance + initial.tokens_on_keys) * 0.015))
  await expect(card()).toContainText("tokens")
  evidence.checks.push(
    "normal Cookie default, automatic UUID detection, save and token credit",
  )
  await site.close()
  const beforeRefresh = (await stored()).find(
    (account) => account.id === accountId,
  ).last_sync_time
  await card().getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByTestId(accounts.rowRefreshMenuItem).click()
  await expect
    .poll(
      async () =>
        (await stored()).find((account) => account.id === accountId)
          ?.last_sync_time,
      { timeout: 30000 },
    )
    .toBeGreaterThan(beforeRefresh)
  const creditValue =
    ((initial.token_balance + initial.tokens_on_keys) * 0.03) / 1_000_000
  await expect(card()).toContainText(`$${creditValue.toFixed(2)}`)
  await capture("01-balance.png")
  evidence.checks.push("refresh after closing the site tab")
  site = await dev.context.newPage()
  await site.goto(`${origin}/account`)
  await testModelCatalogFlow({
    page: ui,
    extensionId: dev.extensionId,
    accountName,
    accountId,
  })
  const catalog = await request("/v1/models")
  await expect(ui.locator('[data-testid="model-list-display"] h3')).toHaveCount(
    catalog.data.length,
  )
  await capture("02-models.png")
  evidence.checks.push("public provider catalog with published price estimate")
  await ui.goto(
    `chrome-extension://${dev.extensionId}/options.html#keys?accountId=${accountId}`,
  )
  await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
    originalKeys.length,
    { timeout: 30000 },
  )
  const reusable = originalKeys.find((key) =>
    /^dahl_[a-z0-9]+$/i.test(key.token ?? ""),
  )
  if (reusable) {
    const row = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${reusable.id}"]`))
    const beforeDisclosure = providerRequestCount
    await row.getByRole("button", { name: "Show Key", exact: true }).click()
    await expect
      .poll(async () => (await row.textContent()).includes(reusable.token))
      .toBe(true)
    await row.getByRole("button", { name: "Hide Key", exact: true }).click()
    await dev.context.grantPermissions(["clipboard-read"])
    try {
      await ui.bringToFront()
      await row.getByRole("button", { name: "Copy Key", exact: true }).click()
      await expect
        .poll(() =>
          ui.evaluate(
            (secret) =>
              navigator.clipboard.readText().then((text) => text === secret),
            reusable.token,
          ),
        )
        .toBe(true)
      assert.equal(providerRequestCount, beforeDisclosure)
    } finally {
      await dev.context.clearPermissions()
    }
    await capture("02a-inventory-secret-actions.png")
    evidence.checks.push(
      "existing plaintext inventory token reveal/hide/copy performs zero provider requests",
    )
  } else {
    evidence.checks.push(
      "plaintext inventory reuse unverified: this account inventory contains no full token",
    )
  }
  await ui.getByTestId(keys.addTokenButton).click()
  const amount = ui.locator("#resource-editor-transfer_amount")
  await expect(ui.getByTestId(keys.nativeEditor)).toContainText(
    "Creates a new key with 0 tokens",
    { timeout: 30000 },
  )
  await expect(ui.getByTestId(keys.nativeEditor).locator("input")).toHaveCount(
    1,
  )
  const createdName = `AAH key ${randomUUID().slice(0, 8)}`
  if (mutate)
    await ui
      .getByRole("textbox", { name: "Key name", exact: true })
      .fill(createdName)
  await expect(amount).toHaveCount(0)
  await capture("03-create-key.png")
  if (mutate) {
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    await expect
      .poll(
        async () =>
          (await inventory()).filter(
            (key) =>
              key.status !== "revoked" &&
              !originalKeys.some((original) => original.id === key.id),
          ).length,
        { timeout: 30000 },
      )
      .toBe(1)
    const created = (await inventory()).filter(
      (key) =>
        key.status !== "revoked" &&
        !originalKeys.some((original) => original.id === key.id),
    )
    assert.equal(created.length, 1)
    createdKeyId = created[0].id
    await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0, {
      timeout: 30000,
    })
    assert.equal(created[0].available_tokens, 0)
    await expect(ui.getByTestId(secrets.oneTimeKeyInput)).toHaveValue(
      created[0].token,
    )
    await expect(ui.getByRole("dialog")).toContainText(
      "You can reveal it again later",
    )
    await expect(ui.getByRole("dialog")).toContainText(createdName)
    await expect(ui.getByTestId(secrets.oneTimeKeySaveButton)).toHaveCount(0)
    await capture("04-created-key.png")
    await ui.getByTestId(secrets.oneTimeKeyCopyButton).click()
    await ui
      .getByRole("dialog")
      .getByRole("button", { name: "Allocate tokens", exact: true })
      .click()
    await expect(amount).toBeEditable({ timeout: 30000 })
    await capture("04a-create-to-allocate.png")
    await ui.keyboard.press("Escape")
    // Both native comparisons use the same run-owned key card boundary.
    const nativeKeyCard = (action) =>
      site
        .locator("div")
        .filter({
          has: site.locator("code").filter({ hasText: created[0].masked }),
        })
        .filter({
          has: site.getByRole("button", { name: action, exact: true }),
        })
        .last()
    const row = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${createdKeyId}"]`))
    await expect(row).toContainText(createdName, { timeout: 30000 })
    await expect(row.getByRole("button", { name: /details/i })).toHaveCount(0)
    await expect(
      row.getByRole("button", { name: "Return tokens", exact: true }),
    ).toHaveCount(1)
    assert.equal(
      await site.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("dahl_key_labels") ?? "{}")[
            String(id)
          ],
        createdKeyId,
      ),
      createdName,
    )
    if (!namesOnly) {
      for (const operation of [
        { direction: "Allocate from pool", amount: "1K", target: 1000 },
        { direction: "Return to pool", amount: "400", target: 600 },
      ]) {
        // Compare the same run-owned key and starting balance on the native UI.
        await site.goto(`${origin}/account`)
        await site
          .getByRole("button", { name: "API keys & Balance", exact: true })
          .first()
          .click()
        const nativeAction =
          operation.direction === "Allocate from pool" ? "Allocate" : "Return"
        const nativeCard = nativeKeyCard(nativeAction)
        await nativeCard
          .getByRole("button", { name: nativeAction, exact: true })
          .click()
        await site.getByRole("textbox").last().fill(operation.amount)
        await expect(
          site.getByRole("button", { name: nativeAction, exact: true }).last(),
        ).toBeEnabled()
        await site.bringToFront()
        await site.screenshot({
          path: path.join(
            evidenceDir,
            `native-${nativeAction.toLowerCase()}.png`,
          ),
          animations: "disabled",
          mask: [ui.getByTestId(secrets.oneTimeKeyInput)],
        })
        await site.getByRole("button", { name: "Close", exact: true }).click()
        await row
          .getByRole("button", {
            name:
              operation.direction === "Allocate from pool"
                ? "Allocate tokens"
                : "Return tokens",
            exact: true,
          })
          .click()
        await expect(amount).toBeEditable({ timeout: 30000 })
        await expect(ui.getByRole("radio")).toHaveCount(0)
        const cap =
          operation.direction === "Allocate from pool"
            ? initial.token_balance
            : 1000
        await ui.getByRole("button", { name: "25%", exact: true }).click()
        await expect(amount).toHaveValue(String(Math.floor(cap * 0.25)))
        await ui.getByRole("button", { name: "50%", exact: true }).click()
        await expect(amount).toHaveValue(String(Math.floor(cap * 0.5)))
        await ui.getByRole("button", { name: "Max", exact: true }).click()
        await expect(amount).toHaveValue(String(cap))
        await amount.fill(String(cap + 1))
        await expect(
          ui.getByTestId(keys.nativeEditorSubmitButton),
        ).toBeDisabled()
        await expect(
          ui.getByTestId(keys.nativeEditor).getByRole("alert"),
        ).toContainText("must not exceed")
        await amount.fill(operation.amount)
        await capture(
          operation.direction === "Allocate from pool"
            ? "05-allocate.png"
            : "06-return.png",
        )
        await ui.getByTestId(keys.nativeEditorSubmitButton).click()
        await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0, {
          timeout: 30000,
        })
        const updated = (await inventory()).find(
          (key) => key.id === createdKeyId,
        )
        assert.equal(updated.available_tokens, operation.target)
        assert.equal(updated.token, created[0].token)
      }
      await row
        .getByRole("button", {
          name: "Return tokens",
          exact: true,
        })
        .click()
      await expect(amount).toHaveValue("", { timeout: 30000 })
      await expect(ui.getByRole("radio")).toHaveCount(0)
      await ui.getByRole("button", { name: "Max", exact: true }).click()
      await expect(amount).toHaveValue("600")
      await capture("07-return-all.png")
      await amount.fill("")
      await ui.keyboard.press("Escape")
      await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0)
      assert.equal(
        (await inventory()).find((key) => key.id === createdKeyId)
          .available_tokens,
        600,
      )
    }
    const renamed = `${createdName} renamed`
    const renameOpenedAt = performance.now()
    await row.getByRole("button", { name: "Rename", exact: true }).click()
    await expect(
      ui.getByRole("textbox", { name: "Key name", exact: true }),
    ).toBeEditable({ timeout: 30000 })
    await expect(ui.getByRole("radio")).toHaveCount(0)
    const renameOpenMs = performance.now() - renameOpenedAt
    const nameInput = ui.getByRole("textbox", { name: "Key name", exact: true })
    await expect(nameInput).toHaveValue(createdName)
    await expect(amount).toHaveCount(0)
    await nameInput.fill(renamed)
    await capture("08-rename-key.png")
    const viewport = await ui.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }))
    await ui.setViewportSize({ width: 390, height: 844 })
    await expect(ui.getByTestId(keys.nativeEditorSubmitButton)).toBeInViewport()
    assert.ok(
      await ui.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Compact rename must not overflow horizontally",
    )
    await capture("08a-rename-compact.png")
    await ui.setViewportSize(viewport)
    const renameSavedAt = performance.now()
    await ui.getByRole("button", { name: "Save name", exact: true }).click()
    await expect(row).toContainText(renamed, { timeout: 2000 })
    await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0)
    evidence.renameTiming = {
      openMs: Math.round(renameOpenMs),
      saveMs: Math.round(performance.now() - renameSavedAt),
    }
    await expect
      .poll(
        () =>
          site.evaluate(
            (id) =>
              JSON.parse(localStorage.getItem("dahl_key_labels") ?? "{}")[
                String(id)
              ],
            createdKeyId,
          ),
        { timeout: 15000 },
      )
      .toBe(renamed)
    await site.reload()
    await site
      .getByRole("button", { name: "API keys & Balance", exact: true })
      .first()
      .click()
    const nativeNamedCard = nativeKeyCard("Allocate")
    await expect(nativeNamedCard).toContainText(renamed)
    // Native desktop key text can overlap this button; use its keyboard action.
    const nativeRename = nativeNamedCard.getByRole("button", {
      name: "Rename key",
      exact: true,
    })
    await nativeRename.focus()
    await nativeRename.press("Enter")
    const websiteName = `${createdName} website`
    await nativeNamedCard.getByRole("textbox").fill(websiteName)
    await nativeNamedCard.getByRole("textbox").press("Enter")
    await expect(nativeNamedCard).toContainText(websiteName)
    await site.bringToFront()
    await site.screenshot({
      path: path.join(evidenceDir, "native-rename-key.png"),
      animations: "disabled",
      mask: [ui.getByTestId(secrets.oneTimeKeyInput)],
    })
    await ui.reload()
    await expect(row).toContainText(websiteName, { timeout: 30000 })
    const otherDahlPages = dev.context
      .pages()
      .filter((page) => page !== site && page.url().startsWith(`${origin}/`))
    if (otherDahlPages.length === 0) {
      await site.goto("about:blank")
      await row.getByRole("button", { name: "Rename", exact: true }).click()
      await expect(
        ui.getByRole("textbox", { name: "Key name", exact: true }),
      ).toBeEditable({ timeout: 30000 })
      await expect(ui.getByRole("radio")).toHaveCount(0)
      const offlineName = `${createdName} offline`
      await nameInput.fill(offlineName)
      await ui.getByRole("button", { name: "Save name", exact: true }).click()
      await expect(row).toContainText(offlineName, { timeout: 30000 })
      await row.getByRole("button", { name: "Rename", exact: true }).click()
      await expect(
        ui.getByRole("textbox", { name: "Key name", exact: true }),
      ).toBeEditable({ timeout: 30000 })
      await expect(ui.getByRole("radio")).toHaveCount(0)
      await expect(ui.getByTestId(keys.nativeEditor)).toContainText(
        "waiting to sync",
      )
      await capture("09-offline-name.png")
      await ui.keyboard.press("Escape")
      await site.goto(`${origin}/account`)
      await ui.reload()
      await expect(row).toContainText(offlineName, { timeout: 30000 })
      assert.equal(
        await site.evaluate(
          (id) =>
            JSON.parse(localStorage.getItem("dahl_key_labels") ?? "{}")[
              String(id)
            ],
          createdKeyId,
        ),
        offlineName,
      )
      evidence.checks.push(
        "no-website-page local rename, pending status and later synchronization",
      )
    } else
      evidence.checks.push(
        "offline UI comparison skipped to preserve unrelated existing website pages; covered by behavior tests",
      )
    const preserved = (await inventory()).find((key) => key.id === createdKeyId)
    assert.equal(preserved.available_tokens, namesOnly ? 0 : 600)
    assert.equal(preserved.token, created[0].token)
    await row.getByRole("button", { name: "Revoke key", exact: true }).click()
    await expect(ui.getByRole("dialog")).toContainText(
      "returned to the account pool",
    )
    await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
    await expect(row).toHaveCount(0, { timeout: 30000 })
    assert.equal(
      (await inventory()).find((key) => key.id === createdKeyId).status,
      "revoked",
    )
    evidence.checks.push(
      namesOnly
        ? "zero-token key creation, recoverable secret preservation and revoke; funding writes skipped"
        : "separate key create and recoverable secret delivery; independent K/M allocation/return, 25%/50%/Max, over-cap validation, reopen, cancel, secret preservation and revoke",
    )
    evidence.checks.push(
      "creation name and direct Allocate handoff; bidirectional website/local name sync, rename-only action and no credential-library promotion",
    )
  } else {
    await ui.keyboard.press("Escape")
    evidence.checks.push(
      "key inventory and separate zero-token creation confirmation; writes skipped",
    )
  }
} catch (error) {
  evidence.failure = String(error)
  await fs.writeFile(
    path.join(evidenceDir, "failure-ui.txt"),
    redactEvidence(
      await ui
        .locator("body")
        .innerText()
        .catch(() => "unavailable"),
    ),
  )
  await capture("failure.png").catch(() => {})
  throw error
} finally {
  try {
    if (createdKeyId) {
      if (site.isClosed()) {
        site = await dev.context.newPage()
      }
      if (!site.url().startsWith(`${origin}/`)) {
        await site.goto(`${origin}/account`)
      }
      const current = await request("/v1/account")
      assert.equal(current.user.user_id, initial.user.user_id)
      if (
        (await inventory()).find((key) => key.id === createdKeyId)?.status !==
        "revoked"
      )
        await request(`/v1/account/keys/${createdKeyId}`, "DELETE")
      const final = await request("/v1/account")
      assert.equal(final.token_balance, initial.token_balance)
      assert.equal(final.tokens_on_keys, initial.tokens_on_keys)
      evidence.cleanup.creditRestored = true
      evidence.cleanup.revokedRecordRetained = true
      await site.evaluate((id) => {
        const names = JSON.parse(
          localStorage.getItem("dahl_key_labels") ?? "{}",
        )
        delete names[String(id)]
        localStorage.setItem("dahl_key_labels", JSON.stringify(names))
      }, createdKeyId)
      const finalNames = await site.evaluate(() =>
        JSON.parse(localStorage.getItem("dahl_key_labels") ?? "{}"),
      )
      assert.deepEqual(finalNames, originalWebsiteNames)
      evidence.cleanup.websiteNamesRestored = true
      await ui.evaluate(
        async ({ key, lock, owner, id }) => {
          await navigator.locks.request(lock, async () => {
            const value = (await globalThis.chrome.storage.local.get(key))[key]
            const names =
              typeof value === "string" ? JSON.parse(value) : value ?? {}
            if (names[owner]) {
              delete names[owner][String(id)]
              if (Object.keys(names[owner]).length === 0) delete names[owner]
              await globalThis.chrome.storage.local.set({
                [key]: JSON.stringify(names),
              })
            }
          })
        },
        {
          key: STORAGE_KEYS.DAHL_KEY_NAMES,
          lock: STORAGE_LOCKS.DAHL_KEY_NAMES,
          owner: JSON.stringify([origin, initial.user.user_id, false, ""]),
          id: createdKeyId,
        },
      )
      evidence.cleanup.localKeyNameRemoved = true
    }
    const account = (await stored()).find(
      (account) => account.site_name === accountName,
    )
    if (account) {
      accountId = account.id
      await ui.goto(
        `chrome-extension://${dev.extensionId}/options.html#account`,
      )
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
  dev.context.off("response", captureResponse)
  dev.context.off("request", countProviderRequest)
  await Promise.all(captures)
  evidence.captureErrors = captureErrors
  if (captureErrors.length) process.exitCode = 1
  await fs.writeFile(
    path.join(evidenceDir, "index.json"),
    JSON.stringify(redactEvidence(evidence), null, 2),
  )
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
