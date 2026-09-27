import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  extractCheckInSupport as extractNewApiCheckInSupport,
  fetchSupportCheckIn as fetchNewApiSupport,
} from "~/services/apiService/newApiFamily/default/accountBootstrap"
import {
  extractCheckInSupport as extractVeloeraCheckInSupport,
  fetchSupportCheckIn as fetchVeloeraSupport,
} from "~/services/apiService/newApiFamily/variants/veloeraCheckIn"
import { AuthTypeEnum } from "~/types"

const { requestData } = vi.hoisted(() => ({ requestData: vi.fn() }))
vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data: requestData },
}))

describe("site-native check-in support parsing", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([
    [{ checkin_enabled: true, check_in_enabled: false }, true, false],
    [{ checkin_enabled: false, check_in_enabled: true }, false, true],
    [{}, undefined, undefined],
    [null, undefined, undefined],
  ] as const)(
    "uses the same native rule for supplied and fetched status %j",
    async (status, newApiSupport, veloeraSupport) => {
      expect(extractNewApiCheckInSupport(status)).toBe(newApiSupport)
      expect(extractVeloeraCheckInSupport(status)).toBe(veloeraSupport)
      expect(requestData).not.toHaveBeenCalled()

      requestData.mockResolvedValue(status)
      const request = {
        baseUrl: "https://support.example.com",
        auth: { authType: AuthTypeEnum.None },
      }
      await expect(fetchNewApiSupport(request)).resolves.toBe(newApiSupport)
      await expect(fetchVeloeraSupport(request)).resolves.toBe(veloeraSupport)
    },
  )
})
