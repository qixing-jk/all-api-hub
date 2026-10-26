#!/usr/bin/env node
/* global chrome */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { MODEL_LIST_TEST_IDS as models } from "../src/features/ModelList/testIds.ts"
import { UPDATE_LOG_DIALOG_TEST_IDS as updateLog } from "../src/features/UpdateLog/testIds.ts"
import {
  VERCEL_AI_GATEWAY_API_BASE_URL,
  VERCEL_API_ORIGIN,
  VERCEL_WEB_ORIGIN,
} from "../src/services/accountSiteDefinitions/identifiers.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import { connectDevBrowser, connectExtensionById } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { withTemporaryAccount } from "./cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Read-only by default. --mutate creates and deletes one disposable AI Gateway
// key through the extension's own Key Management UI. Requires a Vercel access
// token for the team that owns AI Gateway, supplied through
// VERCEL_ACCESS_TOKEN or a local evidence file. No inference request, no
// credential creation and no spend is performed.
await loadLocalEnv()
applyIsolateFlag(process.argv)
const mutate = process.argv.includes("--mutate")
const evidenceDir = path.resolve(
  process.env.VERCEL_AI_GATEWAY_EVIDENCE_DIR ||
    `.scratch/vercel-ai-gateway/evidence/cdp-${Date.now()}`,
)
await fs.mkdir(evidenceDir, { recursive: true })

const readLocalToken = async () => {
  if (process.env.VERCEL_ACCESS_TOKEN?.trim())
    return process.env.VERCEL_ACCESS_TOKEN.trim()
  const file = path.resolve(".scratch/vercel-ai-gateway/evidence/pat.txt")
  try {
    return (await fs.readFile(file, "utf8")).trim()
  } catch {
    return ""
  }
}

const accessToken = await readLocalToken()
if (!accessToken) {
  console.error(
    "Missing VERCEL_ACCESS_TOKEN (or .scratch/vercel-ai-gateway/evidence/pat.txt).",
  )
  process.exit(2)
}

const accountHeaders = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
}
const readJson = async (response) => {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw: text.slice(0, 200) }
  }
}

