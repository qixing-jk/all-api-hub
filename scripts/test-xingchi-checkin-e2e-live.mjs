import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "../src/features/AccountManagement/testIds.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { configureExtensionPage, createUiCapture } from "./cdp/ui-driver.mjs"
import {
  assertAccountDetectionOutcome,
  detectAccountSiteType,
  openAccountAddDialog,
} from "./flows/auto-detect.mjs"
import { assertXingchiClaimEvidence } from "./flows/xingchi-checkin.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
applyIsolateFlag(process.argv)
for (const arg of process.argv.slice(2)) {
  assert(
    ["--isolate", "--execute", "--expect-already-claimed"].includes(arg) ||
      arg.startsWith("--suite="),
    `Unknown argument: ${arg}`,
  )
}
const execute = process.argv.includes("--execute")
const expectedId = process.env.XINGCHI_EXPECTED_USER_ID
assert(
  expectedId,
  "Set XINGCHI_EXPECTED_USER_ID to the independently verified website identity",
)
const target = "https://xingchiapi.com"
const method = "xingchi:daily-checkin"
async function runAcceptance() {
  const output = path.resolve(
    ".scratch/pr-1935/artifacts",
    `live-${Date.now()}`,
  )
  await fs.mkdir(output, { recursive: true })
  const result = {
    target,
    execute,
    expectedId,
    coverage: {
      onboarding: "pending",
      discovery: "pending",
      saveReopen: "pending",
      redetection: "pending",
      firstGrant: "not-run",
      repeat: "not-run",
      nativeChallenge: "not-observed",
    },
    screenshots: [],
  }
  const dev = await connectWorktreeExtension({
    extensionPath: path.resolve(".output/chrome-mv3-dev"),
  })
  result.extensionId = dev.extensionId
  result.browser = dev.browser.version()
  const page = await dev.context.newPage()
  const requests = []
  const responses = []
  const responseTasks = []
  let savedId
  let saveSubmitted = false
  let readAccount
  const cleanupErrors = []
  const observeRequest = (r) => {
    const u = new URL(r.url())
    if (u.origin === target && u.pathname === "/api/v1/user/checkin")
      requests.push({ method: r.method(), url: r.url(), at: Date.now() })
  }
  const observeResponse = (r) => {
    const u = new URL(r.url())
    if (u.origin === target && u.pathname === "/api/v1/user/checkin")
      responseTasks.push(
        r
          .text()
          .then((body) =>
            responses.push({
              method: r.request().method(),
              url: r.url(),
              status: r.status(),
              body,
            }),
          )
          .catch((e) => responses.push({ url: r.url(), error: e.message })),
      )
  }
  dev.context.on("request", observeRequest)
  dev.context.on("response", observeResponse)
  const capture = createUiCapture({
    page,
    directory: output,
    screenshots: result.screenshots,
  })
  try {
    const site = dev.context
      .pages()
      .find((p) => p.url().startsWith(target + "/"))
    assert(
      site,
      "Prepare a verified website session in the isolated profile first",
    )
    const identity = await site.evaluate(async () => {
      const r = await fetch("/api/v1/auth/me", {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("auth_token"),
        },
      })
      const b = await r.json()
      return { status: r.status, id: String(b.data?.id ?? b.id) }
    })
    assert.equal(identity.status, 200)
    assert.equal(identity.id, expectedId)
    await configureExtensionPage(page, {
      language: "en",
      viewport: { width: 1500, height: 1150 },
      dismissUpdateLog: true,
    })
    await page.emulateMedia({ reducedMotion: "reduce" })
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
          const raw = (await browser.storage.local.get("site_accounts"))
            .site_accounts
          const data = typeof raw === "string" ? JSON.parse(raw) : raw
          const a = data?.accounts?.find(
            (a) =>
              a.site_url === target && String(a.account_info.id) === expectedId,
          )
          return a
            ? {
                id: a.id,
                site_type: a.site_type,
                userId: String(a.account_info.id),
                checkIn: a.checkIn,
                health: a.health,
                last_sync_time: a.last_sync_time,
                hasRefresh: !!a.sub2apiAuth?.refreshToken,
              }
            : null
        },
        { target, expectedId },
      )
    assert(
      !(await readAccount()),
      "Preserve an existing target account; use another isolated profile",
    )
    const dialog = await openAccountAddDialog({ page, targetUrl: target })
    await detectAccountSiteType({
      page,
      expectedType: "sub2api",
      timeoutMs: 90000,
    })
    await assertAccountDetectionOutcome({
      page,
      expectedType: "sub2api",
      fields: { userIdInput: expectedId },
      saveState: "enabled",
    })
    await expect(
      dialog.getByTestId(ids.sub2apiBrowserSessionOption).getByRole("radio"),
    ).toBeChecked()
    result.coverage.onboarding = "passed"
    const section = dialog.getByTestId(ids.accountFormSectionCheckIn)
    await section.scrollIntoViewIfNeeded()
    const detect = section.getByRole("button", {
      name: /^(Detect method|Re-detect check-in method)$/,
    })
    await detect.click()
    await expect(detect).not.toHaveAttribute("aria-busy", "true", {
      timeout: 90000,
    })
    await expect(section).toContainText(
      "Automatic selection: Xingchi daily check-in",
      { timeout: 90000 },
    )
    await capture("detected-method", section)
    result.coverage.discovery = "passed"
    assert.equal(
      requests.filter((r) => r.method === "POST").length,
      0,
      "Discovery must not submit a claim",
    )
    const automaticExecution = section.locator(
      "#account-check-in-automatic-execution",
    )
    if (!execute && (await automaticExecution.isChecked())) {
      await automaticExecution.click()
    }
    await expect(automaticExecution).toHaveAttribute(
      "aria-checked",
      String(execute),
    )
    saveSubmitted = true
    await dialog.getByTestId(ids.confirmAddButton).click()
    await dialog.waitFor({ state: "hidden", timeout: 60000 })
    await expect
      .poll(async () => Boolean(await readAccount()), { timeout: 30000 })
      .toBe(true)
    savedId = (await readAccount()).id
    const keyPrompt = page.getByRole("dialog", {
      name: /^(Create API Key|创建 API Key|创建 API 密钥)$/,
    })
    await page.addLocatorHandler(keyPrompt, async () => {
      await keyPrompt.getByRole("button", { name: /^(Cancel|取消)$/ }).click()
    })
    const saved = await readAccount()
    assert.equal(saved.checkIn.automaticExecutionEnabled, execute)
    assert.equal(saved.checkIn.selection.mode, "automatic")
    assert.equal(saved.checkIn.selection.methodId, method)
    assert.equal(saved.hasRefresh, false)
    const row = page.getByTestId(getAccountManagementListItemTestId(savedId))
    await row.hover()
    await row.getByTestId(ids.rowEditButton).click()
    await dialog.waitFor({ state: "visible" })
    await section.scrollIntoViewIfNeeded()
    await expect(section).toContainText(
      "Automatic selection: Xingchi daily check-in",
    )
    await expect(automaticExecution).toHaveAttribute(
      "aria-checked",
      String(execute),
    )
    await capture("saved-method", section)
    result.coverage.saveReopen = "passed"
    await detect.click()
    await expect(detect).not.toHaveAttribute("aria-busy", "true", {
      timeout: 90000,
    })
    await expect(section).toContainText(
      "Automatic selection: Xingchi daily check-in",
    )
    await expect(automaticExecution).toHaveAttribute(
      "aria-checked",
      String(execute),
    )
    result.coverage.redetection = "passed"
    await dialog.getByTestId(ids.confirmAddButton).click()
    await dialog.waitFor({ state: "hidden", timeout: 60000 })
    if (execute) {
      const readResult = () =>
        page.evaluate(async (id) => {
          const raw = (await browser.storage.local.get("autoCheckin_status"))
            .autoCheckin_status
          const state = typeof raw === "string" ? JSON.parse(raw) : raw
          return state?.perAccount?.[id]
        }, savedId)
      const run = async () => {
        const before = await readResult()
        // Reopen the ordinary account page so a completed prior action cannot
        // still own its UI in-flight guard while persistence has already settled.
        await page.reload({ waitUntil: "domcontentloaded" })
        await row.waitFor({ timeout: 60000 })
        await row.hover()
        await row.getByTestId(ids.rowMoreActionsButton).click()
        await page.getByTestId(ids.rowQuickCheckinMenuItem).click()
        let latest
        await expect
          .poll(
            async () => {
              latest = await readResult()
              return Boolean(
                latest &&
                JSON.stringify(latest) !== JSON.stringify(before) &&
                [
                  "success",
                  "already_checked",
                  "skipped",
                  "failed",
                  "uncertain",
                ].includes(latest.status),
              )
            },
            { timeout: 120000 },
          )
          .toBe(true)
        return latest
      }
      const first = await run()
      result.first = first
      if (process.argv.includes("--expect-already-claimed")) {
        assert(
          first.status === "already_checked" ||
            first.reasonCode === "already_checked_today",
          "Expected an already-claimed account",
        )
        assert.equal(
          requests.filter((r) => r.method === "POST").length,
          0,
          "An already-claimed account must not POST",
        )
      }
      assertXingchiClaimEvidence(first, requests)
      result.coverage.firstGrant =
        first.status === "success" ? "passed" : "blocked-already-claimed"
      await capture("first-result", row)
      const postCount = requests.filter((r) => r.method === "POST").length
      const repeat = await run()
      result.repeat = repeat
      assert(
        repeat.status === "already_checked" ||
          repeat.reasonCode === "already_checked_today",
      )
      assert.equal(
        requests.filter((r) => r.method === "POST").length,
        postCount,
        "Repeat must not POST again",
      )
      result.coverage.repeat = "passed"
      const readback = await site.evaluate(async () => {
        const r = await fetch("/api/v1/user/checkin", {
          headers: {
            Authorization: "Bearer " + localStorage.getItem("auth_token"),
          },
        })
        return { status: r.status, body: await r.json() }
      })
      result.nativeAfter = readback
      assert.equal(readback.status, 200)
      assert.equal(readback.body.data.claimed_today, true)
      await site.reload({ waitUntil: "domcontentloaded" })
      await expect(
        site.getByText(/Already claimed|Claimed today/i).first(),
      ).toBeVisible({ timeout: 30000 })
      await capture("native-after", site)
      await page.evaluate(() => {
        location.hash = "autoCheckin"
      })
      await page
        .getByTestId("auto-checkin-run-now-button")
        .waitFor({ timeout: 30000 })
      await expect(page.locator("body")).toContainText(/Xingchi|星驰/)
      await capture("checkin-results")
    }
    result.account = await readAccount()
    assert.equal(result.account.checkIn.automaticExecutionEnabled, execute)
  } catch (error) {
    result.error = error.message
    await capture("failure").catch((e) =>
      cleanupErrors.push("capture: " + e.message),
    )
  } finally {
    try {
      if (!savedId && saveSubmitted) savedId = (await readAccount())?.id
      if (savedId) {
        await page.keyboard.press("Escape")
        await page.evaluate(() => {
          location.hash = "account"
        })
        const row = page.getByTestId(
          getAccountManagementListItemTestId(savedId),
        )
        await row.waitFor({ timeout: 30000 })
        await row.hover()
        await row.getByTestId(ids.rowMoreActionsButton).click()
        await page.getByTestId(ids.rowDeleteMenuItem).click()
        await page.getByTestId(ids.deleteConfirmButton).click()
        await row.waitFor({ state: "hidden" })
        assert(!(await readAccount()), "Owned account cleanup failed")
      }
    } catch (e) {
      cleanupErrors.push(e.message)
    }
    await Promise.allSettled(responseTasks)
    dev.context.off("request", observeRequest)
    dev.context.off("response", observeResponse)
    if (!execute && requests.some((request) => request.method === "POST")) {
      result.error =
        "Read-only acceptance must not submit a claim, including before cleanup"
    }
    result.cleanupErrors = cleanupErrors
    result.finishedAt = new Date().toISOString()
    await fs.writeFile(
      path.join(output, "report.json"),
      JSON.stringify(result, null, 2),
    )
    await fs.writeFile(
      path.join(output, "network.json"),
      JSON.stringify({ requests, responses }, null, 2),
    )
    await page.close()
    await dev.close()
    console.log(
      JSON.stringify({
        output,
        coverage: result.coverage,
        error: result.error,
        cleanupErrors,
      }),
    )
  }
  if (result.error || cleanupErrors.length)
    throw new Error([result.error, ...cleanupErrors].filter(Boolean).join("; "))
  if (
    !execute ||
    (result.coverage.firstGrant !== "passed" &&
      !process.argv.includes("--expect-already-claimed"))
  )
    return {
      skipped: true,
      reason: !execute
        ? "Read-only mode; claim and repeat not selected"
        : "Already claimed; no fresh grant available",
    }
}

await runLiveSuites({
  suite:
    process.argv.find((arg) => arg.startsWith("--suite="))?.slice(8) ?? "all",
  evidenceDir: path.resolve(".scratch/pr-1935/artifacts"),
  environment: { target, execute },
  suites: [
    {
      id: "onboarding-checkin",
      covers: [
        "normal-onboarding",
        "discovery",
        "save-reopen",
        "redetection",
        ...(process.argv.includes("--expect-already-claimed")
          ? ["already-claimed-no-post"]
          : ["fresh-claim"]),
        "repeat-no-post",
        "native-readback",
        "owned-account-cleanup",
      ],
      run: runAcceptance,
    },
  ],
})
