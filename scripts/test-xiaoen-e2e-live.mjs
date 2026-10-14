/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import { XIAOEN_WEB_ORIGIN as origin } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import { connectDevBrowser, connectExtensionById } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Read-only provider validation; the only write is a run-owned local extension account.
// Requires an authenticated Xiaoen session in the dedicated dev browser.
// No login, key rotation, signup, credit claim or message acknowledgement is performed.
await loadLocalEnv()
applyIsolateFlag(process.argv)
if (process.argv.includes("--prepare-login")) {
  const browser = await connectDevBrowser()
  const page = await browser.context.newPage()
  await page.goto(`${origin}/login`)
  await browser.close()
  console.log(
    "Opened Xiaoen login in the dedicated dev browser; no credentials submitted.",
  )
  process.exit(0)
}
const evidenceDir = path.resolve(
  process.env.XIAOEN_EVIDENCE_DIR ||
    `.scratch/supxh-adaptation/evidence/cdp-${Date.now()}`,
)
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
const site = await dev.context.newPage()
const ui = await dev.context.newPage()
await ui.setViewportSize({ width: 1440, height: 1000 })
await ui.addInitScript(() =>
  localStorage.setItem("all-api-hub-i18nextLng", "en"),
)
await ui.addLocatorHandler(ui.getByTestId(updateLog.root), () =>
  ui.getByTestId(updateLog.closeButton).click(),
)
const accountName = `AAH Xiaoen ${randomUUID().slice(0, 8)}`
let accountId,
  clipboardOverride = false
const evidence = {
  capturedAt: new Date().toISOString(),
  worktree: process.cwd(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  extensionId,
  checks: [],
  screenshots: [],
  cleanup: {},
}
const stored = () => getAccounts(dev.serviceWorker)
const card = () =>
  ui.getByTestId(`account-management-account-list-item-${accountId}`)
const capture = async (name, target = ui) => {
  await target.screenshot({
    path: path.join(evidenceDir, name),
    animations: "disabled",
  })
  evidence.screenshots.push(name)
}
const readIdentity = () =>
  site.evaluate(async () => {
    const response = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    })
    const body = await response.json()
    if (!response.ok || !body.success) throw Error("Xiaoen session unavailable")
    return body.data
  })
