import "./apiCheckModalHostMocks"

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { WEB_AI_API_CHECK_TEST_IDS } from "~/entrypoints/content/webAiApiCheck/testIds"
import { PRODUCT_ANALYTICS_RESULTS } from "~/services/productAnalytics/contracts"

import { completeProductAnalyticsActionMock } from "./apiCheckModalHostMocks"
import {
  expectAnalyticsCallsToExcludeSensitiveValues,
  openModal,
  setupApiCheckModalHostTest,
} from "./apiCheckModalHostTestSupport"

describe("ApiCheckModalHost", () => {
  setupApiCheckModalHostTest()

  it("does not attach a focus tooltip to the close control when credentials are detected", async () => {
    await openModal({
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-close-fixture",
      trigger: "autoDetect",
    })

    const closeButton = screen.getByTestId(
      WEB_AI_API_CHECK_TEST_IDS.closeButton,
    )

    expect(closeButton).toHaveAccessibleName("common:actions.close")
    expect(closeButton).not.toHaveAttribute("aria-describedby")
    expect(closeButton).toHaveAttribute("title", "common:actions.close")
  })

  it("auto-extract fills baseUrl + apiKey from pasted text", async () => {
    const user = userEvent.setup()
    await openModal()

    const textarea = await screen.findByPlaceholderText(
      "webAiApiCheck:modal.sourceText.placeholder",
    )

    await user.click(textarea)
    await user.paste(
      "Base URL: https://proxy.example.com/api/v1\nAPI Key: sk-test-modal-input-fixture-12345",
    )

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement
    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://proxy.example.com/api")
      expect(apiKeyInput.value).toBe("sk-test-modal-input-fixture-12345")
    })
  })

  it("prefills cleaned enhanced values without showing an enhanced disclosure", async () => {
    const cleanedKey = "sk-testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1"

    await openModal({
      sourceText:
        "proxy.example.com/api/v1/chat/completions\nsk-testAa1Bb2Cc3Dd4Ee5Ff6Gg【删除这里]7Hh8Ii9Jj0Kk1",
      trigger: "autoDetect",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://proxy.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded", "pathNormalized"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: cleanedKey,
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix", "illegalCharsRemoved"],
              cleanupApplied: true,
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: false,
          hasCleanup: true,
          usesEnhancedResult: true,
          autoPromptEligible: false,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await screen.findByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()

    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement
    expect(apiKeyInput.value).toBe(cleanedKey)
    expectAnalyticsCallsToExcludeSensitiveValues([cleanedKey])
  })

  it("allows selecting alternate extracted candidates", async () => {
    const user = userEvent.setup()

    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://first.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: "https://second.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-first-candidate-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await user.click(
      await screen.findByRole("button", {
        name: "https://second.example.com/api",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.candidates.apiKey 2",
      }),
    )

    expect(
      (
        screen.getByPlaceholderText(
          "https://example.com/api",
        ) as HTMLInputElement
      ).value,
    ).toBe("https://second.example.com/api")
    expect(
      (screen.getByPlaceholderText("sk-...") as HTMLInputElement).value,
    ).toBe("test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
  })

  it("does not expose raw API key candidate values in button attributes", async () => {
    const rawApiKey = "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1"
    const longBaseUrl =
      "https://very-long-subdomain.example.com/api/compatible/v1"

    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://first.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: longBaseUrl,
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-first-candidate-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: rawApiKey,
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    const apiKeyCandidate = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.candidates.apiKey 2",
    })
    const baseUrlCandidate = screen.getByRole("button", {
      name: longBaseUrl,
    })

    expect(apiKeyCandidate).not.toHaveTextContent(rawApiKey)
    expect(apiKeyCandidate).toHaveAccessibleName(
      "webAiApiCheck:modal.candidates.apiKey 2",
    )
    expect(apiKeyCandidate).not.toHaveAttribute("title", rawApiKey)
    expect(apiKeyCandidate.getAttribute("data-testid")).not.toContain(rawApiKey)
    expect(baseUrlCandidate).toHaveAttribute("title", longBaseUrl)
  })

  it("does not show enhanced disclosure for unselected enhanced alternates", async () => {
    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://standard.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: "https://enhanced.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-standard-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await screen.findByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)

    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()
  })

  it("keeps enhanced disclosure hidden when selecting enhanced alternates", async () => {
    const user = userEvent.setup()

    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://standard.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: "https://enhanced.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-standard-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "https://enhanced.example.com/api",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.candidates.apiKey 2",
      }),
    )

    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()
  })

  it("tracks modal open readiness from extraction metadata selected values", async () => {
    await openModal({
      sourceText: "metadata only",
      trigger: "autoDetect",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://metadata.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: true,
          autoPromptEligible: false,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.objectContaining({
          insights: expect.objectContaining({
            readyCount: 1,
            blockedCount: 0,
          }),
        }),
      )
    })
  })
})
