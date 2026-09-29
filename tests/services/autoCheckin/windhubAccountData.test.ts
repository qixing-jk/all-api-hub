import { beforeEach, describe, expect, it, vi } from "vitest"

import { windhubAccountData } from "~/services/apiAdapters/windhub/accountData"
import { readWindhubBrowserStatus } from "~/services/checkin/autoCheckin/providers/windhub"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/checkin/autoCheckin/providers/windhub", () => ({
  readWindhubBrowserStatus: vi.fn(),
}))

const request = {
  baseUrl: "https://windhub.cc",
  auth: { authType: AuthTypeEnum.None, userId: "123" },
  checkIn: buildCheckInConfig(),
} satisfies Parameters<typeof windhubAccountData.fetchData>[0]

describe("Windhub check-in-only account data", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requires verified browser status before creating an account", async () => {
    vi.mocked(readWindhubBrowserStatus).mockResolvedValue({
      kind: "identity_mismatch",
    })
    await expect(windhubAccountData.fetchData(request)).rejects.toThrow(
      "Windhub browser session",
    )
    expect(readWindhubBrowserStatus).toHaveBeenCalledWith("123")
  })

  it("does not probe another origin", async () => {
    await expect(
      windhubAccountData.fetchData({
        ...request,
        baseUrl: "https://example.org",
      }),
    ).rejects.toThrow("Windhub browser session")
    expect(readWindhubBrowserStatus).not.toHaveBeenCalled()
  })

  it("stores check-in settings without claiming usage metrics", async () => {
    vi.mocked(readWindhubBrowserStatus).mockResolvedValue({
      kind: "status",
      enabled: true,
      checked: true,
    })
    const result = await windhubAccountData.fetchData(request)
    expect(result.checkIn).toBe(request.checkIn)
    expect(result.todayStatsAvailability?.consumption).toMatchObject({
      status: "unavailable",
      reason: "unsupported",
    })
  })
})
