import { describe, expect, it, vi } from "vitest"

import { accountStorage } from "~/services/accounts/accountStorage"
import { getApiService } from "~/services/apiService"
import { redeemService } from "~/services/redemption/redeemService"

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: vi.fn(),
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
}))

describe("redeemService.redeemCodeForAccount", () => {
  it("returns a localized error when the account is missing", async () => {
    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)

    const result = await redeemService.redeemCodeForAccount("missing", "CODE")

    expect(result.success).toBe(false)
    expect(result.message).toBe("messages:storage.accountNotFound")
    expect(getApiService).not.toHaveBeenCalled()
  })

  it("rejects disabled accounts and does not call the API service", async () => {
    ;(
      accountStorage.getAccountById as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: "disabled-1",
      disabled: true,
      site_name: "Disabled Site",
    })

    const result = await redeemService.redeemCodeForAccount(
      "disabled-1",
      "CODE",
    )

    expect(result.success).toBe(false)
    expect(result.message).toBe("messages:storage.accountDisabled")
    expect(getApiService).not.toHaveBeenCalled()
  })
})
