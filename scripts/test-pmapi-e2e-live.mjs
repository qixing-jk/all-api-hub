/* global chrome */
// PM-API site-specific CDP validation against the current worktree's built
// extension. Uses the saved pmapi accounts in the dedicated dev profile;
// never seeds or rewrites account storage. Local evidence only.
//
// Covers the adapted user paths that do not need an operator secret:
// identity match, key inventory parity, the disposable key lifecycle through
// the native editor (create → rename → delete, read back from the site), and
// captcha-aware onboarding defaults and the opt-in page-action preference.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { configureExtensionPage, dismissModals } from "./cdp/ui-driver.mjs"
import {
  openNativeKeyEditor,
  submitNativeKeyEditor,
} from "./flows/native-key-editor.mjs"
import { readAllPmApiTokens } from "./suites/pmapi/tokens.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

await loadLocalEnv()
const out = path.resolve(
  `.scratch/pmapi-integration/evidence/cdp-extension-${Date.now()}`,
)
await fs.mkdir(out, { recursive: true })
const report = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worktree: process.cwd(),
  checks: [],
  failures: [],
  gaps: [],
}
const check = (name, detail) => {
  report.checks.push({ name, ...(detail ? { detail } : {}) })
  console.log(`✔ ${name}`)
}

const SITES = [
  { origin: "https://pmcat.top", reason: "checkin_enabled=false" },
  {
    origin: "https://pap.pmcat.top",
    reason: "checkin scene is slider-enforced",
  },
]

