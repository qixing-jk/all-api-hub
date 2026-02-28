import { describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      getPreferences: vi.fn(),
    },
  }
})

describe("redemptionAssist shouldPrompt batch filtering", () => {
  it("returns only prompt-eligible codes for a url", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    const getPreferencesMock = vi.mocked(userPreferences.getPreferences)

    getPreferencesMock.mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      redemptionAssist: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        urlWhitelist: {
          enabled: false,
          patterns: [""],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: true,
        },
        // Strict hex validation for this test case.
        relaxedCodeValidation: false,
      },
    })

    const { handleRedemptionAssistMessage } = await import(
      "~/services/redemptionAssist"
    )

    const validHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const invalidHex = "g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const tooShort = "1234"

    const sendResponse = vi.fn()

    await handleRedemptionAssistMessage(
      {
        action: RuntimeActionIds.RedemptionAssistShouldPrompt,
        url: "https://example.com/redeem",
        codes: [validHex, invalidHex, tooShort],
      },
      { tab: { id: 99 } } as any,
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      promptableCodes: [validHex],
    })
  })
})
