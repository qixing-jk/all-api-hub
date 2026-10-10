/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { connectDevExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import {
  getAccounts,
  withStoredValue,
  withTemporaryAccount,
} from "./cdp/sandbox.mjs"
import { openExtensionPage } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
applyIsolateFlag(process.argv.slice(2))
assert.ok(
  process.argv.includes("--isolate"),
  "Use --isolate to keep validation state in this worktree's dev profile",
)

// Read-only against the provider: credentials live only in process memory and
// the temporary extension account. No refresh token or browser state export.
const baseUrl = new URL(process.env.HIYO_BASE_URL || "https://free.hiyo.top")
  .origin
const token = process.env.HIYO_ACCESS_TOKEN
const evidenceDir = path.resolve(
  process.env.HIYO_EVIDENCE_DIR || ".scratch/hiyo-checkin/evidence/live",
)
assert.ok(token, "Set HIYO_ACCESS_TOKEN to a current console access token")
await fs.mkdir(evidenceDir, { recursive: true })

async function read(endpoint) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  assert.equal(response.status, 200, `GET ${endpoint}`)
  const body = await response.json()
  assert.equal(body.code, 0, `GET ${endpoint} success envelope`)
  return body
}

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
const initial = await read(
  `/api/v1/checkin?timezone=${encodeURIComponent(timezone)}`,
)
assert.equal(typeof initial.data.daily_claimed, "boolean")
const profile = (await read("/api/v1/auth/me")).data
assert.ok(profile.id, "Authenticated account identity")
await fs.writeFile(
  path.join(evidenceDir, "status-before.json"),
  JSON.stringify(initial, null, 2),
)

const dev = await connectDevExtension()
let fixtureId
let mutationCount = 0
dev.context.on("request", (request) => {
  if (
    request.url().startsWith(`${baseUrl}/api/v1/checkin`) &&
    request.method() === "POST"
  )
    mutationCount++
})
try {
  await withStoredValue(dev.serviceWorker, "autoCheckin_status", {}, async () =>
    withTemporaryAccount(
      dev.serviceWorker,
      {
        configVersion: 7,
        site_name: "Hiyo Free live validation",
        site_url: baseUrl,
        site_type: "sub2api",
        account_info: {
          id: String(profile.id),
          username: "Hiyo live validation",
          access_token: token,
          quota: Math.round(profile.balance * 500_000),
        },
      },
      async (fixture) => {
        fixtureId = fixture.id
        const page = await openExtensionPage({
          context: dev.context,
          extensionId: dev.extensionId,
          route: "options.html#account",
        })
        try {
          await expect(
            page.getByText(fixture.site_name, { exact: true }).first(),
          ).toBeVisible({ timeout: 20_000 })
          await page
            .getByTestId("account-management-row-edit-button")
            .first()
            .click()
          const section = page.locator("#account-check-in-config")
          await page.locator("#account-check-in-redetect").click()
          await expect(page.locator("#account-check-in-redetect")).toBeEnabled({
            timeout: 45_000,
          })
          await expect(section).toContainText("Hiyo Free", { timeout: 45_000 })
          await section.screenshot({
            path: path.join(evidenceDir, "01-detected-method.png"),
            animations: "disabled",
          })
          await page
            .getByRole("button", { name: /保存|Save/, exact: true })
            .click()
          await expect
            .poll(
              async () => {
                const saved = (await getAccounts(dev.serviceWorker)).find(
                  ({ id }) => id === fixture.id,
                )
                return saved?.checkIn?.selection?.methodId
              },
              { timeout: 20_000 },
            )
            .toBe("hiyo:daily-checkin")
          const verification = await page.evaluate(async (accountId) => {
            const reply = await chrome.runtime.sendMessage({
              id: 1,
              type: "autoCheckin:verifyAccountStatus",
              timestamp: Date.now(),
              data: { accountId },
            })
            return reply.res
          }, fixture.id)
          assert.equal(verification?.success, true, "Extension status readback")
          assert.equal(
            verification.verifiedStatus,
            initial.data.daily_claimed ? "checked" : "not_checked",
          )
          await page.goto(
            `chrome-extension://${dev.extensionId}/options.html#autoCheckin`,
          )
          await expect(
            page.getByRole("heading", {
              name: /Auto Check-in|自动签到/,
              exact: true,
            }),
          ).toBeVisible({ timeout: 20_000 })
          const row = page
            .getByRole("row")
            .filter({ hasText: fixture.site_name })
          await expect(row).toContainText(
            initial.data.daily_claimed
              ? /Checked in|已签到/
              : /Not checked|未签到/,
            { timeout: 20_000 },
          )
          await row.screenshot({
            path: path.join(evidenceDir, "02-status-workspace.png"),
            animations: "disabled",
          })
          assert.equal(
            mutationCount,
            0,
            "Discovery and status readback must never claim a reward",
          )
          await fs.writeFile(
            path.join(evidenceDir, "result.json"),
            JSON.stringify(
              {
                observedAt: new Date().toISOString(),
                baseUrl,
                extensionId: dev.extensionId,
                method: "hiyo:daily-checkin",
                verification,
                checkinPosts: mutationCount,
                freshGrantThroughExtension: "not exercised: read-only runner",
              },
              null,
              2,
            ),
          )
        } finally {
          await page.close()
        }
      },
    ),
  )
  assert.ok(
    !(await getAccounts(dev.serviceWorker)).some(({ id }) => id === fixtureId),
    "Temporary account removed",
  )
  const finalStatus = await read(
    `/api/v1/checkin?timezone=${encodeURIComponent(timezone)}`,
  )
  assert.equal(finalStatus.data.daily_claimed, initial.data.daily_claimed)
  console.log(
    "Hiyo live discovery, saved method, status readback, UI and temporary account cleanup passed.",
  )
} finally {
  await dev.close()
}
