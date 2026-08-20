import { beforeEach, describe, expect, it, vi } from "vitest"

import { listChannels } from "~/services/apiService/octopus"
import { octopusAuthManager } from "~/services/apiService/octopus/auth"

const { mockTempWindowOctopusApiFetch } = vi.hoisted(() => ({
  mockTempWindowOctopusApiFetch: vi.fn(),
}))

vi.mock("~/services/apiService/octopus/tempContextClient", () => ({
  tempWindowOctopusApiFetch: mockTempWindowOctopusApiFetch,
}))

describe("Octopus cookie authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    octopusAuthManager.clearAllCache()
  })

  it("uses the current login session for the following channel request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: "login successfully",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: [] },
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })

    await expect(
      listChannels({
        baseUrl: "https://octopus.example.invalid",
        username: "admin",
        password: "credential-placeholder",
      }),
    ).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://octopus.example.invalid/api/v1/user/login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    ])

    expect(mockTempWindowOctopusApiFetch).toHaveBeenCalledOnce()
    const channelRequest = mockTempWindowOctopusApiFetch.mock.calls[0][0]
    const headers = new Headers(channelRequest.fetchOptions.headers)
    expect(channelRequest.fetchOptions.credentials).toBe("include")
    expect(headers.get("Authorization")).toBeNull()
    expect(channelRequest.fetchUrl).toBe(
      "https://octopus.example.invalid/api/v1/channel/list",
    )
  })
})
