#!/usr/bin/env node
/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { connectDevExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts, withTemporaryAccount } from "./cdp/sandbox.mjs"
import { openExtensionPage } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
applyIsolateFlag(process.argv)
const methodId = "sidrune:daily-checkin"
const origin = process.env.SIDRUNE_ORIGIN || "https://global.sidrune.ai"
const evidenceDir = path.resolve(
  process.env.SIDRUNE_EVIDENCE_DIR || ".scratch/sidrune-checkin/evidence/cdp",
)

/** Read-only by default. --execute allows one eligible daily grant via the UI. */
async function main() {
  const token = process.env.SIDRUNE_ACCESS_TOKEN
  if (!token)
    throw new Error(
      "Set SIDRUNE_ACCESS_TOKEN; credentials must not be passed on the command line",
    )
  const execute = process.argv.includes("--execute")
  fs.mkdirSync(evidenceDir, { recursive: true })
  const dev = await connectDevExtension()
  const probe = await dev.context.newPage()
  let fixtureId
  try {
    await probe.goto(`${origin}/welfare`)
    const initial = await probe.evaluate(
      async ({ token, origin }) => {
        const read = async (endpoint) => {
          const r = await fetch(`${origin}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!r.ok) throw new Error(`preflight HTTP ${r.status}`)
          const body = await r.json()
          if (body.code !== 0) throw new Error("preflight business error")
          return body.data
        }
        return {
          identity: await read("/api/v1/auth/me"),
          profile: await read("/api/v1/welfare/profile"),
        }
      },
      { token, origin },
    )
    assert(initial.identity?.id, "authenticated account identity required")
    if (execute && !initial.profile.checked_in_today) {
      assert.equal(initial.profile.enabled, true, "welfare must be enabled")
      assert.equal(
        initial.profile.eligible,
        true,
        "API-usage eligibility required",
      )
    }
    if (!execute)
      assert.equal(
        initial.profile.checked_in_today,
        true,
        "read-only run requires already checked today; --execute authorizes an eligible grant",
      )
    fs.writeFileSync(
      path.join(evidenceDir, "preflight.json"),
      JSON.stringify(initial, null, 2),
    )
    await withTemporaryAccount(
      dev.serviceWorker,
      {
        site_name: "Sidrune live",
        site_url: origin,
        site_type: "sub2api",
        checkIn: {
          automaticExecutionEnabled: true,
          methodKnowledge: { methods: {} },
          selection: { mode: "automatic" },
        },
        account_info: {
          id: String(initial.identity.id),
          username: "sidrune-live",
          access_token: token,
        },
      },
      async (fixture) => {
        fixtureId = fixture.id
        const page = await openExtensionPage({
          context: dev.context,
          extensionId: dev.extensionId,
          route: "options.html#account",
        })
        let checkinPage
        try {
          const search = page
            .locator('input[placeholder*="搜索"], input[placeholder*="Search"]')
            .first()
          if (await search.isVisible()) await search.fill("Sidrune live")
          const row = page.getByTestId(
            `account-management-account-list-item-${fixture.id}`,
          )
          await row.waitFor({ state: "visible", timeout: 20_000 })
          await row.hover()
          await row.getByTestId("account-management-row-edit-button").click()
          const dialog = page.getByTestId("account-management-account-dialog")
          const section = dialog.getByTestId(
            "account-management-account-form-section-check-in",
          )
          const detect = section
            .getByRole("button")
            .filter({
              hasText:
                /Re-detect check-in method|重新检测签到方式|重新偵測簽到方式/,
            })
            .first()
          await detect.click()
          await section
            .getByText(/Sidrune/)
            .first()
            .waitFor()
          await detect.waitFor({ state: "visible", timeout: 120_000 })
          await dialog
            .getByTestId("account-management-confirm-add-button")
            .click()
          await dialog.waitFor({ state: "hidden" })
          const saved = (await getAccounts(dev.serviceWorker)).find(
            (a) => a.id === fixture.id,
          )
          assert.equal(saved?.checkIn?.selection?.methodId, methodId)
          assert.equal(
            saved?.checkIn?.methodKnowledge?.methods?.[methodId]?.detection
              ?.outcome,
            "matched",
          )
          // Reopen so the screenshot shows persisted discovery, not a candidate label.
          await row.hover()
          await row.getByTestId("account-management-row-edit-button").click()
          await section.scrollIntoViewIfNeeded()
          await section.screenshot({
            path: path.join(evidenceDir, "01-detected.png"),
          })
          await page.keyboard.press("Escape")
          checkinPage = await openExtensionPage({
            context: dev.context,
            extensionId: dev.extensionId,
            route: "options.html#autoCheckin",
          })
          assert(
            (await getAccounts(dev.serviceWorker)).every(
              (account) =>
                account.id === fixture.id ||
                account.disabled ||
                !account.checkIn?.automaticExecutionEnabled,
            ),
            "Run now would execute another account; use an empty isolated dev profile",
          )
          await checkinPage.getByTestId("auto-checkin-run-now-button").click()
          let result
          await assertEventually(async () => {
            result = await dev.serviceWorker.evaluate(async (id) => {
              const stored = (
                await chrome.storage.local.get("autoCheckin_status")
              ).autoCheckin_status
              const status =
                typeof stored === "string" ? JSON.parse(stored) : stored
              return status?.perAccount?.[id]
            }, fixture.id)
            return (
              result &&
              ["skipped", "already_checked", "success"].includes(result.status)
            )
          })
          if (!execute)
            assert(
              ["already_checked", "already_checked_today"].includes(
                result.reasonCode,
              ) || result.status === "already_checked",
            )
          if (execute && !initial.profile.checked_in_today) {
            assert.equal(result.status, "success", "fresh grant must succeed")
          }
          const after = await probe.evaluate(async (token) => {
            const response = await fetch("/api/v1/welfare/profile", {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!response.ok)
              throw new Error(`readback HTTP ${response.status}`)
            return response.json()
          }, token)
          assert.equal(after.code, 0)
          assert.equal(after.data.checked_in_today, true)
          if (!execute)
            assert.equal(
              after.data.balance,
              initial.profile.balance,
              "read-only run must preserve welfare balance",
            )
          fs.writeFileSync(
            path.join(evidenceDir, "readback.json"),
            JSON.stringify(after, null, 2),
          )
          assert.equal(
            result.reward,
            undefined,
            "welfare rewards must not become account quota",
          )
          await checkinPage.screenshot({
            path: path.join(evidenceDir, "02-result.png"),
            fullPage: true,
          })
          fs.writeFileSync(
            path.join(evidenceDir, "result.json"),
            JSON.stringify(
              { origin, extensionId: dev.extensionId, result },
              null,
              2,
            ),
          )
          console.log(
            JSON.stringify({
              ok: true,
              origin,
              extensionId: dev.extensionId,
              status: result.status,
              reason: result.reasonCode,
            }),
          )
        } finally {
          await page
            .screenshot({
              path: path.join(evidenceDir, "last-account-view.png"),
            })
            .catch(() => {})
          await checkinPage?.close()
          await page.close()
        }
      },
    )
    assert(
      !(await getAccounts(dev.serviceWorker)).some((a) => a.id === fixtureId),
      "temporary fixture cleanup",
    )
  } finally {
    await probe.close()
    await dev.close()
  }
}

async function assertEventually(check) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("Sidrune UI workflow timed out")
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
