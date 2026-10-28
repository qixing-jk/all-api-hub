/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { XIAOEN_WEB_ORIGIN as origin } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { connectDevBrowser, connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts, withStoredValue } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import {
  configureExtensionPage,
  createUiCapture,
  dismissModals,
} from "./cdp/ui-driver.mjs"
import { readModelCatalog } from "./flows/model-catalog.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Provider reads by default; --sync-message-read acknowledges one already-read message.
// Requires an authenticated Xiaoen session in the dedicated dev browser.
// No login, key rotation, signup, credit claim or popup acknowledgement is performed.
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
const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(".output/chrome-mv3"),
})
const { extensionId } = dev
const site = await dev.context.newPage()
const ui = await dev.context.newPage()
await configureExtensionPage(ui, {
  viewport: { width: 1440, height: 1000 },
  language: "en",
  dismissUpdateLog: true,
})
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
const capture = createUiCapture({
  page: ui,
  directory: evidenceDir,
  screenshots: evidence.screenshots,
})
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
const syncMessageRead = process.argv.includes("--sync-message-read")
let allowedMessageId
const messageReadWrites = []
const observeRequest = (request) => {
  if (
    request.url().startsWith(`${origin}/api/`) &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
    !request.url().endsWith("/api/analytics/event")
  ) {
    if (
      syncMessageRead &&
      allowedMessageId &&
      request.url() === `${origin}/api/messages` &&
      request.method() === "PATCH" &&
      JSON.stringify(request.postDataJSON()) ===
        JSON.stringify({ messageId: allowedMessageId })
    ) {
      messageReadWrites.push({ url: request.url(), method: request.method() })
    } else
      forbiddenWrites.push({ url: request.url(), method: request.method() })
  }
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
  const messageResponse = await dev.context.request.get(
    `${origin}/api/messages`,
  )
  assert.equal(messageResponse.status(), 200)
  const nativeMessages = await messageResponse.json()
  assert.ok(Array.isArray(nativeMessages))
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
  if (!process.argv.includes("--allow-existing-site-tabs"))
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
  evidence.checks.push(
    process.argv.includes("--allow-existing-site-tabs")
      ? "refresh while preserving existing console tabs (tab-free behavior not asserted)"
      : "refresh with no console tab",
  )
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
  const { modelDisplay } = await readModelCatalog({
    page: ui,
    accountId,
    timeoutMs: 45000,
    requirePrices: false,
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
    ui.getByRole("button", { name: "Check now", exact: true }),
  ).toBeEnabled({ timeout: 45000 })
  const messageStore = await dev.serviceWorker.evaluate(async () => {
    const raw = (await chrome.storage.local.get("siteAnnouncements_store"))
      .siteAnnouncements_store
    return typeof raw === "string" ? JSON.parse(raw) : raw
  })
  const publicRecord = Object.values(messageStore.sites)
    .filter(
      (source) =>
        source.sourceScope === "site" &&
        source.baseUrl === origin &&
        source.siteType === "xiaoen",
    )
    .flatMap((source) => source.records)
    .find((record) => record.content.includes("go.toter.me"))
  assert.ok(publicRecord, "Native public migration notice is missing")
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#siteAnnouncements?recordId=${encodeURIComponent(publicRecord.id)}`,
  )
  await ui.reload()
  await dismissModals(ui)
  await expect(
    ui.locator("h3").filter({ hasText: "go.toter.me" }).first(),
  ).toBeVisible({ timeout: 45000 })
  await capture("05-announcements.png")
  evidence.checks.push(
    "scoped public announcement refresh and rendered native migration notice without inbox acknowledgement",
  )
  const accountSource = Object.values(messageStore.sites).find(
    (source) =>
      source.accountId === accountId && source.sourceScope === "account",
  )
  assert.ok(accountSource, "Account-scoped inbox source was not discovered")
  assert.equal(
    accountSource.records.length,
    nativeMessages.filter((item) => !item.isDeleted).length,
  )
  const ownedNative = nativeMessages.find(
    (item) =>
      item.userId === initial.id &&
      item.isRead &&
      !item.isDeleted &&
      item.template.type === "quota",
  )
  assert.ok(
    ownedNative,
    "An already-read reward message is required for non-consuming acceptance",
  )
  const cached = accountSource.records.find(
    (record) => record.upstreamId === ownedNative.id,
  )
  assert.ok(cached)
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#siteAnnouncements?recordId=${encodeURIComponent(cached.id)}`,
  )
  await dismissModals(ui)
  await expect(
    ui.getByRole("link", { name: "View and handle on the site", exact: true }),
  ).toHaveAttribute(
    "href",
    `${origin}/dashboard/messages?messageId=${ownedNative.id}`,
  )
  await expect(ui.getByText("Claimed", { exact: true }).first()).toBeVisible()
  await capture("06-account-messages.png")
  evidence.checks.push(
    "account-scoped messages, reward status and native message link",
  )
  if (syncMessageRead) {
    // Only the run-owned local cache is made unread; the native message was already read.
    // Restore the exact cache after the UI action, without consuming native unread messages.
    cached.read = false
    delete cached.readAt
    const digest = createHash("sha256").update(cached.fingerprint).digest("hex")
    delete messageStore.identityLedger[accountSource.siteKey][digest].readAt
    allowedMessageId = ownedNative.id
    await withStoredValue(
      dev.serviceWorker,
      "siteAnnouncements_store",
      messageStore,
      async () => {
        await ui.goto(
          `chrome-extension://${extensionId}/options.html#siteAnnouncements`,
        )
        await ui.reload()
        await dismissModals(ui)
        await ui.getByRole("combobox", { name: "Site", exact: true }).click()
        await ui.getByRole("option", { name: new RegExp(accountName) }).click()
        await ui.evaluate(() => {
          const nativeSend = chrome.runtime.sendMessage.bind(chrome.runtime)
          globalThis.__xiaoenReadResponses = []
          chrome.runtime.sendMessage = (...args) => {
            const tracked = args[0]?.type === "siteAnnouncements:markRead"
            const callback = args.at(-1)
            if (tracked && typeof callback === "function")
              args[args.length - 1] = (response) => {
                globalThis.__xiaoenReadResponses.push(response)
                callback(response)
              }
            const result = nativeSend(...args)
            if (tracked && result?.then)
              result.then((response) =>
                globalThis.__xiaoenReadResponses.push(response),
              )
            return result
          }
        })
        const heading = ui.locator(
          `[aria-controls="site-announcement-content-${cached.id}"]`,
        )
        await expect(heading).toBeVisible()
        await heading.click()
        await expect
          .poll(() => messageReadWrites.length, { timeout: 45000 })
          .toBe(1)
        await expect
          .poll(
            async () => {
              const response = await ui.evaluate(async () =>
                chrome.runtime.sendMessage({
                  type: "siteAnnouncements:listRecords",
                  id: Date.now(),
                  timestamp: Date.now(),
                  data: {},
                }),
              )
              return response.res?.data?.find(
                (record) => record.id === cached.id,
              )?.read
            },
            { timeout: 45000 },
          )
          .toBe(true)
        const afterMessages = await (
          await dev.context.request.get(`${origin}/api/messages`)
        ).json()
        const after = afterMessages.find((item) => item.id === ownedNative.id)
        assert.equal(after.isRead, true)
        assert.equal(after.isClaimed, ownedNative.isClaimed)
        assert.equal(after.popupAcknowledgedAt, ownedNative.popupAcknowledgedAt)
        await expect
          .poll(
            async () => {
              const responses = await ui.evaluate(
                () => globalThis.__xiaoenReadResponses,
              )
              evidence.readSyncResponses = responses
              return responses[0]?.res?.success
            },
            { timeout: 45000 },
          )
          .toBe(true)
        await expect(heading.getByText("Unread", { exact: true })).toHaveCount(
          0,
        )
        await capture("07-message-read-sync.png")
      },
    )
    evidence.checks.push(
      "expanding a locally unread inbox item syncs native read state once without claiming or acknowledging its popup",
    )
  }
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
  evidence.messageReadWrites = messageReadWrites
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
