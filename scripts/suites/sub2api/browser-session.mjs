import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "../../../src/features/AccountManagement/testIds.ts"
import { connectWorktreeExtension } from "../../cdp/client.mjs"
import { applyIsolateFlag } from "../../cdp/dev-profile.mjs"
import {
  assertAccountDetectionOutcome,
  detectAccountSiteType,
  openAccountAddDialog,
} from "../../flows/auto-detect.mjs"

/** Normal website login and extension onboarding; no credential/account injection. */
export async function runBrowserSessionAcceptance(args) {
  const configuredTarget = process.env.AAH_PANEL_PROOF_TEST_BASE_URL?.trim()
  assert(
    configuredTarget,
    "An explicit AAH_PANEL_PROOF_TEST_BASE_URL is required",
  )
  // AccountDialog stores protocol//host regardless of the entered URL path.
  const target = new URL(configuredTarget).origin
  applyIsolateFlag(args)
  assert(
    args.includes("--login"),
    "Use --login for native website login and an owned account save/delete",
  )
  const expectedId =
    args.find((arg) => arg.startsWith("--expected-id="))?.slice(14) ??
    process.env.AAH_PANEL_PROOF_TEST_USER_ID
  assert(expectedId, "An independently verified --expected-id is required")
  const output = path.resolve(
    ".scratch/sub2api-panel-proof/artifacts",
    `browser-live-${Date.now()}`,
  )
  await fs.mkdir(output, { recursive: true })
  const dev = await connectWorktreeExtension({
    extensionPath: path.resolve(".output/chrome-mv3-dev"),
  })
  const page = await dev.context.newPage()
  await page.emulateMedia({ reducedMotion: "reduce" })
  let site = await dev.context.newPage()
  let savedId
  let readAccount
  let saveSubmitted = false
  const result = {
    target,
    expectedId,
    extensionId: dev.extensionId,
    login: "pending",
    detection: "pending",
    save: "pending",
    reopen: "pending",
    refresh: "pending",
    closedPageRefresh: "pending",
    cleanup: "pending",
  }
  const reads = []
  const listener = (response) => {
    if (response.url().startsWith(target + "/api/v1/auth/me"))
      reads.push({ status: response.status() })
  }
  dev.context.on("response", listener)
  try {
    await site.goto(target + "/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })
    const existing = await site.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("auth_user") ?? "null")?.id
      } catch {
        return null
      }
    })
    if (existing)
      assert.equal(
        String(existing),
        expectedId,
        "Existing website account differs",
      )
    else {
      const accept = site.getByRole("button", {
        name: "Accept and continue",
        exact: true,
      })
      if (await accept.isVisible()) await accept.click()
      await site
        .locator('input[type="email"]')
        .fill(process.env.AAH_PANEL_PROOF_TEST_USERNAME)
      await site
        .locator('input[type="password"]')
        .fill(process.env.AAH_PANEL_PROOF_TEST_PASSWORD)
      const verification = site.getByRole("button", {
        name: "开始验证",
        exact: true,
      })
      await verification.waitFor({ state: "visible", timeout: 30000 })
      await verification.click()
      await site.getByRole("button", { name: /^\s*Sign In\s*$/ }).click()
    }
    await site.waitForFunction(
      (id) => {
        try {
          return (
            String(
              JSON.parse(localStorage.getItem("auth_user") ?? "null")?.id,
            ) === id && Boolean(localStorage.getItem("auth_token"))
          )
        } catch {
          return false
        }
      },
      expectedId,
      { timeout: 60000 },
    )
    result.login = existing ? "reused" : "native-ui"
    const username = await site.evaluate(() => {
      const u = JSON.parse(localStorage.getItem("auth_user"))
      return u.username || u.email?.split("@")[0]
    })
    await page.bringToFront()
    await page.goto(
      `chrome-extension://${dev.extensionId}/options.html#account`,
      { waitUntil: "domcontentloaded", timeout: 120000 },
    )
    await page
      .getByTestId(ids.addAccountButton)
      .or(page.getByTestId(ids.emptyStateAddAccountButton))
      .first()
      .waitFor({ timeout: 120000 })
    readAccount = () =>
      page.evaluate(
        async ({ target, expectedId }) => {
          const raw = await browser.storage.local.get("site_accounts")
          const data =
            typeof raw.site_accounts === "string"
              ? JSON.parse(raw.site_accounts)
              : raw.site_accounts
          return data?.accounts?.find(
            (a) =>
              a.site_url === target && String(a.account_info.id) === expectedId,
          )
        },
        { target, expectedId },
      )
    assert(
      !(await readAccount()),
      "This profile already contains the target account; preserve it and use a fresh test profile",
    )
    await openAccountAddDialog({ page, targetUrl: target })
    await detectAccountSiteType({
      page,
      expectedType: "sub2api",
      timeoutMs: 60000,
    })
    const dialog = await assertAccountDetectionOutcome({
      page,
      expectedType: "sub2api",
      fields: { userIdInput: expectedId, usernameInput: username },
      saveState: "enabled",
    })
    await expect(
      dialog.getByTestId(ids.sub2apiBrowserSessionOption).getByRole("radio"),
    ).toBeChecked()
    await dialog.screenshot({
      path: path.join(output, "detected.png"),
      animations: "disabled",
    })
    result.detection = "passed"
    saveSubmitted = true
    await dialog.getByTestId(ids.confirmAddButton).click()
    await dialog.waitFor({ state: "hidden", timeout: 60000 })
    const account = readAccount
    await expect
      .poll(async () => Boolean(await account()), { timeout: 30000 })
      .toBe(true)
    const saved = await account()
    savedId = saved.id
    assert(
      !saved.login?.credentials?.password,
      "Default flow unexpectedly saved a password",
    )
    assert(
      !saved.sub2apiAuth?.refreshToken,
      "Default flow took over website refresh credentials",
    )
    result.save = "passed"
    const keyPrompt = page.getByRole("dialog", {
      name: /^(Create API Key|创建 API Key|创建 API 密钥)$/,
    })
    if (await keyPrompt.isVisible())
      await keyPrompt.getByRole("button", { name: /^(Cancel|取消)$/ }).click()
    const row = page.getByTestId(getAccountManagementListItemTestId(savedId))
    await row.hover()
    await row.getByTestId(ids.rowEditButton).click()
    const edit = page.getByTestId(ids.accountDialog)
    await expect(edit.getByTestId(ids.userIdInput)).toHaveValue(expectedId)
    await expect(
      edit.getByTestId(ids.sub2apiBrowserSessionOption).getByRole("radio"),
    ).toBeChecked()
    await edit.getByRole("button", { name: /^(Cancel|取消)$/ }).click()
    result.reopen = "passed"
    const refresh = async () => {
      const before = (await account()).last_sync_time
      await row.hover()
      await row.getByTestId(ids.rowMoreActionsButton).click()
      await page.getByTestId(ids.rowRefreshMenuItem).click()
      await expect
        .poll(async () => (await account()).last_sync_time, { timeout: 60000 })
        .toBeGreaterThan(before)
      assert.equal((await account()).health.status, "healthy")
    }
    await refresh()
    result.refresh = "passed"
    await site.close()
    site = null
    assert.equal(
      dev.context.pages().filter((p) => p.url().startsWith(target)).length,
      0,
      "Close other target-site pages before testing page-free recovery",
    )
    await page.reload()
    await row.waitFor({ timeout: 60000 })
    await refresh()
    result.closedPageRefresh = "passed"
    await page.screenshot({ path: path.join(output, "saved-refreshed.png") })
  } catch (error) {
    result.error = error.message
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {})
    throw error
  } finally {
    try {
      if (!savedId && saveSubmitted) savedId = (await readAccount())?.id
      if (savedId) {
        await page.keyboard.press("Escape")
        const row = page.getByTestId(
          getAccountManagementListItemTestId(savedId),
        )
        await row.hover()
        await row.getByTestId(ids.rowMoreActionsButton).click()
        await page.getByTestId(ids.rowDeleteMenuItem).click()
        await page.getByTestId(ids.deleteConfirmButton).click()
        await row.waitFor({ state: "hidden" })
      }
      result.cleanup = savedId
        ? "owned extension account removed; website login retained in dedicated profile"
        : saveSubmitted
          ? "failed: submitted account could not be identified for cleanup"
          : "no owned extension account created; website login retained in dedicated profile"
    } catch (error) {
      result.cleanup = "failed: " + error.message
    }
    dev.context.off("response", listener)
    await fs.writeFile(
      path.join(output, "result.json"),
      JSON.stringify({ ...result, identityResponses: reads }, null, 2) + "\n",
    )
    await site?.close().catch(() => {})
    await page.close().catch(() => {})
    await dev.close()
    console.log(JSON.stringify({ ...result, evidence: output }))
    assert(!result.cleanup.startsWith("failed"), "Owned account cleanup failed")
  }
}
