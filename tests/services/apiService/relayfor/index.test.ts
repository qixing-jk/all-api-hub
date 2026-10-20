import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  claimRelayForCheckIn,
  createRelayForToken,
  deleteRelayForToken,
  fetchRelayForAnnouncement,
  fetchRelayForCheckInCampaigns,
  fetchRelayForModels,
  fetchRelayForOverview,
  fetchRelayForTokens,
  fetchRelayForUserInfo,
  rotateRelayForToken,
  updateRelayForToken,
} from "~/services/apiService/relayfor"
import * as transport from "~/services/apiService/relayfor/transport"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/relayfor/transport", () => ({
  fetchRelayForData: vi.fn(),
  isRelayForAuthFailureError: vi.fn(),
}))

const request = {
  baseUrl: "https://relayfor.xyz",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token-abc" },
}

describe("relayfor api service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetchRelayForUserInfo fetches and validates user info", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      id: 1,
      username: "relayuser",
      quota: 500000,
      role: 1,
    })

    const user = await fetchRelayForUserInfo(request)
    expect(user.id).toBe(1)
    expect(user.username).toBe("relayuser")
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/self",
      { method: "GET" },
    )
  })

  it("fetchRelayForOverview fetches and validates account overview", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      user: { id: 1, username: "relayuser", quota: 500000, role: 1 },
      total_quota: 500000,
      today: { requests: 10, tokens: 2000, quota: 15000 },
    })

    const overview = await fetchRelayForOverview(request)
    expect(overview.user.username).toBe("relayuser")
    expect(overview.today?.requests).toBe(10)
    expect(overview.today?.quota).toBe(15000)
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/overview",
      { method: "GET" },
    )
  })

  it("fetchRelayForTokens fetches token list", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce([
      {
        id: 10,
        name: "test-token",
        key: "sk-abc...masked",
        status: 1,
        remain_quota: 100000,
        used_quota: 5000,
        unlimited_quota: false,
      },
    ])

    const tokens = await fetchRelayForTokens(request)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.name).toBe("test-token")
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/tokens",
      { method: "GET" },
    )
  })

  it("createRelayForToken creates token with payload", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      id: 11,
      name: "new-token",
      key: "sk-plaintext-key-12345",
      status: 1,
      remain_quota: 200000,
      used_quota: 0,
      unlimited_quota: false,
    })

    const created = await createRelayForToken(request, {
      name: "new-token",
      remain_quota: 200000,
    })
    expect(created.key).toBe("sk-plaintext-key-12345")
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/tokens",
      {
        method: "POST",
        body: { name: "new-token", remain_quota: 200000 },
      },
    )
  })

  it("updateRelayForToken updates token by id", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      id: 11,
      name: "renamed",
      status: 2,
    })

    await updateRelayForToken(request, 11, { name: "renamed", status: 2 })
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/tokens/11",
      {
        method: "PUT",
        body: { name: "renamed", status: 2 },
      },
    )
  })

  it("rotateRelayForToken rotates key and returns plaintext", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      key: "sk-rotated-key-99999",
    })

    const result = await rotateRelayForToken(request, 11)
    expect(result.key).toBe("sk-rotated-key-99999")
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/tokens/11/rotate",
      { method: "POST" },
    )
  })

  it("deleteRelayForToken deletes key by id", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      success: true,
    })

    await deleteRelayForToken(request, 11)
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/tokens/11",
      { method: "DELETE" },
    )
  })

  it("fetchRelayForModels fetches models list", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      items: [
        { model: "gpt-4o", display_name: "GPT-4o", accessible: true },
        { model: "claude-3-5-sonnet", accessible: true },
      ],
    })

    const models = await fetchRelayForModels(request)
    expect(models.items).toHaveLength(2)
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/models",
      { method: "GET" },
    )
  })

  it("fetchRelayForCheckInCampaigns fetches active campaigns", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce([
      {
        id: 1,
        name: "October Check-in",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 3,
        days: [{ date: "2026-10-19", claimed: false, can_claim: true }],
      },
    ])

    const campaigns = await fetchRelayForCheckInCampaigns(request)
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0]?.name).toBe("October Check-in")
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/checkin-campaigns",
      { method: "GET" },
    )
  })

  it("claimRelayForCheckIn claims check-in for specific date", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      is_makeup: false,
      reward_type: "quota",
      quota_awarded: 10000,
    })

    const result = await claimRelayForCheckIn(request, 1, "2026-10-19")
    expect(result.quota_awarded).toBe(10000)
    expect(result.is_makeup).toBe(false)
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/user/checkin-campaigns/1/claim",
      {
        method: "POST",
        body: { date: "2026-10-19" },
      },
    )
  })

  it("fetchRelayForAnnouncement fetches site announcement", async () => {
    vi.mocked(transport.fetchRelayForData).mockResolvedValueOnce({
      title: "Notice",
      content: "Maintenance notice",
    })

    const announcement = await fetchRelayForAnnouncement(request)
    expect(announcement.title).toBe("Notice")
    expect(transport.fetchRelayForData).toHaveBeenCalledWith(
      request,
      "/api/site/announcement",
      { method: "GET" },
    )
  })
})
