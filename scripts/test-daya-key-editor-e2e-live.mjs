#!/usr/bin/env node
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { probePageSession } from "./cdp/session-preflight.mjs"
import { configureExtensionPage, dismissModals } from "./cdp/ui-driver.mjs"
import {
  openNativeKeyEditor,
  submitNativeKeyEditor,
} from "./flows/native-key-editor.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

await loadLocalEnv()
applyIsolateFlag(process.argv)
const baseline = process.argv.includes("--baseline")
const preview = process.argv.includes("--preview")
const verifyOpening = process.argv.includes("--verify-opening")
const mutate = process.argv.includes("--mutate")
const dir = path.resolve(
  `.scratch/dayaai-integration/evidence/editor-${baseline ? "before" : "after"}-${Date.now()}`,
)
await fs.mkdir(dir, { recursive: true })
const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(".output/chrome-mv3"),
})
const { extensionId } = dev
const site = await dev.context.newPage()
const ui = await dev.context.newPage()
await configureExtensionPage(ui, { dismissUpdateLog: true })
const origin = "https://api.dayaai.com"
const runName = `AAH editor ${randomUUID().slice(0, 8)}`
const evidence = {
  dir,
  baseline,
  mutate,
  extensionId,
  worktree: process.cwd(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  checks: [],
  cleanup: {},
}
let createdId
let originalIds
const read = async (endpoint) => {
  const response = await dev.context.request.get(`${origin}${endpoint}`)
  const body = await response.json()
  assert.equal(body.code, 0)
  return body.data
}
const editor = ui.getByTestId(keys.nativeEditor)
const row = (id) =>
  ui
    .getByTestId(keys.nativeKeyRow)
    .and(ui.locator(`[data-resource-id="${id}"]`))
const openEdit = async (id) => {
  await openNativeKeyEditor(ui, {
    trigger: row(id).getByRole("button", { name: "Edit Key", exact: true }),
    readyField: /^Token Name/,
  })
  await expect(editor.getByLabel("Token Name", { exact: true })).toBeEditable({
    timeout: 30000,
  })
  await expect(
    editor.getByRole(baseline ? "combobox" : "checkbox").first(),
  ).toBeEnabled({ timeout: 30000 })
}
const capture = async (name) => {
  await ui.bringToFront()
  await ui.evaluate(() => document.fonts.ready)
  const session = await dev.context.newCDPSession(ui)
  try {
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    })
    await fs.writeFile(
      path.join(dir, `${name}.png`),
      Buffer.from(result.data, "base64"),
    )
  } finally {
    await session.detach()
  }
}
try {
  await site.goto(`${origin}/keys`)
  const session = await probePageSession(site, {
    endpoint: "/api/v1/auth/me",
    readIdentity: (body) =>
      body?.code === 0 ? String(body.data?.id ?? "") : undefined,
  })
  assert.equal(session.status, "authenticated")
  const account = (await getAccounts(dev.serviceWorker)).find(
    (a) =>
      a.site_type === "daya" && String(a.account_info.id) === session.identity,
  )
  assert.ok(
    account,
    "Existing saved Daya account must match the verified website identity",
  )
  evidence.identity = session.identity
  const original = await read("/api/v1/keys?page=1&page_size=100")
  assert.equal(
    original.total,
    original.items.length,
    "Use a complete key inventory for cleanup verification",
  )
  originalIds = original.items.map((item) => item.id).sort((a, b) => a - b)
  await configureExtensionPage(ui, {
    viewport: { width: 1440, height: 1000 },
    language: "en",
  })
  await ui.goto(
    `chrome-extension://${extensionId}/options.html?accountId=${account.id}&workspace=account#keys`,
  )
  await dismissModals(ui)
  await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
    originalIds.length,
    { timeout: 45000 },
  )
  if (baseline || preview) {
    assert.ok(originalIds.length)
    if (verifyOpening) {
      let release
      let groupReads = 0
      const pending = new Promise((resolve) => {
        release = resolve
      })
      const handler = async (route) => {
        groupReads += 1
        await pending
        await route.continue()
      }
      await dev.context.route("**/api/v1/groups/available", handler)
      try {
        await row(originalIds[0])
          .getByRole("button", { name: "Edit Key", exact: true })
          .click()
        await expect(ui.getByTestId(keys.nativeEditorLoading)).toBeVisible({
          timeout: 30000,
        })
        await expect(
          editor.getByLabel("Token Name", { exact: true }),
        ).toHaveCount(0)
        await expect(
          editor.getByRole("group", { name: "Group", exact: true }),
        ).toHaveCount(0)
        await capture("opening-prepares-complete-form")
        release()
        await expect(
          editor.getByLabel("Token Name", { exact: true }),
        ).toBeEditable({ timeout: 30000 })
        // Once the actual form is mounted the routing cards must already exist.
        assert.ok(await editor.getByRole("checkbox").count())
        await expect(editor.getByRole("checkbox").first()).toBeEnabled()
        assert.equal(groupReads, 1)
        await editor
          .getByRole("group", { name: "Group", exact: true })
          .locator("..")
          .screenshot({
            path: path.join(dir, "ready-routing.png"),
            animations: "disabled",
          })
        evidence.checks.push(
          "Delayed catalogue keeps the opening shell; the first accepted form has enabled routing cards and no second group request",
        )
      } finally {
        release()
        await dev.context.unroute("**/api/v1/groups/available", handler)
      }
    } else {
      await openEdit(originalIds[0])
    }
    await capture("edit-desktop")
    await ui.setViewportSize({ width: 540, height: 900 })
    await capture("edit-compact")
    if (preview) {
      await ui.setViewportSize({ width: 1440, height: 1000 })
      await editor
        .getByRole("switch", { name: "Allow Fast mode", exact: true })
        .scrollIntoViewIfNeeded()
      await capture("edit-billing")
    }
    evidence.checks.push(
      "Read-only installed extension edit captures; no submit",
    )
  } else {
    assert.ok(
      mutate,
      "Use --mutate for disposable create/edit/delete validation",
    )
    await ui
      .getByTestId(
        originalIds.length
          ? keys.addTokenButton
          : keys.emptyStateAddTokenButton,
      )
      .click()
    await expect(editor.getByRole("checkbox").first()).toBeEnabled({
      timeout: 30000,
    })
    await editor.getByLabel("Token Name", { exact: true }).fill(runName)
    await expect(
      editor.getByRole("switch", { name: "Allow Fast mode", exact: true }),
    ).toBeChecked()
    await editor
      .getByRole("switch", { name: "Allow Fast mode", exact: true })
      .click()
    const advanced = editor.getByRole("button", {
      name: "Advanced Settings",
      exact: true,
    })
    await expect(advanced).toHaveAttribute("aria-expanded", "false")
    await advanced.click()
    await editor
      .getByLabel("IP allowlist", { exact: true })
      .fill("192.0.2.0/24")
    await advanced.click()
    await expect(advanced).toContainText("IP allowlist")
    const moves = editor
      .getByRole("button", { name: /^Move down / })
      .filter({ visible: true })
    if ((await moves.count()) > 1) await moves.first().click()
    await capture("create-desktop")
    await submitNativeKeyEditor(ui, { waitForClose: false })
    await expect
      .poll(
        async () => {
          const items = (await read("/api/v1/keys?page=1&page_size=100")).items
          createdId = items.find((k) => k.name === runName)?.id
          return createdId
        },
        { timeout: 30000 },
      )
      .toBeTruthy()
    const created = await read(`/api/v1/keys/${createdId}`)
    assert.equal(created.allow_fast, false)
    assert.deepEqual(created.ip_whitelist, ["192.0.2.0/24"])
    evidence.checks.push(
      "Create with Fast disabled and collapsed IP draft persisted",
    )
    await ui.keyboard.press("Escape")
    await expect(editor).toBeHidden()
    await openEdit(createdId)
    await expect(editor.getByRole("checkbox").first()).toBeEnabled({
      timeout: 30000,
    })
    await expect(
      editor.getByRole("switch", { name: "Allow Fast mode", exact: true }),
    ).not.toBeChecked()
    await expect(advanced).toContainText("IP allowlist")
    await capture("edit-desktop")
    await ui.setViewportSize({ width: 540, height: 900 })
    await capture("edit-compact")
    assert.equal(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
    )
    await ui.setViewportSize({ width: 1440, height: 1000 })
    await editor
      .getByRole("switch", { name: "Allow Fast mode", exact: true })
      .click()
    await submitNativeKeyEditor(ui, { timeoutMs: 30000 })
    assert.equal((await read(`/api/v1/keys/${createdId}`)).allow_fast, true)
    await openEdit(createdId)
    await expect(
      editor.getByRole("switch", { name: "Allow Fast mode", exact: true }),
    ).toBeChecked()
    const concurrent = await dev.context.request.put(
      `${origin}/api/v1/keys/${createdId}`,
      { data: { allow_fast: false, quota: 19 } },
    )
    assert.equal((await concurrent.json()).code, 0)
    await editor
      .getByLabel("Token Name", { exact: true })
      .fill(`${runName} renamed`)
    await submitNativeKeyEditor(ui, { timeoutMs: 30000 })
    const renamed = await read(`/api/v1/keys/${createdId}`)
    assert.equal(renamed.allow_fast, false)
    assert.equal(renamed.quota, 19)
    assert.deepEqual(renamed.group_ids, created.group_ids)
    assert.deepEqual(renamed.ip_whitelist, created.ip_whitelist)
    evidence.checks.push(
      "Edit/reopen Fast=true; later rename preserves concurrent Fast=false, quota and untouched routing/IPs",
    )
    await row(createdId)
      .getByRole("button", { name: /delete key/i })
      .click()
    await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
    await expect
      .poll(
        async () =>
          (await read("/api/v1/keys?page=1&page_size=100")).items.some(
            (k) => k.id === createdId,
          ),
        { timeout: 30000 },
      )
      .toBe(false)
    evidence.checks.push("Disposable key deleted through extension UI")
  }
} catch (error) {
  evidence.error = String(error)
  await capture("failure").catch(() => {})
  throw error
} finally {
  const cleanupErrors = []
  try {
    if (mutate && originalIds) {
      const current = (await read("/api/v1/keys?page=1&page_size=100")).items
      for (const item of current.filter(
        (k) =>
          !originalIds.includes(k.id) &&
          (k.name === runName || k.name === `${runName} renamed`),
      )) {
        const response = await dev.context.request.delete(
          `${origin}/api/v1/keys/${item.id}`,
        )
        assert.equal((await response.json()).code, 0)
      }
      const final = await read("/api/v1/keys?page=1&page_size=100")
      evidence.cleanup.originalInventoryRestored =
        JSON.stringify(final.items.map((k) => k.id).sort((a, b) => a - b)) ===
        JSON.stringify(originalIds)
      assert.equal(evidence.cleanup.originalInventoryRestored, true)
    }
  } catch (error) {
    cleanupErrors.push(`keys: ${String(error)}`)
  }
  for (const [label, close] of [
    ["ui", () => ui.close()],
    ["site", () => site.close()],
    ["dev", () => dev.close()],
  ]) {
    try {
      await close()
    } catch (error) {
      cleanupErrors.push(`${label}: ${String(error)}`)
    }
  }
  if (cleanupErrors.length) {
    evidence.cleanup.error = cleanupErrors.join("; ")
    process.exitCode = 1
  }
  try {
    await fs.writeFile(
      path.join(dir, "evidence.json"),
      JSON.stringify(evidence, null, 2),
    )
  } catch (error) {
    console.error("Failed to write Daya editor evidence:", error)
    process.exitCode = 1
  }
  console.log(JSON.stringify(evidence))
}
