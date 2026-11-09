import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const scenario of [
  "bracket",
  "budget",
  "output-limit",
  "inconclusive",
  "streaming-overflow",
  "responses-overflow",
]) {
  const pauseForBudget = scenario === "budget"
  const outputLimited = scenario === "output-limit"
  const inconclusive = scenario === "inconclusive"
  const responsesOverflow = scenario === "responses-overflow"
  const streamingOverflow =
    scenario === "streaming-overflow" || responsesOverflow
  test(`capacity probe reports a boundary using the selected credential${pauseForBudget ? " after continuing a budget pause" : outputLimited ? " with truncated output" : inconclusive ? " with an unconfirmed result" : responsesOverflow ? " after a Responses overflow without status" : streamingOverflow ? " after a nested SSE overflow without status" : ""}`, async ({
    context,
    page,
    extensionId,
  }) => {
    const requests: Record<string, unknown>[] = []
    let budgetCharged = false
    let releaseFirstRequest!: () => void
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve
    })
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
      let raw = ""
      for await (const chunk of request) raw += chunk.toString()
      const body = JSON.parse(raw)
      requests.push(body)
      if (requests.length === 1) await firstRequestGate
      expect(request.headers.authorization).toBe("Bearer synthetic-key")
      if (streamingOverflow) {
        response.setHeader("Content-Type", "text/event-stream")
        if (responsesOverflow) {
          const tooLong = JSON.stringify(body.input).length > 16000
          const item = {
            id: "msg_1",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "OK", annotations: [] }],
          }
          const events = tooLong
            ? [
                {
                  type: "error",
                  sequence_number: 1,
                  code: "model_context_window_exceeded",
                  message: "Input rejected",
                  param: null,
                },
              ]
            : [
                {
                  type: "response.output_item.added",
                  output_index: 0,
                  item: { ...item, content: [] },
                },
                {
                  type: "response.output_text.delta",
                  item_id: "msg_1",
                  output_index: 0,
                  content_index: 0,
                  delta: "OK",
                },
                { type: "response.output_item.done", output_index: 0, item },
                {
                  type: "response.completed",
                  response: {
                    id: "capacity",
                    object: "response",
                    created_at: 1,
                    model: "gpt-quality",
                    status: "completed",
                    output: [item],
                    usage: {
                      input_tokens: 1000,
                      output_tokens: 1,
                      total_tokens: 1001,
                    },
                  },
                },
              ]
          response.end(
            `: PING\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
          )
          return
        }
        const event =
          JSON.stringify(body.messages).length > 16000
            ? {
                error: {
                  code: "upstream_error",
                  innererror: { code: "context_length_exceeded" },
                  message: "Input rejected",
                },
              }
            : {
                choices: [
                  { index: 0, delta: { content: "OK" }, finish_reason: "stop" },
                ],
              }
        response.end(
          `: PING\n\ndata: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`,
        )
        return
      }
      response.setHeader("Content-Type", "application/json")
      if (
        !outputLimited &&
        !inconclusive &&
        JSON.stringify(body.messages).length > 16000
      ) {
        response.statusCode = 400
        response.end(
          JSON.stringify({
            error: {
              code: "context_length_exceeded",
              message: "maximum context length exceeded",
            },
          }),
        )
      } else {
        const promptTokens = outputLimited
          ? 131004
          : pauseForBudget && !budgetCharged
            ? 8388608
            : 1000
        budgetCharged = true
        response.end(
          JSON.stringify({
            id: "capacity",
            object: "chat.completion",
            created: 1,
            model: "gpt-quality",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: outputLimited || inconclusive ? "" : "OK",
                },
                finish_reason: outputLimited ? "length" : "stop",
              },
            ],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: outputLimited ? 68 : 1,
              total_tokens: outputLimited ? 131072 : 1001,
            },
          }),
        )
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      await stubLlmMetadataIndex(context)
      if (outputLimited || scenario === "bracket" || streamingOverflow)
        await context.route("https://models.dev/models.json", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              models: [
                {
                  id: "gpt-quality",
                  name: "gpt-quality",
                  provider_id: "test",
                  limits: { context: 131072 },
                },
              ],
            }),
          }),
        )
      await forceExtensionLanguage(page, "en")
      await seedApiCredentialProfiles(await getServiceWorker(context), [
        createStoredApiCredentialProfile({
          id: "capacity",
          name: "Capacity target",
          apiType: responsesOverflow ? "openai" : "openai-compatible",
          baseUrl,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
      )
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await page.getByRole("combobox", { name: "Test mode" }).click()
      await page
        .getByRole("option", {
          name: streamingOverflow ? "Streaming" : "Non-streaming",
          exact: true,
        })
        .click()
      const panel = page.getByRole("region", {
        name: "Model context test",
      })
      const summary = panel.locator("[data-verification-summary]")
      const selection = panel.getByRole("button", {
        name: "Model context test",
        exact: true,
      })
      await selection.click()
      await expect(panel).toContainText("Pending")
      await expect(
        panel.getByText("Tests the input context the model can accept", {
          exact: false,
        }),
      ).toBeVisible()
      await expect(panel.getByRole("spinbutton")).toHaveCount(0)
      const titleBounds = await selection.boundingBox()
      const helpBounds = await panel
        .getByRole("button", { name: "About the model context test" })
        .boundingBox()
      const statusBounds = await panel
        .getByText("Pending", { exact: true })
        .boundingBox()
      expect(titleBounds).not.toBeNull()
      expect(helpBounds).not.toBeNull()
      expect(statusBounds).not.toBeNull()
      expect(helpBounds!.x).toBeGreaterThanOrEqual(
        titleBounds!.x + titleBounds!.width,
      )
      expect(
        helpBounds!.x - titleBounds!.x - titleBounds!.width,
      ).toBeLessThanOrEqual(8)
      expect(
        statusBounds!.x >= helpBounds!.x + helpBounds!.width ||
          statusBounds!.y >= helpBounds!.y + helpBounds!.height,
      ).toBe(true)
      await panel
        .getByRole("button", { name: "About the model context test" })
        .hover()
      const explanation = page.getByRole("tooltip")
      await expect(explanation).toContainText("Uses the declared model context")
      await expect(explanation).toContainText("8M-token")
      await panel.getByRole("button", { name: "Run context probe" }).click()
      try {
        await expect.poll(() => requests.length).toBe(1)
        await expect(
          panel.getByRole("button", { name: "Stop", exact: true }),
        ).toBeEnabled()
        await expect(panel).not.toContainText("Testing input capacity")
        await expect(panel).not.toContainText("Sending a long-input request")
        await panel.screenshot({
          path: test.info().outputPath("context-running.png"),
          animations: "disabled",
        })
      } finally {
        releaseFirstRequest()
      }
      if (pauseForBudget) {
        await expect(
          panel.getByRole("button", { name: "Continue probe", exact: true }),
        ).toBeVisible({ timeout: 30000 })
        await expect(summary.getByText(/^Accepted ≈/)).toHaveClass(
          /bg-secondary/,
        )
        const sentBeforeContinue = requests.map((body) =>
          JSON.stringify(body.messages),
        )
        await panel.screenshot({
          path: test.info().outputPath("context-paused.png"),
          animations: "disabled",
        })
        await panel
          .getByRole("button", { name: "Continue probe", exact: true })
          .click()
        await expect
          .poll(() => requests.length)
          .toBeGreaterThan(sentBeforeContinue.length)
        expect(sentBeforeContinue).not.toContain(
          JSON.stringify(requests[sentBeforeContinue.length]?.messages),
        )
      }
      if (outputLimited) {
        await expect(panel).toContainText("Model context:", { timeout: 30000 })
        await expect(
          panel
            .locator("[data-verification-summary]")
            .getByText("Context ≈99.9%", { exact: true }),
        ).toBeVisible()
        await expect(
          panel.getByRole("status", { name: "Context capacity result" }),
        ).toContainText("metadata declares 128K tokens")
        await expect(
          panel
            .locator("[data-verification-summary]")
            .getByText("Context ≈99.9%", { exact: true }),
        ).toHaveClass(/bg-success-soft/)
        await expect(panel).toContainText("Non-streaming")
        await expect(
          panel.getByRole("button", { name: "Execution result", exact: true }),
        ).toBeVisible()
        const disclosure = panel.getByRole("button", {
          name: "Test details",
          exact: true,
        })
        await expect(disclosure).toHaveAttribute("aria-expanded", "false")
        const summaryBounds = await panel
          .getByRole("status", { name: "Context capacity result" })
          .boundingBox()
        const disclosureBounds = await disclosure.boundingBox()
        expect(disclosureBounds!.y).toBeGreaterThanOrEqual(
          summaryBounds!.y + summaryBounds!.height,
        )
        await expect(panel).not.toContainText("Reported usage:")
        await expect(panel).not.toContainText("Result saved")
        await panel.screenshot({
          path: test.info().outputPath("context-summary.png"),
          animations: "disabled",
        })
        await page.setViewportSize({ width: 420, height: 900 })
        await panel.scrollIntoViewIfNeeded()
        expect(
          await panel.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true)
        await panel.screenshot({
          path: test.info().outputPath("context-summary-narrow.png"),
          animations: "disabled",
        })
        await page.setViewportSize({ width: 1280, height: 720 })
        await panel
          .getByRole("button", { name: "Test details", exact: true })
          .click()
        await expect(panel).toContainText(
          "Reported usage: input 131,004 + output 68 = total 131,072 tokens",
        )
        await expect(
          panel.getByText("Measurement evidence", { exact: true }),
        ).toBeVisible()
        await expect(
          panel.getByText("Request and usage", { exact: true }),
        ).toBeVisible()
        await expect(
          panel.getByText(
            "This input length was accepted. The actual capacity may be larger.",
            { exact: true },
          ),
        ).toHaveCount(1)
        await expect(panel).toContainText("Non-streaming")
        await expect(panel).toContainText("Largest accepted input:")
        await expect(panel).not.toContainText("An inconclusive request stopped")
        await expect(panel).not.toContainText("Capacity rejection at:")
        await panel.screenshot({
          path: test.info().outputPath("context-output-limited.png"),
          animations: "disabled",
        })
        const completedRequests = requests.length
        await page.reload()
        await waitForExtensionRoot(page)
        await page.getByTestId(IDS.verifyButton).click()
        await page.getByRole("combobox", { name: "Test mode" }).click()
        await page
          .getByRole("option", { name: "Non-streaming", exact: true })
          .click()
        await expect(panel).toContainText("Non-streaming")
        await selection.click()
        await expect(
          panel.getByRole("status", { name: "Context capacity result" }),
        ).toContainText("Model context:")
        expect(requests.length).toBe(completedRequests)
        await expect(
          panel
            .locator("[data-verification-summary]")
            .getByText("Context ≈99.9%", { exact: true }),
        ).toBeVisible()
        await expect(
          panel.getByRole("status", { name: "Context capacity result" }),
        ).toContainText("metadata declares 128K tokens")
        await panel.screenshot({
          path: test.info().outputPath("context-history.png"),
          animations: "disabled",
        })
        const historyBadge = panel
          .getByRole("button", { name: /^Previously:/ })
          .first()
        await historyBadge.hover()
        const historyTooltip = page.getByRole("tooltip").filter({
          hasText:
            "History keeps measurements, without individual request details",
        })
        await expect(historyTooltip).toBeVisible()
        await expect(historyTooltip).toHaveClass(/react-tooltip__show/)
        await expect
          .poll(() =>
            historyTooltip.evaluate((element) =>
              Number(getComputedStyle(element).opacity),
            ),
          )
          .toBeGreaterThan(0)
        await page.getByRole("dialog").screenshot({
          path: test.info().outputPath("context-history-tooltip.png"),
          animations: "disabled",
        })
        await page.keyboard.press("Escape")
        await expect(historyTooltip).toBeHidden()
        return
      }
      if (inconclusive) {
        await expect(
          panel.getByRole("status", { name: "Context capacity result" }),
        ).toContainText("Could not confirm input capacity", { timeout: 30000 })
        await expect(panel).not.toContainText("Result saved")
        await expect(panel).not.toContainText("Tokenizer:")
        await panel.screenshot({
          path: test.info().outputPath("context-unconfirmed.png"),
          animations: "disabled",
        })
        return
      }
      await expect(panel).toContainText("Model context:", { timeout: 30000 })
      await expect(panel).not.toContainText("Result saved")
      if (scenario === "bracket" || streamingOverflow)
        await expect(summary.getByText(/^Context ≈/)).toHaveClass(
          /bg-warning-soft/,
        )
      else
        await expect(summary.getByText(/^Accepted ≈/)).toHaveClass(
          /bg-secondary/,
        )
      await panel.screenshot({
        path: test.info().outputPath("context-summary.png"),
        animations: "disabled",
      })
      await panel
        .getByRole("button", { name: "Test details", exact: true })
        .click()
      await expect(panel).toContainText("Largest accepted input:")
      await expect(panel).toContainText("Capacity rejection at:")
      await expect(panel).toContainText("Estimated model encoding.")
      expect(requests.length).toBeGreaterThan(2)
      expect(
        requests.every(
          (body) =>
            (streamingOverflow ? body.stream === true : !body.stream) &&
            body.model === "gpt-quality" &&
            (responsesOverflow ? body.max_output_tokens : body.max_tokens) ===
              128,
        ),
      ).toBe(true)
      await panel.scrollIntoViewIfNeeded()
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("context-capacity.png"),
        animations: "disabled",
      })
    } finally {
      releaseFirstRequest()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
}
