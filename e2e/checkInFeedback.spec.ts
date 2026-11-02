import { writeFile } from "node:fs/promises"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import en from "~/locales/en/accountDialog.json" with { type: "json" }
import zh from "~/locales/zh-CN/accountDialog.json" with { type: "json" }
import { CHECKIN_FEEDBACK_TAB_HINT_PREFIX } from "~/services/core/storageKeys"
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
    expect(new URL(issueUrl!).searchParams.get("feedback")).toBe(report)
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
    await feedback.getByLabel(copy.notes).fill("Long report ".repeat(800))
    await expect(
      feedback.getByRole("button", { name: copy.copyAndOpen }),
    ).toBeInViewport()
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`feedback-long-${language}-${width}.png`),
    })
    await page.evaluate(() => sessionStorage.removeItem("feedback-github-url"))
    await expect(
      feedback.getByRole("button", { name: copy.copy, exact: true }),
    ).toHaveCount(0)
    await page.evaluate((openFeedbackAction) => {
      const api = (globalThis as any).browser ?? (globalThis as any).chrome
      const send = api.runtime.sendMessage.bind(api.runtime)
      api.runtime.sendMessage = async (message: {
        action: string
        url?: string
      }) => {
        if (message.action === openFeedbackAction) {
          if (
            !sessionStorage
              .getItem("feedback-copy")
              ?.includes("Long report ".repeat(800))
          )
            throw new Error("Navigated before copying the report")
          sessionStorage.setItem("feedback-github-url", message.url!)
          return { success: true }
        }
        return send(message)
      }
    }, RuntimeActionIds.OpenCheckInFeedbackIssue)
    await feedback.getByRole("button", { name: copy.copyAndOpen }).click()
    await expect(
      feedback.getByRole("button", { name: copy.copy, exact: true }),
    ).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("feedback-github-url")),
      )
      .not.toBeNull()
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`feedback-paste-${language}-${width}.png`),
    })
    const longIssueUrl = new URL(
      (await page.evaluate(() =>
        sessionStorage.getItem("feedback-github-url"),
      ))!,
    )
    expect(longIssueUrl.searchParams.get("template")).toBe(
      "checkin_adaptation.yml",
    )
    expect(longIssueUrl.searchParams.has("feedback")).toBe(false)
    expect(longIssueUrl.searchParams.get("site-url")).toBe(baseUrl)
    expect(longIssueUrl.searchParams.get("extension-version")).toBeTruthy()
    expect(
      await page.evaluate(() => sessionStorage.getItem("feedback-copy")),
    ).toContain("Long report ".repeat(800))

    await page.keyboard.press("Escape")
    await expect(
      editor.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    ).toHaveValue("Unsaved account name")
    expect(requests.every((request) => request.startsWith("GET "))).toBe(true)
  })
}

test("extension guidance follows its feedback tab through login, reload and dismissal", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  const composer =
    "https://github.com/qixing-jk/all-api-hub/issues/new?template=checkin_adaptation.yml"
  const copy = zh.checkInFeedback
  await page.setViewportSize({ width: 390, height: 850 })
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await context.route("https://github.com/**", async (route) => {
    if (!route.request().isNavigationRequest()) return route.abort()
    const url = new URL(route.request().url())
    if (url.pathname === "/login")
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="zh-CN"><head><meta charset="utf-8"></head><body><h1>GitHub login fixture</h1><a href="${composer}&signed-in=1">Continue after login</a></body></html>`,
      })
    if (
      url.pathname.endsWith("/issues/new") &&
      !url.searchParams.has("signed-in")
    )
      return route.fulfill({
        status: 302,
        headers: { location: "https://github.com/login" },
        body: "",
      })
    return route.fulfill({
      contentType: "text/html",
      body: `<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font: 16px system-ui; padding: 180px 16px 16px"><h1>New issue · GitHub fixture</h1><form><label for="feedback">Problem description or extension feedback / 问题描述或扩展反馈</label><textarea id="feedback" required style="width:100%; min-height:160px"></textarea><button>Submit new issue</button></form></body></html>`,
    })
  })
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  const newPage = context.waitForEvent("page")
  const response = await page.evaluate(
    async ({ composer, copy, action }) => {
      const api = (globalThis as any).browser ?? (globalThis as any).chrome
      return await api.runtime.sendMessage({
        action,
        url: composer,
        hint: {
          title: copy.githubHintTitle,
          description: copy.githubHint,
          dismiss: "关闭",
        },
      })
    },
    { composer, copy, action: RuntimeActionIds.OpenCheckInFeedbackIssue },
  )
  expect(response.success).toBe(true)
  const github = await newPage
  await github.setViewportSize({ width: 390, height: 850 })
  await github.waitForURL("https://github.com/login")
  // The extension can navigate before Playwright attaches the new target.
  // Explicitly load the controlled document once attached; subsequent navigations stay routed.
  await github.goto("https://github.com/login?aah-test=1")
  await expect(
    github.getByRole("link", { name: "Continue after login" }),
  ).toBeVisible()
  await expect(github.locator("all-api-hub-redemption-toast")).toHaveCount(0)
  await page.close()
  await github.getByRole("link", { name: "Continue after login" }).click()
  const hint = github.locator("all-api-hub-redemption-toast")
  await expect(
    hint.getByText(copy.githubHintTitle, { exact: true }),
  ).toBeVisible()
  await expect(hint.getByText(copy.githubHint, { exact: true })).toBeVisible()
  await github.screenshot({
    path: testInfo.outputPath("github-paste-hint-zh-CN-390.png"),
    animations: "disabled",
  })
  await github.reload()
  await expect(
    hint.getByText(copy.githubHintTitle, { exact: true }),
  ).toBeVisible()
  await hint.evaluate((element) => element.remove())
  await expect(
    hint.getByText(copy.githubHintTitle, { exact: true }),
  ).toBeVisible()
  const unrelated = await context.newPage()
  await unrelated.goto(`${composer}&signed-in=1`)
  await expect(unrelated.locator("all-api-hub-redemption-toast")).toHaveCount(0)
  await hint.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(
    hint.getByText(copy.githubHintTitle, { exact: true }),
  ).toHaveCount(0)
  const worker = await getServiceWorker(context)
  await expect
    .poll(() =>
      worker.evaluate(async (hintPrefix) => {
        const api = (globalThis as any).browser ?? (globalThis as any).chrome
        return Object.keys(await api.storage.session.get(null)).filter((key) =>
          key.startsWith(hintPrefix),
        ).length
      }, CHECKIN_FEEDBACK_TAB_HINT_PREFIX),
    )
    .toBe(0)
  await github.reload()
  await expect(
    hint.getByText(copy.githubHintTitle, { exact: true }),
  ).toHaveCount(0)
})
