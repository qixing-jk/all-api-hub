#!/usr/bin/env node
// Run with --isolate against the current dev build. Uses synthetic saved accounts,
// checks configuration persistence/focus, and does not invoke check-in execution.
// Add --zh to capture the same workflow in Simplified Chinese.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { createExtensionWorkerEvaluator } from "../e2e/utils/extensionWorkerEvaluator.ts"
import { getAccountManagementListItemTestId } from "../src/features/AccountManagement/testIds.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts, withTemporaryAccount } from "./cdp/sandbox.mjs"
import { openExtensionPage } from "./cdp/ui-driver.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
assert.ok(
  applyIsolateFlag(process.argv),
  "Use --isolate for the owned test profile",
)
const evidenceDir = path.resolve(
  `.scratch/xingya-checkin/evidence/guidance-${Date.now()}`,
)
const language = process.argv.includes("--zh") ? "zh-CN" : "en"
const { login: loginCopy } = JSON.parse(
  await fs.readFile(
    new URL(`../src/locales/${language}/accountDialog.json`, import.meta.url),
    "utf8",
  ),
)
await fs.mkdir(evidenceDir, { recursive: true })
const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(".output/chrome-mv3-dev"),
})
const cases = [
  {
    origin: "https://xingya.site",
    methodId: "xingya:daily-checkin",
    title: loginCopy.sessionCheckInTitle,
  },
  {
    origin: "https://runanytime.hxi.me",
    methodId: "new-api:daily-checkin",
    title: loginCopy.nativeCheckInTitle,
  },
]
const results = []
let page
try {
  page = await openExtensionPage({
    context: dev.context,
    extensionId: dev.extensionId,
    route: "options.html#account",
    language,
    viewport: { width: 1440, height: 1000 },
    dismissUpdateLog: true,
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  const worker = await createExtensionWorkerEvaluator(
    dev.context,
    dev.extensionId,
  )
  for (const scenario of cases) {
    await withTemporaryAccount(
      worker,
      {
        configVersion: 8,
        site_name: `Login guidance ${scenario.methodId}`,
        site_url: scenario.origin,
        site_type: "new-api",
        authType: "access_token",
        account_info: {
          id: "811",
          username: "guidance-fixture",
          access_token: "guidance-fixture-not-a-credential",
        },
        checkIn: {
          automaticExecutionEnabled: false,
          selection: { mode: "manual", methodId: scenario.methodId },
          methodKnowledge: {
            methods: {
              [scenario.methodId]: {
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: Date.now() },
                },
              },
            },
          },
        },
      },
      async (fixture) => {
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.reload({ waitUntil: "domcontentloaded" })
        const row = page.getByTestId(
          getAccountManagementListItemTestId(fixture.id),
        )
        const open = async () => {
          await row.hover()
          await row.getByTestId("account-management-row-edit-button").click()
          await expect(page.getByRole("dialog")).toBeVisible()
        }
        await open()
        const dialog = page.getByRole("dialog")
        const section = dialog.getByTestId(
          "account-management-account-form-section-check-in",
        )
        await expect(
          section.getByText(scenario.title, { exact: true }),
        ).toBeVisible({ timeout: 60000 })
        await section.screenshot({
          path: path.join(
            evidenceDir,
            `${scenario.methodId.split(":")[0]}-missing.png`,
          ),
          animations: "disabled",
        })
        await section
          .getByRole("button", { name: loginCopy.configure, exact: true })
          .click()
        const method = dialog.getByRole("combobox", {
          name: loginCopy.method,
          exact: true,
        })
        await expect(method).toBeFocused()
        await method.click()
        await page
          .getByRole("option", { name: "Linux DO", exact: true })
          .click()
        await dialog
          .getByRole("button", {
            name: language === "zh-CN" ? "保存更改" : "Save Changes",
            exact: true,
          })
          .click()
        await expect(dialog).toBeHidden()
        await expect
          .poll(
            async () =>
              (await getAccounts(worker)).find((a) => a.id === fixture.id)
                ?.login?.methodId,
          )
          .toBe("linuxdo")
        await open()
        await expect(method).toHaveText("Linux DO")
        await expect(
          section.getByRole("button", {
            name: loginCopy.change,
            exact: true,
          }),
        ).toBeVisible()
        await section.screenshot({
          path: path.join(
            evidenceDir,
            `${scenario.methodId.split(":")[0]}-configured.png`,
          ),
          animations: "disabled",
        })
        await page.setViewportSize({ width: 390, height: 844 })
        await section
          .getByRole("button", { name: loginCopy.change, exact: true })
          .click()
        await expect(method).toBeFocused()
        await page.bringToFront()
        const loginSection = dialog.getByTestId(
          "account-management-account-form-section-login",
        )
        await expect(loginSection).not.toHaveClass(/ring-theme-500/)
        await loginSection.screenshot({
          path: path.join(
            evidenceDir,
            `${scenario.methodId.split(":")[0]}-mobile.png`,
          ),
          animations: "disabled",
        })
        await dialog
          .getByRole("button", {
            name: language === "zh-CN" ? "取消" : "Cancel",
            exact: true,
          })
          .click()
        results.push({
          methodId: scenario.methodId,
          configurationSavedAndReopened: true,
          desktopAndMobileFocus: true,
        })
      },
    )
  }
  await fs.writeFile(
    path.join(evidenceDir, "result.json"),
    JSON.stringify(
      {
        extensionId: dev.extensionId,
        language,
        extensionPath: path.resolve(".output/chrome-mv3-dev"),
        fixture:
          "Configuration UI only; synthetic credentials; no check-in execution invoked",
        results,
        cleanup: "Temporary accounts removed by shared storage-lock helper",
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ evidenceDir, results }))
} finally {
  await page?.close().catch(() => {})
  await dev.close()
}
