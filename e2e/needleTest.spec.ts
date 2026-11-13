import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import en from "~/locales/en/aiApiVerification.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { showVerificationSettings } from "~~/e2e/utils/verificationWorkspace"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { buildNewApiToken } from "~~/tests/test-utils/newApiToken"

for (const [stopScope, mode] of [
  ["all", "Non-streaming"],
  ["row", "Non-streaming"],
  ["cell", "Non-streaming"],
  ["column", "Non-streaming"],
  ["row", "Streaming"],
  ["cell", "Streaming"],
] as const) {
  test(`native needle pages share ownership and retain a stopped first request (${stopScope}, ${mode})`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    let requests = 0
    let firstResponseClosed = false
    const server = createServer(async (request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*")
      response.setHeader("Access-Control-Allow-Headers", "*")
      if (request.method === "OPTIONS") {
        response.end()
        return
      }
      if (request.method === "GET") {
        response.setHeader("Content-Type", "application/json")
        response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
        return
      }
      for await (const _chunk of request) {
        /* consume body, keep response pending */
      }
      expect(request.headers.authorization).toBe("Bearer synthetic-key")
      requests++
      if (requests === 1)
        response.once("close", () => {
          firstResponseClosed = true
        })
      const completion = {
        id: "needle-stop",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "wrong" },
            finish_reason: "stop",
          },
        ],
      }
      if (mode === "Streaming") {
        response.setHeader("Content-Type", "text/event-stream")
        response.write(
          `data: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: { content: "wrong" }, finish_reason: null }] })}\n\n`,
        )
        if (requests > 1)
          response.end(
            `data: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
          )
      } else if (requests > 1) {
        response.setHeader("Content-Type", "application/json")
        response.end(JSON.stringify(completion))
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "en")
      await seedApiCredentialProfiles(await getServiceWorker(context), [
        createStoredApiCredentialProfile({
          id: "needle",
          name: "Needle target",
          apiType: "openai-compatible",
          baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
      const open = async (targetPage: Page) => {
        await targetPage.emulateMedia({ reducedMotion: "reduce" })
        await targetPage.goto(
          `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
        )
        await waitForExtensionRoot(targetPage)
        await targetPage.getByTestId(IDS.verifyButton).click()
        await targetPage.getByRole("combobox", { name: "Test mode" }).click()
        await targetPage
          .getByRole("option", { name: mode, exact: true })
          .click()
        const panel = targetPage.getByRole("region", {
          name: "Needle in a haystack",
          exact: true,
        })
        await panel
          .getByRole("button", { name: "Needle in a haystack", exact: true })
          .click()
        await expect(
          panel.getByRole("button", { name: "Run needle test" }),
        ).toBeEnabled()
        return panel
      }
      const first = await open(page)
      await first
        .getByRole("button", { name: /^Run .* row \(3 requests\)$/ })
        .last()
        .click()
      await expect.poll(() => requests).toBe(1)
      const otherPage = await context.newPage()
      const second = await open(otherPage)
      await second.getByRole("button", { name: "Run needle test" }).click()
      await expect(second).toContainText("already running in another page")
      expect(requests).toBe(1)
      // Continue the owner workflow in the foreground after checking the other page.
      await page.bringToFront()
      const resultPanel = first.getByRole("region", {
        name: "Execution result",
      })
      const stop =
        stopScope === "all"
          ? resultPanel.getByRole("button", { name: "Stop", exact: true })
          : stopScope === "row"
            ? first.getByRole("button", { name: /^Stop .* row$/ })
            : stopScope === "column"
              ? first.getByRole("button", {
                  name: "Stop 10% column",
                  exact: true,
                })
              : first.getByRole("button", { name: /^Stop .* · 10%$/ })
      await expect(stop).toBeEnabled()
      if (stopScope !== "cell")
        await expect(stop).toHaveAttribute("aria-busy", "true")
      await captureVisualViews({
        page,
        ready: resultPanel,
        extensionDir,
        id: `native-needle-preview-stop-${stopScope}-${mode.toLowerCase()}`,
        views: [
          { id: "desktop", theme: "light", width: 1280, height: 1000 },
          { id: "narrow", theme: "light", width: 380, height: 800 },
        ],
      })
      const resultToggle = first.getByRole("button", {
        name: "Execution result",
      })
      if (stopScope === "all") {
        await resultToggle.click()
        await expect(first.getByRole("table")).toBeHidden()
        await expect(stop).toBeVisible()
      }
      await stop.focus()
      await page.keyboard.press("Enter")
      await expect.poll(() => firstResponseClosed).toBe(true)
      await expect(first).toContainText("Stopped")
      const expectedRequests =
        stopScope === "cell" || stopScope === "column" ? 3 : 1
      await expect(first).toContainText(
        `Processed ${expectedRequests}/3 requests`,
      )
      await expect(
        resultPanel.getByRole("button", { name: "Run", exact: true }),
      ).toBeEnabled()
      if (stopScope === "all") {
        await expect(resultToggle).toHaveAttribute("aria-expanded", "false")
        await expect(
          first.getByText("Latest run: Processed 1/3 requests"),
        ).toBeVisible()
        await resultToggle.click()
      }
      await expect(
        first.getByRole("button", {
          name: stopScope === "all" ? /10%: Unknown/ : /10%: Cancelled/,
        }),
      ).toBeVisible()
      expect(requests).toBe(expectedRequests)
      await expect(first.getByText("Could not stop. Try again.")).toBeHidden()
      if (expectedRequests === 3)
        await expect(
          first.getByRole("table").getByText("Miss", { exact: true }),
        ).toHaveCount(2)
      if (stopScope === "row")
        await expect(
          first.getByRole("table").getByText("Cancelled", { exact: true }),
        ).toHaveCount(3)
      await page
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click()
      const restored = await open(page)
      await expect(restored).toContainText("Saved result")
      await restored
        .getByRole("button", {
          name: "Test parameters and reproduction",
          exact: true,
        })
        .click()
      await expect(restored).not.toContainText("Only measurements are saved")
      const historyBadge = restored.getByRole("button", {
        name: /^Previously:/,
      })
      await historyBadge.hover()
      await expect(
        page
          .getByRole("tooltip")
          .filter({ hasText: "History keeps measurements" }),
      ).toBeVisible()
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("needle-history-tooltip.png"),
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
      const historyTooltip = page
        .getByRole("tooltip")
        .filter({ hasText: "History keeps measurements" })
      await expect(historyTooltip).toBeHidden()
      await historyBadge.click()
      await expect(historyTooltip).toHaveCSS("opacity", "0.9")
      await expect
        .poll(() =>
          historyTooltip.evaluate((element) =>
            Number(getComputedStyle(element).opacity),
          ),
        )
        .toBeGreaterThan(0)
      await page.keyboard.press("Escape")
      await expect(historyTooltip).toBeHidden()
      await expect(page.getByRole("dialog")).toBeVisible()
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("native-needle-history-restored.png"),
        animations: "disabled",
      })
      await expect(restored).toContainText(
        `Processed ${expectedRequests}/3 requests`,
      )
      if (stopScope === "row")
        await expect(
          restored.getByRole("table").getByText("Cancelled", { exact: true }),
        ).toHaveCount(3)
      expect(requests).toBe(expectedRequests)
      await restored.getByRole("table").screenshot({
        path: test.info().outputPath("native-needle-stopped.png"),
        animations: "disabled",
      })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
}

