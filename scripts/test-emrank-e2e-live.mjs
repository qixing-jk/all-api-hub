import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import fsPromises from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { MODEL_LIST_TEST_IDS as models } from "../src/features/ModelList/testIds.ts"
import { TOKEN_PROVISIONING_TEST_IDS as secrets } from "../src/features/TokenProvisioning/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import { EMRANK_WEB_ORIGIN } from "../src/services/accountSiteDefinitions/identifiers.ts"
import {
  EMRANK_CSRF_HEADER_NAME,
  EMRANK_CSRF_HEADER_VALUE,
  EMRANK_ENDPOINTS,
  EMRANK_TOKEN_ASSET,
  EMRANK_TOKENS_PER_M_TOKEN,
} from "../src/services/apiService/emrank/constants.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import { connectDevBrowser, connectExtensionById } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { preflightSession, probePageSession } from "./cdp/session-preflight.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Default: read-only provider probes plus an isolated local account (removed).
// --mutate: create one disposable key with unlimited quota, edit it, and delete it.
// No inference, login, redemption submission, checkout or account rotation.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const mutate = process.argv.includes("--mutate")
const origin = EMRANK_WEB_ORIGIN
const accountName = `AAH EMRank ${randomUUID().slice(0, 8)}`
const evidenceDir = path.resolve(
  process.env.EMRANK_EVIDENCE_DIR ||
    `.scratch/emrank-site-integration/evidence/ui-${Date.now()}`,
)
execFileSync("git", [
  "check-ignore",
  "-q",
  path.join(evidenceDir, "index.json"),
])
await fsPromises.mkdir(evidenceDir, { recursive: true })

/** Session readiness probe over the console's own session endpoint. */
// `preflightSession` invokes the target probe with no arguments, so the page
// has to come from the runner's own open console tab.
let site
const probeSession = () =>
  probePageSession(site, {
    endpoint: `${origin}${EMRANK_ENDPOINTS.Identity}`,
    readIdentity: (body) =>
      body?.authenticated === true && Number.isSafeInteger(body?.user?.id)
        ? String(body.user.id)
        : undefined,
  })

const discovery = await connectDevBrowser()
let extensionId
try {
  extensionId = await findInstalledDevExtension(
    discovery.browser,
    // The launcher mounts the hot-reload dev build when a dev server is up.
    path.resolve(
      fs.existsSync(".output/chrome-mv3-dev/manifest.json")
        ? ".output/chrome-mv3-dev"
        : ".output/chrome-mv3",
    ),
  )
} finally {
  await discovery.close()
}
const dev = await connectExtensionById({ extensionId })
site = await dev.context.newPage()
const ui = await dev.context.newPage()
await ui.addInitScript(() =>
  localStorage.setItem("all-api-hub-i18nextLng", "en"),
)
await ui.addLocatorHandler(ui.getByTestId(updateLog.root), () =>
  ui.getByTestId(updateLog.closeButton).click(),
)
const uiErrors = []
ui.on("pageerror", (error) => uiErrors.push(String(error).slice(0, 300)))
ui.on("console", (message) => {
  if (message.type() === "error") uiErrors.push(message.text().slice(0, 300))
})
const consoleWrites = []
dev.context.on("request", (request) => {
  const url = new URL(request.url())
  if (url.origin === origin && url.pathname.startsWith("/api/")) {
    consoleWrites.push({
      method: request.method(),
      path: url.pathname,
      at: Date.now(),
      frame: request.frame()?.url() ?? "no-frame",
      // Never record credentials; the write shape is what a failure needs.
      ...(request.method() === "GET"
        ? {}
        : {
            postData: request.postData()?.slice(0, 500) ?? null,
            contentType: request.headers()["content-type"] ?? null,
            csrf: request.headers()["x-gateway-csrf"] ?? null,
          }),
    })
  }
})
/** Every provider answer the extension receives, including late failures. */
const consoleResponses = []
const recordResponse = async (response) => {
  const url = new URL(response.url())
  if (url.origin === origin && url.pathname.startsWith("/api/")) {
    const entry = {
      method: response.request().method(),
      path: url.pathname,
      status: response.status(),
      at: Date.now(),
    }
    if (response.status() >= 400)
      entry.body = await response
        .text()
        .catch(() => "")
        .then((text) => text.slice(0, 500))
    consoleResponses.push(entry)
  }
}
dev.context.on("response", recordResponse)
dev.context.on("requestfailed", (request) => {
  const url = new URL(request.url())
  if (url.origin === origin && url.pathname.startsWith("/api/")) {
    consoleResponses.push({
      method: request.method(),
      path: url.pathname,
      failed: request.failure()?.errorText ?? "unknown",
      at: Date.now(),
    })
  }
})

