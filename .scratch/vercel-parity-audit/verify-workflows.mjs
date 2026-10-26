// Requires temp5's logged-in isolated dev browser on CDP 9291 and one saved
// Vercel account. --mutate opts into a disposable key; existing keys are untouched.
/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { chromium, expect } from "@playwright/test"

const out = `.scratch/vercel-ai-gateway/evidence/parity-acceptance-${Date.now()}`
await fs.mkdir(out, { recursive: true })
const browser = await chromium.connectOverCDP("http://127.0.0.1:9291")
const session = await browser.newBrowserCDPSession()
const { extensions } = await session.send("Extensions.getExtensions")
const extension = extensions.find(
  (e) =>
    e.enabled &&
    path.resolve(e.path) === path.resolve(".output/chrome-mv3-dev"),
)
assert(extension, "Current-worktree dev extension must be enabled")
const page = await browser.contexts()[0].newPage()
page.setDefaultTimeout(30000)
page.setDefaultNavigationTimeout(30000)
const result = { output: out, extensionPath: extension.path, checks: [] }
let creationAttempted = false
let disposableId
let accountId
const keyName = `AAH parity ${Date.now()}`
const api = async (pathname, method = "GET", body) =>
  page.evaluate(
    async ({ pathname, method, body, accountId }) => {
      const raw = (await chrome.storage.local.get("site_accounts"))
        .site_accounts
      const accounts = (typeof raw === "string" ? JSON.parse(raw) : raw)
        .accounts
      const account = accounts.find((a) => a.id === accountId)
      const url = new URL(pathname, "https://api.vercel.com")
      url.searchParams.set("teamId", account.account_info.id)
      const r = await fetch(url, {
        method,
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${account.account_info.access_token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const text = await r.text()
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
      if (payload && typeof payload === "object") delete payload.apiKeyString
      return { status: r.status, payload }
    },
    { pathname, method, body, accountId },
  )
try {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`chrome-extension://${extension.id}/options.html#account`, {
    waitUntil: "domcontentloaded",
  })
  await page.getByTestId("options-app").waitFor({ timeout: 30000 })
  accountId = await page.evaluate(async () => {
    const raw = (await chrome.storage.local.get("site_accounts")).site_accounts
    return (typeof raw === "string" ? JSON.parse(raw) : raw)?.accounts?.find(
      (a) => a.site_type === "vercel-ai-gateway",
    )?.id
  })
  assert(accountId, "Saved Vercel account required")
  if (!process.argv.includes("--account-only")) {
    await page.goto(
      `chrome-extension://${extension.id}/options.html?accountId=${encodeURIComponent(accountId)}&workspace=account#keys`,
      { waitUntil: "domcontentloaded" },
    )
    await page
      .getByTestId("key-management-add-token-button")
      .waitFor({ timeout: 30000 })
    await expect(
      page.getByRole("button", { name: "Open Vercel console" }),
    ).toBeVisible()
    await page.getByTestId("key-management-add-token-button").click()
    const editor = page.getByTestId("key-management-native-editor")
    await expect(editor.getByLabel("Token Name", { exact: false })).toBeVisible(
      {
        timeout: 30000,
      },
    )
    await editor.getByLabel("Token Name", { exact: false }).fill(keyName)
    await editor
      .getByRole("switch", { name: "Spend budget", exact: true })
      .click()
    await editor.getByLabel("Spending limit (USD, minimum $1)").fill("2")
    await editor.getByRole("combobox", { name: "Budget refresh" }).click()
    await page.getByRole("option", { name: "Weekly", exact: true }).click()
    await editor.getByRole("checkbox", { name: "50%", exact: true }).check()
    await editor.getByRole("checkbox", { name: "100%", exact: true }).check()
    await page.screenshot({ path: `${out}/create-budget.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(
      page.getByTestId("key-management-native-editor-submit-button"),
    ).toBeInViewport()
    await page.screenshot({ path: `${out}/create-budget-mobile.png` })
    await page.setViewportSize({ width: 1440, height: 1000 })
    result.checks.push("budget controls visible; weekly budget configured")
    if (!process.argv.includes("--mutate")) {
      result.editor = await editor.innerText()
    } else {
      creationAttempted = true
      await page
        .getByTestId("key-management-native-editor-submit-button")
        .click()
      await expect(editor).toBeHidden({ timeout: 30000 })
      const listed = await api("/v1/api-keys?purpose=ai-gateway")
      assert.equal(listed.status, 200)
      const created = listed.payload.apiKeys.find((k) => k.name === keyName)
      assert(created, "UI-created disposable key must exist")
      disposableId = created.id
      const budgets = await api("/ai-gateway/budgets/list")
      const budget = budgets.payload.budgets.find(
        (b) => b.scopeId === disposableId,
      )
      assert.equal(budget.limitAmount, 2)
      assert.equal(budget.refreshPeriod, "weekly")
      assert.deepEqual(budget.alertThresholds, [50, 100])
      result.checks.push("UI creation read back: USD 2 / weekly")
      await page.getByTestId("key-management-one-time-key-close-button").click()
      const confirmClose = page.getByTestId(
        "key-management-one-time-key-confirm-close-button",
      )
      if (await confirmClose.count()) await confirmClose.click()
      const row = page
        .getByTestId("key-management-native-key-row")
        .filter({ hasText: keyName })
      await expect(row).toBeVisible()
      await row.getByRole("button", { name: "Edit key", exact: true }).click()
      await expect(
        editor.getByLabel("Spending limit (USD, minimum $1)"),
      ).toHaveValue("2", { timeout: 30000 })
      await expect(
        editor.getByLabel("Token Name", { exact: false }),
      ).toBeDisabled()
      await editor.getByLabel("Spending limit (USD, minimum $1)").fill("3")
      await editor.getByRole("combobox", { name: "Budget refresh" }).click()
      await page.getByRole("option", { name: "Monthly", exact: true }).click()
      await editor.getByRole("combobox", { name: "Spend attribution" }).click()
      await page.getByRole("option", { name: "Team", exact: true }).click()
      await expect(
        editor.getByRole("combobox", { name: "Spend attribution" }),
      ).toHaveText("Team")
      await editor.getByRole("checkbox", { name: "50%", exact: true }).uncheck()
      await editor
        .getByRole("checkbox", { name: "100%", exact: true })
        .uncheck()
      await editor.getByRole("checkbox", { name: "75%", exact: true }).check()
      await page.screenshot({ path: `${out}/edit-budget.png` })
      await page
        .getByTestId("key-management-native-editor-submit-button")
        .click()
      await expect(editor).toBeHidden({ timeout: 30000 })
      const changed = (
        await api("/ai-gateway/budgets/list")
      ).payload.budgets.find((b) => b.scopeId === disposableId)
      assert.equal(changed.limitAmount, 3)
      assert.equal(changed.refreshPeriod, "monthly")
      assert.deepEqual(changed.alertThresholds, [75])
      const detail = (await api(`/v1/api-keys/${disposableId}`)).payload.apiKey
      assert.equal(detail.metadata.spendAttribution, "team")
      result.checks.push(
        "UI edit read back: USD 3 / monthly / team attribution",
      )
      await row.getByRole("button", { name: "Edit key", exact: true }).click()
      await expect(
        editor.getByLabel("Spending limit (USD, minimum $1)"),
      ).toHaveValue("3", { timeout: 30000 })
      await expect(
        editor.getByRole("combobox", { name: "Budget refresh" }),
      ).toHaveText("Monthly")
      await expect(
        editor.getByRole("checkbox", { name: "75%", exact: true }),
      ).toBeChecked()
      await editor
        .getByRole("switch", { name: "Spend budget", exact: true })
        .click()
      await page
        .getByTestId("key-management-native-editor-submit-button")
        .click()
      await expect(editor).toBeHidden({ timeout: 30000 })
      const removed = (
        await api("/ai-gateway/budgets/list")
      ).payload.budgets.find((b) => b.scopeId === disposableId)
      assert(!removed || removed.archived)
      result.checks.push(
        "reopened editor retained configuration; custom budget removal confirmed",
      )
      await page.screenshot({ path: `${out}/inventory.png` })
      result.checks.push(
        "alert thresholds created, edited and reopened correctly",
      )
    }
  }
  if (
    process.argv.includes("--capture-account") ||
    process.argv.includes("--account-only")
  ) {
    await page.goto(`chrome-extension://${extension.id}/options.html#account`, {
      waitUntil: "domcontentloaded",
    })
    if (process.argv.includes("--fresh-account")) {
      await page.getByTestId("account-management-add-account-button").click()
      await page
        .getByRole("button", { name: "Choose from recently active tabs" })
        .click()
      await page
        .getByRole("option")
        .filter({ hasText: /AI Gateway/ })
        .first()
        .click()
      await expect(
        page.getByTestId("account-management-site-url-input"),
      ).toHaveValue("https://vercel.com")
      await page.getByTestId("account-management-manual-add-button").click()
      await page.getByTestId("account-management-site-type-trigger").click()
      await page
        .getByTestId("account-management-site-type-option-vercel-ai-gateway")
        .click()
      const credential = await page.evaluate(async (accountId) => {
        const raw = (await chrome.storage.local.get("site_accounts"))
          .site_accounts
        return (typeof raw === "string" ? JSON.parse(raw) : raw).accounts.find(
          (a) => a.id === accountId,
        ).account_info.access_token
      }, accountId)
      await page
        .getByTestId("account-management-access-token-input")
        .fill(credential)
    } else
      await page
        .getByTestId("account-management-row-edit-button")
        .first()
        .click()
    const selector = page.getByTestId("account-management-vercel-team-select")
    await expect(selector).toBeEnabled({ timeout: 30000 })
    await expect(selector).toHaveText(/\S.*\(\S.*\)/)
    await page.screenshot({ path: `${out}/account-team.png` })
    result.checks.push(
      process.argv.includes("--fresh-account")
        ? "fresh manual account form loads accessible teams; not saved"
        : "saved account editor loads the accessible team; not saved",
    )
  }
} catch (error) {
  result.error = error.message
  result.pageText = (
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  ).slice(-3500)
  throw error
} finally {
  try {
    if (accountId && creationAttempted) {
      const listed = await api("/v1/api-keys?purpose=ai-gateway")
      assert.equal(listed.status, 200)
      const owned = listed.payload.apiKeys.filter((key) =>
        disposableId ? key.id === disposableId : key.name === keyName,
      )
      for (const key of owned) {
        const deleted = await api(
          `/v1/api-keys/${encodeURIComponent(key.id)}`,
          "DELETE",
        )
        assert.equal(deleted.status, 204)
      }
      const after = await api("/v1/api-keys?purpose=ai-gateway")
      assert.equal(after.status, 200)
      assert(
        !after.payload.apiKeys.some((key) =>
          disposableId ? key.id === disposableId : key.name === keyName,
        ),
      )
      result.checks.push("disposable key deleted and absence confirmed")
    }
  } catch (error) {
    result.cleanupError = error.message
    process.exitCode = 1
  }
  try {
    await fs.writeFile(`${out}/result.json`, JSON.stringify(result, null, 2))
    console.log(
      JSON.stringify({
        output: out,
        checks: result.checks,
        error: result.error,
        cleanupError: result.cleanupError,
      }),
    )
  } finally {
    try {
      await page.close().catch(() => {})
    } finally {
      await browser.close()
    }
  }
}
