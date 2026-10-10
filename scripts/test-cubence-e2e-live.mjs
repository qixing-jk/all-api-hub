import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { QUOTA_PER_USD } from "../src/constants/money.ts"
import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { CC_SWITCH_EXPORT_TEST_IDS as ccSwitch } from "../src/features/CredentialExport/CCSwitchExportDialog.testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { MODEL_LIST_TEST_IDS as models } from "../src/features/ModelList/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import { getDefaultAccountKeyName } from "../src/services/accounts/keys/accountKeyNames.ts"
import { getCubenceGroupDisplayName } from "../src/services/apiAdapters/cubence/groupPresentation.ts"
import {
  connectDevBrowser,
  connectDevExtension,
  connectExtensionById,
} from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { testModelCatalogFlow } from "./flows/model-catalog.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Preflights the current-worktree dev session before authenticated operations.
// The default reads provider data and creates/removes only a local account.
// --mutate additionally submits default and management creation, then edits/deletes disposable keys.
// --direct-only asserts that saved-account workflows never open another Cubence page.
// --unresponsive-content (with --mutate) stalls one owned temp-page receiver before UI submission.
// --stalled-download-rule (with --mutate) stalls optional DNR download-rule installation.
// --login-guide-only checks the fresh Cookie default and session guidance without saving.
// --wait-for-login keeps the Cubence tab open for up to 15 minutes for interactive login.
// --preflight-only reports session readiness without running UI/resource flows.
// No inference, payment, redemption, login, credential export or account rotation.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const mutate = process.argv.includes("--mutate")
const directOnly = process.argv.includes("--direct-only")
const unresponsiveContent = process.argv.includes("--unresponsive-content")
const stalledDownloadRule = process.argv.includes("--stalled-download-rule")
assert.ok(
  !(unresponsiveContent || stalledDownloadRule) || mutate,
  "Temporary-page fault injection requires --mutate",
)
const guideOnly = process.argv.includes("--login-guide-only")
const waitForLogin = process.argv.includes("--wait-for-login")
const preflightOnly = process.argv.includes("--preflight-only")
assert.ok(
  !(mutate && guideOnly),
  "--mutate and --login-guide-only are mutually exclusive",
)
assert.ok(
  !(preflightOnly && (mutate || guideOnly || waitForLogin)),
  "--preflight-only cannot be combined with mutation, guide or login-wait modes",
)

/** Provider identity facts stay with the site runner, outside the common preflight. */
const probeCubenceSession = (page) =>
  probePageSession(page, {
    endpoint: "https://cubence.com/api/v1/auth/me",
    readIdentity: (body) =>
      body?.user?.active === true &&
      Number.isSafeInteger(body.user.id) &&
      body.user.id > 0
        ? String(body.user.id)
        : undefined,
  })
const checkSession = (probeTarget) =>
  preflightSession({
    probeTarget,
    expectedIdentity: process.env.CUBENCE_USER_ID || undefined,
    // This runner cannot discover the daily Edge extension bridge itself.
    // Missing source evidence must remain pending, never imply manual login.
  })
const recoveryHint = (status) => {
  if (status === "ready") return "Existing dev session is ready."
  if (status === "source-check-required")
    return "Inspect authorized session sources before requesting login: pnpm browser:sync -- --list; follow the session preflight in .agents/skills/live-extension-ui-automation/SKILL.md for live bridge or offline sync."
  if (status === "identity-mismatch")
    return "Verify the intended account before synchronizing sessions or running account operations."
  return "Diagnose the identity probe (connection, challenge or endpoint); this is not evidence that manual login is required."
}

if (preflightOnly) {
  const dev = await connectDevBrowser()
  let page
  try {
    page = await dev.context.newPage()
    const session = await checkSession(async () => {
      await page.goto("https://cubence.com/dashboard")
      return probeCubenceSession(page)
    })
    console.log(
      JSON.stringify(
        { ...session, nextStep: recoveryHint(session.status) },
        null,
        2,
      ),
    )
    process.exitCode = session.status === "ready" ? 0 : 2
  } finally {
    await page?.close().catch(() => {})
    await dev.close()
  }
  // The inspection owns no capture streams or background jobs to drain.
  process.exit(process.exitCode ?? 0)
}
const runId = randomUUID().slice(0, 8)
const accountName = `AAH Cubence ${runId}`
const keyName = `aah-cubence-${runId}`
const defaultKeyName = `${keyName}-default`
const evidenceDir = path.resolve(
  process.env.CUBENCE_EVIDENCE_DIR ||
    `.scratch/cubence-adaptation/evidence/ui-${Date.now()}`,
)
execFileSync("git", [
  "check-ignore",
  "-q",
  path.join(evidenceDir, "index.json"),
])
await fs.mkdir(evidenceDir, { recursive: true })
const dev = process.env.CUBENCE_EXTENSION_ID
  ? await connectExtensionById({
      extensionId: process.env.CUBENCE_EXTENSION_ID,
    })
  : await connectDevExtension()
