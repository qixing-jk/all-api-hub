import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useRepairMissingKeysJob } from "~/features/KeyManagement/components/useRepairMissingKeysJob"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"
import { renderHook } from "~~/tests/test-utils/render"

vi.mock("~/services/accounts/accountKeyAutoProvisioning/messaging", () => ({
  AccountKeyRepairMessageTypes: {
    Start: "accountKeyRepair:start",
    GetProgress: "accountKeyRepair:getProgress",
    DeleteInvalidTokens: "accountKeyRepair:deleteInvalidTokens",
  },
  sendAccountKeyRepairMessage: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: vi.fn(),
  trackProductAnalyticsActionStarted: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  onRuntimeMessage: vi.fn(() => vi.fn()),
}))

const sendAccountKeyRepairMessageMock = vi.mocked(sendAccountKeyRepairMessage)

describe("useRepairMissingKeysJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the load failure message when progress loading returns an unsuccessful response", async () => {
    sendAccountKeyRepairMessageMock.mockResolvedValue({
      success: false,
      error: "load failed",
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [
          {
            id: "account-1",
            name: "Account 1",
            siteType: SITE_TYPES.NEW_API,
            baseUrl: "https://one.example.invalid",
            token: "token",
            authType: AuthTypeEnum.AccessToken,
            disabled: false,
            health: { status: SiteHealthStatus.Healthy },
          } as any,
        ],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.error).toBe(
        "keyManagement:repairMissingKeys.messages.loadFailed",
      )
    })
    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.GetProgress,
    )
  })
})
