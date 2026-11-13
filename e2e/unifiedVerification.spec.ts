import fs from "node:fs/promises"
import http from "node:http"
import type { AddressInfo } from "node:net"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  getApiCredentialProfileVerifyProbeTestId,
  API_CREDENTIAL_PROFILES_TEST_IDS as IDS,
} from "~/features/ApiCredentialProfiles/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { showVerificationSettings } from "~~/e2e/utils/verificationWorkspace"

test("API and CLI shortcuts share the workspace with CLI presets only", async ({
  context,
  extensionId,
  page,
}) => {
  const captures: Array<{
    path: string
    headers: http.IncomingHttpHeaders
    body: Record<string, unknown> & { tools?: Array<{ name?: string }> }
  }> = []
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json")
    if (request.method !== "POST") {
      response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    captures.push({ path: request.url!, headers: request.headers, body })
    // A successful Codex tool call and failures from the other protocols
    // exercise partial compatibility without contacting a paid provider.
    if (request.url === "/v1/responses" && body.tools?.[0]?.name) {
      response.end(
        JSON.stringify({
          id: "resp-test",
          object: "response",
          created_at: 0,
          model: "gpt-quality",
          status: "completed",
          output: [
            {
              type: "function_call",
              id: "fc-test",
              call_id: "call-test",
              name: body.tools[0].name,
              arguments: JSON.stringify({ location: "Paris" }),
              status: "completed",
            },
          ],
          usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        }),
      )
    } else {
      response.statusCode = 400
      response.end(
        JSON.stringify({ error: { message: "Fixture protocol rejected" } }),
      )
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "unified",
        name: "Unified verification fixture",
        baseUrl,
        apiKey: "synthetic-key",
        apiType: "openai-compatible",
        requestHeaders: { "x-fixture": "unified" },
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(
      page.getByRole("combobox", { name: "Client simulation" }),
    ).toContainText("Ordinary API")
    const probeRows = page.locator('[data-testid^="profile-verify-probe-"]')
    const ordinaryProbeOrder = await probeRows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid")),
    )
    await page.getByTestId(IDS.verifyDialogCloseButton).click()
    await page.getByTestId(IDS.verifyCliSupportButton).click()
    const client = page.getByRole("combobox", { name: "Client simulation" })
    await expect(client).toContainText("Claude Code")
    await page.getByRole("dialog").screenshot({
      path: test.info().outputPath("cli-preset-workspace.png"),
      animations: "disabled",
    })
    await expect(
      page.getByRole("combobox", { name: "API type", exact: true }),
    ).toBeEnabled()
    const tool = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("tool-calling"),
    )
    expect(
      await probeRows.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-testid")),
      ),
    ).toEqual(ordinaryProbeOrder)
    await expect(probeRows.first()).toHaveAttribute(
      "data-testid",
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    const ordinaryTest = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    const boxStyle = (element: HTMLElement | SVGElement) => {
      const style = getComputedStyle(element)
      return { border: style.borderTopWidth, padding: style.paddingLeft }
    }
    expect(await tool.evaluate(boxStyle)).toEqual(
      await ordinaryTest.evaluate(boxStyle),
    )

    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    expect(captures).toHaveLength(0)
    await page.getByRole("combobox", { name: "Test mode" }).click()
    await page
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    await page.getByRole("switch", { name: "Enhanced CLI simulation" }).click()
    await page.getByTestId("verification-config").screenshot({
      path: test.info().outputPath("configuration-desktop.png"),
      animations: "disabled",
    })
    await tool.getByTestId(IDS.verifyProbeRunButton).click()
    await expect(tool).toContainText("Fail")
    expect(captures).toHaveLength(1)
    await expect(page.getByTestId("cli-tool-comparison")).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Compare three CLIs" }),
    ).toHaveCount(0)
    expect(captures[0]!.path).toBe("/v1/messages?beta=true")
    expect(captures[0]!.headers["x-fixture"]).toBe("unified")
    expect(captures[0]!.body.tools).toBeDefined()
    await tool.screenshot({
      path: test.info().outputPath("cli-preset-tool-test.png"),
      animations: "disabled",
    })
    await client.click()
    await page.getByRole("option", { name: "Codex CLI", exact: true }).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await expect(
      page.getByRole("switch", { name: "Enhanced CLI simulation" }),
    ).not.toBeChecked()
    await tool.getByTestId(IDS.verifyProbeRunButton).click()
    await expect(tool).toContainText("Pass")
    expect(captures).toHaveLength(2)
    expect(captures[1]!.path).toBe("/v1/responses")
    await page.getByRole("switch", { name: "Enhanced CLI simulation" }).click()
    await page.getByRole("combobox", { name: "API type", exact: true }).click()
    await page
      .getByRole("option", { name: "OpenAI-compatible", exact: true })
      .click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await page.getByTestId("verification-config").screenshot({
      path: test.info().outputPath("manual-protocol-configuration.png"),
      animations: "disabled",
    })
    await expect(client).toContainText("Codex CLI")
    await expect(
      page.getByRole("switch", { name: "Enhanced CLI simulation" }),
    ).toBeChecked()
    await expect(page.getByTestId("verification-config")).toContainText(
      "compatibility may be limited",
    )
    expect(captures).toHaveLength(2)
    await tool.getByTestId(IDS.verifyProbeRunButton).click()
    await expect(tool).toContainText("Fail")
    expect(captures).toHaveLength(3)
    expect(captures[2]!.path).toBe("/v1/chat/completions")
    expect(captures[2]!.headers["originator"]).toBe("codex_cli_rs")
    expect(captures[2]!.headers["x-fixture"]).toBe("unified")
    await client.click()
    await page
      .getByRole("option", { name: "Ordinary API", exact: true })
      .click()
    await expect(page.getByTestId("verification-config")).not.toContainText(
      "compatibility may be limited",
    )
    await expect(
      page.getByRole("combobox", { name: "API type", exact: true }),
    ).toBeEnabled()
    await page
      .getByRole("button", { name: "Run routine tests", exact: true })
      .click()
    await expect(page.getByTestId(IDS.verifyDialogCloseButton)).toBeEnabled()
    expect(captures.length).toBeGreaterThan(3)
    for (const capture of captures) {
      expect(JSON.stringify(capture.body)).not.toContain(
        "Read the following reference text.",
      )
      expect(JSON.stringify(capture.body)).not.toContain(
        "Generate an SVG of a pelican riding a bicycle",
      )
    }
    await page.setViewportSize({ width: 420, height: 900 })
    await showVerificationSettings(page)
    await client.scrollIntoViewIfNeeded()
    await page.getByTestId("verification-config").screenshot({
      path: test.info().outputPath("configuration-mobile.png"),
      animations: "disabled",
    })
    const evidence = test.info().outputPath("received-requests.json")
    await fs.writeFile(evidence, JSON.stringify(captures, null, 2))
    await test.info().attach("received-requests", {
      path: evidence,
      contentType: "application/json",
    })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