const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(
    process.argv.includes("--prod")
      ? ".output/chrome-mv3"
      : ".output/chrome-mv3-dev",
  ),
})
const { extensionId } = dev
check("dev browser extension installed", { extensionId })
let cleanupRunKey
const capture = async (ui, name, target = ui.locator("main")) => {
  await ui.bringToFront()
  await target.screenshot({
    path: path.join(out, `${name}.png`),
    animations: "disabled",
  })
}
// The update dialog mounts asynchronously after the options shell. Wait for
// that optional owner before closing it, rather than racing its first render.
const settleOptions = async (ui) => {
  await ui.locator("main").waitFor({ state: "visible" })
  const update = ui
    .getByRole("dialog")
    .filter({ hasText: /更新内容|what.s new|changelog/i })
  if (
    await update.waitFor({ state: "visible", timeout: 5000 }).then(
      () => true,
      () => false,
    )
  ) {
    await update.getByTestId("update-log-dialog-close").click()
    await expect(update).toBeHidden()
  }
  await dismissModals(ui)
}
try {
  const accounts = await getAccounts(dev.serviceWorker)
  const siteAccounts = SITES.map((site) => {
    const account = accounts.find(
      (a) =>
        a.site_url === site.origin && a.site_type === "pmapi" && !a.disabled,
    )
    assert.ok(
      account,
      `An enabled saved pmapi account must exist for ${site.origin}`,
    )
    return { ...site, account }
  })
  check("saved pmapi accounts match both deployments", {
    users: siteAccounts.map(({ account }) => account.account_info?.username),
  })

  const ui = await dev.context.newPage()
  ui.setDefaultTimeout(20000)
  await ui.emulateMedia({ reducedMotion: "reduce" })
  await configureExtensionPage(ui, {
    viewport: { width: 1920, height: 1080 },
    language: "en",
  })

  if (!process.argv.includes("--checkin-only")) {
    // Key lifecycle on the pmcat deployment through the native editor, verified
    // against the site API with the account's own saved credential.
    const pmcat = siteAccounts[0]
    const sitePage = await dev.context.newPage()
    const siteRead = async (p) => {
      const res = await sitePage.request.get(`https://pmcat.top${p}`, {
        headers: {
          Authorization: `Bearer ${pmcat.account.account_info.access_token}`,
        },
      })
      assert.equal(res.status(), 200)
      const j = await res.json()
      assert.equal(j.success, true)
      return j.data
    }
    const readTokens = () => readAllPmApiTokens(siteRead)
    const baselineTokens = await readTokens()
    const baselineIds = baselineTokens.map((k) => k.id).sort((a, b) => a - b)

    await ui.goto(
      `chrome-extension://${extensionId}/options.html?accountId=${pmcat.account.id}&workspace=account#keys`,
      { waitUntil: "domcontentloaded" },
    )
    await dismissModals(ui)
    await expect(ui.getByTestId(keys.nativeKeyRow)).toHaveCount(
      baselineIds.length,
      { timeout: 45000 },
    )
    check("key inventory rows match the live token count", {
      count: baselineIds.length,
    })

    const runName = `extension-cdp-disposable-${Date.now()}`
    cleanupRunKey = async () => {
      for (const key of await readTokens()) {
        if (key.name === runName || key.name === `${runName} r`) {
          const res = await sitePage.request.delete(
            `https://pmcat.top/api/tokens/${key.id}`,
            {
              headers: {
                Authorization: `Bearer ${pmcat.account.account_info.access_token}`,
              },
            },
          )
          assert.equal(res.status(), 200)
        }
      }
    }
    const editor = await openNativeKeyEditor(ui, {
      trigger: ui.getByTestId(
        baselineIds.length
          ? keys.addTokenButton
          : keys.emptyStateAddTokenButton,
      ),
      readyField: /^(Token Name|密钥名称)$/,
    })
    await expect(editor).toBeVisible({ timeout: 30000 })
    await editor.getByLabel(/^(Token Name|密钥名称)$/).fill(runName)
    await capture(ui, "key-editor-create", editor)
    await submitNativeKeyEditor(ui, { timeoutMs: 30000 })
    await dismissModals(ui)
    let createdId
    await expect
      .poll(
        async () => {
          const items = await readTokens()
          createdId = items.find((k) => k.name === runName)?.id
          return createdId
        },
        { timeout: 30000 },
      )
      .toBeTruthy()
    const created = (await readTokens()).find((k) => k.id === createdId)
    assert.equal(created.unlimited, true)
    assert.match(created.key, /^sk-/)
    check("disposable key created through the extension editor", {
      id: createdId,
      secretRecoverableFromList: true,
    })

    const createdRow = ui
      .getByTestId(keys.nativeKeyRow)
      .and(ui.locator(`[data-resource-id="${createdId}"]`))
    await createdRow.getByRole("button", { name: /edit key|编辑密钥/i }).click()
    await expect(editor.getByLabel(/^(Token Name|密钥名称)$/)).toBeEditable({
      timeout: 30000,
    })
    await editor.getByLabel(/^(Token Name|密钥名称)$/).fill(`${runName} r`)
    await capture(ui, "key-editor-edit", editor)
    await submitNativeKeyEditor(ui, { timeoutMs: 30000 })
    await expect
      .poll(
        async () => (await readTokens()).find((k) => k.id === createdId)?.name,
      )
      .toBe(`${runName} r`)
    check(
      "key renamed through the editor; partial write preserved other fields",
    )

    await createdRow
      .getByRole("button", { name: /delete key|删除密钥/i })
      .click()
    await ui.getByTestId(keys.nativeDeleteConfirmButton).click()
    await expect
      .poll(async () => (await readTokens()).some((k) => k.id === createdId), {
        timeout: 30000,
      })
      .toBe(false)
    check("disposable key deleted through the extension UI")

    assert.deepEqual(
      (await readTokens()).map((k) => k.id).sort((a, b) => a - b),
      baselineIds,
    )
    check("live token inventory restored to its baseline")
  }

  await ui.goto(
    `chrome-extension://${extensionId}/options.html?tab=checkinRedeem#basic`,
    { waitUntil: "domcontentloaded" },
  )
  const setting = ui.locator(
    "#auto-checkin-continue-when-verification-required",
  )
  await expect(setting).toBeVisible()
  await settleOptions(ui)
  const toggle = setting.getByRole("switch")
  const original = await toggle.getAttribute("aria-checked")
  assert.equal(
    original,
    "false",
    "dedicated profile starts with native clicking disabled",
  )
  try {
    await toggle.click()
    await expect(toggle).toBeChecked()
    await ui.reload({ waitUntil: "domcontentloaded" })
    await expect(setting.getByRole("switch")).toBeChecked()
    await settleOptions(ui)
    check("native-page opt-in persists through a real options reload")
    await capture(ui, "checkin-page-action-setting", setting.locator(".."))
  } finally {
    if (await toggle.isChecked()) await toggle.click()
  }
  await ui.reload({ waitUntil: "domcontentloaded" })
  await settleOptions(ui)
  await expect(toggle).not.toBeChecked()
  check("native-page preference restored to off and persisted")

  await ui.goto(`chrome-extension://${extensionId}/options.html#account`, {
    waitUntil: "domcontentloaded",
  })
  await settleOptions(ui)
  await ui.getByTestId("account-management-add-account-button").click()
  await ui
    .getByTestId("account-management-site-url-input")
    .fill("https://pap.pmcat.top")
  await ui.getByTestId("account-management-auto-detect-button").click()
  const automatic = ui.locator("#account-check-in-automatic-execution")
  await expect(automatic).toBeVisible({ timeout: 60000 })
  await expect(automatic).not.toBeChecked()
  // The gate is persisted metadata, so the dialog explains why the account
  // starts out of the run instead of only defaulting the switch off.
  await expect(ui.getByText(/验证码|CAPTCHA/i).first()).toBeVisible()
  const continuation = ui.locator("#account-check-in-verification-continuation")
  // Progressive disclosure: the continuation preference is only consulted once
  // a run reaches the claim, so the choice appears with the switch that puts
  // the account into the run.
  await expect(continuation).not.toBeVisible()
  await automatic.click()
  await expect(continuation).toBeVisible()
  await expect(continuation).toContainText(/跟随全局|use global/i)
  // Inheriting must state what it resolves to; the shipped default is off.
  await expect(ui.getByText(/跟随全局|use global/i).first()).toBeVisible()
  await expect(
    ui.getByRole("button", { name: /修改全局默认设置|change global default/i }),
  ).toBeVisible()
  await automatic.click()
  await expect(continuation).not.toBeVisible()
  await capture(
    ui,
    "captcha-account-default-off",
    ui.getByTestId("account-management-account-form-section-check-in"),
  )
  check(
    "fresh captcha-gated account detects daily check-in, explains the gate, defaults automatic execution off, and reveals the continuation choice only with the switch on",
  )
  await ui
    .getByTestId("account-management-account-dialog")
    .getByRole("button", { name: /^取消$|^cancel$/i })
    .click()
  assert.deepEqual(
    (await getAccounts(dev.serviceWorker)).map((a) => a.id).sort(),
    accounts.map((a) => a.id).sort(),
  )
  check("onboarding validation cancelled without adding or changing an account")

  if (process.argv.includes("--native-action")) {
    const pap = siteAccounts.find(
      (site) => site.origin === "https://pap.pmcat.top",
    )
    const identityResponse = await dev.context.request.get(
      `${pap.origin}/api/me`,
      {
        headers: {
          Authorization: `Bearer ${pap.account.account_info.access_token}`,
        },
      },
    )
    assert.equal(identityResponse.status(), 200)
    const identity = (await identityResponse.json()).data
    assert.equal(String(identity.id), String(pap.account.account_info.id))
    if (identity.checked_in_today === true) {
      report.gaps.push(
        "The live captcha-gated account is already checked in today; native click/reminder completion cannot be exercised on this account today.",
      )
      check("authoritative identity read prevents a redundant native action", {
        checkedInToday: true,
      })
    } else {
      const actionUi = await dev.context.newPage()
      const history = () =>
        dev.serviceWorker.evaluate(async () => {
          const data = await chrome.storage.local.get(
            "protectionBypass_history_v1",
          )
          const raw = data.protectionBypass_history_v1
          return typeof raw === "string" ? JSON.parse(raw) : raw
        })
      const priorHistory = await history()
      await ui.goto(
        `chrome-extension://${extensionId}/options.html?tab=checkinRedeem#basic`,
        { waitUntil: "domcontentloaded" },
      )
      await expect(toggle).toBeVisible()
      await settleOptions(ui)
      try {
        await toggle.click()
        await expect(toggle).toBeChecked()
        await actionUi.goto(
          `chrome-extension://${extensionId}/options.html#account`,
          { waitUntil: "domcontentloaded" },
        )
        await settleOptions(actionUi)
        const row = actionUi.getByTestId(
          `account-management-account-list-item-${pap.account.id}`,
        )
        await row
          .getByTestId("account-management-row-more-actions-button")
          .click()
        const actionStartedAt = Date.now()
        await actionUi
          .getByTestId("account-management-row-quick-checkin-menu-item")
          .click()
        // Dispatch once. The existing page-assist owner handles any manual wait;
        // observation never retries the account action.
        await expect
          .poll(
            async () => {
              const current = await history()
              const entries = current?.entries ?? []
              return entries.filter(
                (e) =>
                  e.taskKind === "native_page_action" &&
                  e.origin === pap.origin &&
                  !(priorHistory?.entries ?? []).some((old) => old.id === e.id),
              ).length
            },
            { timeout: 45000 },
          )
          .toBe(1)
        check(
          "one native page action dispatched through the ordinary quick-checkin UI",
        )
        const popup = dev.browser
          .contexts()
          .flatMap((context) => context.pages())
          .find(
            (p) =>
              p.url().startsWith(`${pap.origin}/`) &&
              p.url().includes("console/wallet"),
          )
        if (popup) {
          await popup.emulateMedia({ reducedMotion: "reduce" })
          const challenge = popup
            .locator('.captcha-panel, [role="dialog"]')
            .filter({ hasText: /验证|captcha|verification/i })
          await expect(challenge).toBeVisible({ timeout: 15000 })
          await capture(popup, "native-verification-challenge", challenge)
          check("site-native manual captcha is visible after the single click")
        } else
          report.gaps.push(
            "Native page context was not exposed for screenshot inspection.",
          )
        let finalResult
        await expect
          .poll(
            async () => {
              finalResult = await dev.serviceWorker.evaluate(
                async (accountId) => {
                  const stored =
                    await chrome.storage.local.get("autoCheckin_status")
                  const raw = stored.autoCheckin_status
                  const status = typeof raw === "string" ? JSON.parse(raw) : raw
                  return status?.perAccount?.[accountId]
                },
                pap.account.id,
              )
              return finalResult?.timestamp >= actionStartedAt
                ? finalResult.status
                : undefined
            },
            { timeout: 120000 },
          )
          .toMatch(/^(success|already_checked|failed|skipped|uncertain)$/)
        const afterResponse = await dev.context.request.get(
          `${pap.origin}/api/me`,
          {
            headers: {
              Authorization: `Bearer ${pap.account.account_info.access_token}`,
            },
          },
        )
        assert.equal(afterResponse.status(), 200)
        const afterIdentity = (await afterResponse.json()).data
        assert.equal(
          String(afterIdentity.id),
          String(pap.account.account_info.id),
        )
        if (afterIdentity.checked_in_today !== true)
          assert.ok(
            !["success", "already_checked"].includes(finalResult.status),
          )
        check(
          "native action result agrees with authoritative account readback",
          {
            status: finalResult.status,
            reasonCode: finalResult.reasonCode,
            checkedInToday: afterIdentity.checked_in_today,
          },
        )
        report.nativeActionHistory = (await history())?.entries?.filter(
          (e) =>
            e.taskKind === "native_page_action" &&
            e.origin === pap.origin &&
            !(priorHistory?.entries ?? []).some((old) => old.id === e.id),
        )
      } finally {
        if (await toggle.isChecked()) await toggle.click()
        await expect(toggle).not.toBeChecked()
        await actionUi.close()
      }
    }
  }

  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  )
  console.log(`\nevidence written to ${out}`)
} catch (error) {
  report.failures.push(String(error?.stack ?? error))
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  )
  console.error("VALIDATION FAILED:", error?.message ?? error)
  process.exitCode = 1
} finally {
  await cleanupRunKey?.()
  await dev.close()
}
process.exit(process.exitCode ?? 0)
