#!/usr/bin/env node
/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { MODEL_LIST_TEST_IDS as models } from "../src/features/ModelList/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import { DAYA_WEB_ORIGIN as origin } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import { connectDevBrowser, connectExtensionById } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Read-only by default. --execute allows one eligible daily grant through the
// extension's own auto check-in run; --mutate creates and deletes one
// disposable native key. Requires an authenticated Daya API session in the
// dedicated dev browser. No login, purchase or binding task is performed.
// --verify-group-loading holds one group read to inspect the transient editor.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const execute = process.argv.includes("--execute")
const mutate = process.argv.includes("--mutate")
const previewEditor = process.argv.includes("--preview-editor")
const verifyGroupLoading = process.argv.includes("--verify-group-loading")
const methodId = "daya:daily-checkin"
const evidenceDir = path.resolve(
  process.env.DAYA_EVIDENCE_DIR ||
    `.scratch/dayaai-integration/evidence/cdp-${Date.now()}`,
)
await fs.mkdir(evidenceDir, { recursive: true })

/** Kept in sync with `src/constants/money.ts`; the runner is plain JS. */
const QUOTA_PER_USD = 500_000

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
const accountName = `AAH Daya ${randomUUID().slice(0, 8)}`
let accountId
let createdKeyId
let createdKeyName
let checkinPage
let succeeded = false
const evidence = {
  capturedAt: new Date().toISOString(),
  worktree: process.cwd(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  extensionId,
  mode: { execute, mutate, verifyGroupLoading, previewEditor },
  checks: [],
  screenshots: [],
  cleanup: {},
}
const stored = () => getAccounts(dev.serviceWorker)
const card = () =>
  ui.getByTestId(`account-management-account-list-item-${accountId}`)
const capture = async (name, target = ui) => {
  // A refreshing card never settles; fall back to the page view rather than
  // failing the run on an unstable element screenshot.
  await target
    .screenshot({
      path: path.join(evidenceDir, `${name}.png`),
      animations: "disabled",
      timeout: 8000,
    })
    .catch(async () => {
      await ui.screenshot({
        path: path.join(evidenceDir, `${name}-page.png`),
        animations: "disabled",
      })
    })
  evidence.screenshots.push(`${name}.png`)
}
const readIdentity = () =>
  site.evaluate(async () => {
    const response = await fetch("/api/v1/auth/me", {
      credentials: "include",
      cache: "no-store",
    })
    const body = await response.json()
    if (!response.ok || body.code !== 0) throw Error("Daya session unavailable")
    return body.data
  })
const readOverview = async () => {
  // The site page is closed for the tab-free refresh; read back through a
  // transient console tab instead.
  const page = await dev.context.newPage()
  try {
    await page.goto(`${origin}/rewards`)
    return await page.evaluate(async () => {
      const response = await fetch("/api/v1/rewards/overview", {
        credentials: "include",
        cache: "no-store",
      })
      const body = await response.json()
      if (!response.ok || body.code !== 0)
        throw Error("rewards overview unavailable")
      return body.data
    })
  } finally {
    await page.close()
  }
}
const request = (endpoint, init) =>
  dev.context.request.get(`${origin}${endpoint}`, init)

try {
  await site.goto(`${origin}/dashboard`)
  evidence.sessionPreflight = await preflightSession({
    expectedIdentity: process.env.DAYA_USER_ID || undefined,
    probeTarget: () =>
      probePageSession(site, {
        endpoint: "/api/v1/auth/me",
        readIdentity: (body) =>
          body?.code === 0 ? String(body.data?.id ?? "") : undefined,
      }),
  })
  assert.equal(
    evidence.sessionPreflight.status,
    "ready",
    "Inspect authorized source sessions when the target preflight is not ready",
  )
  const initial = await readIdentity()
  evidence.identity = initial.id
  evidence.nativeBalanceUsd = initial.balance

  // Fresh add-account form: detection through the console Cookie session.
  await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
  await dismissModals(ui)
  await ui.getByTestId(accounts.addAccountButton).click()
  await ui.getByTestId(accounts.siteUrlInput).fill(origin)
  const grant = ui.getByTestId(accounts.cookiePermissionGrantButton)
  await grant
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => grant.click())
    .catch(() => {})
  await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
    "data-auth-type",
    "cookie",
  )
  // The permission grant applies asynchronously; retry detection once when the
  // first attempt raced the grant.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await ui.getByTestId(accounts.autoDetectButton).click()
    const error = ui.getByTestId(accounts.autoDetectErrorMessage)
    try {
      await expect(error).toBeVisible({ timeout: 20000 })
      await expect(ui.getByTestId(accounts.autoDetectButton)).toBeEnabled({
        timeout: 20000,
      })
      continue
    } catch {
      // No visible error: detection proceeded.
    }
    break
  }
  await expect(ui.getByTestId(accounts.siteTypeTrigger)).toContainText("daya", {
    timeout: 45000,
  })
  await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
    String(initial.id),
    { timeout: 45000 },
  )
  await ui.getByTestId(accounts.siteNameInput).fill(accountName)
  await capture("00-onboarding")
  await ui.getByTestId(accounts.confirmAddButton).click()
  await expect
    .poll(async () => {
      const duplicate = ui.getByTestId(accounts.duplicateWarningContinueButton)
      if (await duplicate.isVisible()) await duplicate.click()
      return (await stored()).find(
        (account) => account.site_name === accountName,
      )?.id
    })
    .toBeTruthy()
  const saved = (await stored()).find(
    (account) => account.site_name === accountName,
  )
  accountId = saved.id
  assert.equal(saved.site_type, "daya")
  assert.equal(saved.authType, "cookie")
  assert.equal(saved.account_info.id, String(initial.id))
  // Wait for accepted provider data instead of a placeholder snapshot.
  await expect
    .poll(
      async () =>
        (await stored()).find((account) => account.id === accountId)
          ?.account_info.quota,
      { timeout: 45000 },
    )
    .toBe(Math.round(initial.balance * QUOTA_PER_USD))
  await dismissModals(ui)
  await card().waitFor({ state: "visible", timeout: 30000 })
  await expect(card()).toContainText(
    new Intl.NumberFormat("en").format(initial.balance),
  )
  await capture("01-account", card())
  evidence.checks.push(
    "fresh Cookie auto-detection, live identity, save and USD balance mapping",
  )

  // Tab-free refresh updates the account from the console session.
  await site.close()
  if (!verifyGroupLoading) {
    assert.ok(
      dev.context.pages().every((page) => !page.url().startsWith(`${origin}/`)),
      "A console tab remains open; tab-free refresh was not established",
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
  }

  // Check-in discovery through the account's own rewards overview.
  await dismissModals(ui)
  const dialog = ui.getByTestId(accounts.accountDialog)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await card().hover()
    await card().getByTestId(accounts.rowEditButton).click()
    try {
      await dialog.waitFor({ state: "visible", timeout: 10000 })
      break
    } catch {
      if (attempt === 2) throw new Error("Edit account dialog did not open")
    }
  }
  const section = dialog.getByTestId(accounts.accountFormSectionCheckIn)
  await section.waitFor({ state: "attached", timeout: 30000 })
  // The dialog re-renders while post-save refreshes settle; retry the scroll.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await section.scrollIntoViewIfNeeded({ timeout: 5000 })
      break
    } catch {
      await section.waitFor({ state: "attached", timeout: 10000 })
    }
  }
  await capture("02-checkin-section", dialog)
  const detect = section
    .getByRole("button")
    .filter({
      hasText:
        /([Rr]e-)?[Dd]etect check-in method|重新检测签到方式|重新偵測簽到方式/,
    })
    .first()
  await detect.click()
  await detect.waitFor({ state: "visible", timeout: 120_000 })
  await dialog.getByTestId(accounts.confirmAddButton).click()
  await dialog.waitFor({ state: "hidden" })
  await dismissModals(ui)
  const withMethod = (await stored()).find(
    (account) => account.id === accountId,
  )
  assert.equal(withMethod?.checkIn?.selection?.methodId, methodId)
  assert.equal(
    withMethod?.checkIn?.methodKnowledge?.methods?.[methodId]?.detection
      ?.outcome,
    "matched",
  )
  evidence.checks.push("check-in method discovery matched the rewards overview")

  const overviewBefore = await readOverview()
  const claimable = overviewBefore.daily_check_in?.claimable === true
  evidence.checkIn = { beforeClaimable: claimable, executionSkipped: !execute }
  if (execute) {
    // Enable the automatic run for this account only (fixture setup; the
    // isolated profile must not hold another runnable account).
    await dev.serviceWorker.evaluate(async (id) => {
      const result = await chrome.storage.local.get("site_accounts")
      const raw = result.site_accounts
      const envelope = typeof raw === "string" ? JSON.parse(raw) : raw
      const record = envelope.accounts.find((account) => account.id === id)
      record.checkIn = {
        ...record.checkIn,
        automaticExecutionEnabled: true,
      }
      envelope.last_updated = Date.now()
      await chrome.storage.local.set({
        site_accounts: JSON.stringify(envelope),
      })
    }, accountId)
    assert.ok(
      (await stored()).every(
        (account) =>
          account.id === accountId ||
          account.disabled ||
          !account.checkIn?.automaticExecutionEnabled,
      ),
      "--execute requires no other runnable account; existing settings are preserved",
    )
    checkinPage = await ui.context().newPage()
    await checkinPage.setViewportSize({ width: 1440, height: 1000 })
    await checkinPage.goto(
      `chrome-extension://${extensionId}/options.html#autoCheckin`,
    )
    await dismissModals(checkinPage)
    await checkinPage.getByTestId("auto-checkin-run-now-button").click()
    let result
    await assertEventually(async () => {
      result = await dev.serviceWorker.evaluate(async (id) => {
        const storedStatus = (
          await chrome.storage.local.get("autoCheckin_status")
        ).autoCheckin_status
        const status =
          typeof storedStatus === "string"
            ? JSON.parse(storedStatus)
            : storedStatus
        return status?.perAccount?.[id]
      }, accountId)
      return (
        result &&
        ["skipped", "already_checked", "success"].includes(result.status)
      )
    })
    if (!execute)
      assert.notEqual(result.status, "success", "read-only run must not submit")
    if (execute && claimable)
      assert.equal(result.status, "success", "fresh grant must succeed")
    const overviewAfter = await readOverview()
    evidence.checkIn = {
      beforeClaimable: claimable,
      result,
      afterClaimable: overviewAfter.daily_check_in?.claimable === true,
    }
    assert.equal(
      evidence.checkIn.afterClaimable,
      false,
      "the daily grant must be taken after the run",
    )
    await checkinPage.getByText(accountName, { exact: true }).first().waitFor()
    await capture("02-checkin-result", checkinPage)
    await checkinPage.close()
    evidence.checks.push(
      execute && claimable
        ? "daily grant executed once through the auto check-in run"
        : "auto check-in run reconciled an already-taken daily grant",
    )
  } else {
    evidence.checks.push(
      "check-in discovery read-only; daily grant execution skipped",
    )
  }

  // Announcements through the extension runtime.
  const notices = await ui.evaluate(
    async (id) =>
      chrome.runtime.sendMessage({
        type: "siteAnnouncements:checkNow",
        id: Date.now(),
        timestamp: Date.now(),
        data: { accountIds: [id] },
      }),
    accountId,
  )
  assert.equal(notices.res?.success, true)
  assert.equal(notices.res?.data?.failed, 0)
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#siteAnnouncements`,
  )
  await dismissModals(ui)
  await capture("03-announcements")
  evidence.checks.push("announcements fetched through the extension")

  // Public catalogue through the actual account source: no key availability claim.
  const nativeCatalog = (await (await request("/api/v1/catalog/models")).json())
    .data
  await ui.goto(
    `chrome-extension://${extensionId}/options.html?accountId=${accountId}#models`,
  )
  await dismissModals(ui)
  await expect(
    ui
      .getByTestId(models.modelDisplay)
      .getByText("gpt-6-astra", { exact: true })
      .first(),
  ).toBeVisible({ timeout: 45000 })
  await expect(ui.getByTestId(models.verifyApiButton)).toHaveCount(0)
  await expect(
    ui
      .getByTestId(models.modelDisplay)
      .getByText("Full site catalogue", { exact: true })
      .first(),
  ).toBeVisible()
  await capture("03-model-catalog")
  evidence.catalogCount = nativeCatalog.length
  evidence.checks.push(
    "provider catalogue and reference pricing rendered; key verification suppressed",
  )

  // Native key inventory.
  const nativeKeys = await (
    await request("/api/v1/keys?page=1&page_size=100")
  ).json()
  assert.equal(nativeKeys.code, 0)
  const originalKeyIds = nativeKeys.data.items.map((item) => item.id)
  if (verifyGroupLoading) {
    assert.ok(
      originalKeyIds.length,
      "Group loading verification needs an existing key",
    )
  }
  await ui.goto(
    `chrome-extension://${extensionId}/options.html#keys?accountId=${accountId}`,
  )
  await dismissModals(ui)
  await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
    originalKeyIds.length,
    { timeout: 45000 },
  )
  evidence.checks.push(
    `native key inventory matches the console (${originalKeyIds.length} keys)`,
  )
  if (originalKeyIds.length) {
    const existing = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${originalKeyIds[0]}"]`))
    const nativeName = nativeKeys.data.items.find(
      (item) => item.id === originalKeyIds[0],
    ).name
    await expect(existing).toContainText(nativeName, { timeout: 30000 })
    await expect(
      existing.getByTestId(keys.keyResourceSecretDisplay),
    ).toBeVisible()
    await capture("04-key-details", existing)
    if (verifyGroupLoading) {
      // Delay the real console-tab read, without replacing its response.
      const groupUrl = "**/api/v1/groups/available"
      let release
      const pending = new Promise((resolve) => {
        release = resolve
      })
      const holdGroupRead = async (route) => {
        await pending
        await route.continue()
      }
      await dev.context.route(groupUrl, holdGroupRead)
      try {
        await existing
          .getByRole("button", { name: "Edit Key", exact: true })
          .click()
        const editor = ui.getByTestId(keys.nativeEditor)
        const group = editor.getByRole("group", {
          name: "Group",
          exact: true,
        })
        await expect(ui.getByTestId(keys.nativeEditorLoading)).toBeVisible({
          timeout: 30000,
        })
        await expect(
          editor.getByLabel("Token Name", { exact: true }),
        ).toHaveCount(0)
        for (const id of ["2", "21", "7"]) {
          await expect(editor.getByText(id, { exact: true })).toHaveCount(0)
        }
        // Page capture avoids waiting for the continuously spinning control to
        // become stable, which would miss the intermediate state under test.
        await ui.screenshot({
          path: path.join(evidenceDir, "04-group-loading.png"),
        })
        evidence.screenshots.push("04-group-loading.png")
        await expect(group).toHaveCount(0)
        release()
        await expect(
          group.getByRole("checkbox", { name: "OpenAI", exact: true }),
        ).toBeEnabled({ timeout: 30000 })
        await ui.screenshot({
          path: path.join(evidenceDir, "04-group-ready.png"),
        })
        evidence.screenshots.push("04-group-ready.png")
        await ui.keyboard.press("Escape")
        evidence.checks.push(
          "editor opening waits for routing metadata, then shows complete cards without a second group read",
        )
      } catch (error) {
        await ui.screenshot({
          path: path.join(evidenceDir, "04-group-failure.png"),
        })
        throw error
      } finally {
        release()
        await dev.context.unroute(groupUrl, holdGroupRead)
      }
    }
  }
  if (previewEditor) {
    await ui
      .getByTestId(
        originalKeyIds.length
          ? keys.addTokenButton
          : keys.emptyStateAddTokenButton,
      )
      .click()
    const editor = ui.getByTestId(keys.nativeEditor)
    await expect(editor.getByLabel("Token Name", { exact: true })).toBeEditable(
      { timeout: 30000 },
    )
    await expect(editor.getByRole("checkbox").first()).toBeEnabled({
      timeout: 30000,
    })
    for (const label of [
      "Basic Information",
      "Quota Settings",
      "Expiration Time",
      "Advanced Settings",
    ]) {
      await expect(
        editor.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-expanded", "true")
    }
    const basic = editor.getByRole("button", {
      name: "Basic Information",
      exact: true,
    })
    const nameInput = editor.getByLabel("Token Name", { exact: true })
    const initialName = await nameInput.inputValue()
    await basic.click()
    await expect(nameInput).toBeHidden()
    await basic.click()
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue(initialName)
    const defaults = (
      await (await request("/api/v1/groups/default-api-key-groups")).json()
    ).data
    await expect(
      editor
        .getByText(`×${defaults[0].rate_multiplier}`, { exact: true })
        .first(),
    ).toBeVisible()
    await capture("08-default-routing-editor", editor)
    const customInput = editor.getByLabel("Custom key (optional)", {
      exact: true,
    })
    if (!(await customInput.isVisible()))
      await editor.getByRole("button", { name: /advanced/i }).click()
    await customInput.scrollIntoViewIfNeeded()
    await capture("08-advanced-editor", editor)
    await ui.setViewportSize({ width: 540, height: 900 })
    await capture("08-advanced-editor-compact", editor)
    assert.ok(
      await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      "compact editor must not overflow horizontally",
    )
    await ui.setViewportSize({ width: 1440, height: 1000 })
    await ui.keyboard.press("Escape")
    evidence.checks.push(
      "shared section blocks expand/collapse without losing values; defaults and advanced fields previewed, compact width has no horizontal overflow",
    )
  }
  if (mutate) {
    const runName = `AAH disposable ${randomUUID().slice(0, 8)}`
    createdKeyName = runName
    await ui
      .getByTestId(
        originalKeyIds.length
          ? keys.addTokenButton
          : keys.emptyStateAddTokenButton,
      )
      .click()
    const editor = ui.getByTestId(keys.nativeEditor)
    await expect(editor.getByLabel("Token Name", { exact: true })).toBeEditable(
      {
        timeout: 30000,
      },
    )
    const defaults = (
      await (await request("/api/v1/groups/default-api-key-groups")).json()
    ).data
    assert.ok(
      defaults.length > 1,
      "live ordering fixture requires two default routes",
    )
    await expect(editor.getByRole("checkbox").first()).toBeEnabled({
      timeout: 30000,
    })
    const reorderedIds = defaults.map((group) => group.id)
    ;[reorderedIds[0], reorderedIds[1]] = [reorderedIds[1], reorderedIds[0]]
    await editor
      .getByRole("button", { name: `Move up ${defaults[1].name}`, exact: true })
      .click()
    // Reuse the shared drag control as well as its keyboard-accessible arrows.
    const handles = editor.getByRole("button", {
      name: "Drag to reorder",
      exact: true,
    })
    const first = await handles.first().boundingBox()
    const last = await handles.last().boundingBox()
    assert.ok(first && last)
    await ui.mouse.move(last.x + last.width / 2, last.y + last.height / 2)
    await ui.mouse.down()
    await ui.mouse.move(
      last.x + last.width / 2,
      last.y + last.height / 2 - 10,
      { steps: 5 },
    )
    await ui.mouse.move(first.x + first.width / 2, first.y + first.height / 2, {
      steps: 20,
    })
    await ui.mouse.up()
    reorderedIds.unshift(reorderedIds.pop())
    const customSecret = `sk-aah-disposable-${randomUUID().replaceAll("-", "")}`
    // Advanced restrictions are progressively disclosed by the shared editor.
    const customInput = editor.getByLabel("Custom key (optional)", {
      exact: true,
    })
    if (!(await customInput.isVisible()))
      await editor.getByRole("button", { name: /advanced/i }).click()
    await customInput.fill(customSecret)
    await editor
      .getByLabel("IP allowlist", { exact: true })
      .fill("192.0.2.1\n198.51.100.0/24")
    await editor.getByLabel("IP blocklist", { exact: true }).fill("203.0.113.1")
    await editor.getByLabel("5-hour budget (USD)", { exact: true }).fill("1.25")
    await editor.getByLabel("Daily budget (USD)", { exact: true }).fill("3")
    await editor.getByLabel("7-day budget (USD)", { exact: true }).fill("12")
    await expect(
      editor.getByLabel("Expires in (days)", { exact: true }),
    ).toBeEditable()
    await editor
      .getByRole("switch", { name: "Unlimited Quota", exact: true })
      .click()
    await editor.getByLabel("Total quota (USD)", { exact: true }).fill("0")
    let invalidWrites = 0
    const countInvalidWrites = (request) => {
      if (
        request.method() === "POST" &&
        request.url() === `${origin}/api/v1/keys`
      )
        invalidWrites += 1
    }
    dev.context.on("request", countInvalidWrites)
    try {
      await ui.getByTestId(keys.nativeEditorSubmitButton).click()
      await expect(
        editor.getByLabel("Total quota (USD)", { exact: true }),
      ).toHaveAttribute("aria-invalid", "true")
      assert.equal(
        invalidWrites,
        0,
        "finite zero must be rejected before dispatch",
      )
    } finally {
      dev.context.off("request", countInvalidWrites)
    }
    await capture("05-finite-zero-blocked", editor)
    await editor.getByLabel("Token Name", { exact: true }).fill(runName)
    await editor.getByLabel("Total quota (USD)", { exact: true }).fill("10")
    await editor.getByLabel("Expires in (days)", { exact: true }).fill("30")
    await capture("05-create")
    // One submit: the busy button means the write dispatched; a validation
    // failure keeps the editor open and the API poll below reports it.
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    await capture("05b-after-submit")
    await expect
      .poll(
        async () => {
          const rows = await (
            await request("/api/v1/keys?page=1&page_size=100")
          ).json()
          return rows.data.items.find(
            (item) =>
              item.name === runName && !originalKeyIds.includes(item.id),
          )?.id
        },
        { timeout: 45000 },
      )
      .toBeTruthy()
    createdKeyId = (
      await (await request("/api/v1/keys?page=1&page_size=100")).json()
    ).data.items.find(
      (item) => item.name === runName && !originalKeyIds.includes(item.id),
    ).id
    evidence.createdKeyId = createdKeyId
    const created = (
      await (await request(`/api/v1/keys/${createdKeyId}`)).json()
    ).data
    assert.equal(created.quota, 10)
    assert.equal(created.key, customSecret)
    assert.deepEqual(created.group_ids, reorderedIds)
    assert.deepEqual(created.ip_whitelist, ["192.0.2.1", "198.51.100.0/24"])
    assert.deepEqual(created.ip_blacklist, ["203.0.113.1"])
    assert.equal(created.rate_limit_5h, 1.25)
    assert.equal(created.rate_limit_1d, 3)
    assert.equal(created.rate_limit_7d, 12)
    evidence.checks.push(
      "custom key, defaults, reordered routes, IP restrictions and all window budgets read back",
    )
    const remainingDays =
      (Date.parse(created.expires_at) - Date.now()) / 86400000
    assert.ok(
      remainingDays > 29.9 && remainingDays <= 30.01,
      "created key must expire in 30 days",
    )
    evidence.checks.push("finite quota and day-based creation expiry read back")
    // Read back the accepted record through the plugin inventory.
    await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
      originalKeyIds.length + 1,
      { timeout: 45000 },
    )
    evidence.checks.push("disposable native key created and inventoried")
    // The create dialog stays open through the write; close it before acting
    // on the inventory row underneath it.
    await ui.keyboard.press("Escape")
    await dismissModals(ui)
    const createdRow = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${createdKeyId}"]`))
    await createdRow
      .getByRole("button", { name: "Edit Key", exact: true })
      .click()
    await expect(editor.getByLabel("Token Name", { exact: true })).toHaveValue(
      runName,
      { timeout: 30000 },
    )
    await expect(editor.getByRole("checkbox").first()).toBeEnabled({
      timeout: 30000,
    })
    assert.equal(
      await editor.getByLabel("Custom key (optional)", { exact: true }).count(),
      0,
    )
    const blacklist = editor.getByLabel("IP blocklist", { exact: true })
    if (!(await blacklist.isVisible()))
      await editor.getByRole("button", { name: /advanced/i }).click()
    await expect(blacklist).toHaveValue("203.0.113.1")
    await blacklist.fill("")
    await editor.getByLabel("5-hour budget (USD)", { exact: true }).fill("0")
    await editor.getByLabel("7-day budget (USD)", { exact: true }).fill("14")
    const concurrent = await dev.context.request.put(
      `${origin}/api/v1/keys/${createdKeyId}`,
      { data: { ip_whitelist: ["192.0.2.0/24"], rate_limit_1d: 7, quota: 20 } },
    )
    assert.equal((await concurrent.json()).code, 0)
    await editor
      .getByLabel("Token Name", { exact: true })
      .fill(`${runName} edited`)
    await capture("06-edit-preserving-native-settings", editor)
    await blacklist.scrollIntoViewIfNeeded()
    await capture("06-edit-advanced-settings", editor)
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    await expect(editor).toBeHidden({ timeout: 30000 })
    const edited = (
      await (await request(`/api/v1/keys/${createdKeyId}`)).json()
    ).data
    assert.equal(edited.name, `${runName} edited`)
    assert.equal(edited.quota, 20)
    assert.deepEqual(edited.group_ids, reorderedIds)
    assert.deepEqual(edited.ip_blacklist ?? [], [])
    assert.equal(edited.rate_limit_5h, 0)
    assert.equal(edited.rate_limit_7d, 14)
    assert.equal(edited.key, customSecret)
    assert.equal(edited.rate_limit_1d, 7)
    assert.deepEqual(edited.ip_whitelist, ["192.0.2.0/24"])
    assert.equal(edited.expires_at, created.expires_at)
    evidence.checks.push(
      "edit preserves concurrent native quota, IP and rate limits; expiry unchanged",
    )
    await createdRow.getByRole("button", { name: /delete key/i }).click()
    await capture("07-delete-confirm")
    await ui
      .getByTestId(keys.nativeDeleteConfirmButton)
      .click({ timeout: 10000 })
      .catch(async () => {
        await capture("07b-delete-blocked")
        await ui
          .getByTestId(keys.nativeDeleteConfirmButton)
          .click({ force: true })
      })
    await expect
      .poll(
        async () => {
          const rows = await (
            await request("/api/v1/keys?page=1&page_size=100")
          ).json()
          return !rows.data.items.some((item) => item.id === createdKeyId)
        },
        { timeout: 45000 },
      )
      .toBeTruthy()
    await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
      originalKeyIds.length,
      { timeout: 45000 },
    )
    evidence.cleanup.deletedKeyIds = [createdKeyId]
    evidence.checks.push("disposable native key deleted and read back")
  }
  await capture("06-keys")
  succeeded = true
} catch (error) {
  evidence.error = String(error)
  throw error
} finally {
  const cleanupErrors = []
  try {
    if (createdKeyName) {
      const rows = (
        await (await request("/api/v1/keys?page=1&page_size=100")).json()
      ).data.items
      const owned = rows.filter(
        (item) =>
          item.id === createdKeyId ||
          item.name === createdKeyName ||
          item.name === `${createdKeyName} edited`,
      )
      for (const item of owned) {
        const deleted = await dev.context.request.delete(
          `${origin}/api/v1/keys/${item.id}`,
        )
        assert.ok(deleted.ok(), "disposable key cleanup failed")
      }
      const remaining = (
        await (await request("/api/v1/keys?page=1&page_size=100")).json()
      ).data.items
      assert.ok(
        !remaining.some((item) => owned.some((own) => own.id === item.id)),
        "disposable key remains after cleanup",
      )
      evidence.cleanup.finallyDeletedKeyIds = owned.map((item) => item.id)
    }
  } catch (error) {
    cleanupErrors.push(`keys: ${String(error)}`)
  }
  try {
    accountId ??= (await stored()).find(
      (account) => account.site_name === accountName,
    )?.id
    if (accountId) {
      await dev.serviceWorker.evaluate(async (id) => {
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
  await checkinPage?.close().catch(() => {})
  await ui.close().catch(() => {})
  await site.close().catch(() => {})
  evidence.ok = succeeded
  evidence.finishedAt = new Date().toISOString()
  await fs.writeFile(
    path.join(evidenceDir, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        ok: succeeded,
        extensionId,
        identity: evidence.identity,
        checks: evidence.checks,
        evidenceDir,
      },
      null,
      1,
    ),
  )
  await dev.close()
}

async function assertEventually(check) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("Daya UI workflow timed out")
}
