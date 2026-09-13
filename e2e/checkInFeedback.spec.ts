import { writeFile } from "node:fs/promises"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import en from "~/locales/en/accountDialog.json" with { type: "json" }
import zh from "~/locales/zh-CN/accountDialog.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const { width, language } of [
  { width: 1100, language: "en" },
  { width: 390, language: "en" },
  { width: 1100, language: "zh-CN" },
  { width: 390, language: "zh-CN" },
]) {
  const copy = (language === "en" ? en : zh).checkInFeedback
  test(`check-in feedback preserves account edits and exports clues at ${width}px (${language})`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 850 })
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, language)
    await stubLlmMetadataIndex(context)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            window.sessionStorage.setItem("feedback-copy", text)
          },
        },
      })
    })
    const baseUrl = "https://feedback.example.invalid"
    const requests: string[] = []
    const pageNavigations: string[] = []
    await context.route(`${baseUrl}/**`, async (route) => {
      requests.push(
        `${route.request().method()} ${new URL(route.request().url()).pathname}`,
      )
      const path = new URL(route.request().url()).pathname
      if (route.request().isNavigationRequest()) pageNavigations.push(path)
      const isPage = path === "/" || path === "/console/personal"
      const cleared = (await route.request().allHeaders()).cookie?.includes(
        "cf_clearance=feedback-test",
      )
      if (isPage && !cleared)
        return route.fulfill({
          contentType: "text/html",
          body: '<html><title>Just a moment...</title><form id="challenge-form"></form><script>setTimeout(() => { document.cookie = "cf_clearance=feedback-test; path=/; SameSite=Lax"; location.reload() }, 750)</script></html>',
        })
      if (isPage)
        return route.fulfill({
          contentType: "text/html",
          body: '<html><script src="/app.js"></script></html>',
        })
      if (path.endsWith(".js") && !cleared)
        return route.fulfill({
          status: 403,
          body: "Page verification required",
        })
      if (path === "/app.js")
        return route.fulfill({
          contentType: "text/javascript",
          body: `import("/active.js"); const optional = ["/unloaded.js"];`,
        })
      if (path === "/active.js")
        return route.fulfill({
          contentType: "text/javascript",
          body: `const routes = ['/custom/checkin?token=do-not-copy'];`,
        })
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { enabled: true, checked_in_today: false },
        }),
      })
    })
    const serviceWorker = await getServiceWorker(context)
    await seedStoredAccounts(serviceWorker, [
      createStoredAccount({
        id: "feedback-account",
        site_name: "Feedback Account",
        site_url: baseUrl,
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
    )
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)
    const row = page
      .getByTestId(new RegExp(`^${getAccountManagementListItemTestId("")}`))
      .filter({ hasText: "Feedback Account" })
    await row.hover()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await page
      .getByRole("menuitem", {
        name: new RegExp(`${copy.feedback}|${copy.request}`),
      })
      .click()
    let feedback = page.getByRole("dialog", {
      name: copy.request,
      exact: true,
    })
    await expect(feedback.getByLabel(copy.notes)).toBeVisible()
    await feedback
      .getByLabel(copy.notes)
      .fill("Website check-in works; extension cannot detect it.")
    await expect(feedback.getByText(copy.scanCompleted)).toBeVisible()
    await feedback.getByText(copy.preview, { exact: true }).click()
    await expect(
      feedback
        .getByTestId("checkin-feedback-preview")
        .getByRole("heading", { name: copy.reportProblem }),
    ).toBeVisible()
    const report = await feedback.getByLabel(copy.fullReport).inputValue()
    await writeFile(testInfo.outputPath("feedback-report.md"), report, "utf8")
    expect(report).toContain("route hint</th><td>/custom/checkin</td>")
    expect(pageNavigations).toContain("/console/personal")
    expect(requests).not.toContain("GET /unloaded.js")
    expect(report).not.toContain("do-not-copy")
    expect(report).not.toContain("e2e-token")
    await feedback.getByRole("button", { name: copy.copy, exact: true }).click()
    expect(
      await page.evaluate(() => sessionStorage.getItem("feedback-copy")),
    ).toBe(report)
    // Record the browser API boundary without contacting GitHub or relying on login redirects.
    await page.evaluate(() => {
      const api = (globalThis as any).browser ?? (globalThis as any).chrome
      api.tabs.create = async (properties: { url: string }) => {
        sessionStorage.setItem("feedback-github-url", properties.url)
        return { id: 12345, ...properties }
      }
    })
    await feedback.getByRole("button", { name: copy.open }).click()
    const issueUrl = await page.evaluate(() =>
      sessionStorage.getItem("feedback-github-url"),
    )
    expect(new URL(issueUrl!).searchParams.get("body")).toBe(report)
    await page.keyboard.press("Escape")
    await expect(feedback).toBeHidden()
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    const editor = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
    await editor
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
      .fill("Unsaved account name")
    const section = editor.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn,
    )
    const requestButton = section.getByRole("button", {
      name: copy.feedback,
      exact: true,
    })
    if (!(await requestButton.isVisible()))
      await section
        .getByRole("button", { name: language === "en" ? /Check-in/i : /签到/ })
        .first()
        .click()
    await section.screenshot({
      path: testInfo.outputPath("checkin-settings.png"),
      animations: "disabled",
    })
    await requestButton.click()
    feedback = page.getByRole("dialog", {
      name: copy.request,
      exact: true,
    })
    await expect(feedback.getByLabel(copy.notes)).toHaveValue("")
    await feedback.getByLabel(copy.notes).fill("Second report")
    await expect(
      feedback.getByRole("button", { name: copy.open }),
    ).toBeInViewport()
    const bounds = await feedback.boundingBox()
    expect(bounds?.width).toBeLessThanOrEqual(width)
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`feedback-${language}-${width}.png`),
    })
    await feedback.getByText(copy.preview, { exact: true }).click()
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`feedback-preview-${language}-${width}.png`),
    })
    const renderedReport = feedback.getByTestId("checkin-feedback-preview")
    const diagnosticSummary = renderedReport.getByText(copy.details, {
      exact: true,
    })
    await diagnosticSummary.focus()
    await page.keyboard.press("Enter")
    await expect(diagnosticSummary).toBeFocused()
    await expect(
      renderedReport.getByRole("rowheader", { name: "app", exact: true }),
    ).toBeVisible()
    await renderedReport.getByText(copy.clues, { exact: true }).click()
    await expect(
      renderedReport.getByRole("rowheader", {
        name: "GET /api/status",
        exact: true,
      }),
    ).toBeVisible()
    await expect(renderedReport.locator("pre")).toHaveCount(0)
    await feedback.getByLabel(copy.notes).fill("Revised report")
    await expect(
      renderedReport.getByRole("rowheader", { name: "app", exact: true }),
    ).toBeVisible()
    await renderedReport
      .getByRole("rowheader", { name: "route hint", exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`feedback-report-${language}-${width}.png`),
    })
    if (language === "zh-CN") {
      await page.evaluate(() => document.documentElement.classList.add("dark"))
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`feedback-dark-${width}.png`),
      })
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      )
    }
    await page.keyboard.press("Escape")
    await expect(
      editor.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    ).toHaveValue("Unsaved account name")
    expect(requests.every((request) => request.startsWith("GET "))).toBe(true)
  })
}