/**
 * MV3 work happens in the service worker, whose requests never surface on the
 * context, so both contexts record their own fetches and rejections.
 */
const installFetchProbe = () => {
  const scope = globalThis
  if (scope.__aahFetchLog) return true
  const log = []
  scope.__aahFetchLog = log
  const original = scope.fetch
  if (typeof original === "function") {
    scope.fetch = async (...args) => {
      const input = args[0]
      const entry = {
        t: Date.now(),
        url: typeof input === "string" ? input : input?.url ?? String(input),
        method: args[1]?.method ?? input?.method ?? "GET",
      }
      log.push(entry)
      try {
        const response = await original.apply(scope, args)
        entry.status = response.status
        return response
      } catch (error) {
        entry.error = String(error)
        throw error
      }
    }
  }
  scope.addEventListener?.("unhandledrejection", (event) => {
    log.push({
      t: Date.now(),
      unhandled: String(event.reason?.stack || event.reason).slice(0, 500),
    })
  })
  scope.addEventListener?.("error", (event) => {
    log.push({
      t: Date.now(),
      error: String(event.message || event.error).slice(0, 500),
    })
  })
  return true
}
const readFetchProbe = async () => {
  const read = async (target) =>
    (
      await target
        .evaluate(() => globalThis.__aahFetchLog ?? [])
        .catch(() => [])
    ).filter((entry) => entry.url.includes("/api/"))
  return { page: await read(ui), worker: await read(dev.serviceWorker) }
}
await ui.evaluate(installFetchProbe)
await dev.serviceWorker.evaluate(installFetchProbe)
let accountId
let createdKeyId
let initial
/** Samples taken after the create submit; dumped on both success and failure. */
const createTimeline = []
/** Set before the create dialog is filled so cleanup can find a late key. */
let createdName = ""
const writeCreateTimeline = () =>
  fsPromises.writeFile(
    path.join(evidenceDir, "post-submit.json"),
    JSON.stringify(
      {
        timeline: createTimeline,
        contextRequests: consoleWrites,
        responses: consoleResponses,
      },
      null,
      2,
    ),
  )
const evidence = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .toString()
    .trim(),
  worktree: process.cwd(),
  extensionId: dev.extensionId,
  capturedAt: new Date().toISOString(),
  mutate,
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
/** Starts when the canonical workspace route appears in the options URL. */
const routeSettledAt = { value: 0 }
const extensionApiRequests = () =>
  consoleWrites.filter(
    (entry) =>
      entry.frame === "no-frame" ||
      entry.frame.startsWith("chrome-extension://"),
  )
/**
 * A mutation submitted while the inventory reload is in flight reaches the
 * editor's submit handler and is then dropped without any feedback, so every
 * write waits for the extension's own request stream to go quiet first.
 */
const waitForInventorySettled = async () => {
  await expect
    .poll(
      () => {
        // The canonical route lands in the query string: options.html?…&workspace=…
        if (!new URL(ui.url()).searchParams.has("workspace")) {
          routeSettledAt.value = 0
          return false
        }
        if (routeSettledAt.value === 0) routeSettledAt.value = Date.now()
        const now = Date.now()
        const inFlight = extensionApiRequests().some(
          (entry) => now - entry.at < 1500,
        )
        return now - routeSettledAt.value >= 2500 && !inFlight
      },
      { timeout: 30000, intervals: [250] },
    )
    .toBe(true)
}
/**
 * Save stays disabled while that reload runs, so a write first waits for the
 * reload to settle and then for the control to come back.
 */
