import { describe, expect, it, vi } from "vitest"

import { fetchTelemetryJson } from "~/services/apiCredentialProfiles/telemetryTransport"
import { ApiError } from "~/services/apiTransport/errors"
import { API_AUTH_TOKEN_MODES } from "~/services/apiTransport/type"

const { fetchApiMock } = vi.hoisted(() => ({
  fetchApiMock: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: (...args: unknown[]) => fetchApiMock(...args),
}))

describe("api credential telemetry transport", () => {
  it("passes raw authorization mode and returns the requested endpoint", async () => {
    fetchApiMock.mockResolvedValue({ balance: 1 })

    await expect(
      fetchTelemetryJson({
        baseUrl: "https://example.invalid",
        endpoint: "/usage",
        bearerToken: "token",
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      }),
    ).resolves.toEqual({ endpoint: "/usage", json: { balance: 1 } })

    expect(fetchApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.invalid",
        auth: expect.objectContaining({ accessToken: "token" }),
      }),
      expect.objectContaining({
        endpoint: "/usage",
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      }),
      true,
    )
  })

  it("preserves unsupported endpoint classification for 404 and 405", async () => {
    fetchApiMock.mockRejectedValue(
      new ApiError("method not allowed", 405, "/usage"),
    )

    await expect(
      fetchTelemetryJson({
        baseUrl: "https://example.invalid",
        endpoint: "/usage",
      }),
    ).rejects.toMatchObject({
      name: "TelemetryEndpointError",
      endpoint: "/usage",
      unsupported: true,
    })
  })
})
