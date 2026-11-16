import { writeFile } from "node:fs/promises"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import en from "~/locales/en/accountDialog.json" with { type: "json" }
import zh from "~/locales/zh-CN/accountDialog.json" with { type: "json" }
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedAutoCheckinStatus,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

// Feedback collection uses real extension storage and UI with controlled site responses.
// Storage read faults verify collection recovery. No check-in command is triggered.
const cases = [
  { id: "no-history", history: null, expected: undefined },
  { id: "saved-success", history: "success", expected: "success" },
  { id: "saved-failed", history: "failed", expected: "failed" },
  { id: "saved-skipped", history: "skipped", expected: "skipped" },
  { id: "saved-uncertain", history: "uncertain", expected: "uncertain" },
  {
    id: "saved-already-checked",
    history: "already_checked",
    expected: "already_checked",
  },
  {
    id: "storage-read-failed",
    history: "failed",
    expected: undefined,
    fault: "storage",
  },
  { id: "invalid-record", history: "unknown-status", expected: undefined },
  {
    id: "storage-read-failed-mobile-en",
    history: "failed",
    expected: undefined,
    fault: "storage",
    width: 390,
    language: "en",
  },
  {
    id: "storage-read-failed-mobile",
    history: "failed",
    expected: undefined,
    fault: "storage",
    width: 390,
  },
  {
    id: "storage-read-failed-dark-en",
    history: "failed",
    expected: undefined,
    fault: "storage",
    theme: "dark",
    language: "en",
  },
  {
    id: "saved-success-dark-en",
    history: "success",
    expected: "success",
    theme: "dark",
    language: "en",
  },
  { id: "no-history-mobile", history: null, expected: undefined, width: 390 },
  {
    id: "collecting-mobile",
    history: null,
    expected: undefined,
    width: 390,
    pauseScan: true,
  },
] as const

