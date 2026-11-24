import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  fetchLoxoCheckInStatus,
  performLoxoCheckIn,
} from "~/services/apiService/sub2api/checkin/loxoCheckIn"
import { fetchApiResponse } from "~/services/apiTransport/request"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/sub2api/auth/browserAuth", async (original) => ({
  ...(await original<
    typeof import("~/services/apiService/sub2api/auth/browserAuth")
  >()),
  recoverSub2ApiBrowserAuth: vi.fn().mockResolvedValue(null),
}))
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi.fn(),
  }),
)
vi.mock("~/services/apiTransport/request", async (original) => ({
  ...(await original<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const request = (): ApiServiceRequest => ({
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://relay.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "42",
    accessToken: "expired-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: Date.now() - 1000,
  },
})
const reply = (data: unknown, status = 200) => ({
  ok: status === 200,
  status,
  headers: {},
  body: { code: status === 200 ? 0 : status, message: "reply", data },
})
const statusData = {
  enabled: true,
  checked_in_today: false,
  captcha_required: false,
}

describe("Loxo execution status authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset().mockResolvedValue(reply(statusData))
    vi.mocked(refreshSub2ApiTokens)
      .mockReset()
      .mockResolvedValue({
        accessToken: "renewed-token",
        refreshToken: "rotated-token",
        tokenExpiresAt: Date.now() + 3600000,
      })
  })

  it("does not renew an expired credential for passive reads", async () => {
    await fetchLoxoCheckInStatus(request())
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "expired-token" }),
      }),
      expect.anything(),
    )
  })

  it("renews an expiring token before the authorized status GET", async () => {
    await fetchLoxoCheckInStatus(request(), {
      allowAuthenticationRecovery: true,
    })
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "renewed-token" }),
      }),
      expect.objectContaining({
        options: { method: "GET", cache: "no-store" },
      }),
    )
  })

  it("may retry an unauthorized status GET after renewal", async () => {
    const input = request()
    delete input.auth.tokenExpiresAt
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(reply(null, 401))
      .mockResolvedValueOnce(reply(statusData))
    await expect(
      fetchLoxoCheckInStatus(input, { allowAuthenticationRecovery: true }),
    ).resolves.toMatchObject({ checkedInToday: false })
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it("does not renew or replay an unauthorized POST", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(reply(null, 401))
    await expect(performLoxoCheckIn(request())).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })
})
