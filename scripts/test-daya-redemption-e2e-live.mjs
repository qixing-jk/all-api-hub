#!/usr/bin/env node
/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
} from "../src/features/AccountManagement/testIds.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { configureExtensionPage, dismissModals } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Uses an existing saved account; never seeds or rewrites account storage.
// --execute sends only a known-invalid sentinel, never a real redemption code.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const execute = process.argv.includes("--execute")
const out = path.resolve(
  `.scratch/dayaai-integration/evidence/redemption-20261021/extension-${Date.now()}`,
)
await fs.mkdir(out, { recursive: true })
const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(".output/chrome-mv3"),
})
const { extensionId } = dev
const site = await dev.context.newPage()
const ui = await dev.context.newPage()
const report = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worktree: process.cwd(),
  execute,
  checks: [],
}
try {
  await site.goto("https://api.dayaai.com/purchase", {
    waitUntil: "domcontentloaded",
  })
  await site
    .getByTestId("purchase-redeem-code-input")
    .waitFor({ timeout: 30000 })
  const identity = () =>
    site.evaluate(
      async () => (await (await fetch("/api/v1/auth/me")).json()).data,
    )
  const before = await identity()
  const account = (await getAccounts(dev.serviceWorker)).find(
    (a) =>
      a.site_type === "daya" &&
      String(a.account_info.id) === String(before.id) &&
      !a.disabled,
  )
  assert.ok(
    account,
    "An enabled saved account must match the current native identity",
  )
  await configureExtensionPage(ui, {
    viewport: { width: 1440, height: 1000 },
    language: "en",
    dismissUpdateLog: true,
  })
  await ui.goto(`chrome-extension://${extensionId}/options.html#account`)
  await dismissModals(ui)
  const row = ui.getByTestId(getAccountManagementListItemTestId(account.id))
  await row.getByTestId(accounts.rowMoreActionsButton).click()
  await ui.getByRole("menuitem", { name: "Related pages" }).hover()
  await expect(ui.getByTestId(accounts.rowRedeemMenuItem)).toBeVisible()
  await ui.evaluate(() => document.fonts.ready)
  await ui.screenshot({
    path: path.join(out, "redemption-menu.png"),
    animations: "disabled",
  })
  report.checks.push("Saved Daya account exposes manual redemption navigation")
  if (execute) {
    const reply = await ui.evaluate(
      async (accountId) =>
        chrome.runtime.sendMessage({
          type: "redemptionAssist:autoRedeem",
          id: Date.now(),
          timestamp: Date.now(),
          data: { accountId, code: "all-api-hub-validation-not-a-code" },
        }),
      account.id,
    )
    assert.equal(
      reply.res?.success,
      true,
      "Runtime request must reach the redemption handler",
    )
    assert.equal(reply.res.data.success, false)
    assert.match(reply.res.data.message, /兑换码或推广码不存在/)
    const after = await identity()
    assert.equal(after.id, before.id)
    assert.equal(after.balance, before.balance)
    report.checks.push(
      "Real extension Cookie transport preserves native code/apply rejection; identity and balance unchanged",
    )
  }
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify({ out, checks: report.checks }, null, 2))
} finally {
  await ui.close()
  await site.close()
  await dev.close()
}
