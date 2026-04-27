import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import {
  axonHubChannelToManagedSite,
  graphqlRequest,
  listChannels,
  signIn,
} from "~/services/apiService/axonHub"
import { CHANNEL_STATUS } from "~/types/managedSite"

const config = {
  baseUrl: "https://axonhub.example.com/",
  email: "admin@example.com",
  password: "secret",
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

describe("AxonHub API service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("signs in against the normalized admin endpoint and returns the token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "admin-jwt" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(signIn(config)).resolves.toBe("admin-jwt")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://axonhub.example.com/admin/auth/signin",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: config.email,
          password: config.password,
        }),
      }),
    )
  })

  it("uses the upstream message when AxonHub rejects admin credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(
          {
            message: "Invalid email or password",
          },
          401,
        ),
      ),
    )

    await expect(
      signIn({ ...config, email: "invalid@example.com" }),
    ).rejects.toThrow("Invalid email or password")
  })

  it("redacts bearer tokens from GraphQL error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ token: "graphql-redaction-token" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            errors: [{ message: "Bearer secret-token is expired" }],
          }),
        ),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "redaction@example.com" },
        "query { viewer { id } }",
        undefined,
        { retryAuth: false },
      ),
    ).rejects.toThrow("Bearer [redacted] is expired")
  })

  it("retries a GraphQL request once with a fresh token when the cached token is unauthorized", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "old-token" }))
      .mockResolvedValueOnce(
        jsonResponse({ errors: [{ message: "expired" }] }, 401),
      )
      .mockResolvedValueOnce(jsonResponse({ token: "new-token" }))
      .mockResolvedValueOnce(jsonResponse({ data: { ping: "pong" } }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      graphqlRequest<{ ping: string }>(
        { ...config, email: "retry@example.com" },
        "query Ping",
      ),
    ).resolves.toEqual({
      ping: "pong",
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://axonhub.example.com/admin/graphql",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer old-token",
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://axonhub.example.com/admin/graphql",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-token",
        }),
      }),
    )
  })

  it("normalizes AxonHub channel data into the managed-site channel shape", () => {
    const result = axonHubChannelToManagedSite({
      id: "channel_opaque_id",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      type: "openai",
      baseURL: "https://api.openai.com/v1",
      name: "OpenAI",
      status: AXON_HUB_CHANNEL_STATUS.ARCHIVED,
      credentials: null,
      supportedModels: ["gpt-4.1"],
      manualModels: ["gpt-4.1", "gpt-4.1-mini"],
      defaultTestModel: "gpt-4.1-mini",
      settings: {
        modelMappings: [{ from: "gpt-4o", to: "gpt-4.1" }],
      },
      orderingWeight: 7,
      remark: "archived channel",
      errorMessage: "disabled upstream",
    })

    expect(Number.isSafeInteger(result.id)).toBe(true)
    expect(result.type).toBe("openai")
    expect(result.status).toBe(CHANNEL_STATUS.ManuallyDisabled)
    expect(result.key).toBe("")
    expect(result.models).toBe("gpt-4.1,gpt-4.1-mini")
    expect(result.model_mapping).toBe(JSON.stringify({ "gpt-4o": "gpt-4.1" }))
    expect(result._axonHubData.id).toBe("channel_opaque_id")
  })

  it("lists paginated channels and aggregates string channel type counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ token: "list-token" }))
        .mockResolvedValueOnce(
          jsonResponse({
            data: {
              queryChannels: {
                edges: [
                  {
                    node: {
                      id: "1",
                      type: "openai",
                      baseURL: "https://one.example.com",
                      name: "one",
                      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                      credentials: { apiKeys: ["sk-one"] },
                      supportedModels: ["gpt-4.1"],
                      manualModels: [],
                    },
                  },
                ],
                pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
                totalCount: 2,
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            data: {
              queryChannels: {
                edges: [
                  {
                    node: {
                      id: "2",
                      type: "anthropic",
                      baseURL: "https://two.example.com",
                      name: "two",
                      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
                      credentials: { apiKey: "sk-two" },
                      supportedModels: [],
                      manualModels: ["claude-sonnet-4-5"],
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 2,
              },
            },
          }),
        ),
    )

    const result = await listChannels({
      ...config,
      email: "list@example.com",
    })

    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 1,
        key: "sk-one",
        type: "openai",
        status: CHANNEL_STATUS.Enable,
      }),
    )
    expect(result.items[1]).toEqual(
      expect.objectContaining({
        id: 2,
        key: "sk-two",
        type: "anthropic",
        status: CHANNEL_STATUS.ManuallyDisabled,
      }),
    )
    expect(result.type_counts).toEqual({
      openai: 1,
      anthropic: 1,
    })
  })
})
