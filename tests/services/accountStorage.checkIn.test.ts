import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountStorage } from "~/services/accountStorage"
import { createSiteAccount } from "~/tests/fixtures/accounts"

vi.mock("i18next", () => ({
  t: (key: string) => key,
  default: { t: (key: string) => key }
}))

beforeEach(async () => {
  await accountStorage.clearAllData()
})

afterEach(async () => {
  await accountStorage.clearAllData()
  vi.useRealTimers()
})

describe("accountStorage check-in helpers", () => {
  it("marks an account as checked in and stamps the current date", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-09-15T03:00:00Z"))

    const account = createSiteAccount({
      id: "acct-checked",
      checkIn: {
        enableDetection: true,
        isCheckedInToday: false,
        customCheckInUrl: "https://custom-check",
        customRedeemUrl: "https://custom-redeem",
        openRedeemWithCheckIn: false
      }
    })

    await accountStorage.importData({ accounts: [account] })

    const success = await accountStorage.markAccountAsCheckedIn(account.id)
    expect(success).toBe(true)

    const updated = await accountStorage.getAccountById(account.id)
    expect(updated?.checkIn.isCheckedInToday).toBe(true)
    expect(updated?.checkIn.lastCheckInDate).toBe("2024-09-15")
    expect(updated?.checkIn.customCheckInUrl).toBe("https://custom-check")
    expect(updated?.checkIn.customRedeemUrl).toBe("https://custom-redeem")
    expect(updated?.checkIn.openRedeemWithCheckIn).toBe(false)
  })

  it("resets stale custom check-in states while keeping fresh ones", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01T23:30:00-05:00"))

    const expired = createSiteAccount({
      id: "expired",
      checkIn: {
        enableDetection: true,
        isCheckedInToday: true,
        customCheckInUrl: "https://custom",
        lastCheckInDate: "2024-01-01"
      }
    })

    const fresh = createSiteAccount({
      id: "fresh",
      checkIn: {
        enableDetection: true,
        isCheckedInToday: true,
        customCheckInUrl: "https://custom",
        lastCheckInDate: "2024-01-02"
      }
    })

    const noCustom = createSiteAccount({
      id: "no-custom",
      checkIn: {
        enableDetection: true,
        isCheckedInToday: true,
        lastCheckInDate: "2024-01-01"
      }
    })

    const alreadyReset = createSiteAccount({
      id: "already",
      checkIn: {
        enableDetection: true,
        isCheckedInToday: false,
        customCheckInUrl: "https://custom",
        lastCheckInDate: "2024-01-01"
      }
    })

    await accountStorage.importData({
      accounts: [expired, fresh, noCustom, alreadyReset]
    })

    await accountStorage.resetExpiredCheckIns()

    const accounts = await accountStorage.getAllAccounts()
    const accountMap = new Map(accounts.map((item) => [item.id, item]))

    expect(accountMap.get("expired")?.checkIn.isCheckedInToday).toBe(false)
    expect(accountMap.get("expired")?.checkIn.lastCheckInDate).toBeUndefined()

    expect(accountMap.get("fresh")?.checkIn.isCheckedInToday).toBe(true)
    expect(accountMap.get("fresh")?.checkIn.lastCheckInDate).toBe("2024-01-02")

    expect(accountMap.get("no-custom")?.checkIn.isCheckedInToday).toBe(true)
    expect(accountMap.get("no-custom")?.checkIn.lastCheckInDate).toBe(
      "2024-01-01"
    )

    expect(accountMap.get("already")?.checkIn.isCheckedInToday).toBe(false)
    expect(accountMap.get("already")?.checkIn.lastCheckInDate).toBe(
      "2024-01-01"
    )
  })
})
