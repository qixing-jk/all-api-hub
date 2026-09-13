import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchAgentRouterPublicStatus } from "~/services/apiService/agentrouter/status"
import { AuthTypeEnum } from "~/types"

const { mockFetchEnvelope } = vi.hoisted(() => ({
  mockFetchEnvelope: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: mockFetchEnvelope },
}))

describe("AgentRouter public status", () => {
  beforeEach(() => {
    mockFetchEnvelope.mockReset()
  })

  it("reads /api/status without forwarding account credentials", async () => {
    const status = {
      success: true,
      message: "ok",
      data: {
        system_name: "Agent Router",
        github_oauth: true,
        github_client_id: "example-client-id",
        linuxdo_oauth: true,
        linuxdo_client_id: "example-linuxdo-client-id",
      },
    }
    const request = {
      baseUrl: "https://agentrouter.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.Cookie,
        cookie: "session=secret",
      },
    }
    const signal = new AbortController().signal
    mockFetchEnvelope.mockResolvedValueOnce(status)

    await expect(
      fetchAgentRouterPublicStatus(request, signal),
    ).resolves.toEqual(status)
    expect(mockFetchEnvelope).toHaveBeenCalledWith(
      {
        ...request,
        auth: { authType: AuthTypeEnum.None },
      },
      {
        endpoint: "/api/status",
        options: { signal },
      },
    )
  })
})
