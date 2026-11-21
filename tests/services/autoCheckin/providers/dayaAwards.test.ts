import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { performDayaCheckIn } from "~/services/apiService/daya/rewards"
import { dayaProvider } from "~/services/checkin/autoCheckin/providers/daya"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/daya/rewards", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/apiService/daya/rewards")
  >()),
  performDayaCheckIn: vi.fn(),
}))

const account = buildSiteAccount({
  id: "daya-award-account",
  site_type: SITE_TYPES.DAYA,
  site_url: "https://api.dayaai.com",
  authType: AuthTypeEnum.Cookie,
})
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}

describe("Daya confirmed check-in awards", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(["0.1234567890123456789", "0"])(
    "uses actual USD grant %s instead of the announced amount",
    async (amount) => {
      vi.mocked(performDayaCheckIn).mockResolvedValue({
        alreadyChecked: false,
        status: "success",
        rewardUsd: 99,
        message: "claimed",
        data: { amount, currency: CURRENCIES.USD },
      })
      const result = await dayaProvider.checkIn(account, context)
      expect(result).toMatchObject({
        status: "success",
        awards: [
          {
            amount: {
              status: "known",
              value: amount,
              source: {
                operation: "/api/v1/rewards/check-in",
                inputs: ["amount"],
              },
            },
            asset: { kind: "currency", code: "USD" },
            validity: { kind: "unknown" },
          },
        ],
      })
      expect(performDayaCheckIn).toHaveBeenCalledTimes(1)
    },
  )

  it.each([{}, { amount: 2 }, { amount: 2, currency: "points" }])(
    "does not fill an unverified grant from the announcement: %j",
    async (data) => {
      vi.mocked(performDayaCheckIn).mockResolvedValue({
        alreadyChecked: false,
        status: "success",
        rewardUsd: 99,
        data,
        message: undefined,
      })
      const result = await dayaProvider.checkIn(account, context)
      expect(result.status).toBe("success")
      expect(result.awards ?? []).toEqual([])
      expect(result.reward).toBeUndefined()
    },
  )
})