for (const scenario of cases) {
  test(`execution feedback: ${scenario.id}`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    const language = "language" in scenario ? scenario.language : "zh-CN"
    const copy = (language === "en" ? en : zh).checkInFeedback
    const theme = "theme" in scenario ? scenario.theme : "light"
    const siteRequests: string[] = []
    const baseUrl = "https://issue1880.example.invalid"
    const accountId = "issue1880-probe"
    const accountName = "签到反馈复现账号"
    const worker = await getServiceWorker(context)
    let resumeScan!: () => void
    const scanGate =
      "pauseScan" in scenario
        ? new Promise<void>((resolve) => {
            resumeScan = resolve
          })
        : Promise.resolve()
    await stubLlmMetadataIndex(context)
    await context.route(`${baseUrl}/**`, async (route) => {
      await scanGate
      const pathname = new URL(route.request().url()).pathname
      siteRequests.push(`${route.request().method()} ${pathname}`)
      if (route.request().isNavigationRequest()) {
        return route.fulfill({
          contentType: "text/html",
          body: "<html><head><title>Diagnostic fixture</title></head><body>checkin</body></html>",
        })
      }
      return route.fulfill({
        json:
          pathname === "/api/user/self"
            ? {
                success: true,
                data: { id: 1, username: "e2e-user", quota: 1000 },
              }
            : {
                success: true,
                data: { enabled: true, checked_in_today: false },
              },
      })
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: accountId,
        site_name: accountName,
        site_url: baseUrl,
        site_type: SITE_TYPES.NEW_API,
        checkIn: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.NEW_API,
          supported: true,
          automaticExecutionEnabled: true,
        }),
      }),
    ])
    await seedUserPreferences(worker, {
      themeMode: theme,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: false,
      },
    })
    await expect
      .poll(() => getPlasmoStorageJsonValue(worker, "autoCheckin_status"))
      .toBeTruthy()
    const timestamp = Date.now() - 3600000
    await seedAutoCheckinStatus(worker, {
      perAccount: scenario.history
        ? {
            [accountId]: {
              accountId,
              accountName,
              timestamp,
              status: scenario.history,
              ...(scenario.history === "uncertain"
                ? { reconciliation: "unknown" }
                : {}),
              rawMessage: `Fixture historical ${scenario.history}`,
            },
          }
        : {},
      accountsSnapshot: [],
    } as any)
    const fault = "fault" in scenario ? scenario.fault : null
    await page.addInitScript(
      ({ fault }) => {
        const api = (globalThis as any).browser ?? (globalThis as any).chrome
        if (fault === "storage") {
          const original = api.storage.local.get.bind(api.storage.local)
          api.storage.local.get = async (keys: unknown) => {
            const targets =
              typeof keys === "string"
                ? [keys]
                : Array.isArray(keys)
                  ? keys
                  : Object.keys(keys ?? {})
            if (
              targets.includes("autoCheckin_status") &&
              !sessionStorage.getItem("execution-read-restored")
            )
              throw new Error("Fixture execution storage unavailable")
            return original(keys)
          }
        }
      },
      { fault },
    )
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, language)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({
      width: "width" in scenario ? scenario.width : 1150,
      height: 950,
    })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await waitForExtensionRoot(page)
    const row = page.getByTestId(getAccountManagementListItemTestId(accountId))
    await expect(row).toBeVisible()
    await row.hover()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await page
      .getByRole("menuitem", {
        name: new RegExp(`${copy.feedback}|${copy.request}`),
      })
      .click()
    const dialog = page.getByRole("dialog", { name: copy.title, exact: true })
    await expect(dialog.getByLabel(copy.notes)).toBeVisible()
    await expect(dialog.getByLabel(copy.notes)).not.toHaveAttribute("required")
    if ("pauseScan" in scenario) {
      await expect(
        dialog.getByText(copy.scanning, { exact: true }),
      ).toBeVisible()
      await expect(
        dialog.getByRole("button", { name: copy.open }),
      ).toBeEnabled()
      await dialog.screenshot({
        path: testInfo.outputPath("feedback-collecting.png"),
        animations: "disabled",
      })
      resumeScan()
    }
    await expect(
      dialog.getByText(copy.scanning, { exact: true }),
    ).not.toBeVisible()
    await dialog.getByLabel(copy.notes).fill(`诊断对照：${scenario.id}`)
    await dialog.getByText(copy.preview, { exact: true }).click()
    const report = await dialog.getByLabel(copy.fullReport).inputValue()
    const execution = /<th scope="row">execution<\/th><td>([^<]+)<\/td>/.exec(
      report,
    )?.[1]
    expect(execution).toBe(scenario.expected)
    const recordState =
      fault === "storage"
        ? "read_failed"
        : scenario.history
          ? scenario.expected
            ? "available"
            : "invalid_record"
          : "no_history"
    expect(report).toContain(`execution record</th><td>${recordState}</td>`)
    expect(report).toContain("execution source</th><td>saved_history</td>")
    expect(report).not.toContain("command outcome</th>")
    expect(report).not.toContain("command stage</th>")
    if (recordState === "no_history") {
      await expect(
        dialog.getByRole("button", { name: copy.retryExecution }),
      ).toHaveCount(0)
      await expect(
        dialog.getByText(/暂无已保存的执行记录|No saved execution record/),
      ).toHaveCount(0)
    }
    if (recordState === "read_failed" || recordState === "invalid_record") {
      const message =
        recordState === "read_failed"
          ? copy.executionReadFailed
          : copy.executionInvalid
      const notice = dialog.getByRole("status", { name: message })
      await expect(notice).toBeVisible()
      const retry = notice.getByRole("button", { name: copy.retryExecution })
      await expect(retry).toHaveAccessibleDescription(message)
      await expect(retry).toBeEnabled()
      const emphasis = await notice.evaluate((element) => {
        const title = element.querySelector("[id]")!
        const titleStyle = getComputedStyle(title)
        const noticeStyle = getComputedStyle(element)
        const button = element.querySelector("button")!
        const normalText =
          element.parentElement!.querySelector('[role="status"] p')!
        const normalStyle = getComputedStyle(normalText)
        const icon = element.querySelector("svg")!
        const normalIcon = normalText
          .closest('[role="status"]')!
          .querySelector("svg")!
        const textRect = title.getBoundingClientRect()
        const iconRect = icon.getBoundingClientRect()
        const normalTextRect = normalText.getBoundingClientRect()
        const normalIconRect = normalIcon.getBoundingClientRect()
        return {
          fontSize: Number.parseFloat(titleStyle.fontSize),
          normalFontSize: Number.parseFloat(normalStyle.fontSize),
          textColor: titleStyle.color,
          normalTextColor: normalStyle.color,
          iconColor: getComputedStyle(element.querySelector("svg")!).color,
          iconCenterOffset:
            iconRect.y +
            iconRect.height / 2 -
            textRect.y -
            Number.parseFloat(titleStyle.lineHeight) / 2,
          normalIconCenterOffset:
            normalIconRect.y +
            normalIconRect.height / 2 -
            normalTextRect.y -
            Number.parseFloat(normalStyle.lineHeight) / 2,
          textLeft: textRect.x,
          normalTextLeft: normalTextRect.x,
          iconLeft: iconRect.x,
          normalIconLeft: normalIconRect.x,
          background: noticeStyle.backgroundColor,
          borderWidth: Number.parseFloat(noticeStyle.borderLeftWidth),
          buttonBorder: Number.parseFloat(
            getComputedStyle(button).borderTopWidth,
          ),
          overflow: element.scrollWidth > element.clientWidth,
        }
      })
      expect(emphasis.fontSize).toBe(emphasis.normalFontSize)
      expect(emphasis.textColor).toBe(emphasis.normalTextColor)
      expect(emphasis.textLeft).toBe(emphasis.normalTextLeft)
      expect(emphasis.iconLeft).toBe(emphasis.normalIconLeft)
      expect(
        Math.abs(emphasis.iconCenterOffset - emphasis.normalIconCenterOffset),
      ).toBeLessThanOrEqual(0.5)
      expect(emphasis.iconColor).not.toBe(emphasis.textColor)
      expect(emphasis.background).toBe("rgba(0, 0, 0, 0)")
      expect(emphasis.borderWidth).toBe(0)
      expect(emphasis.buttonBorder).toBe(0)
      expect(emphasis.overflow).toBe(false)
      await writeFile(
        testInfo.outputPath("failure-emphasis.json"),
        JSON.stringify(emphasis, null, 2),
      )
    }
    if (scenario.expected && fault !== "storage")
      expect(report).toContain(new Date(timestamp).toISOString())
    await writeFile(testInfo.outputPath("feedback-report.md"), report)
    await dialog
      .getByTestId("checkin-feedback-preview")
      .locator("summary")
      .filter({ hasText: copy.details })
      .click()
    await dialog.getByTestId("checkin-feedback-preview").screenshot({
      path: testInfo.outputPath("report-preview.png"),
      animations: "disabled",
    })
    await dialog.getByText(copy.preview, { exact: true }).click()
    await dialog.screenshot({
      path: testInfo.outputPath("feedback-dialog.png"),
      animations: "disabled",
    })
    if (fault === "storage") {
      await dialog.getByText(copy.preview, { exact: true }).click()
      await expect(
        dialog.getByText(copy.scanning, { exact: true }),
      ).not.toBeVisible()
      await dialog.getByText(copy.editReport, { exact: true }).click()
      await dialog
        .getByLabel(copy.clues, { exact: true })
        .fill("Keep my manually edited clue")
      await page.evaluate(() =>
        sessionStorage.setItem("execution-read-restored", "1"),
      )
      await dialog.getByRole("button", { name: copy.retryExecution }).click()
      await expect
        .poll(() => dialog.getByLabel(copy.fullReport).inputValue())
        .toContain("execution record</th><td>available</td>")
      const reloaded = await dialog.getByLabel(copy.fullReport).inputValue()
      expect(reloaded).toContain("execution</th><td>failed</td>")
      expect(reloaded).toContain(`诊断对照：${scenario.id}`)
      expect(reloaded).toContain("Keep my manually edited clue")
      expect(reloaded).not.toContain("read_failed")
      await expect(
        dialog.getByRole("status", { name: copy.executionReadFailed }),
      ).toHaveCount(0)
      await writeFile(testInfo.outputPath("feedback-reloaded.md"), reloaded)
      await dialog.getByText(copy.preview, { exact: true }).click()
      await dialog.screenshot({
        path: testInfo.outputPath("feedback-reloaded.png"),
        animations: "disabled",
      })
    }
    expect(
      siteRequests.filter((request) => request.startsWith("POST ")),
    ).toEqual([])
    console.log(
      JSON.stringify({
        case: scenario.id,
        seededHistory: scenario.history,
        fault,
        observedExecution: execution,
        checkinTriggered: false,
      }),
    )
  })
}