let site = await dev.context.newPage()
const ui = await dev.context.newPage()
// The update notice can arrive after initial modal dismissal while data loads.
await ui.addLocatorHandler(ui.getByTestId(updateLog.root), async () => {
  await ui.getByTestId(updateLog.closeButton).click()
})
await ui.addInitScript(() =>
  localStorage.setItem("all-api-hub-i18nextLng", "en"),
)
const evidence = {
  runId,
  worktree: process.cwd(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  extensionId: dev.extensionId,
  sourceHasChanges: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  capturedAt: new Date().toISOString(),
  mutate,
  directOnly,
  unresponsiveContent,
  stalledDownloadRule,
  guideOnly,
  checks: [],
  cleanup: {},
}
const cleanupErrors = []
let accountId
let userId
let originalKeys
const extraSitePages = new Set()
const trackSitePage = (page) =>
  page.on("framenavigated", (frame) => {
    if (
      page !== site &&
      frame === page.mainFrame() &&
      frame.url().startsWith("https://cubence.com/")
    )
      extraSitePages.add(page)
  })
let clipboardPermissionOverride = false
const pendingCaptures = new Set()
const captureErrors = []

/** Retain the extension's actual provider traffic, including failed writes. */
function captureResponse(response) {
  if (!response.url().startsWith("https://cubence.com/api/")) return
  const pending = (async () => {
    const request = response.request()
    const snapshot = {
      url: response.url(),
      method: request.method(),
      requestBody: request.postData(),
      status: response.status(),
      headers: await response.allHeaders(),
      text: await response.text(),
    }
    await fs.writeFile(
      path.join(evidenceDir, `network-${randomUUID()}.json`),
      JSON.stringify(snapshot, null, 2),
    )
  })()
    .catch((error) => captureErrors.push(String(error)))
    .finally(() => pendingCaptures.delete(pending))
  pendingCaptures.add(pending)
}
dev.context.on("response", captureResponse)

/** Capture only target requests; originals remain in a verified ignored directory. */
async function request(endpoint, method = "GET", body) {
  const result = await site.evaluate(
    async ({ endpoint, method, body }) => {
      const response = await fetch(endpoint, {
        method,
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return {
        endpoint,
        method,
        requestBody: body,
        status: response.status,
        text: await response.text(),
      }
    },
    { endpoint, method, body },
  )
  await fs.writeFile(
    path.join(evidenceDir, `request-${randomUUID()}.json`),
    JSON.stringify(result, null, 2),
  )
  assert.equal(
    result.status,
    200,
    `${method} ${endpoint}: unexpected HTTP status; inspect the response and session preflight`,
  )
  return JSON.parse(result.text)
}
const inventory = async () => {
  const body = await request("/api/v1/user/apikeys")
  assert.equal(body.success, true)
  assert.ok(Array.isArray(body.data))
  return body.data
}
const stored = () => getAccounts(dev.serviceWorker)
const card = () =>
  ui.getByTestId(`account-management-account-list-item-${accountId}`)
const capture = (name) =>
  ui.screenshot({ path: path.join(evidenceDir, name), animations: "disabled" })

/** Persist completed checkpoints even while the remaining live flow is running. */
async function checkpoint(description) {
  evidence.checks.push(description)
  await fs.writeFile(
    path.join(evidenceDir, "index.json"),
    JSON.stringify(evidence, null, 2),
  )
  console.log(`PASS: ${description}`)
}

/** Fault only one pool-owned receiver, restoring the browser API even when submission fails. */
async function withTempPageFaults(submit) {
  await dev.serviceWorker.evaluate((stallDownloadRule) => {
    const api = globalThis.browser.tabs
    const state = {
      original: api.sendMessage,
      observed: [],
      tabId: null,
      failTabId: null,
      originalRules: globalThis.chrome.declarativeNetRequest.updateSessionRules,
      stalledRules: 0,
    }
    globalThis.__aahContentRecoveryProbe = state
    if (stallDownloadRule) {
      globalThis.chrome.declarativeNetRequest.updateSessionRules = function (
        options,
        ...rest
      ) {
        if (
          options.addRules?.some(
            (rule) =>
              rule.action.type === "block" && rule.condition.tabIds?.length,
          )
        ) {
          state.stalledRules += 1
          return new Promise(() => {})
        }
        return Reflect.apply(state.originalRules, this, [options, ...rest])
      }
    }
    api.sendMessage = function (tabId, message, ...rest) {
      if (
        [
          "checkCapGuard",
          "checkCloudflareGuard",
          "performTempWindowFetch",
        ].includes(message.action)
      ) {
        state.observed.push({
          tabId,
          action: message.action,
          method: message.fetchOptions?.method,
          failed: tabId === state.failTabId,
        })
        if (
          message.action === "performTempWindowFetch" &&
          message.fetchUrl === "https://cubence.com/api/v1/auth/me"
        )
          state.tabId = tabId
        if (tabId === state.failTabId) return new Promise(() => {})
      }
      return Reflect.apply(state.original, this, [tabId, message, ...rest])
    }
  }, stalledDownloadRule)
  try {
    const warmed = await ui.evaluate(async () => {
      let timeout
      try {
        const response = await Promise.race([
          globalThis.chrome.runtime.sendMessage({
            action: "protectionBypass:executeTask",
            execution: {
              version: 2,
              kind: "user_command",
              command: "manage_api_keys",
              surface: "options",
            },
            task: {
              kind: "explicit_page_fetch",
              params: {
                originUrl: "https://cubence.com",
                fetchUrl: "https://cubence.com/api/v1/auth/me",
                fetchOptions: { method: "GET", credentials: "include" },
                authType: "cookie",
                requestId: crypto.randomUUID(),
              },
            },
          }),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Temporary-page preflight timed out")),
              30000,
            )
          }),
        ])
        return response?.success === true
      } finally {
        clearTimeout(timeout)
      }
    })
    assert.ok(
      warmed,
      "The pool fixture must first establish a healthy content receiver",
    )
    const staleTabId = await dev.serviceWorker.evaluate((stallContent) => {
      const state = globalThis.__aahContentRecoveryProbe
      if (stallContent) state.failTabId = state.tabId
      return state.failTabId
    }, unresponsiveContent)
    if (unresponsiveContent) assert.equal(typeof staleTabId, "number")
    await submit()
    const observed = await dev.serviceWorker.evaluate(
      () => globalThis.__aahContentRecoveryProbe.observed,
    )
    const writes = observed.filter((entry) => entry.method === "POST")
    if (unresponsiveContent)
      assert.ok(
        observed.some(
          (entry) => entry.failed && entry.action === "checkCapGuard",
        ),
        "The stalled receiver must actually be probed",
      )
    assert.equal(
      writes.length,
      1,
      "Recovery must dispatch creation exactly once",
    )
    assert.notEqual(
      writes[0].tabId,
      staleTabId,
      "Creation must use the fresh receiver",
    )
    evidence.contentRecovery = { staleTabId, observed }
    const stalledRules = await dev.serviceWorker.evaluate(
      () => globalThis.__aahContentRecoveryProbe.stalledRules,
    )
    if (stalledDownloadRule)
      assert.ok(
        stalledRules > 0,
        "The download-rule fault must actually be exercised",
      )
    evidence.contentRecovery.stalledRules = stalledRules
    await checkpoint(
      "temporary-page faults recover before exactly one UI creation write",
    )
  } finally {
    await dev.serviceWorker.evaluate(() => {
      const state = globalThis.__aahContentRecoveryProbe
      if (state) {
        globalThis.browser.tabs.sendMessage = state.original
        globalThis.chrome.declarativeNetRequest.updateSessionRules =
          state.originalRules
        delete globalThis.__aahContentRecoveryProbe
      }
    })
  }
}

