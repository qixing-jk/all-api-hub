import type { AddressInfo } from "node:net"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { WebAiApiCheckMessageTypes } from "~/services/verification/webAiApiCheck/messaging"
import { API_CREDENTIAL_PROFILES_CONFIG_VERSION } from "~/types/apiCredentialProfiles"
import { createStoredApiCredentialProfile } from "~~/e2e/utils/commonUserFlows"
import { createDrawingServer } from "~~/e2e/utils/verificationDrawingServer"

import { expect, test } from "./extensionTest"

test("Firefox answers a webpage verification message in the background", async ({
  firefoxExtension,
}) => {
  const fixture = createDrawingServer({ textResponse: () => "Paris" })
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  try {
    await firefoxExtension.driver.executeScript("Services.io.offline = false")
    const options = firefoxExtension.page("options.html")
    await options.openInTab("#overview")
    const message = {
      id: 1,
      type: WebAiApiCheckMessageTypes.RunQuestionAnswer,
      data: {
        runId: "firefox-background-qa",
        apiType: "openai-compatible",
        baseUrl: `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`,
        apiKey: "synthetic-key",
        modelId: "gpt-quality",
        question: "What is the capital of France?",
        referenceAnswer: "Paris",
      },
    }
    const response = await options.evaluateAsync(
      `browser.runtime.sendMessage({... ${JSON.stringify(message)}, timestamp: Date.now()})`,
    )
    expect(response).toMatchObject({
      res: { success: true, result: { answer: "Paris", outcome: "matched" } },
    })
    expect(fixture.requests).toHaveLength(1)
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("Firefox runs agent JavaScript and renders the workspace SVG", async ({
  firefoxExtension,
}, testInfo) => {
  const fixture = createDrawingServer()
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  try {
    // This fixture owns an isolated browser. Allow its synthetic loopback API.
    await firefoxExtension.driver.executeScript("Services.io.offline = false")
    const options = firefoxExtension.page("options.html")
    await options.openInTab("#overview")
    const config = {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [
        createStoredApiCredentialProfile({
          id: "firefox-agent",
          name: "Firefox agent target",
          apiType: "openai-compatible",
          baseUrl: `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ],
      lastUpdated: Date.now(),
    }
    await options.evaluateAsync(
      `navigator.locks.request(${JSON.stringify(STORAGE_LOCKS.API_CREDENTIAL_PROFILES)}, () => browser.storage.local.set({[${JSON.stringify(STORAGE_KEYS.API_CREDENTIAL_PROFILES)}]: ${JSON.stringify(JSON.stringify(config))}}))`,
    )
    await options.evaluate(
      `location.hash = ${JSON.stringify(MENU_ITEM_IDS.API_CREDENTIAL_PROFILES)}`,
    )
    await options.click(IDS.verifyButton)
    await expect
      .poll(() =>
        options.evaluate<string>(
          `document.querySelector('[data-testid="${IDS.verifyModelId}"]')?.textContent ?? ''`,
        ),
      )
      .toContain("gpt-quality")
    await options.clickSelector('[role="switch"][id]')
    await options.clickButton("Run drawing test")
    await expect
      .poll(
        () =>
          options.evaluate<string>(
            "document.querySelector('[data-testid=agent-test-result]')?.textContent ?? ''",
          ),
        { timeout: 30_000 },
      )
      .toContain("An SVG file was generated")
    await expect
      .poll(() =>
        options.evaluate<boolean>(
          "(() => { const img = document.querySelector('[data-testid=pelican-svg-preview]'); return Boolean(img?.complete && img.naturalWidth > 0); })()",
        ),
      )
      .toBe(true)
    expect(fixture.requests).toHaveLength(2)
    expect(
      String(
        fixture.requests[1]?.messages.find((message) => message.role === "tool")
          ?.content,
      ),
    ).toContain("workspace checked")
    await options.screenshot(testInfo.outputPath("agent-firefox.png"))
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})