const waitForSaveReady = async () => {
  await waitForInventorySettled()
  const save = ui.getByTestId(keys.nativeEditorSubmitButton)
  await expect(save).toBeVisible({ timeout: 30000 })
  await expect(save).toBeEnabled({ timeout: 30000 })
}
let sequence = 0
async function request(endpoint, method = "GET", body) {
  const response = await site.evaluate(
    async ({ endpoint, method, body, csrfHeaderName, csrfHeaderValue }) => {
      const headers = { Accept: "application/json" }
      if (method !== "GET") headers[csrfHeaderName] = csrfHeaderValue
      // Without it the browser sends text/plain and the console rejects the body.
      if (body) headers["Content-Type"] = "application/json"
      const response = await fetch(endpoint, {
        method,
        credentials: "include",
        cache: "no-store",
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      return {
        endpoint,
        method,
        status: response.status,
        body: await response.json().catch(() => null),
      }
    },
    {
      endpoint,
      method,
      body,
      csrfHeaderName: EMRANK_CSRF_HEADER_NAME,
      csrfHeaderValue: EMRANK_CSRF_HEADER_VALUE,
    },
  )
  await fsPromises.writeFile(
    path.join(evidenceDir, `probe-${sequence++}.json`),
    JSON.stringify(response, null, 2),
  )
  assert.ok(
    response.status >= 200 && response.status < 300,
    `Unexpected status for ${endpoint}: ${response.status}`,
  )
  return response.body
}
const inventory = async () =>
  (await request(`${EMRANK_ENDPOINTS.Keys}?page=1&page_size=100`)).data
/** Reopen the console when cleanup follows a closed-tab refresh scenario. */
const ensureConsolePage = async () => {
  if (site.isClosed()) site = await dev.context.newPage()
  if (!site.url().startsWith(`${origin}/`)) await site.goto(`${origin}/account`)
}
try {
  await site.goto(`${origin}/account`)
  const readiness = await preflightSession({
    probeTarget: probeSession,
    expectedIdentity: process.env.EMRANK_USER_ID || undefined,
  })
  evidence.session = readiness
  assert.equal(
    readiness.status,
    "ready",
    "Check authorized source sessions or diagnose the identity probe before requesting login",
  )
  initial = await request(EMRANK_ENDPOINTS.Account)
  const originalKeys = await inventory()
  await ui.goto(`chrome-extension://${dev.extensionId}/options.html#account`)
  await dismissModals(ui)
  await ui.getByTestId(accounts.addAccountButton).click()
  await ui.getByTestId(accounts.siteUrlInput).fill(origin)
  const grant = ui.getByTestId(accounts.cookiePermissionGrantButton)
  if (await grant.isVisible()) await grant.click()
  await expect(ui.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
    "data-auth-type",
    "cookie",
    { timeout: 30000 },
  )
  await ui.getByTestId(accounts.autoDetectButton).click()
  await expect(ui.getByTestId(accounts.siteTypeTrigger)).toContainText(
    "emrank",
    { timeout: 30000 },
  )
  await expect(ui.getByTestId(accounts.userIdInput)).toHaveValue(
    String(readiness.target.identity),
    { timeout: 30000 },
  )
  await expect(ui.getByTestId(accounts.confirmAddButton)).toBeVisible({
    timeout: 30000,
  })
  await ui.getByTestId(accounts.siteNameInput).fill(accountName)
  await capture("00-onboarding.png")
  await ui.getByTestId(accounts.confirmAddButton).click()
  // A run that died before cleanup leaves the same console identity behind;
  // the duplicate warning has to be confirmed before the save can land.
  const duplicateContinue = ui.getByTestId(
    accounts.duplicateWarningContinueButton,
  )
  let acknowledgedDuplicate = false
  await expect
    .poll(
      async () => {
        const id = (await stored()).find(
          (account) => account.site_name === accountName,
        )?.id
        if (id) return id
        if (
          !acknowledgedDuplicate &&
          (await duplicateContinue.isVisible().catch(() => false))
        ) {
          acknowledgedDuplicate = true
          await duplicateContinue.click()
        }
        return undefined
      },
      { timeout: 30000, intervals: [500] },
    )
    .toBeTruthy()
  evidence.duplicateWarningAcknowledged = acknowledgedDuplicate
  accountId = (await stored()).find(
    (account) => account.site_name === accountName,
  ).id
  await dismissModals(ui)
  // Saving completes before the ordinary post-save refresh; wait for the
  // accepted provider balance instead of reading the placeholder snapshot.
  const mTokens = initial.quota / EMRANK_TOKENS_PER_M_TOKEN
  await expect
    .poll(
      async () =>
        (await stored()).find((account) => account.site_name === accountName)
          ?.account_info.nativeBalance,
      { timeout: 45000 },
    )
    .toEqual({
      unit: "quota",
      total: Number(initial.quota),
      asset: EMRANK_TOKEN_ASSET,
    })
  const saved = (await stored()).find((account) => account.id === accountId)
  assert.equal(saved.authType, "cookie")
  assert.equal(saved.site_type, "emrank")
  assert.equal(String(saved.account_info.id), String(readiness.target.identity))
  // The options list keeps its last in-memory snapshot; reload it so the
  // saved Token balance, not the placeholder, are what the card renders.
  await ui.reload()
  await dismissModals(ui)
  await expect(card()).toContainText(
    new Intl.NumberFormat("en").format(mTokens),
    { timeout: 30000 },
  )
  await expect(card()).toContainText("M Token")
  await expect(card()).not.toContainText(/Credits|Permanent|Daily/)
  await expect(card()).not.toContainText("$0.00")
  await capture("01-token-balance.png")
  evidence.checks.push(
    "Cookie default, automatic detection, atomic Token storage and M Token display",
  )
  // Refresh after closing the site tab.
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
  evidence.checks.push("background refresh after closing the site tab")
  site = await dev.context.newPage()
  await site.goto(`${origin}/account`)
  // Native quota rates remain separate from the catalogue's monetary prices.
  const catalog = await request(`${EMRANK_ENDPOINTS.Catalog}?page=0`)
  await ui.goto(
    `chrome-extension://${dev.extensionId}/options.html#models?accountId=${encodeURIComponent(accountId)}`,
  )
  await ui.waitForLoadState("domcontentloaded")
  await dismissModals(ui)
  await ui.waitForFunction(
    (expectedSource) => {
      const root = document.querySelector('[data-testid="model-list-page"]')
      const display = root?.querySelector('[data-testid="model-list-display"]')
      return (
        root?.getAttribute("data-model-source") === expectedSource &&
        !root.hasAttribute("data-options-page-pending") &&
        (!display || Boolean(display.querySelector("h3")))
      )
    },
    `account:${accountId}`,
    { timeout: 30000 },
  )
  const modelDisplay = ui.locator('[data-testid="model-list-display"]')
  // Rows virtualize by provider group, so assert the page's own counts instead
  // of rendered headers.
  await expect(
    ui.getByText(new RegExp(`Showing ${catalog.data.length} model`)),
  ).toBeVisible()
  assert.ok(
    (await modelDisplay.locator("h3").allTextContents()).some((name) =>
      name.trim(),
    ),
    "model_catalog_has_no_rendered_models",
  )
  assert.equal(
    /[$¥￥]\s*\d/.test(await modelDisplay.innerText()),
    false,
    "Native Token quota must not acquire a monetary price",
  )
  const visibleBilling = await modelDisplay
    .locator("h3")
    .evaluateAll((headings) =>
      headings.map((heading) => {
        const row = heading.closest('[data-slot="card"]')
        return {
          name: heading.textContent.trim(),
          text: row?.textContent ?? "",
        }
      }),
    )
  for (const row of visibleBilling) {
    const native = catalog.data.find((model) => model.id === row.name)
    assert.ok(native, `Missing upstream model: ${row.name}`)
    assert.ok(
      row.text.includes(
        `${new Intl.NumberFormat("en", {
          maximumSignificantDigits: 12,
        }).format(Number(native.modelratio))} M Token/M`,
      ),
      `Native multiplier missing for ${row.name}`,
    )
    assert.ok(row.text.includes("Output:0 M Token/M"))
  }
  await capture("02-models.png")
  await expect(modelDisplay.getByTestId(models.verifyApiButton)).toHaveCount(0)
  await expect(
    modelDisplay.getByTestId(models.verifyCliSupportButton),
  ).toHaveCount(0)
  await expect(modelDisplay).toContainText("Model type")
  await expect(modelDisplay).toContainText("Available on site")
  const firstModel = modelDisplay
    .locator('[data-slot="card"]')
    .filter({ has: ui.locator("h3") })
    .first()
  await firstModel.getByTestId(models.modelExpandButton).click()
  await expect(firstModel).toContainText("Catalog owner")
  await expect(
    firstModel.getByRole("link", { name: "View on site" }),
  ).toHaveAttribute("href", `${origin}/models`)
  await capture("02-model-specifications.png")
  evidence.checks.push(
    "model purpose, provider availability and native specifications use shared rows; unsuitable API/CLI generation probes are absent",
  )
  evidence.checks.push(
    "account catalogue displays native quota rates and free output without a fabricated monetary price",
  )
  await expect(
    modelDisplay.getByRole("button", { name: "Estimate quota usage" }),
  ).toHaveCount(0)
  await expect(modelDisplay.getByRole("spinbutton")).toHaveCount(0)
  await expect(modelDisplay).not.toContainText("million modeled tokens")
  const rules = modelDisplay
    .getByRole("link", { name: "Billing rules" })
    .first()
  await expect(rules).toHaveAccessibleDescription(/Account level, RPM/)
  evidence.checks.push(
    "native rates share standard per-million rows, with qualified billing rules and no separate calculator",
  )
  const viewport = ui.viewportSize()
  await ui.setViewportSize({ width: 390, height: 844 })
  await rules.scrollIntoViewIfNeeded()
  await capture("03-models-narrow.png")
  assert.ok(
    await ui.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "narrow viewport overflow",
  )
  await ui.setViewportSize(viewport ?? { width: 1440, height: 1000 })
  const sort = ui.getByRole("combobox").nth(1)
  await sort.click()
  await ui
    .getByRole("option", { name: "Quota usage: low to high", exact: true })
    .click()
  await expect(sort).toContainText("Quota usage: low to high")
  const sortedRates = await modelDisplay.locator("h3").evaluateAll((headings) =>
    headings.map((heading) => {
      const text = heading.closest('[data-slot="card"]')?.textContent ?? ""
      return Number(
        text.match(/Input:\s*([\d,.]+) M Token\/M/)?.[1]?.replaceAll(",", ""),
      )
    }),
  )
  assert.ok(sortedRates.length > 0 && sortedRates.every(Number.isFinite))
  assert.deepEqual(
    sortedRates,
    [...sortedRates].sort((a, b) => a - b),
  )
  evidence.checks.push(
    "quota sorting uses native base consumption within the account",
  )
  await ui.goto(
    `chrome-extension://${dev.extensionId}/options.html#keys?accountId=${accountId}`,
  )
  await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
    originalKeys.length,
    { timeout: 30000 },
  )
  evidence.checks.push("key inventory matches the console count")
  if (originalKeys.length) {
    await expect(ui.getByTestId(keys.nativeKeyRow).first()).toContainText(
      "M Token",
    )
    await expect(ui.getByTestId(keys.nativeKeyRow).first()).not.toContainText(
      /Credits/,
    )
  }
  await capture("04-token-keys.png")
  const reusable = originalKeys.find((key) => key.can_copy)
  if (reusable) {
    const row = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${reusable.id}"]`))
    const display = row
      .getByTestId(keys.keyResourceSecretDisplay)
      .locator(".font-mono")
    const masked = await display.innerText()
    await row.getByRole("button", { name: "Show Key", exact: true }).click()
    // Check only the secret text, excluding labels and button tooltips.
    await expect(display).toContainText(/sk-emr-[A-Za-z0-9_-]+/, {
      timeout: 30000,
    })
    await expect(display).not.toHaveText(masked)
    await row.getByRole("button", { name: "Hide Key", exact: true }).click()
    await expect(display).toHaveText(masked)
    evidence.checks.push("plaintext reveal/hide over the secrets route")
  } else {
    evidence.checks.push(
      "plaintext reveal unverified: this inventory has no copyable row",
    )
  }
  // Landing on #keys canonicalizes the workspace route, which starts one more
  // inventory reload; open the editor only after it settles.
  await waitForInventorySettled()
  evidence.checks.push("inventory settled after the canonical route reload")
  await ui.getByTestId(keys.addTokenButton).click()
  await expect(ui.getByTestId(keys.nativeEditor)).toBeVisible({
    timeout: 30000,
  })
  const expiry = ui.getByTestId(keys.nativeEditor).getByRole("combobox").first()
  await expect(expiry).toContainText("Never expires")
  await expiry.click()
  for (const label of [
    "Never expires",
    "One month (30 days)",
    "One day",
    "One hour",
    "Custom time",
  ]) {
    await expect(
      ui.getByRole("option", { name: label, exact: true }),
    ).toBeVisible()
  }
  await capture("05-expiration-options.png")
  await ui.keyboard.press("Escape")
  evidence.checks.push(
    "native key expiration modes use readable localized options",
  )
  createdName = `AAH key ${randomUUID().slice(0, 8)}`
  if (mutate) {
    const dialogInputs = await ui.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      if (!dialog) return { dialog: false, inputs: [] }
      return {
        dialog: true,
        inputs: [...dialog.querySelectorAll("input,textarea,select")].map(
          (el) => ({
            tag: el.tagName,
            type: el.getAttribute("type"),
            id: el.id,
            aria: el.getAttribute("aria-label"),
            name: el.getAttribute("name"),
            required: el.required === true,
            value: String(el.value ?? "").slice(0, 40),
            visible: !!el.offsetParent,
          }),
        ),
      }
    })
    await fsPromises.writeFile(
      path.join(evidenceDir, "editor-inputs.json"),
      JSON.stringify(dialogInputs, null, 2),
    )
    const nameBox = ui
      .getByTestId(keys.nativeEditor)
      .getByRole("textbox", { name: /name/i })
      .first()
    await nameBox.fill(createdName)
    await expect(nameBox).toHaveValue(createdName)
    // Opening the editor can start another inventory reload; never submit into it.
    await waitForSaveReady()
    await expect(nameBox).toHaveValue(createdName)
    const beforeClick = await ui.evaluate(() => ({
      invalidInputs: document.querySelectorAll("input:invalid").length,
      dialogText:
        document.querySelector('[role="dialog"]')?.textContent?.slice(0, 200) ??
        "",
    }))
    beforeClick.nameField = await nameBox
      .evaluate((element) => ({ id: element.id, value: element.value }))
      .catch(() => null)
    evidence.beforeSubmit = beforeClick
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    // Failures land as a toast that outlives neither the poll nor the failure
    // dump, so sample the surfaces while the request is still in flight and
    // keep sampling across the whole inventory poll.
    const sampleSurfaces = async () => {
      createTimeline.push({
        at: Date.now(),
        editor: await ui.getByTestId(keys.nativeEditor).count(),
        oneTimeSecret: await ui.getByTestId(secrets.oneTimeKeyInput).count(),
        toasts: await ui
          .locator("[data-sonner-toast]")
          .allInnerTexts()
          .catch(() => []),
        alerts: await ui
          .locator('[role="alert"]:not([data-sonner-toast])')
          .allInnerTexts()
          .catch(() => []),
        dialogText: await ui
          .evaluate(() => document.querySelector('[role="dialog"]')?.innerText)
          .catch(() => null),
        pageErrors: [...uiErrors],
        responses: [...consoleResponses],
        requests: await readFetchProbe(),
      })
    }
    // The created-secret dialog can live for a fraction of a second, so sample
    // quickly before falling back to the slower inventory poll cadence.
    for (let sample = 0; sample < 20; sample++) {
      await sampleSurfaces()
      await ui.waitForTimeout(150)
    }
    await expect
      .poll(
        async () => {
          const count = (await inventory()).length
          await sampleSurfaces()
          return count
        },
        { timeout: 30000, intervals: [1000] },
      )
      .toBe(originalKeys.length + 1)
    await writeCreateTimeline()
    const created = (await inventory()).find((key) => key.name === createdName)
    assert.ok(created, "created key row was not found")
    createdKeyId = created.id
    // Re-viewable site: no one-time dialog, the row is the handoff.
    await expect(ui.getByTestId(secrets.oneTimeKeyInput)).toHaveCount(0)
    evidence.checks.push("unlimited key creation without a secret dialog")
    // Only this disposable key is changed: the disabled editor must preserve
    // its state, and a concurrent native quota edit must survive renaming.
    await request(`${EMRANK_ENDPOINTS.Keys}/${createdKeyId}`, "PUT", {
      enabled: false,
      total_quota: "1",
    })
    const renamed = `${createdName} renamed`
    await ui.reload()
    await dismissModals(ui)
    const row = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${createdKeyId}"]`))
    await expect(row).toContainText(createdName, { timeout: 30000 })
    await row.getByRole("button", { name: /edit/i }).click()
    await expect(ui.getByTestId(keys.nativeEditor)).toBeVisible()
    const nameInput = ui
      .getByTestId(keys.nativeEditor)
      .getByRole("textbox", { name: /name/i })
      .first()
    await expect(nameInput).toHaveValue(createdName)
    await expect(
      ui
        .getByTestId(keys.nativeEditor)
        .getByRole("switch", { name: "Enabled", exact: true }),
    ).not.toBeChecked()
    await request(`${EMRANK_ENDPOINTS.Keys}/${createdKeyId}`, "PUT", {
      total_quota: "2",
    })
    await nameInput.fill(renamed)
    await waitForSaveReady()
    await expect(nameInput).toHaveValue(renamed)
    await ui.getByTestId(keys.nativeEditorSubmitButton).click()
    await expect(ui.getByTestId(keys.nativeEditor)).toHaveCount(0, {
      timeout: 30000,
    })
    const after = (await inventory()).find((key) => key.id === createdKeyId)
    assert.equal(after.name, renamed)
    assert.equal(after.total_quota, "2")
    assert.equal(after.enabled, false)
    assert.equal(after.expires_at, created.expires_at)
    evidence.checks.push(
      "rename preserves disabled status, concurrent quota and expiry",
    )
  } else {
    await ui.keyboard.press("Escape")
    evidence.checks.push("create dialog opens; writes skipped")
  }
} catch (error) {
  evidence.failure = String(error)
  await writeCreateTimeline().catch(() => {})
  await fsPromises.writeFile(
    path.join(evidenceDir, "failure-ui.txt"),
    await ui
      .locator("body")
      .innerText()
      .catch(() => "unavailable"),
  )
  await capture("failure.png").catch(() => {})
  // Keep the editor's own state; a silent validation or disabled submit is the
  // first thing a later run needs to see.
  const editorText = await ui
    .getByTestId(keys.nativeEditor)
    .innerText({ timeout: 1000 })
    .catch(() => "editor-not-open")
  const submitDisabled = await ui
    .getByTestId(keys.nativeEditorSubmitButton)
    .isDisabled({ timeout: 1000 })
    .catch(() => "submit-not-found")
  const alerts = await ui
    .locator('[role="alert"], [data-sonner-toast]')
    .allInnerTexts()
    .catch(() => [])
  const nameValue = await ui
    .getByTestId(keys.nativeEditor)
    .getByRole("textbox", { name: /name/i })
    .first()
    .inputValue({ timeout: 1000 })
    .catch(() => "name-input-unavailable")
  await fsPromises.writeFile(
    path.join(evidenceDir, "failure-editor.txt"),
    `${editorText}
---
submitDisabled: ${submitDisabled}
nameValue: ${nameValue}
alerts: ${JSON.stringify(alerts)}
fetchProbe: ${JSON.stringify(await readFetchProbe())}
consoleWrites: ${JSON.stringify(consoleWrites)}
uiErrors: ${JSON.stringify(uiErrors.slice(0, 6))}`,
  )
  throw error
} finally {
  try {
    // Key cleanup must not hide the account cleanup that follows it.
    try {
      // The create may land after the poll timed out; find the key by name.
      if (mutate && !createdKeyId && createdName) {
        await ensureConsolePage()
        const late = (await inventory()).find((key) => key.name === createdName)
        if (late) {
          createdKeyId = late.id
          evidence.cleanup.lateCreatedKeyFound = true
        }
      }
      if (createdKeyId) {
        await ensureConsolePage()
        await request(EMRANK_ENDPOINTS.KeyBatchDelete, "POST", {
          ids: [createdKeyId],
        })
        const final = await request(EMRANK_ENDPOINTS.Account)
        assert.equal(String(final.quota), String(initial.quota))
        evidence.cleanup.keyDeleted = true
        evidence.cleanup.creditRestored = true
      }
    } catch (error) {
      evidence.cleanup.keyFailure = String(error)
      process.exitCode = 1
    }
    const account = (await stored()).find(
      (account) => account.site_name === accountName,
    )
    if (account) {
      accountId = account.id
      // Cleanup must not depend on the editor page's route or modal state.
      const cleanupUi = await dev.context.newPage()
      try {
        await cleanupUi.goto(
          `chrome-extension://${dev.extensionId}/options.html#account`,
        )
        await dismissModals(cleanupUi)
        const row = cleanupUi.getByTestId(
          `account-management-account-list-item-${accountId}`,
        )
        await row.waitFor({ state: "visible", timeout: 20000 })
        await row.getByTestId(accounts.rowMoreActionsButton).click()
        await cleanupUi.getByTestId(accounts.rowDeleteMenuItem).click()
        await cleanupUi.getByTestId(accounts.deleteConfirmButton).click()
      } finally {
        await cleanupUi.close()
      }
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
  await fsPromises.writeFile(
    path.join(evidenceDir, "index.json"),
    JSON.stringify(evidence, null, 2),
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
