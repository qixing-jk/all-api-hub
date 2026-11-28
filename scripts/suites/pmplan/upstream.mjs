import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
} from "../../../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../../../src/features/KeyManagement/testIds.ts"
import { TOKEN_PROVISIONING_TEST_IDS as provisioning } from "../../../src/features/TokenProvisioning/testIds.ts"
import { PMPLAN_WEB_ORIGIN as origin } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { getAccounts } from "../../cdp/sandbox.mjs"
import {
  configureExtensionPage,
  createUiCapture,
} from "../../cdp/ui-driver.mjs"
import { runUiScenarios } from "../../cdp/ui-scenarios.mjs"
import { readModelCatalog } from "../../flows/model-catalog.mjs"
import {
  openNativeKeyEditor,
  submitNativeKeyEditor,
} from "../../flows/native-key-editor.mjs"
import {
  readPmplanAnnouncementStatus,
  requirePmplanAccount,
} from "./accountScope.mjs"
import { revokePmplanKeys } from "./keyCleanup.mjs"
import { submitPmplanKeyCreation } from "./keyCreation.mjs"

/** Follow-up acceptance against an existing UI-added account; only confirmed disposable keys are mutated. */
export async function runPmplanUpstream({
  context,
  serviceWorker,
  extensionId,
  evidenceDir,
  write,
}) {
  await fs.mkdir(evidenceDir, { recursive: true })
  let ui, site, capture
  const owned = new Set()
  let baseline = []
  const report = {
    extensionId,
    screenshots: [],
    cleanup: {},
    capturedAt: new Date().toISOString(),
  }

  const nativeRead = (endpoint) =>
    site.evaluate(async (endpoint) => {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok)
        throw Error(`Native read ${endpoint}: ${response.status}`)
      return response.json()
    }, endpoint)
  const navigate = (route) =>
    ui.evaluate((route) => {
      location.hash = route
    }, route)
  const row = (id) =>
    ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${id}"]`))
  return runScenarioWithCleanup({
    run: async () => {
      ui = await context.newPage()
      site = await context.newPage()
      capture = createUiCapture({
        page: ui,
        directory: evidenceDir,
        screenshots: report.screenshots,
        mask: [ui.getByTestId(provisioning.oneTimeKeyInput)],
        timeoutMs: 30000,
      })
      ui.setDefaultTimeout(60000)
      await ui.emulateMedia({ reducedMotion: "reduce" })
      await configureExtensionPage(ui, {
        viewport: { width: 1440, height: 1000 },
        dismissUpdateLog: true,
      })
      await site.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
      const identity = await nativeRead("/api/me")
      const account = requirePmplanAccount(
        await getAccounts(serviceWorker),
        identity.user.id,
      )
      baseline = (await nativeRead("/api/keys")).keys
      const models = (await nativeRead("/api/models")).models
      await ui.goto(`chrome-extension://${extensionId}/options.html#account`, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      })
      const card = ui.getByTestId(
        getAccountManagementListItemTestId(account.id),
      )
      const edit = async (id) =>
        openNativeKeyEditor(ui, {
          trigger: row(id).getByRole("button", {
            name: /^(Edit key|编辑密钥)$/,
            exact: true,
          }),
          readyField: /^(Available Models|可用模型)$/,
        })
      const readKey = async (id) =>
        (await nativeRead("/api/keys")).keys.find((k) => k.id === id)
      Object.assign(
        report,
        await runUiScenarios({
          selected: [
            "refresh-and-catalog",
            "models-edit-clear-reopen",
            "account-notices",
          ],
          scenarios: [
            {
              id: "refresh-and-catalog",
              covers: [
                "usage.resettable-cost-excluded",
                "pricing.catalog-minima",
              ],
              run: async () => {
                await card.getByTestId(accounts.rowMoreActionsButton).click()
                await ui.getByTestId(accounts.rowRefreshMenuItem).click()
                await expect
                  .poll(
                    async () =>
                      (await getAccounts(serviceWorker)).find(
                        (a) => a.id === account.id,
                      )?.last_sync_time,
                  )
                  .toBeGreaterThan(account.last_sync_time)
                const saved = (await getAccounts(serviceWorker)).find(
                  (a) => a.id === account.id,
                )
                assert.equal(saved.account_info.usage?.cost, undefined)
                assert.ok(saved.account_info.allowances.entries.length)
                await capture("account-refreshed.png", card)
                await card.getByTestId(accounts.rowMoreActionsButton).click()
                await ui
                  .getByTestId(accounts.rowModelManagementMenuItem)
                  .click()
                const { modelDisplay } = await readModelCatalog({
                  page: ui,
                  accountId: account.id,
                  requirePrices: true,
                  timeoutMs: 60000,
                })
                await expect(modelDisplay).toContainText(
                  /Available plans|开放档位/,
                )
                await capture("catalog-minima.png", modelDisplay)
              },
            },
            {
              id: "models-edit-clear-reopen",
              covers: [
                "keys.edit.restrict",
                "keys.edit.clear",
                "keys.edit.cancel",
                "keys.edit.reopen",
                "keys.edit.payload",
                "keys.revoke.readback",
              ],
              prerequisite: () =>
                !write
                  ? "Pass --write to create/edit/revoke one disposable key"
                  : !models.length
                    ? "Live account requires at least one model for restriction editing"
                    : undefined,
              run: async () => {
                await navigate(`keys?accountId=${account.id}`)
                await openNativeKeyEditor(ui, {
                  trigger: ui.getByTestId(keys.addTokenButton),
                  readyField: ui.locator("#resource-editor-expiry"),
                })
                await ui.locator("#resource-editor-expiry").click()
                await ui.getByRole("option").nth(3).click()
                const result = await submitPmplanKeyCreation({
                  page: ui,
                  input: { expires_at: null, models: [] },
                  write,
                  confirmedIds: owned,
                  existingIds: new Set(baseline.map((k) => k.id)),
                  evidenceDir,
                })
                await ui.getByTestId(provisioning.oneTimeKeyCloseButton).click()
                const initial = await readKey(result.id)
                assert.equal(initial.expires_at, null)
                const editor = await edit(result.id)
                await expect(
                  editor.locator("#resource-editor-expiry"),
                ).toHaveCount(0)
                await editor
                  .getByRole("combobox", {
                    name: /^(Available Models|可用模型)$/,
                    exact: true,
                  })
                  .fill(models[0].name)
                await ui
                  .getByRole("option", { name: models[0].name, exact: true })
                  .click()
                await capture("edit-model-restriction.png", editor)
                const request = ui.waitForRequest(
                  (r) =>
                    r.url() === `${origin}/api/keys/${result.id}/models` &&
                    r.method() === "PUT",
                )
                await submitNativeKeyEditor(ui)
                assert.deepEqual((await request).postDataJSON(), {
                  models: [models[0].name],
                })
                assert.deepEqual((await readKey(result.id)).models, [
                  models[0].name,
                ])
                const reopen = await edit(result.id)
                await expect(reopen).toContainText(models[0].name)
                await reopen
                  .getByRole("button", {
                    name: /^(Cancel selection|取消当前选中)$/,
                    exact: true,
                  })
                  .click()
                await reopen
                  .getByRole("button", { name: /^(Cancel|取消)$/, exact: true })
                  .click()
                await ui
                  .getByRole("button", {
                    name: /^(Discard changes|放弃更改)$/,
                    exact: true,
                  })
                  .click()
                await expect(reopen).toBeHidden()
                assert.deepEqual((await readKey(result.id)).models, [
                  models[0].name,
                ])
                const clear = await edit(result.id)
                await clear
                  .getByRole("button", {
                    name: /^(Cancel selection|取消当前选中)$/,
                    exact: true,
                  })
                  .click()
                await capture("edit-models-cleared.png", clear)
                await submitNativeKeyEditor(ui)
                const cleared = await readKey(result.id)
                assert.equal(cleared.all_models, true)
                assert.deepEqual(cleared.models, [])
                assert.equal(cleared.expires_at, initial.expires_at)
                assert.equal(cleared.key_prefix, initial.key_prefix)
                const finalEditor = await edit(result.id)
                await expect(
                  finalEditor.getByRole("button", {
                    name: /^(Cancel selection|取消当前选中)$/,
                    exact: true,
                  }),
                ).toBeDisabled()
                await finalEditor
                  .getByRole("button", { name: /^(Cancel|取消)$/, exact: true })
                  .click()
                await row(result.id)
                  .getByRole("button", {
                    name: /^(Revoke key|撤销密钥)$/,
                    exact: true,
                  })
                  .click()
                await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
                await expect
                  .poll(async () => (await readKey(result.id)).status)
                  .toBe("revoked")
                await expect(
                  row(result.id).getByRole("button", {
                    name: /^(Edit key|编辑密钥)$/,
                    exact: true,
                  }),
                ).toHaveCount(0)
                report.keyLifecycle = {
                  id: result.id,
                  restricted: true,
                  cleared: true,
                  reopened: true,
                  cancelled: true,
                  revoked: true,
                }
              },
            },
            {
              id: "account-notices",
              covers: ["notices.account-source", "notices.live-fetch"],
              run: async () => {
                const notices = await nativeRead("/api/notices")
                report.nativeNoticeCount = notices.notices.length
                await navigate("siteAnnouncements")
                const before = await readPmplanAnnouncementStatus(
                  serviceWorker,
                  account,
                )
                await ui
                  .getByRole("button", {
                    name: /^(Check now|立即检查)$/,
                    exact: true,
                  })
                  .first()
                  .click()
                await expect
                  .poll(async () => {
                    const current = await readPmplanAnnouncementStatus(
                      serviceWorker,
                      account,
                    )
                    return (
                      current?.status === "success" &&
                      current.lastCheckedAt > (before?.lastCheckedAt ?? 0)
                    )
                  })
                  .toBe(true)
                await capture(
                  "notices-empty.png",
                  ui.locator("[data-options-page-content]"),
                )
              },
            },
          ],
        }),
      )
      if (!report.ok) await capture("failure.png", ui.locator("body"))
      return report
    },
    finalizers: [
      async () => {
        const errors = []
        try {
          for (const id of owned)
            assert.ok(!baseline.some((key) => key.id === id))
          await revokePmplanKeys({
            site,
            ids: owned,
            readKeys: async () => (await nativeRead("/api/keys")).keys,
          })
        } catch (error) {
          errors.push(error)
        }
        if (baseline.length) {
          const final = (await nativeRead("/api/keys")).keys
          for (const key of baseline)
            assert.deepEqual(
              final.find((k) => k.id === key.id),
              key,
              "Existing key changed",
            )
        }
        report.cleanup = {
          ownedIds: [...owned],
          existingKeysUnchanged: true,
          errors: errors.map((e) => e.message),
        }
        if (errors.length)
          throw new AggregateError(errors, "Disposable key cleanup failed")
      },
      async () => {
        await fs.writeFile(
          path.join(evidenceDir, "upstream-report.json"),
          JSON.stringify(report, null, 2),
        )
      },
      () => ui?.close(),
      () => site?.close(),
    ],
    cleanupMessage: "PM-Plan follow-up cleanup failed",
    failureMessage: "PM-Plan follow-up and cleanup failed",
  })
}