try {
  if (guideOnly) {
    await ui.goto(`chrome-extension://${dev.extensionId}/options.html#account`)
    await dismissModals(ui)
    await ui.getByTestId(accounts.addAccountButton).click()
    await ui.getByTestId(accounts.siteUrlInput).fill("https://cubence.com")
    await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
      "data-auth-type",
      "cookie",
    )
    const grant = ui.getByTestId(accounts.cookiePermissionGrantButton)
    if (await grant.isVisible()) await grant.click()
    await ui.getByTestId(accounts.manualAddButton).click()
    await ui.getByTestId(accounts.siteTypeTrigger).click()
    await ui.getByRole("option", { name: "cubence", exact: true }).click()
    await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
      "data-auth-type",
      "cookie",
    )
    await expect(
      ui
        .getByText("Uses the browser session for this site.", { exact: false })
        .first(),
    ).toBeVisible()
    await expect(
      ui.getByPlaceholder("Paste Cookie header value"),
    ).not.toHaveAttribute("required")
    await capture("00-login-guide.png")
    evidence.checks.push(
      "fresh URL defaults to Cookie; manual Cubence form explains session recovery and optional import; detection/save/refresh not exercised",
    )
  } else {
    await site.goto("https://cubence.com/dashboard")
    let session = await checkSession(() => probeCubenceSession(site))
    if (waitForLogin && session.status === "source-check-required") {
      console.log(
        "Waiting for Cubence login in the isolated dev browser (up to 15 minutes).",
      )
      await expect
        .poll(
          async () => {
            session = await checkSession(() => probeCubenceSession(site))
            return session.status
          },
          { timeout: 15 * 60 * 1000, intervals: [2000, 5000] },
        )
        .toBe("ready")
    }
    evidence.sessionPreflight = session
    assert.equal(session.status, "ready", recoveryHint(session.status))
    const user = (await request("/api/v1/auth/me")).user
    assert.equal(String(user?.id), session.target.identity)
    assert.equal(user.active, true)
    userId = Number(session.target.identity)
    evidence.userId = userId
    evidence.viewport = await ui.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }))
    originalKeys = await inventory()
    evidence.originalKeyIds = originalKeys.map((key) => key.id)
    await checkpoint("authenticated native identity and initial key inventory")
    const groups = (await request("/api/v1/share-groups/available")).data
    const group = groups.find(
      (group) => group.is_active && group.name.startsWith("openai-off"),
    )
    const alternate = groups.find(
      (candidate) =>
        candidate.is_active &&
        candidate.id !== group?.id &&
        candidate.supported_protocols?.includes("openai.responses"),
    )
    const invitation = (await request("/api/v1/invite/my-code")).data
      .invite_code
    const announcements = (
      await request(
        "/api/v1/announcements?page=1&page_size=50&sort=latest&lang=en",
      )
    ).data.announcements

    await ui.goto(`chrome-extension://${dev.extensionId}/options.html#account`)
    await dismissModals(ui)
    await ui.getByTestId(accounts.addAccountButton).click()
    await ui.getByTestId(accounts.siteUrlInput).fill("https://cubence.com")
    const grant = ui.getByTestId(accounts.cookiePermissionGrantButton)
    if (await grant.isVisible()) await grant.click()
    await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
      "data-auth-type",
      "cookie",
    )
    await ui.getByTestId(accounts.autoDetectButton).click()
    await expect(ui.getByTestId(accounts.siteTypeTrigger)).toContainText(
      "cubence",
      { timeout: 30000 },
    )
    await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
      String(user.id),
    )
    // A fresh profile discovers identity before the Cookie permission action is
    // shown. Grant through that normal recovery UI, then retry detection.
    if (
      !(await ui.evaluate(() =>
        globalThis.chrome.permissions.contains({ permissions: ["cookies"] }),
      ))
    ) {
      await expect(
        ui.getByTestId(accounts.autoDetectButton),
      ).not.toHaveAttribute("aria-busy", "true")
      await grant.click()
      await expect
        .poll(() =>
          ui.evaluate(() =>
            globalThis.chrome.permissions.contains({
              permissions: ["cookies"],
            }),
          ),
        )
        .toBe(true)
      await ui.getByTestId(accounts.autoDetectButton).click()
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
    assert.equal(saved.site_type, "cubence")
    assert.equal(String(saved.account_info.id), String(userId))
    assert.equal(
      saved.account_info.quota,
      (user.normal_balance / 1000000) * QUOTA_PER_USD,
    )
    await checkpoint(
      "fresh form, default Cookie, automatic live identity, save and USD balance",
    )
    if (directOnly) dev.context.on("page", trackSitePage)
    if (originalKeys.length === 0) {
      await card().getByTestId(accounts.rowCopyKeyButton).click()
      const quickKeys = ui.getByRole("dialog").filter({
        has: ui.getByRole("heading", { name: "Key List", exact: true }),
      })
      const createDefault = quickKeys.getByRole("button", {
        name: "Create default key",
        exact: true,
      })
      // The row action resolves live keys before opening the inventory.
      await expect(createDefault).toBeVisible({ timeout: 30000 })
      await capture("01a-default-key-action.png")
      const openingStarted = performance.now()
      await createDefault.click()
      const name = ui.locator("#resource-editor-name")
      const groupField = ui.locator("#resource-editor-group")
      await expect(name).toBeEditable({ timeout: 5000 })
      const formReadyMs = Math.round(performance.now() - openingStarted)
      await capture("01aa-default-key-group-loading.png")
      await expect(groupField).toBeEnabled({
        timeout: 30000,
      })
      evidence.defaultKeyCreationTiming = {
        formReadyMs,
        groupsReadyMs: Math.round(performance.now() - openingStarted),
      }
      console.log(
        `TIMING: ${JSON.stringify(evidence.defaultKeyCreationTiming)}`,
      )
      await expect(
        ui.getByText(
          "Key creation requires a confirmed group. Choose an available group before continuing.",
          { exact: true },
        ),
      ).toHaveCount(0)
      assert.ok(group, "A selectable group is required for naming validation")
      await groupField.click()
      await ui
        .getByRole("option", {
          name: `${getCubenceGroupDisplayName(group)} ${group.multiplier}x`,
          exact: true,
        })
        .click()
      await expect(name).toHaveValue(
        getDefaultAccountKeyName(getCubenceGroupDisplayName(group)),
      )
      await capture("01ab-default-key-group-name.png")
      if (alternate) {
        await groupField.click()
        await ui
          .getByRole("option", {
            name: `${getCubenceGroupDisplayName(alternate)} ${alternate.multiplier}x`,
            exact: true,
          })
          .click()
        await expect(name).toHaveValue(
          getDefaultAccountKeyName(getCubenceGroupDisplayName(alternate)),
        )
        await name.fill("My custom key")
        await groupField.click()
        await ui
          .getByRole("option", {
            name: `${getCubenceGroupDisplayName(group)} ${group.multiplier}x`,
            exact: true,
          })
          .click()
        await expect(name).toHaveValue("My custom key")
      }
      await capture("01b-default-key-editor.png")
      await ui.keyboard.press("Escape")
      await ui
        .getByRole("button", { name: "Discard changes", exact: true })
        .click()
      await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0)
      await expect(createDefault).toBeEnabled()
      await expect
        .poll(() =>
          quickKeys.evaluate((node) => node.contains(document.activeElement)),
        )
        .toBe(true)
      await capture("01c-default-key-cancelled.png")
      if (mutate) {
        await createDefault.click()
        await expect(groupField).toBeEnabled({ timeout: 30000 })
        await groupField.click()
        await ui
          .getByRole("option", {
            name: `${getCubenceGroupDisplayName(group)} ${group.multiplier}x`,
            exact: true,
          })
          .click()
        await name.fill(defaultKeyName)
        await expect(ui.locator("#resource-editor-unlimited")).toBeChecked()
        await ui.locator("#resource-editor-unlimited").uncheck()
        await ui.locator("#resource-editor-quota").fill("1")
        await site.close()
        const submitStarted = performance.now()
        await ui.getByTestId(keys.nativeEditorSubmitButton).click()
        await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0, {
          timeout: 60000,
        })
        evidence.defaultKeySubmitMs = Math.round(
          performance.now() - submitStarted,
        )
        console.log(
          `TIMING: default key submission ${evidence.defaultKeySubmitMs}ms`,
        )
        site = await dev.context.newPage()
        await site.goto("https://cubence.com/dashboard")
        const created = (await inventory()).find(
          (key) => key.name === defaultKeyName,
        )
        assert.ok(created, "Default creation must persist the native key")
        assert.equal(created.share_group_id, group.id)
        assert.equal(created.quota_limit, 1000000)
        await request(`/api/v1/user/apikeys/${created.id}`, "DELETE")
        assert.ok(!(await inventory()).some((key) => key.id === created.id))
        await checkpoint(
          "default-key submission completes with native readback and cleanup",
        )
      }
      await ui
        .getByTestId(accounts.copyKeyDialogFooter)
        .getByRole("button", { name: "Close", exact: true })
        .click()
      await checkpoint(
        "default-key editor synchronizes generated names with groups, preserves custom names and returns to the key list on discard",
      )
    }

    await site.close()
    evidence.otherConsoleTabsDuringRefresh = dev.context
      .pages()
      .filter((tab) => tab.url().startsWith("https://cubence.com/")).length
    const beforeSync = (await stored()).find(
      (account) => account.id === accountId,
    ).last_sync_time
    await card()
      .getByRole("button", { name: "Click to refresh balance", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await stored()).find((account) => account.id === accountId)
            ?.last_sync_time,
        { timeout: 30000 },
      )
      .toBeGreaterThan(beforeSync)
    assert.equal(
      (await stored()).find((account) => account.id === accountId).health
        .status,
      "healthy",
    )
    await card().screenshot({ path: path.join(evidenceDir, "01-account.png") })
    await checkpoint(
      evidence.otherConsoleTabsDuringRefresh === 0
        ? "refresh with no Cubence tabs open in the dev browser"
        : "refresh after closing the suite's console tab",
    )
    site = await dev.context.newPage()
    await site.goto("https://cubence.com/dashboard")

    // Chromium treats extension URLs as opaque for origin-scoped overrides.
    // Temporarily permit only clipboard reads in this dev context, then reset
    // the override without changing the extension's optional permissions.
    await dev.context.grantPermissions(["clipboard-read"])
    clipboardPermissionOverride = true
    await ui.bringToFront()
    await card().getByTestId(accounts.rowMoreActionsButton).click()
    await ui.getByRole("menuitem", { name: "Share", exact: true }).hover()
    await ui.getByTestId(accounts.rowCopyInviteLinkMenuItem).click()
    await expect(
      ui.getByText("Invite link copied", { exact: false }),
    ).toBeVisible({ timeout: 15000 })
    assert.equal(
      await ui.evaluate(async () => {
        let timer
        try {
          return await Promise.race([
            navigator.clipboard.readText(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Clipboard read timed out")),
                5000,
              )
            }),
          ])
        } finally {
          clearTimeout(timer)
        }
      }),
      `https://cubence.com/signup?code=${encodeURIComponent(invitation)}`,
    )
    await dev.context.clearPermissions()
    clipboardPermissionOverride = false
    await capture("02-invite.png")
    await checkpoint("exact native invitation URL and copy feedback")
    await testModelCatalogFlow({
      page: ui,
      extensionId: dev.extensionId,
      accountName,
      accountId,
    })
    await capture("03-models.png")
    await checkpoint("provider model rows and static price estimates")
    const groupSummary = ui.locator('[title^="Current usable groups:"]').first()
    await expect(groupSummary).toBeVisible()
    const summary = await groupSummary.getAttribute("title")
    assert.ok(
      groups.some((group) =>
        summary.includes(getCubenceGroupDisplayName(group)),
      ),
    )
    assert.ok(
      !/groups: \d+ \(/.test(summary),
      "Model group summaries must use names rather than IDs",
    )
    await ui.getByTestId(models.modelKeyDialogButton).first().click()
    await expect(ui.getByTestId(models.createCustomKeyButton)).toBeEnabled({
      timeout: 30000,
    })
    await ui.getByTestId(models.createCustomKeyButton).click()
    await expect(ui.locator("#resource-editor-name")).toBeEditable({
      timeout: 5000,
    })
    await expect(ui.locator("#resource-editor-group")).toBeEnabled({
      timeout: 30000,
    })
    const modelKeyName = await ui.locator("#resource-editor-name").inputValue()
    assert.ok(
      groups.some(
        (group) =>
          modelKeyName ===
          getDefaultAccountKeyName(getCubenceGroupDisplayName(group)),
      ),
      "Model creation must use the selected group's clean display name",
    )
    await capture("03a-model-key-creation.png")
    await ui.keyboard.press("Escape")
    await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0)
    await ui.keyboard.press("Escape")
    await checkpoint(
      "model group names and creation handoff preserve native selection without multiplier text in generated names",
    )

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
    await ui.getByTestId(keys.addTokenButton).click()
    await expect(ui.locator("#resource-editor-unlimited")).toBeChecked({
      timeout: 30000,
    })
    await expect(ui.locator("#resource-editor-name")).toBeVisible()
    await capture("04-key-editor.png")
    await checkpoint("native editor with unlimited default and required group")
    if (mutate) {
      assert.ok(group, "An unrestricted OpenAI test group is required")
      assert.ok(
        alternate,
        "A different available OpenAI group is required to verify group edits",
      )
      await ui.locator("#resource-editor-name").fill(keyName)
      await ui.locator("#resource-editor-group").click()
      await ui
        .getByRole("option", {
          name: `${getCubenceGroupDisplayName(group)} ${group.multiplier}x`,
          exact: true,
        })
        .click()
      await ui.locator("#resource-editor-unlimited").uncheck()
      await ui.locator("#resource-editor-quota").fill("1")
      await site.close()
      const submitStarted = performance.now()
      const submit = async () => {
        await ui.getByTestId(keys.nativeEditorSubmitButton).click()
        await expect(ui.getByTestId(keys.nativeEditorSubmitButton)).toBeHidden({
          timeout: 60000,
        })
      }
      if (unresponsiveContent || stalledDownloadRule)
        await withTempPageFaults(submit)
      else await submit()
      evidence.managementKeySubmitMs = Math.round(
        performance.now() - submitStarted,
      )
      console.log(
        `TIMING: management key submission ${evidence.managementKeySubmitMs}ms`,
      )
      site = await dev.context.newPage()
      await site.goto("https://cubence.com/dashboard")
      await expect
        .poll(
          async () =>
            (await inventory()).find((key) => key.name === keyName)?.id,
          { timeout: 30000 },
        )
        .toBeTruthy()
      const created = (await inventory()).find((key) => key.name === keyName)
      evidence.createdKeyId = created.id
      assert.equal(created.quota_limit, 1000000)
      assert.equal(created.share_group_id, group.id)
      await checkpoint("UI key creation and native quota/group readback")
      // Reopen the persisted inventory before exercising secret disclosure.
      await ui.reload()
      const row = ui.getByTestId(keys.nativeKeyRow).filter({ hasText: keyName })
      await expect(row).toBeVisible({ timeout: 30000 })
      await row.getByRole("button", { name: "Show Key", exact: true }).click()
      await expect(
        row.getByRole("button", { name: "Hide Key", exact: true }),
      ).toBeVisible({ timeout: 30000 })
      assert.ok(
        (
          await row.getByTestId(keys.keyResourceSecretDisplay).innerText()
        ).includes(created.key),
        "Revealed key must match the native secret",
      )
      await row.getByRole("button", { name: "Hide Key", exact: true }).click()
      await row.getByTestId(keys.exportMenuButton).click()
      await ui.getByTestId(keys.exportToCCSwitchButton).click()
      await expect(ui.getByTestId(ccSwitch.dialog)).toBeVisible()
      await expect(ui.locator("#ccswitch-endpoint")).toHaveValue(
        "https://api.cubence.com",
        { timeout: 30000 },
      )
      await ui.locator("#ccswitch-app").click()
      await ui.getByRole("option", { name: "Codex", exact: true }).click()
      await expect(ui.locator("#ccswitch-endpoint")).toHaveValue(
        "https://api.cubence.com/v1",
        { timeout: 30000 },
      )
      await capture("05-export.png")
      await ui.getByTestId(ccSwitch.cancelButton).click()
      await checkpoint(
        "CC Switch export preview uses Anthropic root and OpenAI /v1 on the inference origin",
      )
      await row.getByRole("button", { name: "Edit Key", exact: true }).click()
      await expect(ui.locator("#resource-editor-quota")).toHaveValue("1", {
        timeout: 30000,
      })
      await expect(ui.locator("#resource-editor-name")).toHaveCount(0)
      await ui.locator("#resource-editor-quota").fill("2")
      await ui.locator("#resource-editor-enabled").click()
      await ui.locator("#resource-editor-group").click()
      await ui
        .getByRole("option", {
          name: `${getCubenceGroupDisplayName(alternate)} ${alternate.multiplier}x`,
          exact: true,
        })
        .click()
      await ui.getByTestId(keys.nativeEditorSubmitButton).click()
      // Three sequential native PATCH requests each acquire a page context,
      // followed by fresh inventory readback before the editor can close.
      await expect(ui.getByTestId(keys.nativeEditorSubmitButton)).toBeHidden({
        timeout: 90000,
      })
      const updated = (await inventory()).find((key) => key.id === created.id)
      assert.equal(updated.quota_limit, 2000000)
      assert.equal(updated.status, "disabled")
      assert.ok(
        updated.key === created.key,
        "Editing must preserve the native secret",
      )
      assert.equal(updated.name, keyName)
      assert.equal(updated.share_group_id, alternate.id)
      await row.getByRole("button", { name: "Edit Key", exact: true }).click()
      await expect(ui.locator("#resource-editor-quota")).toHaveValue("2", {
        timeout: 30000,
      })
      await expect(
        ui.getByText("Expiration Time", { exact: true }),
      ).toHaveCount(0)
      await expect(ui.locator("#resource-editor-enabled")).toHaveAttribute(
        "aria-checked",
        "false",
      )
      await expect(ui.locator("#resource-editor-group")).toContainText(
        getCubenceGroupDisplayName(alternate),
        { timeout: 30000 },
      )
      await capture("05-edited-key.png")
      await ui.keyboard.press("Escape")
      await row.getByRole("button", { name: "Delete Key", exact: true }).click()
      await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
      await expect
        .poll(
          async () => (await inventory()).some((key) => key.id === created.id),
          { timeout: 30000 },
        )
        .toBe(false)
      await checkpoint(
        "UI create, plaintext reveal, quota/group/status edit, reopen, secret/name preservation and delete readback",
      )
    } else await ui.keyboard.press("Escape")

    await ui.goto(
      `chrome-extension://${dev.extensionId}/options.html#siteAnnouncements`,
    )
    await dismissModals(ui)
    const check = ui
      .getByRole("button", { name: "Check now", exact: false })
      .first()
    await expect(check).toBeVisible({ timeout: 30000 })
    await check.click()
    if (announcements.length)
      await expect(
        ui.getByText(announcements[0].title, { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 })
    await capture("06-announcements.png")
    await checkpoint("site announcement refresh and rendered title")
  }
  if (directOnly) {
    assert.equal(
      extraSitePages.size,
      0,
      "Saved-account operations must not open a temporary Cubence page",
    )
    const rules = await dev.serviceWorker.evaluate(() =>
      globalThis.chrome.declarativeNetRequest.getSessionRules(),
    )
    assert.ok(
      !rules.some((rule) => rule.id === 3_000_000),
      "Private request rules must be cleaned up",
    )
    await checkpoint(
      "saved-account workflows use direct requests without temporary Cubence pages or residual credential rules",
    )
  }
} catch (error) {
  evidence.failure = String(error)
  await fs
    .writeFile(
      path.join(evidenceDir, "failure-ui.txt"),
      await ui
        .locator("body")
        .innerText()
        .catch(() => "Page unavailable during failure capture"),
    )
    .catch(() => {})
  await capture("failure.png").catch((error) => {
    evidence.screenshotFailure = String(error)
  })
  throw error
} finally {
  if (clipboardPermissionOverride) {
    await dev.context.clearPermissions().catch((error) => {
      cleanupErrors.push(String(error))
    })
  }
  try {
    if (originalKeys && mutate) {
      if (site.isClosed()) {
        site = await dev.context.newPage()
        await site.goto("https://cubence.com/dashboard")
      }
      assert.equal((await request("/api/v1/auth/me")).user.id, userId)
      for (const key of await inventory())
        if (
          [keyName, defaultKeyName].includes(key.name) &&
          !originalKeys.some((original) => original.id === key.id)
        )
          await request(`/api/v1/user/apikeys/${key.id}`, "DELETE")
      const remaining = await inventory()
      assert.ok(
        !remaining.some((key) => [keyName, defaultKeyName].includes(key.name)),
      )
      assert.ok(
        originalKeys.every((original) =>
          remaining.some((key) => key.id === original.id),
        ),
        "Original keys must remain after cleanup",
      )
      evidence.cleanup.keys = true
    }
  } catch (error) {
    cleanupErrors.push(String(error))
  }
  try {
    accountId ||= (await stored()).find(
      (account) => account.site_name === accountName,
    )?.id
    if (accountId) {
      await ui.goto(
        `chrome-extension://${dev.extensionId}/options.html#account`,
      )
      // A failed editor can leave a blocking modal when the hash was already #account.
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
      evidence.cleanup.account = true
    }
  } catch (error) {
    cleanupErrors.push(String(error))
  }
  evidence.cleanup.errors = cleanupErrors
  dev.context.off("response", captureResponse)
  dev.context.off("page", trackSitePage)
  await Promise.all(pendingCaptures)
  evidence.captureErrors = captureErrors
  await fs.writeFile(
    path.join(evidenceDir, "index.json"),
    JSON.stringify(evidence, null, 2),
  )
  await ui.close().catch(() => {})
  await site.close().catch(() => {})
  await dev.close()
}
assert.deepEqual(cleanupErrors, [])
console.log(
  JSON.stringify(
    { checks: evidence.checks, cleanup: evidence.cleanup, evidenceDir },
    null,
    2,
  ),
)