const forbiddenWrites = []
const observeRequest = (request) => {
  if (
    request.url().startsWith(`${origin}/api/`) &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
    !request.url().endsWith("/api/analytics/event")
  )
    forbiddenWrites.push({ url: request.url(), method: request.method() })
}
dev.context.on("request", observeRequest)
try {
  await site.goto(`${origin}/dashboard/keys`)
  evidence.sessionPreflight = await preflightSession({
    expectedIdentity: process.env.XIAOEN_USER_ID || undefined,
    probeTarget: () =>
      probePageSession(site, {
        endpoint: "/api/auth/me",
        readIdentity: (body) =>
          body.success === true ? body.data?.id : undefined,
      }),
  })
  assert.equal(
    evidence.sessionPreflight.status,
    "ready",
    "Inspect authorized source sessions when the target preflight is not ready",
  )
  const initial = await readIdentity()
  const runtimeResponse = await site.request.get(
    `${initial.apiBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/models`,
    { headers: { Authorization: `Bearer ${initial.apiKey}` } },
  )
  assert.equal(
    runtimeResponse.status(),
    200,
    "Native inference model list unavailable",
  )
  const runtimeBody = await runtimeResponse.json()
  const expectedModelIds = runtimeBody.data.map((model) => model.id).sort()
  assert.ok(expectedModelIds.length > 0)
  evidence.runtimeModelIds = expectedModelIds
  evidence.identity = initial.id
  evidence.nativeBalance = {
    total: initial.quota,
    permanent: initial.permanentQuota,
    daily: initial.dailyQuota,
  }
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
    "xiaoen",
    { timeout: 45000 },
  )
  await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(initial.id, {
    timeout: 45000,
  })
  await ui.getByTestId(accounts.siteNameInput).fill(accountName)
  await capture("00-onboarding.png")
  await ui.getByTestId(accounts.confirmAddButton).click()
  await expect
    .poll(
      async () => {
        const duplicate = ui.getByTestId(
          accounts.duplicateWarningContinueButton,
        )
        if (await duplicate.isVisible()) await duplicate.click()
        return (await stored()).find(
          (account) => account.site_name === accountName,
        )?.id
      },
      { timeout: 45000 },
    )
    .toBeTruthy()
  // Saving the configuration completes before the ordinary post-save refresh.
  // Wait for accepted provider data rather than inspecting its placeholder snapshot.
  await expect
    .poll(
      async () =>
        (await stored()).find((account) => account.site_name === accountName)
          ?.account_info.nativeBalance,
      { timeout: 45000 },
    )
    .toEqual({
      unit: "credits",
      total: initial.quota,
      permanent: initial.permanentQuota,
      daily: initial.dailyQuota,
    })
  const saved = (await stored()).find(
    (account) => account.site_name === accountName,
  )
  accountId = saved.id
  assert.equal(saved.site_type, "xiaoen")
  assert.equal(saved.authType, "cookie")
  assert.equal(saved.account_info.id, initial.id)
  assert.deepEqual(saved.account_info.nativeBalance, {
    unit: "credits",
    total: initial.quota,
    permanent: initial.permanentQuota,
    daily: initial.dailyQuota,
  })
  await dismissModals(ui)
  await expect(card()).toContainText(
    new Intl.NumberFormat("en").format(initial.quota),
  )
  await capture("01-account.png", card())
  evidence.checks.push(
    "fresh Cookie auto-detection, live identity, save and native credits",
  )
  await site.close()
  assert.ok(
    dev.context.pages().every((page) => !page.url().startsWith(`${origin}/`)),
    "Another console tab remains open; tab-free refresh was not established",
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
  evidence.checks.push("refresh with no console tab")
  await dev.context.grantPermissions(["clipboard-read"])
  clipboardOverride = true
  await ui.bringToFront()
  await card().getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByRole("menuitem", { name: "Share", exact: true }).hover()
  await ui.getByTestId(accounts.rowCopyInviteLinkMenuItem).click()
  const expectedInvite = `https://go.toter.me/register?code=${encodeURIComponent(initial.inviteCode)}`
  await expect
    .poll(() => ui.evaluate(() => navigator.clipboard.readText()), {
      timeout: 30000,
    })
    .toBe(expectedInvite)
  await capture("02-invitation.png", card())
  evidence.checks.push("canonical invitation copy")
  await card().getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByTestId(accounts.rowKeyManagementMenuItem).click()
  const credential = ui.getByTestId(keys.serviceCredentialCard)
  await expect(credential).toBeVisible({ timeout: 45000 })
  await expect(credential).toContainText("肖恩 AI")
  await expect(credential).toContainText(
    `${initial.apiBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
  )
  await credential.getByRole("button", { name: "Copy", exact: true }).click()
  await expect
    .poll(
      async () =>
        (await ui.evaluate(() => navigator.clipboard.readText())) ===
        initial.apiKey,
    )
    .toBe(true)
  await capture("03-service-key.png", credential)
  evidence.checks.push(
    "singleton inference-key card and exact plaintext copy without rotation or CRUD",
  )
  await credential.getByTestId(keys.serviceCredentialExportMenuButton).click()
  await ui
    .getByRole("menuitem", { name: "Export to Kelivo mobile", exact: true })
    .click()
  await ui
    .getByRole("button", { name: "Copy mobile import code", exact: true })
    .click()
  await expect
    .poll(async () => {
      const code = await ui.evaluate(() => navigator.clipboard.readText())
      if (!code.startsWith("ai-provider:v1:")) return false
      const payload = JSON.parse(
        Buffer.from(code.slice("ai-provider:v1:".length), "base64").toString(
          "utf8",
        ),
      )
      return (
        payload.apiKey === initial.apiKey &&
        payload.baseUrl ===
          `${initial.apiBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1` &&
        payload.type === "openai"
      )
    })
    .toBe(true)
  await dismissModals(ui)
  evidence.checks.push(
    "Kelivo export contains the existing inference key and account-specific /v1 route",
  )
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#models?accountId=${encodeURIComponent(accountId)}`,
  )
  await dismissModals(ui)
  const modelRoot = ui.getByTestId("model-list-page")
  await expect(modelRoot).toHaveAttribute(
    "data-model-source",
    `account:${accountId}`,
  )
  const modelDisplay = ui.getByTestId("model-list-display")
  await expect(modelDisplay.locator("h3").first()).toBeVisible({
    timeout: 45000,
  })
  // Rows are virtualized; the normal copy action exposes the complete filtered list.
  await ui
    .getByRole("button", { name: "Copy All Model Names", exact: true })
    .click()
  await expect
    .poll(
      async () =>
        (await ui.evaluate(() => navigator.clipboard.readText()))
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
          .sort(),
      { timeout: 45000 },
    )
    .toEqual(expectedModelIds)
  await expect(modelDisplay).toContainText("额度")
  assert.equal(
    /[$¥￥]\s*\d/.test(await modelDisplay.innerText()),
    false,
    "Native credits must not acquire a monetary price",
  )
  await capture("04-models.png")
  evidence.checks.push("key-visible model catalog")
  const current = (await stored()).find((account) => account.id === accountId)
  assert.ok(
    current.checkIn.methodKnowledge.methods["xiaoen:daily-checkin"],
    "Native check-in method was not discovered",
  )
  const checkInStatus =
    current.checkIn.methodKnowledge.methods["xiaoen:daily-checkin"].status
  assert.equal(checkInStatus?.outcome, "known")
  assert.equal(checkInStatus?.availability, "enabled")
  assert.equal(
    checkInStatus?.today,
    initial.hasSignedInToday ? "checked" : "not_checked",
  )
  evidence.checkInStatus = checkInStatus
  evidence.checks.push("read-only native daily check-in discovery")
  const announcementsResponse = await ui.evaluate(async (accountId) => {
    return await chrome.runtime.sendMessage({
      type: "siteAnnouncements:checkNow",
      id: Date.now(),
      timestamp: Date.now(),
      data: { accountIds: [accountId] },
    })
  }, accountId)
  assert.equal(
    announcementsResponse.res?.success,
    true,
    "Scoped public announcement check failed",
  )
  assert.equal(announcementsResponse.res?.data?.failed, 0)
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#siteAnnouncements`,
  )
  await dismissModals(ui)
  await ui.getByRole("combobox", { name: "Site", exact: true }).click()
  await ui.getByRole("option", { name: new RegExp(accountName) }).click()
  await expect(
    ui.getByRole("button", { name: "Check now", exact: true }),
  ).toBeEnabled()
  await ui.getByRole("button", { name: "Check now", exact: true }).click()
  await expect(
    ui.locator("h3").filter({ hasText: "go.toter.me" }).first(),
  ).toBeVisible({ timeout: 45000 })
  await capture("05-announcements.png")
  evidence.checks.push(
    "scoped public announcement refresh and rendered native migration notice without inbox acknowledgement",
  )
  assert.deepEqual(
    forbiddenWrites,
    [],
    "Read-only suite unexpectedly mutated the provider",
  )
} catch (error) {
  evidence.failure = String(error)
  await capture("failure.png").catch(() => {})
  process.exitCode = 1
} finally {
  try {
    const owned = (await stored()).find(
      (account) => account.site_name === accountName,
    )
    if (owned) {
      accountId = owned.id
      await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
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
    evidence.cleanup.accountRemoved = true
  } catch (error) {
    evidence.cleanup.failure = String(error)
    process.exitCode = 1
  }
  dev.context.off("request", observeRequest)
  evidence.forbiddenWrites = forbiddenWrites
  await fs.writeFile(
    path.join(evidenceDir, "index.json"),
    JSON.stringify(evidence, null, 2),
  )
  if (clipboardOverride) await dev.context.clearPermissions()
  await ui.close()
  await site.close().catch(() => {})
  await dev.close()
  console.log(
    JSON.stringify({
      evidenceDir,
      checks: evidence.checks,
      failure: evidence.failure,
      cleanup: evidence.cleanup,
    }),
  )
}
