#!/usr/bin/env node
/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { connectDevExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts, withTemporaryAccount } from "./cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
applyIsolateFlag(process.argv)
const methodId = "freeapi:daily-checkin"
const origin = process.env.FREEAPI_ORIGIN || "https://freeapi.site"
const evidenceDir = path.resolve(
  process.env.FREEAPI_EVIDENCE_DIR || ".scratch/freeapi-checkin/evidence/cdp",
)

/** Kept in sync with `src/constants/money.ts`; the runner is plain JS. */
const QUOTA_PER_USD = Number(
  /QUOTA_PER_USD\s*=\s*([\d_]+)/
    .exec(fs.readFileSync(path.resolve("src/constants/money.ts"), "utf8"))?.[1]
    ?.replaceAll("_", ""),
)

const timezone = () =>
  encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)

/** Read-only by default. --execute allows one eligible daily grant via the UI. */
async function main() {
  const token = process.env.FREEAPI_ACCESS_TOKEN
  if (!token)
    throw new Error(
      "Set FREEAPI_ACCESS_TOKEN; credentials must not be passed on the command line",
    )
  const execute = process.argv.includes("--execute")
  fs.mkdirSync(evidenceDir, { recursive: true })
  const dev = await connectDevExtension()
  const probe = await dev.context.newPage()
  let fixtureId
  try {
    await probe.goto(`${origin}/checkin`)
    const initial = await probe.evaluate(
      async ({ token, origin, timezone }) => {
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
          status: await read(`/api/v1/user/checkin?timezone=${timezone}`),
        }
      },
      { token, origin, timezone: timezone() },
    )
    assert(initial.identity?.id, "authenticated account identity required")
    if (execute && !initial.status.checked_in_today) {
      assert.equal(initial.status.enabled, true, "check-in must be enabled")
    }
    if (!execute)
      assert.equal(
        initial.status.checked_in_today,
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
        site_name: "FreeAPI live",
        site_url: origin,
        site_type: "sub2api",
        checkIn: {
          automaticExecutionEnabled: true,
          methodKnowledge: { methods: {} },
          selection: { mode: "automatic" },
        },
        account_info: {
          id: String(initial.identity.id),
          username: "freeapi-live",
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
          if (await search.isVisible()) await search.fill("FreeAPI live")
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
          // The registered third-party source name is the site's own brand.
          await section.getByText(/露娜/).first().waitFor()
          await detect.waitFor({ state: "visible", timeout: 120_000 })
          await dialog
            .getByTestId("account-management-confirm-add-button")
            .click()
          await dialog.waitFor({ state: "hidden" })
          // Saving can offer key creation; this check-in run leaves it untouched.
          await dismissModals(page)
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
          if (!execute) {
            assert.notEqual(
              result.status,
              "success",
              "read-only run must not submit",
            )
            assert(
              ["already_checked", "already_checked_today"].includes(
                result.reasonCode,
              ) || result.status === "already_checked",
            )
          }
          if (execute && !initial.status.checked_in_today) {
            assert.equal(result.status, "success", "fresh grant must succeed")
            // The dashboard quotes awards in USD, so the reported quota must
            // agree with the balance delta the deployment itself publishes.
            const quota = result.reward?.quota
            assert.equal(
              typeof quota,
              "number",
              "an applied grant must report a quota reward",
            )
            assert.ok(quota > 0, "a fresh grant must report a positive reward")
          }
          const after = await probe.evaluate(
            async ({ token, origin, timezone }) => {
              const response = await fetch(
                `${origin}/api/v1/user/checkin?timezone=${timezone}`,
                { headers: { Authorization: `Bearer ${token}` } },
              )
              if (!response.ok)
                throw new Error(`readback HTTP ${response.status}`)
              return response.json()
            },
            { token, origin, timezone: timezone() },
          )
          assert.equal(after.code, 0)
          assert.equal(after.data.checked_in_today, true)
          if (!execute)
            assert.equal(
              after.data.total_count,
              initial.status.total_count,
              "read-only run must not add a record",
            )
          if (execute && !initial.status.checked_in_today) {
            assert.equal(
              after.data.total_count,
              initial.status.total_count + 1,
              "the grant must add exactly one record",
            )
            const delta = after.data.total_amount - initial.status.total_amount
            assert.ok(delta > 0, "the grant must raise the earned total")
            const expectedQuota = delta * QUOTA_PER_USD
            assert.ok(
              Math.abs(result.reward.quota - expectedQuota) <= 1,
              `reward ${result.reward.quota} must equal the reported USD delta ${expectedQuota}`,
            )
          }
          fs.writeFileSync(
            path.join(evidenceDir, "readback.json"),
            JSON.stringify(after, null, 2),
          )
          // Per-account persistence can precede completion of the visible run.
          await assertEventually(() =>
            checkinPage.getByTestId("auto-checkin-run-now-button").isEnabled(),
          )
          await checkinPage
            .getByText(fixture.site_name, { exact: true })
            .first()
            .waitFor()
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
              methodId,
              status: result.status,
              reason: result.reasonCode,
              reward: result.reward,
              total_count: after.data.total_count,
              total_amount: after.data.total_amount,
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
  throw new Error("FreeAPI UI workflow timed out")
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
