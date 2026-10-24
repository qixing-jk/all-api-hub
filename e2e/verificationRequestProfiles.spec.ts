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

test("ordinary probes can opt into actual CLI headers and return to ordinary requests", async ({
  context,
  extensionId,
  page,
}) => {
  const captures: Array<{
    path: string
    headers: http.IncomingHttpHeaders
    body: Record<string, unknown>
  }> = []
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ data: [{ id: "gpt-test" }] }))
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    captures.push({ path: request.url!, headers: request.headers, body })
    if (request.url?.startsWith("/v1/messages")) {
      const bearer = request.headers.authorization
      response.writeHead(bearer ? 400 : 401, {
        "Content-Type": "application/json",
      })
      response.end(
        JSON.stringify({
          error: { message: bearer ? "Bearer request received" : "Use Bearer" },
        }),
      )
      return
    }
    if (request.headers.originator !== "codex_cli_rs") {
      response.writeHead(403, { "Content-Type": "application/json" })
      response.end(
        JSON.stringify({ error: { message: "CLI client required" } }),
      )
      return
    }
    const item = {
      id: "msg-test",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "OK", annotations: [] }],
    }
    const result = {
      id: "resp-test",
      object: "response",
      created_at: 0,
      model: "gpt-test",
      status: "completed",
      output: [item],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }
    const events = [
      {
        type: "response.created",
        response: { ...result, status: "in_progress", output: [], usage: null },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, status: "in_progress", content: [] },
      },
      {
        type: "response.output_text.delta",
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: "OK",
      },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: result },
    ]
    response.writeHead(200, { "Content-Type": "text/event-stream" })
    response.end(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const worker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(worker, [
      createStoredApiCredentialProfile({
        id: "simulation",
        name: "Client simulation",
        apiType: "openai",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText("gpt-test")
    const selector = page.getByRole("combobox", {
      name: "Client simulation",
      exact: true,
    })
    const probe = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    const run = probe.getByTestId(IDS.verifyProbeRunButton)
    await run.click()
    await expect(probe).toContainText("Forbidden (403)")
    await selector.click()
    await page.getByRole("option", { name: "Codex CLI", exact: true }).click()
    const enhanced = page.getByRole("switch", {
      name: "Enhanced CLI simulation",
      exact: true,
    })
    await expect(enhanced).not.toBeChecked()
    await enhanced.click()
    await run.click()
    await expect(probe).toContainText("Text generation succeeded")
    expect(captures[1]).toMatchObject({
      headers: {
        "user-agent": "codex_cli_rs/0.164.0 (Windows 10.0; x86_64)",
        authorization: "Bearer synthetic-key",
      },
      body: {
        store: false,
        stream: true,
        include: ["reasoning.encrypted_content"],
      },
    })
    expect(captures[1]!.body.client_metadata).toMatchObject({
      session_id: captures[1]!.headers["session-id"],
    })
    const turn = JSON.parse(
      String(captures[1]!.headers["x-codex-turn-metadata"]),
    )
    expect(captures[1]!.body.client_metadata).toMatchObject({
      "x-codex-installation-id": turn.installation_id,
    })
    expect(captures[1]!.body.input).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "developer" })]),
    )
    await expect(probe).toContainText("Codex CLI · Enhanced")
    await selector.click()
    await page
      .getByRole("option", { name: "None (ordinary request)", exact: true })
      .click()
    await run.click()
    await expect(probe).toContainText("Forbidden (403)")
    expect(captures[2]!.headers["user-agent"]).not.toContain("codex_cli_rs")
    expect(captures[2]!.body).not.toHaveProperty("client_metadata")
    await selector.click()
    await page.getByRole("option", { name: "Claude Code", exact: true }).click()
    await expect(enhanced).not.toBeChecked()
    await enhanced.click()
    await run.click()
    await expect(probe).toContainText("Fail")
    await expect.poll(() => captures.length).toBe(5)
    expect(
      captures.slice(3).map(({ headers }) => ({
        apiKey: headers["x-api-key"],
        bearer: headers.authorization,
      })),
    ).toEqual([
      { apiKey: "synthetic-key", bearer: undefined },
      { apiKey: undefined, bearer: "Bearer synthetic-key" },
    ])
    expect(captures[4]).toMatchObject({
      path: "/v1/messages?beta=true",
      headers: {
        "user-agent": "claude-cli/2.1.306 (external, cli)",
        "x-app": "cli",
        "x-stainless-package-version": "0.128.0",
      },
    })
    expect(
      (captures[4]!.body.system as Array<{ text: string }>)[0]!.text,
    ).toContain("x-anthropic-billing-header:")
    const rules = await worker.evaluate(async () =>
      (globalThis as any).chrome.declarativeNetRequest.getSessionRules(),
    )
    expect(rules.some((rule: { id: number }) => rule.id === 3_000_000)).toBe(
      false,
    )
    const evidencePath = test
      .info()
      .outputPath("receiving-server-request-features.json")
    await fs.writeFile(evidencePath, JSON.stringify(captures, null, 2))
    await test.info().attach("receiving-server-request-features", {
      path: evidencePath,
      contentType: "application/json",
    })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("owned Sub2API rejects ordinary requests and admits simulated Claude requests", async ({
  context,
  page,
  extensionId,
}) => {
  test.skip(
    process.env.AAH_CLI_PROFILE_LIVE !== "1",
    "Requires the disposable owned Sub2API fixture",
  )
  const fixture = JSON.parse(
    await fs.readFile(
      new URL(
        `../.scratch/cli-request-simulation/artifacts/${process.env.AAH_CLI_PROFILE_EXPERIMENT ?? "live-sub2api"}/state.private.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  )
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "en")
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      id: "live-cli",
      name: "Owned gateway client gate",
      apiType: "anthropic",
      baseUrl: fixture.baseUrl,
      apiKey: fixture.credentials.outerApiKey,
      telemetryConfig: { mode: "disabled" },
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(IDS.verifyButton).click()
  const picker = page.getByTestId(IDS.verifyModelId)
  await picker.click()
  await page.locator("[cmdk-input]").fill(fixture.modelId)
  await page
    .getByRole("option")
    .filter({ hasText: fixture.modelId })
    .first()
    .click()
  const probe = page.getByTestId(
    getApiCredentialProfileVerifyProbeTestId("text-generation"),
  )
  const run = probe.getByTestId(IDS.verifyProbeRunButton)
  const ordinaryDispatched = page.waitForResponse(
    (response) =>
      response.url().includes("/messages") &&
      response.request().method() === "POST",
  )
  await run.click()
  const ordinaryResponse = await ordinaryDispatched
  const ordinaryStatus = ordinaryResponse.status()
  const ordinaryBody = await ordinaryResponse.text()
  const restriction = "only allows Claude Code clients"
  expect(ordinaryStatus).toBe(503)
  expect(ordinaryBody).toContain(restriction)
  await expect(probe).toContainText("Fail")
  await page
    .getByRole("combobox", { name: "Client simulation", exact: true })
    .click()
  await page.getByRole("option", { name: "Claude Code", exact: true }).click()
  await page
    .getByRole("switch", { name: "Enhanced CLI simulation", exact: true })
    .click()
  const dispatched = page.waitForResponse(
    (response) =>
      response.url().includes("/messages") &&
      response.request().method() === "POST",
  )
  await run.click()
  const response = await dispatched
  expect([200, 502]).toContain(response.status())
  const passedClientRestriction = [200, 502].includes(response.status())
  expect(passedClientRestriction).toBe(true)
  // Admission is the agreed live boundary. Stop here instead of waiting for
  // SDK retries against this fixture's unconfigured inference upstream.
  await run.click()
  await expect(run).not.toHaveText("Stop")
  const evidence = {
    ordinary: {
      status: ordinaryStatus,
      restrictionRejected: ordinaryBody.includes(restriction),
    },
    simulated: {
      status: response.status(),
      enhanced: true,
      passedClientRestriction,
    },
    inferenceSuccessRequired: false,
  }
  const evidencePath = test.info().outputPath("gateway-comparison.json")
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2))
  await test.info().attach("gateway-comparison", {
    path: evidencePath,
    contentType: "application/json",
  })
})
