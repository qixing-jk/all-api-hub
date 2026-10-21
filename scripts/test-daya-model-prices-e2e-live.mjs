#!/usr/bin/env node
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { MODEL_LIST_TEST_IDS as models } from "../src/features/ModelList/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import { connectDevBrowser, connectExtensionById } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { probePageSession } from "./cdp/session-preflight.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Read-only current-worktree check. Baseline mode records the previous label.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const baseline = process.argv.includes("--baseline")
const dir = path.resolve(
  `.scratch/dayaai-integration/evidence/price-labels-${baseline ? "before" : "after"}-${Date.now()}`,
)
await fs.mkdir(dir, { recursive: true })
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
assert.ok(extensionId)
const dev = await connectExtensionById({ extensionId })
const site = await dev.context.newPage()
const ui = await dev.context.newPage()
const evidence = {
  baseline,
  extensionId,
  worktree: process.cwd(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  checks: [],
}
try {
  await site.goto("https://api.dayaai.com/catalog/models")
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
  assert.ok(account, "Saved account must match the native session")
  await ui.setViewportSize({ width: 1440, height: 1000 })
  await ui.addInitScript(() =>
    localStorage.setItem("all-api-hub-i18nextLng", "en"),
  )
  await ui.addLocatorHandler(ui.getByTestId(updateLog.root), () =>
    ui.getByTestId(updateLog.closeButton).click(),
  )
  await ui.goto(
    `chrome-extension://${extensionId}/options.html?accountId=${encodeURIComponent(account.id)}#models`,
  )
  await dismissModals(ui)
  const display = ui.getByTestId(models.modelDisplay)
  // Model names are stable public catalogue identities; no fixture response is injected.
  await expect(
    display.getByText("gpt-6-astra", { exact: true }).first(),
  ).toBeVisible({ timeout: 45000 })
  // Existing installations can retain a pre-upgrade catalogue for its normal
  // ten-minute TTL. Refresh through the user's ordinary action, not storage edits.
  await ui.getByRole("button", { name: "Refresh Data", exact: true }).click()
  if (baseline) {
    await expect(
      display.getByText("Reference price", { exact: true }).first(),
    ).toBeVisible({ timeout: 45000 })
  } else {
    await expect(
      display.getByText("Full site catalogue", { exact: true }).first(),
    ).toBeVisible({ timeout: 45000 })
    await expect(
      display.getByText("Reference price", { exact: true }),
    ).toHaveCount(0)
    await expect(display.getByText("Estimated", { exact: true })).toHaveCount(0)
  }
  await expect(ui.getByTestId(models.verifyApiButton)).toHaveCount(0)
  await ui.evaluate(() => document.fonts.ready)
  await ui.screenshot({
    path: path.join(dir, "desktop.png"),
    animations: "disabled",
  })
  // Capture a focused real card when its public name is available.
  const heading = display.getByText("gpt-6-astra", { exact: true }).first()
  const card = heading.locator(
    "xpath=ancestor::*[contains(@class,'rounded')][1]",
  )
  await expect(card.getByText("$2.00/M", { exact: true })).toBeVisible()
  await expect(card.getByText("$10.00/M", { exact: true })).toBeVisible()
  await card.screenshot({
    path: path.join(dir, "model-card.png"),
    animations: "disabled",
  })
  await ui.setViewportSize({ width: 540, height: 900 })
  if (baseline)
    await expect(
      display.getByText("Reference price", { exact: true }).first(),
    ).toBeVisible()
  else {
    await expect(
      display.getByText("Reference price", { exact: true }),
    ).toHaveCount(0)
    await expect(display.getByText("Estimated", { exact: true })).toHaveCount(0)
  }
  await ui.screenshot({
    path: path.join(dir, "compact.png"),
    animations: "disabled",
  })
  evidence.checks.push(
    baseline
      ? "Pre-change Daya catalogue retains $2/$10 rates and the Reference price badge in desktop and compact views"
      : "Real Daya catalogue retains published $2/$10 rates; desktop and compact views use ordinary prices without confidence badges; no resource mutation",
  )
} catch (error) {
  evidence.error = String(error)
  await ui
    .screenshot({ path: path.join(dir, "failure.png"), animations: "disabled" })
    .catch(() => {})
  throw error
} finally {
  await fs.writeFile(
    path.join(dir, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  )
  await ui.close()
  await site.close()
  await dev.close()
  console.log(JSON.stringify({ dir, ...evidence }))
}
