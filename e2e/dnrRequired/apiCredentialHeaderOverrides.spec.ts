import http from "node:http"
import type { AddressInfo } from "node:net"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileRowTestId,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getCdpHeader } from "~~/e2e/utils/cdpHeaders"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  E2E_BUILD_VARIANTS,
  readE2eBuildVariant,
} from "~~/e2e/utils/e2eBuildVariants"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test("sends credential-specific UA headers without changing concurrent ordinary requests", async ({
  context,
  extensionId,
  page,
}) => {
  test.skip(
    readE2eBuildVariant() !== E2E_BUILD_VARIANTS.DnrRequired,
    "Requires the DNR permission build",
  )
  const captures: Array<{
    path?: string
    key?: string
    ua?: string
    client?: string
  }> = []
  let releaseFirst: (() => void) | undefined
  const server = http.createServer((request, response) => {
    captures.push({
      path: request.url,
      key: request.headers.authorization,
      ua: request.headers["user-agent"],
      client: request.headers["x-client"] as string | undefined,
    })
    if (request.url === "/v1/chat/completions") {
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.write(
        `data: ${JSON.stringify({ id: "chatcmpl-test", object: "chat.completion.chunk", created: 0, model: "gpt-test", choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] })}\n\n`,
      )
      response.end(
        `data: ${JSON.stringify({ id: "chatcmpl-test", object: "chat.completion.chunk", created: 0, model: "gpt-test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
      )
      return
    }
    const respond = () => {
      if (response.writableEnded || response.destroyed) return
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ data: [{ id: "gpt-test" }] }))
    }
    if (request.headers.authorization === "Bearer key-a" && !releaseFirst)
      releaseFirst = respond
    else respond()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const worker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(worker, [
      createStoredApiCredentialProfile({
        id: "headers-a",
        name: "Headers A",
        baseUrl: origin,
        apiKey: "key-a",
        requestHeaders: { "user-agent": "initial/1" },
        telemetryConfig: { mode: "disabled" },
      }),
      createStoredApiCredentialProfile({
        id: "headers-b",
        name: "Headers B",
        baseUrl: origin,
        apiKey: "key-b",
        requestHeaders: { "user-agent": "client-b/1", "x-client": "b" },
        telemetryConfig: { mode: "disabled" },
      }),
      createStoredApiCredentialProfile({
        id: "headers-default",
        name: "Default",
        baseUrl: origin,
        apiKey: "key-default",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    const pageB = await context.newPage()
    const ordinaryPage = await context.newPage()
    const cdpRequests = new Map<
      string,
      { url?: string; ua?: string; key?: string }
    >()
    for (const target of [page, pageB, ordinaryPage]) {
      const session = await context.newCDPSession(target)
      session.on("Network.requestWillBeSent", ({ requestId, request }) => {
        cdpRequests.set(requestId, {
          ...cdpRequests.get(requestId),
          url: request.url,
        })
      })
      session.on(
        "Network.requestWillBeSentExtraInfo",
        ({ requestId, headers }) => {
          cdpRequests.set(requestId, {
            ...cdpRequests.get(requestId),
            ua: getCdpHeader(headers, "user-agent"),
            key: getCdpHeader(headers, "authorization"),
          })
        },
      )
      await session.send("Network.enable")
    }
    const url = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`
    for (const target of [page, pageB, ordinaryPage]) {
      await target.goto(url)
      await waitForExtensionRoot(target)
    }
    await page
      .getByTestId(getApiCredentialProfileRowTestId("headers-a"))
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.editButton)
      .click()
    const editor = page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialog)
    await expect(editor.getByLabel("Header value")).toHaveAttribute(
      "type",
      "password",
    )
    await editor.getByLabel("Header value").fill("client-a/1")
    await editor.getByRole("button", { name: "Add header" }).click()
    await editor.getByLabel("Header name").last().fill("X-Client")
    await editor.getByLabel("Header value").last().fill("a")
    const headerSection = editor.locator("details").filter({
      has: page.getByLabel("Header name"),
    })
    await headerSection.screenshot({
      path: test.info().outputPath("request-headers-desktop.png"),
    })
    const originalViewport = page.viewportSize()!
    await page.setViewportSize({ width: 390, height: 844 })
    await headerSection.screenshot({
      path: test.info().outputPath("request-headers-mobile.png"),
    })
    const overflow = await headerSection.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    )
    expect(overflow).toBe(false)
    await page.setViewportSize(originalViewport)
    await editor
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton)
      .click()
    await expect(editor).toBeHidden()
    await page.reload()
    await waitForExtensionRoot(page)
    await page
      .getByTestId(getApiCredentialProfileRowTestId("headers-a"))
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton)
      .click()
    await expect
      .poll(() => captures.some((capture) => capture.key === "Bearer key-a"))
      .toBe(true)
    await pageB
      .getByTestId(getApiCredentialProfileRowTestId("headers-b"))
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton)
      .click()
    await ordinaryPage
      .getByTestId(getApiCredentialProfileRowTestId("headers-default"))
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton)
      .click()
    expect(captures).toHaveLength(1)
    releaseFirst!()
    await expect
      .poll(() => new Set(captures.map((capture) => capture.key)).size)
      .toBe(3)
    expect(
      captures.find((capture) => capture.key === "Bearer key-a"),
    ).toMatchObject({ ua: "client-a/1", client: "a" })
    expect(
      captures.find((capture) => capture.key === "Bearer key-b"),
    ).toMatchObject({ ua: "client-b/1", client: "b" })
    const ordinary = captures.find(
      (capture) => capture.key === "Bearer key-default",
    )!
    expect(ordinary.ua).toContain("Chrome/")
    expect(ordinary.client).toBeUndefined()
    const textProbe = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await textProbe
      .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton)
      .click()
    await expect(textProbe).toContainText("Text generation succeeded")
    expect(
      captures.find((capture) => capture.path === "/v1/chat/completions"),
    ).toMatchObject({ key: "Bearer key-a", ua: "client-a/1", client: "a" })
    const actualCdpRequests = () =>
      [...cdpRequests.values()].filter(
        ({ url, ua }) => url?.startsWith(origin) && ua,
      )
    await expect.poll(() => actualCdpRequests().length).toBe(captures.length)
    for (const capture of captures) {
      expect(actualCdpRequests()).toContainEqual({
        url: `${origin}${capture.path}`,
        key: capture.key,
        ua: capture.ua,
      })
    }
    await test.info().attach("actual-request-user-agents", {
      body: JSON.stringify(
        { server: captures, cdp: actualCdpRequests() },
        null,
        2,
      ),
      contentType: "application/json",
    })
    const rules = await worker.evaluate(async () =>
      (globalThis as any).chrome.declarativeNetRequest.getSessionRules(),
    )
    expect(rules.some((rule: { id: number }) => rule.id === 3_000_000)).toBe(
      false,
    )
  } finally {
    releaseFirst?.()
    await context.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
