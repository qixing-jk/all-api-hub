import { beforeEach, describe, expect, it, vi } from "vitest"

import { CHECK_IN_METHOD_DETECTION_OUTCOMES } from "~/constants/checkIn"
import { browserAutomationProvider } from "~/services/checkin/autoCheckin/providers/browserAutomation"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { BrowserCheckInExecutionResult } from "~/types/checkinAutomation"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { tempWindowBrowserCheckIn } from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  tempWindowBrowserCheckIn: vi.fn(),
}))

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: vi.fn(),
}))

const BROWSER_CONFIG = {
  enabled: true,
  action: { kind: "click_selector" as const, selector: "button.check-in" },
  success: { textPattern: "success" },
  timeoutMs: 10_000,
}

const account = buildSiteAccount({
  id: "browser-account",
  site_url: "https://checkin.example.invalid",
  checkIn: buildCheckInConfig({
    customCheckIn: {
      url: "https://checkin.example.invalid/console",
      browserAutomation: BROWSER_CONFIG,
    },
  }),
})

const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution("manual_checkin"),
}

describe("browserAutomationProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(safeRandomUUID).mockReturnValue("browser-request")
  })

  it("is ready and detected only when the saved browser contract is valid", async () => {
    expect(browserAutomationProvider.getReadiness(account)).toEqual({
      ready: true,
    })
    await expect(
      browserAutomationProvider.detect!({ account, observedAt: 123 }),
    ).resolves.toEqual({
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
      evidence: { source: "user_configuration" },
    })

    const withoutConfiguration = buildSiteAccount({
      checkIn: buildCheckInConfig(),
    })
    expect(
      browserAutomationProvider.getReadiness(withoutConfiguration),
    ).toEqual({
      ready: false,
      reason: "account_data_missing",
    })
    await expect(
      browserAutomationProvider.detect!({
        account: withoutConfiguration,
        observedAt: 456,
      }),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
      reason: "invalid_response",
      attemptedAt: 456,
    })
  })

  it("forwards the bounded configuration and maps explicit execution outcomes", async () => {
    const success: BrowserCheckInExecutionResult = {
      success: true,
      reason: "completed",
      actionTriggered: true,
      matchedCondition: "text",
      currentUrl: "https://checkin.example.invalid/console",
    }
    vi.mocked(tempWindowBrowserCheckIn).mockResolvedValueOnce(success)

    await expect(
      browserAutomationProvider.checkIn(account, context),
    ).resolves.toEqual({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      data: success,
    })
    expect(tempWindowBrowserCheckIn).toHaveBeenCalledWith({
      pageUrl: "https://checkin.example.invalid/console",
      requestId: "browser-request",
      action: BROWSER_CONFIG.action,
      success: BROWSER_CONFIG.success,
      timeoutMs: BROWSER_CONFIG.timeoutMs,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: context.protectionBypassExecution,
    })

    const timeout: BrowserCheckInExecutionResult = {
      success: false,
      reason: "timeout",
      actionTriggered: true,
    }
    vi.mocked(tempWindowBrowserCheckIn).mockResolvedValueOnce(timeout)
    await expect(
      browserAutomationProvider.checkIn(account, context),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: "timeout",
      messageKey: "autoCheckin:providerFallback.browserAutomationTimeout",
      data: timeout,
    })
  })
})