test("native needle rows send only the selected length, including retests with other saved rows", async ({
  context,
  page,
  extensionId,
}) => {
  const promptLengths: number[] = []
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET") {
      response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
      return
    }
    let body = ""
    for await (const chunk of request) body += chunk
    const payload = JSON.parse(body)
    promptLengths.push(JSON.stringify(payload.messages).length)
    response.end(
      JSON.stringify({
        id: "row-scope",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "wrong" },
            finish_reason: "stop",
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "row-scope",
        name: "Row scope",
        apiType: "openai-compatible",
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await page.getByRole("combobox", { name: "Test mode" }).click()
    await page
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    const panel = page.getByRole("region", {
      name: "Needle in a haystack",
      exact: true,
    })
    await panel
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await panel
      .getByRole("button", { name: "Run 8K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => promptLengths.length).toBe(3)
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    await expect(
      panel.getByRole("button", { name: /^8192 tokens.*Miss$/ }),
    ).toHaveCount(3)
    await expect(
      panel.getByRole("button", { name: /^16384 tokens.*Not in this run$/ }),
    ).toHaveCount(3)

    await panel
      .getByRole("button", { name: "Run 16K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => promptLengths.length).toBe(6)
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    await expect(
      panel.getByRole("table").getByText("Miss", { exact: true }),
    ).toHaveCount(6)
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => promptLengths.length).toBe(9)
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    expect(promptLengths.slice(6)).toEqual(promptLengths.slice(0, 3))
    expect(Math.min(...promptLengths.slice(3, 6))).toBeGreaterThan(
      Math.max(...promptLengths.slice(0, 3)) * 1.5,
    )
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("account needle testing reveals a masked key only on run and uses the selected credential", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  let requests = 0
  let releaseColumn!: () => void
  const columnResponse = new Promise<void>((resolve) => {
    releaseColumn = resolve
  })
  let releaseScoped!: () => void
  const scopedResponse = new Promise<void>((resolve) => {
    releaseScoped = resolve
  })
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    if (request.method === "GET") {
      response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
      return
    }
    let raw = ""
    for await (const chunk of request) raw += chunk.toString()
    const prompt = JSON.parse(raw).messages.at(-1).content as string
    const key =
      /Question: Return only the archive code for record "([^"]+)"/.exec(
        prompt,
      )![1]
    const value = new RegExp(`Record "${key}" has archive code "([^"]+)"`).exec(
      prompt,
    )![1]
    expect(request.headers.authorization).toBe(
      "Bearer sk-resolved-needle-secret",
    )
    requests++
    if (requests === 4) await columnResponse
    if (requests === 12) await scopedResponse
    response.setHeader("Content-Type", "application/json")
    response.end(
      JSON.stringify({
        id: "needle",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: value },
            finish_reason: "stop",
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await stubNewApiSiteRoutes(context, {
      baseUrl,
      models: ["gpt-quality"],
      initialTokens: [buildNewApiToken({ key: "sk-visible****suffix" })],
    })
    // The site fixture owns management routes; generation must reach the local provider.
    await context.route(`${baseUrl}/v1/chat/completions`, (route) =>
      route.continue(),
    )
    let reveals = 0
    await context.route(`${baseUrl}/api/token/1/key`, async (route) => {
      reveals++
      await route.fulfill({
        json: { success: true, data: { key: "resolved-needle-secret" } },
      })
    })
    await seedStoredAccounts(await getServiceWorker(context), [
      createStoredAccount({ site_url: baseUrl }),
    ])
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=e2e-account-1#${MENU_ITEM_IDS.MODELS}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton).first().click()
    await page.getByRole("combobox", { name: "Test mode", exact: true }).click()
    await page
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    const panel = page.getByRole("region", {
      name: "Needle in a haystack",
      exact: true,
    })
    await panel
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run needle test" }),
    ).toBeEnabled()
    const activeTest = page.locator("[data-verification-active-test]")
    expect(reveals).toBe(0)
    expect(requests).toBe(0)
    await expect(
      panel.getByRole("table").getByText("Planned", { exact: true }),
    ).toHaveCount(3)
    await expect(
      panel.getByRole("table").getByText("Not in this run", { exact: true }),
    ).toHaveCount(3)
    await captureVisualViews({
      page,
      ready: panel,
      extensionDir,
      id: "account-needle-idle",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await showVerificationSettings(page)
    await expect(
      page.getByRole("switch", { name: "Test only the longest text" }),
    ).toBeChecked()
    await panel
      .getByRole("region", { name: "Test preview" })
      .getByRole("button", { name: "Run", exact: true })
      .click()
    await expect(activeTest).toContainText("3/3 matched", {
      timeout: 30000,
    })
    expect(reveals).toBe(1)
    expect(requests).toBe(3)
    await panel
      .getByRole("button", {
        name: "Retest 50% column (2 requests)",
        exact: true,
      })
      .click()
    await expect.poll(() => requests).toBe(4)
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 50%: Running..." }),
    ).toBeVisible()
    const execution = panel.getByRole("region", { name: "Execution result" })
    await expect(
      panel.getByRole("region", { name: "Test preview" }),
    ).toHaveCount(0)
    await expect(execution).toContainText("2 requests")
    await expect(execution).toContainText("Each length is tested at 50%.")
    await expect(
      panel.getByRole("button", {
        name: "Stop 50% column",
        exact: true,
      }),
    ).toHaveAttribute("aria-busy", "true")
    await expect(
      panel.getByRole("table").getByText("Not in this run", { exact: true }),
    ).toHaveCount(2)
    await page.setViewportSize({ width: 380, height: 800 })
    const runningCell = panel
      .getByRole("table")
      .getByText("Running...", { exact: true })
    await expect(runningCell).toBeVisible()
    expect(
      await panel
        .getByRole("table")
        .evaluate(
          (element) =>
            element.scrollWidth <= element.parentElement!.clientWidth,
        ),
    ).toBe(true)
    expect(
      await runningCell.evaluate((element) => {
        const range = document.createRange()
        const text = [...element.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE,
        )!
        range.selectNodeContents(text)
        return (
          range.getBoundingClientRect().height <=
          parseFloat(getComputedStyle(element).lineHeight)
        )
      }),
    ).toBe(true)
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      extensionDir,
      id: "account-needle-column-running",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await captureVisualViews({
      page,
      ready: execution,
      extensionDir,
      id: "account-needle-column-preview",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await page.setViewportSize({ width: 1280, height: 1000 })
    releaseColumn()
    await expect(activeTest).toContainText("4/6 matched")
    await expect(
      panel.getByRole("button", { name: "Run needle test" }),
    ).toBeEnabled()
    expect(requests).toBe(5)
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect(activeTest).toContainText("6/6 matched")
    expect(requests).toBe(8)
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run needle test" }),
    ).toBeEnabled()
    expect(requests).toBe(11)
    await expect(panel.getByRole("table").getByRole("cell")).toHaveCount(6)
    const resultCard = panel.getByRole("region", {
      name: "Execution result",
      exact: true,
    })
    await expect(activeTest).toContainText("6/6 matched")
    await expect(activeTest).toContainText("Processed 3/3")
    await expect(
      resultCard.getByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).toHaveText("8Ktokens")
    await expect(
      activeTest.getByRole("button", { name: "Run", exact: true }),
    ).toHaveAccessibleDescription("3 requests")
    const resultBounds = (await resultCard.boundingBox())!
    const settingsBounds = (await page
      .getByRole("group", { name: "Test settings" })
      .boundingBox())!
    expect(resultBounds.x + resultBounds.width).toBeLessThanOrEqual(
      settingsBounds.x,
    )
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      extensionDir,
      id: "account-needle-results",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await panel.getByRole("table").scrollIntoViewIfNeeded()
    await page.screenshot({
      path: test.info().outputPath("account-needle-results.png"),
      animations: "disabled",
    })
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => requests).toBe(12)
    await panel
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .hover()
    const details = panel.getByRole("region", {
      name: "Cell details",
      exact: true,
    })
    await expect(details).toBeHidden()
    await panel
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .click()
    await expect(details).toContainText("Running...")
    const activeMatrix = panel.getByRole("table")
    const statusBounds = await activeMatrix
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .boundingBox()
    const stopBounds = await activeMatrix
      .getByRole("button", { name: "Stop 8K · 10%" })
      .boundingBox()
    expect(statusBounds).not.toBeNull()
    expect(stopBounds).not.toBeNull()
    expect(Math.abs(statusBounds!.height - stopBounds!.height)).toBeLessThan(1)
    expect(
      Math.abs(statusBounds!.x + statusBounds!.width - stopBounds!.x),
    ).toBeLessThan(1)
    expect(requests).toBe(12)
    await panel
      .getByRole("button", { name: "8192 tokens · 90%: Pending", exact: true })
      .click()
    await details
      .getByRole("button", { name: "Stop 8K · 90%", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 90%: Cancelled" }),
    ).toBeVisible()
    expect(requests).toBe(12)
    await panel
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .click()
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      extensionDir,
      id: "account-needle-scoped-controls",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
        { id: "dark", theme: "dark", width: 1280, height: 1000 },
      ],
    })
    await details
      .getByRole("button", { name: "Stop 8K · 10%", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    expect(requests).toBe(13)
    await expect(details).toContainText("Cancelled")
    await expect(details).not.toContainText("Previous result (before this run)")
    await expect(details).toContainText("No gradable result was obtained.")
    await panel.locator("[data-verification-detail]").evaluate((element) => {
      element.scrollTop = 0
    })
    await captureVisualViews({
      page,
      ready: resultCard,
      extensionDir,
      id: "account-needle-cancelled-result",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "dark", theme: "dark", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    const resultToggle = resultCard.getByRole("button", {
      name: "Execution result",
    })
    await expect(resultToggle).toHaveCount(0)
    await expect(resultCard.getByRole("table")).toBeVisible()
    await expect(activeTest).not.toContainText("Cumulative results:")
    await expect(details).toContainText("No gradable result was obtained.")
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 10%: Cancelled" }),
    ).toHaveAttribute("aria-pressed", "true")
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 50%: Match" }),
    ).toBeVisible()
    await panel
      .getByRole("button", { name: "8192 tokens · 90%: Cancelled" })
      .focus()
    await page.keyboard.press("Enter")
    await expect(details).toContainText("Previous result (before this run)")
    await panel
      .getByRole("button", { name: "8192 tokens · 50%: Match" })
      .click()
    await details
      .getByRole("button", { name: "Request and answer details" })
      .click()
    await expect(details.locator("pre")).toBeVisible()
    await expect(
      details.getByRole("button", { name: "Retest this cell", exact: true }),
    ).toHaveCSS("font-size", "12px")
    await captureVisualViews({
      page,
      ready: resultCard,
      extensionDir,
      id: "account-needle-response-details",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "dark", theme: "dark", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    for (const depth of [50, 10, 90]) {
      await panel
        .getByRole("button", { name: new RegExp(`^8192 tokens · ${depth}%:`) })
        .click()
      const before = requests
      await details
        .getByRole("button", { name: "Retest this cell", exact: true })
        .click()
      await expect(
        panel.getByRole("button", { name: "Run needle test" }),
      ).toBeEnabled()
      expect(requests).toBe(before + 1)
      await expect(
        panel.getByRole("button", { name: `8192 tokens · ${depth}%: Match` }),
      ).toBeVisible()
      await expect(activeTest).toContainText("Processed 1/1")
      await expect(
        panel.getByRole("button", { name: "16384 tokens · 90%: Match" }),
      ).toBeVisible()
    }
  } finally {
    releaseColumn()
    releaseScoped()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
