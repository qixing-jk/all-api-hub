#!/usr/bin/env node
/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { connectWorktreeExtension } from "./cdp/client.mjs"
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

// Read-only against the provider. Two credential shapes are supported:
//
// - `XINGYA_ACCESS_TOKEN`: a scoped `nap_` personal access token, which is what
//   this rc.41+ deployment lets an account save. This is the realistic
//   AccessToken-account shape and needs no browser session.
// - Otherwise the dashboard Bearer is minted inside the dev browser's own
//   xingya session (`XINGYA_SESSION_FILE` may seed origin-scoped cookies for a
//   profile that has not logged in yet, like the FoxCode runner).
//
// Either way the credential lives only in this process and the temporary
// extension account; neither is printed or written to evidence files.
const baseUrl = process.env.XINGYA_ORIGIN || "https://xingya.site"
const methodId = "xingya:daily-checkin"
const accessToken = process.env.XINGYA_ACCESS_TOKEN?.trim()
const evidenceDir = path.resolve(
  process.env.XINGYA_EVIDENCE_DIR || ".scratch/xingya-checkin/evidence/cdp",
)
await fs.mkdir(evidenceDir, { recursive: true })

/** Read-only status preflight through the deployment's own route. */
async function readStatus(bearer) {
  const response = await fetch(`${baseUrl}/api/user/xingya-checkin`, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  })
  assert.equal(response.status, 200, "GET /api/user/xingya-checkin")
  const body = await response.json()
  assert.equal(body.success, true, "read-only status preflight")
  return body
}

const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(".output/chrome-mv3-dev"),
})
let fixtureId
let mutationCount = 0
dev.context.on("request", (request) => {
  if (
    request.url().startsWith(`${baseUrl}/api/user/xingya-daily-claim`) &&
    request.method() === "POST"
  )
    mutationCount++
})
try {
  const probe = await dev.context.newPage()
  let session
  let fixtureToken
  if (accessToken) {
    // The saved scoped token is the whole credential: no page or session needed.
    const status = await readStatus(accessToken)
    const self = await fetch(`${baseUrl}/api/user/self`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    })
    assert.equal(self.status, 200, "GET /api/user/self with the scoped token")
    const selfBody = await self.json()
    session = {
      status: 200,
      credential: "scoped-access-token",
      userId: selfBody?.data?.id,
      username: selfBody?.data?.display_name || selfBody?.data?.username,
      echo: status,
    }
    fixtureToken = accessToken
  } else {
    // The console keeps its Bearer only in page memory, so mint one fresh pair
    // of eyes from the live session the dev profile already owns.
    const importedSession = process.env.XINGYA_SESSION_FILE
      ? JSON.parse(await fs.readFile(process.env.XINGYA_SESSION_FILE, "utf8"))
      : undefined
    if (importedSession) {
      assert.ok(
        Array.isArray(importedSession.cookies) &&
          importedSession.cookies.every(
            (cookie) => typeof cookie === "object" && cookie !== null,
          ) &&
          importedSession.cookies.every(
            (cookie) =>
              typeof cookie.name === "string" &&
              typeof cookie.value === "string" &&
              typeof cookie.domain === "string",
          ),
        "XINGYA_SESSION_FILE must be an origin-scoped cookie export",
      )
      await dev.context.addCookies(importedSession.cookies)
    }
    await probe.goto(`${baseUrl}/checkin`, { waitUntil: "domcontentloaded" })
    const minted = await probe.evaluate(async (origin) => {
      const response = await fetch(`${origin}/api/user/auth/refresh`, {
        method: "POST",
        credentials: "include",
      })
      if (!response.ok) return { status: response.status }
      const body = await response.json()
      return body?.data?.access_token
        ? {
            status: 200,
            userId: body.data.user?.id,
            expiresAt: body.data.access_expires_at,
            username: body.data.user?.display_name || body.data.user?.username,
            // The bearer itself never crosses into Node.
            echo: await fetch(`${origin}/api/user/xingya-checkin`, {
              headers: { Authorization: `Bearer ${body.data.access_token}` },
            })
              .then((r) => r.json())
              .catch(() => null),
          }
        : { status: response.status }
    }, baseUrl)
    assert.equal(
      minted.status,
      200,
      "The dev profile must be logged into xingya.site (open the console once), or set XINGYA_ACCESS_TOKEN",
    )
    session = { ...minted, credential: "dashboard-bearer" }
    // A second mint supplies the temporary account through this process;
    // the bearer is never printed or included in retained evidence.
    fixtureToken = await probe.evaluate(async (origin) => {
      const response = await fetch(`${origin}/api/user/auth/refresh`, {
        method: "POST",
        credentials: "include",
      })
      const body = await response.json()
      return body?.data?.access_token ?? ""
    }, baseUrl)
    assert.ok(fixtureToken, "fixture bearer mint")
  }
  assert.ok(session.echo?.success, "read-only status preflight")
  const checkedInToday = session.echo?.data?.today_record?.checked_in === true
  assert.equal(
    typeof checkedInToday,
    "boolean",
    "today_record.checked_in must be present",
  )
  await fs.writeFile(
    path.join(evidenceDir, "preflight.json"),
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        baseUrl,
        credential: session.credential,
        userId: session.userId,
        checkedInToday,
        claimEnabled: session.echo?.data?.claim_enabled,
        groupAccessible: session.echo?.data?.group_accessible,
        quotaPerUnit: await probe
          .evaluate(
            () =>
              JSON.parse(localStorage.getItem("system-config-storage") || "{}")
                ?.state?.config?.currency?.quotaPerUnit ?? null,
          )
          .catch(() => null),
      },
      null,
      2,
    ),
  )
  await probe.close()

  await withStoredValue(dev.serviceWorker, "autoCheckin_status", {}, () =>
    withTemporaryAccount(
      dev.serviceWorker,
      {
        configVersion: 7,
        site_name: "Xingya live validation",
        site_url: baseUrl,
        site_type: "new-api",
        account_info: {
          id: String(session.userId),
          username: session.username || "xingya-live",
          access_token: fixtureToken,
          quota: 0,
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
          const accountRow = page.getByTestId(
            `account-management-account-list-item-${fixture.id}`,
          )
          await accountRow.hover()
          await accountRow
            .getByTestId("account-management-row-edit-button")
            .click()
          const section = page.locator("#account-check-in-config")
          await page.locator("#account-check-in-redetect").click()
          await expect(page.locator("#account-check-in-redetect")).toBeEnabled({
            timeout: 45_000,
          })
          await expect(section).toContainText(
            /An available check-in method was detected|检测到可用的签到方式/,
            { timeout: 45_000 },
          )
          // Two matches would report a manual choice here; the fork's own method
          // must be the single candidate on this origin.
          await expect(section).not.toContainText(
            /Multiple check-in methods|检测到多个签到方式/,
          )
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
            .toBe(methodId)
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
            checkedInToday ? "checked" : "not_checked",
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
            checkedInToday ? /Checked in|已签到/ : /Not checked|未签到/,
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
                methodId,
                verification,
                claimPosts: mutationCount,
                checkedInToday,
                freshGrantThroughExtension:
                  "not exercised: read-only runner; today already claimed or a claim would be an irreversible grant",
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
  console.log(
    "Xingya live discovery, saved method, status readback, UI and temporary account cleanup passed.",
  )
} finally {
  await dev.close()
}
