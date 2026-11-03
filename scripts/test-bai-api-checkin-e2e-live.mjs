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

/**
 * Live acceptance for 柏API's daily check-in (issue #1746).
 *
 * Read-only by default: requires the account to be already checked today and
 * asserts a full detect → save → run cycle that submits nothing.
 * `--execute` authorizes one fresh grant on the temporary fixture account,
 * which also captures the unverified submit response contract.
 *
 * The account session comes from the isolated dev profile's own byeapi.top
 * login (transfer it with the documented origin-scoped handoff first); this
 * runner never reads or prints the token.
 */
loadLocalEnv()
applyIsolateFlag(process.argv)
const methodId = "bai-api:daily-checkin"
const origin = process.env.BAI_API_ORIGIN || "https://byeapi.top"
const evidenceDir = path.resolve(
  process.env.BAI_API_EVIDENCE_DIR || ".scratch/byeapi-checkin/evidence/cdp",
)

const timezone = () =>
  encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)

/** Reads the fixture token through the extension's own stored account. */
async function readFixtureToken(serviceWorker, accountId) {
  const accounts = await getAccounts(serviceWorker)
  const account = accounts.find((entry) => entry.id === accountId)
  const token = account?.account_info?.access_token
  assert(token, "temporary fixture must carry its access token")
  return token
}

async function main() {
  const execute = process.argv.includes("--execute")
  fs.mkdirSync(evidenceDir, { recursive: true })
  const dev = await connectDevExtension()
  const probe = await dev.context.newPage()
  let fixtureId
  try {
    await probe.goto(`${origin}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    })
    const token = await probe.evaluate(() => localStorage.getItem("auth_token"))
    assert(token, "the dev profile needs a byeapi.top login for this origin")
    await probe.goto(`${origin}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    })
    const read = async (endpoint) => {
      const r = await probe.evaluate(
        async ({ endpoint, origin }) => {
          const raw = localStorage.getItem("auth_token")
          const response = await fetch(`${origin}${endpoint}`, {
            headers: { Authorization: `Bearer ${raw}` },
            cache: "no-store",
          })
          return { status: response.status, body: await response.json() }
        },
        { endpoint, origin },
      )
      assert.equal(r.status, 200, `preflight HTTP ${r.status}`)
      assert.equal(r.body.code, 0, "preflight business error")
      return r.body.data
    }
    const identity = await read("/api/v1/auth/me")
    const statusPath = `/api/v1/daily-rewards/checkin/status?timezone=${timezone()}`
    const initial = await read(statusPath)
    assert(identity?.id, "authenticated account identity required")
    assert.equal(typeof initial.checked_today, "boolean")
    if (!execute)
      assert.equal(
        initial.checked_today,
        true,
        "read-only run requires already checked today; --execute authorizes one fresh grant",
      )
    fs.writeFileSync(
      path.join(evidenceDir, "preflight.json"),
      JSON.stringify(
        {
          identityId: identity.id,
          checkedToday: initial.checked_today,
          checkinDate: initial.checkin_date,
          streakDays: initial.streak_days,
          balance: identity.balance,
        },
        null,
        2,
      ),
    )

    await withTemporaryAccount(
      dev.serviceWorker,
      {
        site_name: "柏API live",
        site_url: origin,
        site_type: "sub2api",
        checkIn: {
          automaticExecutionEnabled: true,
          methodKnowledge: { methods: {} },
          selection: { mode: "automatic" },
        },
        account_info: {
          id: String(identity.id),
          username: "bai-api-live",
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
          if (await search.isVisible()) await search.fill("柏API live")
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
          await section.getByText(/柏API/).first().waitFor()
          await detect.waitFor({ state: "visible", timeout: 120_000 })
          await dialog
            .getByTestId("account-management-confirm-add-button")
            .click()
          await dialog.waitFor({ state: "hidden" })
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
          // Reopen so the screenshot shows persisted discovery, not a candidate.
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
            "Run now would execute another account; use an isolated dev profile",
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
              result.status === "skipped" ||
                result.status === "already_checked",
              `read-only run must skip an already-checked day (got ${result.status})`,
            )
          } else if (!initial.checked_today) {
            assert.equal(result.status, "success", "fresh grant must succeed")
            if (result.reward !== undefined) {
              // A reported reward must be a numeric, positive quota. The provider
              // unit test covers conversion from the endpoint's reward amount.
              assert.equal(typeof result.reward.quota, "number")
              assert.ok(result.reward.quota > 0)
            }
          }
          const after = await read(statusPath)
          assert.equal(after.checked_today, true)
          if (!execute)
            assert.equal(
              after.streak_days,
              initial.streak_days,
              "read-only run must not change the streak",
            )
          fs.writeFileSync(
            path.join(evidenceDir, "readback.json"),
            JSON.stringify(
              {
                checkedToday: after.checked_today,
                checkinDate: after.checkin_date,
                streakDays: after.streak_days,
              },
              null,
              2,
            ),
          )
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
              {
                origin,
                extensionId: dev.extensionId,
                execute,
                status: result.status,
                reason: result.reasonCode,
                reward: result.reward ?? null,
              },
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
              reward: result.reward ?? null,
              checkedToday: after.checked_today,
              streakDays: after.streak_days,
            }),
          )
        } finally {
          await checkinPage
            ?.screenshot({
              path: path.join(evidenceDir, "last-checkin-view.png"),
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
  // The token stays in the extension's stored fixture only; never log it.
  void readFixtureToken
}

async function assertEventually(check) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("柏API UI workflow timed out")
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
