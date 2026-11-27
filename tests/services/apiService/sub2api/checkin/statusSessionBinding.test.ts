import { afterEach, describe, expect, it, vi } from "vitest"

import * as browserAuth from "~/services/apiService/sub2api/auth/browserAuth"
import * as tokenRefresh from "~/services/apiService/sub2api/auth/tokenRefresh"
import { fetchDaiguaDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/daiguaCheckIn"
import { fetchGeniusProgrammerDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/geniusProgrammerCheckIn"
import { fetchHiyoDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/hiyoCheckIn"
import { fetchSub2ApiProDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/proCheckInExecution"
import { fetchSidruneDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/sidruneCheckIn"
import { fetchToolcodeDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/toolcodeCheckIn"
import * as transport from "~/services/apiTransport/request"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const request: ApiServiceRequest = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://relay.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "access",
    refreshToken: "refresh",
    userId: "42",
  },
}

afterEach(() => vi.restoreAllMocks())

describe.each([
  ["Pro", fetchSub2ApiProDailyCheckInStatus],
  ["Genius Programmer", fetchGeniusProgrammerDailyCheckInStatus],
  ["Hiyo", fetchHiyoDailyCheckInStatus],
  ["Toolcode", fetchToolcodeDailyCheckInStatus],
  ["Sidrune", fetchSidruneDailyCheckInStatus],
  ["DaiGua", fetchDaiguaDailyCheckInStatus],
] as const)("%s status admission", (_, read) => {
  it.each([
    { code: "SESSION_BINDING_MISMATCH" },
    { code: "SESSION_BINDING_MISMATCH", reason: "client address changed" },
  ])("requests the bound browser session directly for %j", async (body) => {
    const get = vi
      .spyOn(transport, "fetchApiResponse")
      .mockResolvedValue({ ok: false, status: 401, headers: {}, body })
    const rotate = vi
      .spyOn(tokenRefresh, "refreshSub2ApiTokens")
      .mockRejectedValue(new Error("Unexpected refresh"))
    const browser = vi
      .spyOn(browserAuth, "recoverSub2ApiBrowserAuth")
      .mockResolvedValue(null)

    await expect(
      read(request, { allowAuthenticationRecovery: true }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(get).toHaveBeenCalledOnce()
    expect(browser).toHaveBeenCalledOnce()
    expect(rotate).not.toHaveBeenCalled()
  })
})