const evidence = {
  capturedAt: new Date().toISOString(),
  worktree: process.cwd(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  mode: { mutate },
  checks: [],
  screenshots: [],
  cleanup: {},
}

/** Reads the console identity and the team the account will represent. */
async function readAccountScope() {
  const userResponse = await fetch(`${VERCEL_API_ORIGIN}/v2/user`, {
    headers: accountHeaders,
  })
  assert.equal(userResponse.status, 200, "Vercel access token was rejected")
  const userBody = await readJson(userResponse)
  const user = userBody.user
  assert.ok(user?.id, "Vercel identity was unreadable")

  const teamsResponse = await fetch(`${VERCEL_API_ORIGIN}/v2/teams?limit=100`, {
    headers: accountHeaders,
  })
  assert.equal(teamsResponse.status, 200, "Vercel teams read failed")
  const teamsBody = await readJson(teamsResponse)
  const teams = Array.isArray(teamsBody.teams) ? teamsBody.teams : []
  const team =
    teams.find((candidate) => candidate.id === user.defaultTeamId) ??
    (teams.length === 1 ? teams[0] : undefined)
  assert.ok(team?.id, "No unambiguous AI Gateway team for this token")
  return { user, team }
}

const listNativeKeys = async (teamId) => {
  const response = await fetch(
    `${VERCEL_API_ORIGIN}/v1/api-keys?purpose=ai-gateway&teamId=${encodeURIComponent(teamId)}`,
    { headers: accountHeaders },
  )
  assert.equal(response.status, 200, "AI Gateway key inventory read failed")
  const body = await readJson(response)
  return Array.isArray(body.apiKeys) ? body.apiKeys : []
}

const readCredits = async (teamId) => {
  const response = await fetch(
    `${VERCEL_AI_GATEWAY_API_BASE_URL}/credits?teamId=${encodeURIComponent(teamId)}`,
    { headers: accountHeaders },
  )
  assert.equal(response.status, 200, "AI Gateway credits read failed")
  const body = await readJson(response)
  assert.equal(typeof body.balance, "string", "Credits balance was unreadable")
  return Number(body.balance)
}

const discovery = await connectDevBrowser()
let extensionId
// Default to the production bundle; a hot-reload dev browser can be validated
// by pointing this at `.output/chrome-mv3-dev`.
const extensionDir = path.resolve(
  process.env.VERCEL_AI_GATEWAY_EXTENSION_DIR || ".output/chrome-mv3",
)
try {
  extensionId = await findInstalledDevExtension(discovery.browser, extensionDir)
} finally {
  await discovery.close()
}
assert.ok(
  extensionId,
  `Extension build is not installed in this browser: ${extensionDir}`,
)
const dev = await connectExtensionById({ extensionId })
evidence.extensionId = extensionId
const ui = await dev.context.newPage()
await ui.setViewportSize({ width: 1440, height: 1000 })
await ui.addInitScript(() =>
  localStorage.setItem("all-api-hub-i18nextLng", "en"),
)
await ui.addLocatorHandler(ui.getByTestId(updateLog.root), () =>
  ui.getByTestId(updateLog.closeButton).click(),
)

const capture = async (name, target = ui) => {
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

let createdKeyName
let createdKeyId
let succeeded = false

try {
  const { user, team } = await readAccountScope()
  evidence.identity = { userId: user.id, teamId: team.id, teamSlug: team.slug }
  const nativeKeysBefore = await listNativeKeys(team.id)
  const nativeBalance = await readCredits(team.id)
  evidence.native = {
    keyCount: nativeKeysBefore.length,
    balanceUsd: nativeBalance,
  }
  evidence.checks.push("live identity, team, credits and key inventory read")

  await withTemporaryAccount(
    dev.serviceWorker,
    {
      site_type: "vercel-ai-gateway",
      site_name: "Vercel AI Gateway validation",
      site_url: VERCEL_WEB_ORIGIN,
      authType: "access_token",
      account_info: {
        // The saved account identity is the team, not the personal user.
        id: team.id,
        username: team.name ?? team.slug ?? "vercel",
        access_token: accessToken,
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    },
    async (account) => {
      const page = await openExtensionPage({
        context: dev.context,
        extensionId,
        route: "options.html#account",
      })
      const row = page.getByTestId(
        `account-management-account-list-item-${account.id}`,
      )
      try {
        await row.waitFor({ state: "visible", timeout: 30000 })
        await row.getByTitle(/Click to refresh balance|点击刷新余额/).click()
        // The balance must come from the gateway's own USD credit figure.
        await expect
          .poll(
            async () => {
              const raw = await dev.serviceWorker.evaluate(async (id) => {
                const stored = await chrome.storage.local.get("site_accounts")
                const envelope =
                  typeof stored.site_accounts === "string"
                    ? JSON.parse(stored.site_accounts)
                    : stored.site_accounts
                return envelope?.accounts?.find(
                  (candidate) => candidate.id === id,
                )?.account_info?.quota
              }, account.id)
              return raw
            },
            { timeout: 45000 },
          )
          .toBe(Math.round(nativeBalance * 500000))
        await capture("00-account", row)
        evidence.checks.push("extension refresh reports the native USD credit")

        // Model list through the account's own provider catalog.
        await page.goto(
          `chrome-extension://${extensionId}/options.html?accountId=${encodeURIComponent(account.id)}#models`,
        )
        await dismissModals(page)
        await page
          .getByTestId(models.modelDisplay)
          .waitFor({ state: "visible", timeout: 45000 })
        // The list renders virtualized model cards; the catalog's first row
        // proves the provider catalog arrived through the account's source.
        await expect(
          page
            .getByTestId(models.modelDisplay)
            .getByText("alibaba/qwen-3-14b", { exact: true }),
        ).toBeVisible({ timeout: 45000 })
        // Token prices are published per token and quoted per million.
        await expect(
          page
            .getByTestId(models.modelDisplay)
            .getByText("$0.1200/M", { exact: false })
            .first(),
        ).toBeVisible({ timeout: 10000 })
        await capture("01-model-catalog", page.getByTestId(models.modelDisplay))
        evidence.checks.push("provider model catalog rendered with prices")

        // Native key inventory mirrors the console.
        await page.goto(
          `chrome-extension://${extensionId}/options.html#keys?accountId=${encodeURIComponent(account.id)}`,
        )
        await dismissModals(page)
        await expect(page.getByTestId(keys.nativeKeyRow)).toHaveCount(
          nativeKeysBefore.length,
          { timeout: 45000 },
        )
        await capture("02-keys")
        evidence.checks.push(
          `native key inventory matches the console (${nativeKeysBefore.length} keys)`,
        )

        if (!mutate) return

        const runName = `AAH disposable ${randomUUID().slice(0, 8)}`
        createdKeyName = runName
        await page
          .getByTestId(
            nativeKeysBefore.length
              ? keys.addTokenButton
              : keys.emptyStateAddTokenButton,
          )
          .click()
        const editor = page.getByTestId(keys.nativeEditor)
        // Required fields merge the asterisk into the accessible label.
        const nameInput = editor.getByLabel(/^Token Name/)
        await expect(nameInput).toBeEditable({ timeout: 30000 })
        await nameInput.fill(runName)
        // The native create dialog offers expiry and spend attribution; the
        // extension must submit the same fields. The select is a Radix
        // trigger, so open the list and pick by its rendered label.
        await editor
          .getByRole("combobox", { name: "Spend attribution" })
          .click()
        await page.getByRole("option", { name: "Team", exact: true }).click()
        await expect(
          editor.getByRole("combobox", { name: "Spend attribution" }),
        ).toContainText("Team")
        await capture("03-create-editor", editor)
        await page.getByTestId(keys.nativeEditorSubmitButton).click()

        await expect
          .poll(
            async () => {
              const rows = await listNativeKeys(team.id)
              return rows.find((item) => item.name === runName)?.id
            },
            { timeout: 45000 },
          )
          .toBeTruthy()
        const created = (await listNativeKeys(team.id)).find(
          (item) => item.name === runName,
        )
        createdKeyId = created.id
        assert.equal(
          created.metadata?.spendAttribution,
          "team",
          "spend attribution was not applied",
        )
        assert.match(
          created.partialKey ?? "",
          /^[A-Za-z0-9]+$/,
          "partial key was unreadable",
        )
        evidence.createdKeyId = createdKeyId
        evidence.checks.push(
          "disposable key created through the UI with team attribution",
        )

        await page.keyboard.press("Escape")
        await dismissModals(page)
        await expect(page.getByTestId(keys.nativeKeyRow)).toHaveCount(
          nativeKeysBefore.length + 1,
          { timeout: 45000 },
        )
        const createdRow = page
          .getByTestId(keys.nativeKeyRow)
          .and(page.locator(`[data-resource-id="${createdKeyId}"]`))
        await expect(createdRow).toContainText(runName, { timeout: 30000 })
        // No update route exists, so the row must not offer an editor.
        assert.equal(
          await createdRow
            .getByRole("button", { name: /Edit Key|Edit key/ })
            .count(),
          0,
          "a key with no update route must not offer editing",
        )
        // Spend attribution is billing metadata: it must render under its own
        // label, never as a model-access "Group".
        await expect(createdRow).toContainText("Spend attribution", {
          timeout: 15000,
        })
        assert.equal(
          await createdRow.getByText("Group", { exact: true }).count(),
          0,
          "spend attribution must not be labelled as a group",
        )
        await expect(createdRow).toContainText("Team", { timeout: 15000 })
        await capture("04-created-key", createdRow)
        evidence.checks.push("created key inventoried; editing is unavailable")

        await createdRow.getByRole("button", { name: /delete key/i }).click()
        await capture("05-delete-confirm")
        await page.getByTestId(keys.nativeDeleteConfirmButton).click({
          timeout: 15000,
        })
        await expect
          .poll(
            async () =>
              (await listNativeKeys(team.id)).some(
                (item) => item.id === createdKeyId,
              ),
            { timeout: 45000 },
          )
          .toBe(false)
        await expect(page.getByTestId(keys.nativeKeyRow)).toHaveCount(
          nativeKeysBefore.length,
          { timeout: 45000 },
        )
        evidence.cleanup.deletedKeyIds = [createdKeyId]
        evidence.checks.push("disposable key deleted and read back")
      } finally {
        await page.close().catch(() => {})
      }
    },
  )
  succeeded = true
} catch (error) {
  evidence.error = String(error)
  throw error
} finally {
  const cleanupErrors = []
  try {
    const scope = evidence.identity
    if (scope?.teamId && (createdKeyId || createdKeyName)) {
      const rows = await listNativeKeys(scope.teamId)
      const owned = rows.filter(
        (item) => item.id === createdKeyId || item.name === createdKeyName,
      )
      for (const item of owned) {
        const deleted = await fetch(
          `${VERCEL_API_ORIGIN}/v1/api-keys/${encodeURIComponent(item.id)}?teamId=${encodeURIComponent(scope.teamId)}`,
          { method: "DELETE", headers: accountHeaders },
        )
        assert.ok(deleted.ok, "disposable key cleanup failed")
      }
      const remaining = await listNativeKeys(scope.teamId)
      assert.ok(
        !remaining.some((item) => owned.some((own) => own.id === item.id)),
        "disposable key remains after cleanup",
      )
      evidence.cleanup.finallyDeletedKeyIds = owned.map((item) => item.id)
    }
  } catch (error) {
    cleanupErrors.push(`keys: ${String(error)}`)
  }
  if (cleanupErrors.length) {
    evidence.cleanup.error = cleanupErrors.join("; ")
    succeeded = false
    process.exitCode = 1
  }
  await ui.close().catch(() => {})
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
        native: evidence.native,
        checks: evidence.checks,
        evidenceDir,
      },
      null,
      1,
    ),
  )
  await dev.close()
}
