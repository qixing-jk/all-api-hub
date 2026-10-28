import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import { getAccountManagementListItemTestId } from "../src/features/AccountManagement/testIds.ts"
import { connectDevExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { withTemporaryAccount } from "./cdp/sandbox.mjs"
import { preflightSession } from "./cdp/session-preflight.mjs"
import { dismissModals, openExtensionPage } from "./cdp/ui-driver.mjs"
import { readModelCatalog } from "./flows/model-catalog.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

await loadLocalEnv()
applyIsolateFlag(process.argv)
const evidenceDir = path.resolve(".scratch/relayfor-parity-audit/live")
await fs.mkdir(evidenceDir, { recursive: true })
const dev = await connectDevExtension()
const ownedPages = []
try {
  let site = dev.context
    .pages()
    .find((page) => new URL(page.url()).origin === "https://relayfor.xyz")
  if (!site) {
    site = await dev.context.newPage()
    ownedPages.push(site)
    await site.goto("https://relayfor.xyz/console/#overview", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    })
  }
  await site.waitForFunction(
    () =>
      localStorage.getItem("relayfor_token") ||
      localStorage.getItem("topublic_proxy_token") ||
      location.pathname.startsWith("/auth"),
    null,
    { timeout: 15000 },
  )
  const result = await preflightSession({
    expectedIdentity: process.env.RELAYFOR_USER_ID,
    sourceDiscoveryComplete: false,
    probeTarget: async () =>
      site.evaluate(async () => {
        const token =
          localStorage.getItem("relayfor_token") ||
          localStorage.getItem("topublic_proxy_token")
        if (!token) return { status: "unauthenticated" }
        try {
          const response = await fetch("/api/user/self", {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          })
          if (response.status === 401) return { status: "unauthenticated" }
          if (!response.ok)
            return { status: "error", reason: `http-${response.status}` }
          const user = await response.json()
          return typeof user.id === "number"
            ? { status: "authenticated", identity: String(user.id) }
            : { status: "error", reason: "invalid-identity" }
        } catch {
          return { status: "error", reason: "request-failed" }
        }
      }),
  })
  await fs.writeFile(
    path.join(evidenceDir, "preflight.json"),
    JSON.stringify(result, null, 2),
  )
  console.log(
    JSON.stringify({
      status: result.status,
      extensionId: dev.extensionId,
      sourceDiscoveryComplete: result.sourceDiscoveryComplete,
    }),
  )
  if (result.status !== "ready") {
    process.exitCode = 2
  } else if (!process.argv.includes("--preflight-only")) {
    // Only the verified site's bearer credential is held in process memory.
    const session = await site.evaluate(() => ({
      token:
        localStorage.getItem("relayfor_token") ||
        localStorage.getItem("topublic_proxy_token"),
    }))
    assert.ok(session.token)
    await withTemporaryAccount(
      dev.serviceWorker,
      {
        site_type: "relayfor",
        site_name: "RelayFor validation",
        site_url: "https://relayfor.xyz",
        account_info: {
          id: result.target.identity,
          username: "validation",
          access_token: session.token,
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
          extensionId: dev.extensionId,
          route: "options.html#account",
        })
        ownedPages.push(page)
        await dismissModals(page)
        const row = page.getByTestId(
          getAccountManagementListItemTestId(account.id),
        )
        await row
          .waitFor({ state: "visible", timeout: 20000 })
          .catch(async (error) => {
            await page.screenshot({
              path: path.join(evidenceDir, "account-failure.png"),
            })
            throw error
          })
        await row.getByTitle(/Click to refresh balance|点击刷新余额/).click()
        await row
          .getByRole("button", {
            name: /Allowance details|额度明细/,
            exact: true,
          })
          .waitFor({ timeout: 20000 })
        await row
          .getByRole("button", {
            name: /Allowance details|额度明细/,
            exact: true,
          })
          .click()
        await row.screenshot({
          path: path.join(evidenceDir, "account-allowances.png"),
        })
        await page
          .getByRole("dialog", { name: /Allowance details|额度明细/ })
          .screenshot({ path: path.join(evidenceDir, "allowance-details.png") })
        await page.keyboard.press("Escape")
        await page.goto(
          `chrome-extension://${dev.extensionId}/options.html?accountId=${encodeURIComponent(account.id)}#models`,
        )
        await readModelCatalog({
          page,
          accountId: account.id,
          timeoutMs: 20000,
          requirePrices: false,
        })
        await page.screenshot({
          path: path.join(evidenceDir, "model-catalog.png"),
        })
        console.log(
          "Authenticated read-only extension account and model flows passed; no provider mutations performed.",
        )
      },
    )
  }
} finally {
  for (const page of ownedPages.reverse()) await page.close().catch(() => {})
  await dev.close()
}
