import { describe, expect, it, vi } from "vitest"

import { fetchTelemetryJson } from "~/services/apiCredentialProfiles/telemetryTransport"
import { API_AUTH_TOKEN_MODES } from "~/services/apiTransport/type"

const { fetchApiResponseMock } = vi.hoisted(() => ({
  fetchApiResponseMock: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiResponse: (...args: unknown[]) => fetchApiResponseMock(...args),
}))

describe("api credential telemetry transport", () => {
  it("passes raw authorization mode and returns the requested endpoint", async () => {
    fetchApiResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {},
      body: { success: true, data: { balance: 1 } },
    })

    await expect(
      fetchTelemetryJson({
        baseUrl: "https://example.invalid",
        endpoint: "/usage",
        bearerToken: "token",
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      }),
    ).resolves.toEqual({
      endpoint: "/usage",
      json: { success: true, data: { balance: 1 } },
    })

    expect(fetchApiResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.invalid",
        auth: expect.objectContaining({ accessToken: "token" }),
        requestTimeoutMs: 10_000,
      }),
      expect.objectContaining({
        endpoint: "/usage",
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      }),
    )
  })

  it("preserves unsupported endpoint classification for 404 and 405", async () => {
    fetchApiResponseMock.mockResolvedValue({
      ok: false,
      status: 405,
      headers: {},
      body: { message: "provider detail must not be parsed" },
    })

    await expect(
      fetchTelemetryJson({
        baseUrl: "https://example.invalid",
        endpoint: "/usage",
      }),
    ).rejects.toMatchObject({
      name: "TelemetryEndpointError",
      endpoint: "/usage",
      unsupported: true,
      message: "请求失败: 405",
    })
  })

  it("classifies malformed JSON and generic network failures", async () => {
    fetchApiResponseMock.mockRejectedValueOnce(
      new SyntaxError("Unexpected token"),
    )
    await expect(
      fetchTelemetryJson({
        baseUrl: "https://example.invalid",
        endpoint: "/invalid-json",
      }),
    ).rejects.toMatchObject({
      name: "TelemetryEndpointError",
      message: "Non-JSON response",
    })

    fetchApiResponseMock.mockRejectedValueOnce(new Error("connection closed"))
    await expect(
      fetchTelemetryJson({
        baseUrl: "https://example.invalid",
        endpoint: "/network-error",
      }),
    ).rejects.toMatchObject({
      name: "TelemetryEndpointError",
      message: "Network request failed: connection closed",
    })
  })
})
