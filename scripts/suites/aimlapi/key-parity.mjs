import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { configureExtensionPage, dismissModals } from "../../cdp/ui-driver.mjs"

/** Exercises key tasks only; the temporary account deliberately bypasses onboarding. */
export async function runAimlapiKeyParity({
  context,
  extensionId,
  serviceWorker,
  managementKey,
  evidenceDir = ".scratch/aimlapi-integration/parity-artifacts",
}) {
  if (!managementKey) throw new Error("AIMLAPI_MANAGEMENT_KEY is required")
  await fs.mkdir(evidenceDir, { recursive: true })
  evidenceDir = await fs.mkdtemp(path.join(evidenceDir, "keys-"))
  console.log(`Key parity evidence: ${evidenceDir}`)
  const api = async (endpoint, options = {}) => {
    const response = await fetch(`https://api.aimlapi.com${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${managementKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
    })
    const body = await response.json()
    assert.ok(
      response.ok,
      `Provider ${options.method || "GET"} ${endpoint}: ${response.status}`,
    )
    return body.data
  }
  await api("/v1/keys")
  const name = `AAH key parity ${randomUUID()}`
  const names = new Set([name, `${name} edited`])
  const ids = new Set()
  const fixture = {
    id: `aimlapi-parity-${randomUUID()}`,
    site_name: "AI/ML API parity",
    site_url: "https://aimlapi.com",
    site_type: "aimlapi",
    authType: "access_token",
    exchange_rate: 7.2,
    account_info: {
      id: "parity-key-scope",
      username: "parity",
      access_token: managementKey,
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    created_at: Date.now(),
    updated_at: Date.now(),
    user_updated_at: Date.now(),
  }
  const result = {
    mode: "live-key-ui-with-temporary-account",
    extensionId,
    created: false,
    edited: false,
    reopened: false,
    cleared: false,
    cleanup: false,
    disabled: false,
    reenabled: false,
    deleted: false,
  }
  let dispatched = false
  try {
    await withTemporaryAccount(serviceWorker, fixture, async (savedFixture) => {
      const page = await context.newPage()
      try {
        await configureExtensionPage(page, {
          language: "en",
          viewport: { width: 1240, height: 1000 },
          dismissUpdateLog: true,
        })
        await page.emulateMedia({ reducedMotion: "reduce" })
        await page.goto(
          `chrome-extension://${extensionId}/options.html#keys?accountId=${savedFixture.id}`,
          { waitUntil: "domcontentloaded", timeout: 90000 },
        )
        await dismissModals(page)
        await page
          .getByTestId("key-management-add-token-button")
          .click({ timeout: 60000 })
        const nameInput = page.locator("#resource-editor-name")
        await nameInput.waitFor({ state: "visible", timeout: 60000 })
        await nameInput.fill(name)
        await page
          .locator("#resource-editor-expiresAt")
          .fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16))
        const models = page.getByRole("combobox", {
          name: /Allowed models|允许的模型/,
        })
        await expect(models).toBeEnabled({ timeout: 60000 })
        await models.fill("gpt")
        const modelChoice = page.getByRole("option").first()
        await modelChoice.waitFor({ timeout: 30000 })
        await modelChoice.click()
        const tools = page.getByRole("combobox", {
          name: /Allowed tools|允许的工具/,
        })
        await expect(tools).toBeEnabled({ timeout: 60000 })
        await tools.fill("aaa")
        await expect(page.getByRole("option").first()).toContainText(
          "aaa-gas-prices/",
        )
        await page.getByRole("listbox").screenshot({
          path: path.join(evidenceDir, "tool-options.png"),
          animations: "disabled",
        })
        await page.getByRole("option").first().click()
        await page
          .getByRole("heading", { name: /Create API Key|创建 API 密钥/ })
          .click()
        await page
          .getByRole("dialog")
          .filter({ has: nameInput })
          .screenshot({
            path: path.join(evidenceDir, "extension-create.png"),
            animations: "disabled",
          })
        const submit = page.getByTestId(
          "key-management-native-editor-submit-button",
        )
        dispatched = true
        await submit.click()
        await expect(submit).toBeHidden({ timeout: 60000 })
        // Authoritative readback also finds the created prefix for cleanup.
        const created = (await api("/v1/keys")).filter(
          (key) => key.name === name,
        )
        assert.equal(created.length, 1)
        ids.add(created[0].prefix)
        assert.equal(created[0].allowed_models?.length, 1)
        assert.equal(created[0].allowed_tools?.length, 1)
        assert.ok(created[0].expires_at)
        result.created = true
        const prefix = created[0].prefix
        await dismissModals(page)
        const row = page
          .getByTestId("key-management-native-key-row")
          .filter({ hasText: name })
        await row.getByRole("button", { name: /Edit key|编辑密钥/ }).click()
        await nameInput.waitFor({ state: "visible", timeout: 60000 })
        await expect(nameInput).toHaveValue(name)
        await nameInput.fill(`${name} edited`)
        await submit.click()
        await expect(submit).toBeHidden({ timeout: 60000 })
        const edited = await api(`/v1/keys/${prefix}`)
        assert.equal(edited.name, `${name} edited`)
        assert.deepEqual(edited.allowed_models, created[0].allowed_models)
        assert.deepEqual(edited.allowed_tools, created[0].allowed_tools)
        assert.equal(edited.expires_at, created[0].expires_at)
        result.edited = true
        await row.getByRole("button", { name: /Edit key|编辑密钥/ }).click()
        await expect(nameInput).toHaveValue(`${name} edited`, {
          timeout: 60000,
        })
        await expect(models).toBeEnabled({ timeout: 60000 })
        await expect(tools).toBeEnabled({ timeout: 60000 })
        await expect(page.locator('input[type="datetime-local"]')).toHaveCount(
          0,
        )
        await expect(
          page.locator("output#resource-editor-expiresAt"),
        ).not.toBeEmpty()
        result.reopened = true
        await page
          .getByRole("dialog")
          .filter({ has: nameInput })
          .screenshot({
            path: path.join(evidenceDir, "extension-reopened.png"),
            animations: "disabled",
          })
        // Clear through the same selections, rather than replacing the request payload.
        for (const field of [models, tools]) {
          await expect(field).toBeEnabled({ timeout: 60000 })
          await field.click()
          await page.getByRole("option", { selected: true }).click()
          await field.press("Escape")
        }
        await submit.click()
        await expect(submit).toBeHidden({ timeout: 60000 })
        const cleared = await api(`/v1/keys/${prefix}`)
        assert.equal(cleared.allowed_models, null)
        assert.equal(cleared.allowed_tools, null)
        result.cleared = true
        await row.getByRole("button", { name: /^Disable API key$/ }).click()
        await expect
          .poll(async () => (await api(`/v1/keys/${prefix}`)).disabled, {
            timeout: 30000,
          })
          .toBe(true)
        result.disabled = true
        await row
          .getByRole("button", { name: "Enable API key", exact: true })
          .waitFor()
        await row.screenshot({
          path: path.join(evidenceDir, "disabled-key.png"),
          animations: "disabled",
        })
        await row.getByRole("button", { name: /^Enable API key$/ }).click()
        await expect
          .poll(async () => (await api(`/v1/keys/${prefix}`)).disabled, {
            timeout: 30000,
          })
          .toBe(false)
        result.reenabled = true
        // Provider readback can precede acceptance of the refreshed UI state.
        await expect(
          row.getByRole("button", { name: "Disable API key", exact: true }),
        ).toBeEnabled({ timeout: 30000 })
        await row
          .getByRole("button", { name: "Delete key", exact: true })
          .click()
        await page
          .getByTestId("key-management-native-delete-confirm-button")
          .click()
        await expect(row).toHaveCount(0, { timeout: 30000 })
        assert.ok(!(await api("/v1/keys")).some((key) => key.prefix === prefix))
        ids.delete(prefix)
        result.deleted = true
      } catch (error) {
        await page
          .screenshot({
            path: path.join(evidenceDir, "failure.png"),
            animations: "disabled",
          })
          .catch(() => {})
        await fs.writeFile(path.join(evidenceDir, "failure.txt"), String(error))
        throw error
      } finally {
        await page.close()
      }
    })
  } finally {
    // A dispatched create may have succeeded even if its UI acknowledgement failed.
    if (dispatched)
      for (const key of await api("/v1/keys"))
        if (names.has(key.name)) ids.add(key.prefix)
    for (const prefix of ids)
      await api(`/v1/keys/${prefix}`, { method: "DELETE" })
    const remaining = await api("/v1/keys")
    assert.ok(
      !remaining.some((key) => ids.has(key.prefix) || names.has(key.name)),
      "Owned key cleanup is unconfirmed",
    )
    result.cleanup = true
    await fs.writeFile(
      path.join(evidenceDir, "key-parity-result.json"),
      JSON.stringify(result, null, 2),
    )
  }
  return result
}
