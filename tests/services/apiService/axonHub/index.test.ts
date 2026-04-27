import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import {
  __resetCachesForTesting,
  axonHubChannelToManagedSite,
  createAxonHubChannel,
  createChannel as createChannelAdapter,
  deleteAxonHubChannel,
  deleteChannel as deleteChannelAdapter,
  fetchSiteUserGroups,
  graphqlRequest,
  listAllChannels,
  listChannels,
  resolveAxonHubGraphqlId,
  searchChannel as searchChannelAdapter,
  searchChannels,
  signIn,
  updateAxonHubChannel,
  updateAxonHubChannelStatus,
  updateChannel as updateChannelAdapter,
} from "~/services/apiService/axonHub"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
import { CHANNEL_STATUS } from "~/types/managedSite"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://axonhub.example.com/",
  email: "admin@example.com",
  password: "secret",
}

const AUTH_URL = "https://axonhub.example.com/admin/auth/signin"
const GRAPHQL_URL = "https://axonhub.example.com/admin/graphql"

const buildRequest = (): ApiServiceRequest => ({
  baseUrl: config.baseUrl,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: config.email,
    accessToken: config.password,
  },
})

describe("AxonHub API service", () => {
  beforeEach(() => {
    __resetCachesForTesting()
    server.resetHandlers()
  })

  it("signs in against the normalized admin endpoint and returns the token", async () => {
    let capturedBody: unknown
    let capturedContentType: string | null = null

    server.use(
      http.post(AUTH_URL, async ({ request }) => {
        capturedBody = await request.json()
        capturedContentType = request.headers.get("content-type")
        return HttpResponse.json({ token: "admin-jwt" })
      }),
    )

    await expect(signIn(config)).resolves.toBe("admin-jwt")

    expect(capturedContentType).toBe("application/json")
    expect(capturedBody).toEqual({
      email: config.email,
      password: config.password,
    })
  })

  it("uses the upstream message when AxonHub rejects admin credentials", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json(
          {
            message: "Invalid email or password",
          },
          { status: 401 },
        ),
      ),
    )

    await expect(
      signIn({ ...config, email: "invalid@example.com" }),
    ).rejects.toThrow("Invalid email or password")
  })

  it("includes the HTTP status when AxonHub sign-in fails without a response message", async () => {
    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({}, { status: 403 })),
    )

    await expect(
      signIn({ ...config, email: "cors@example.com" }),
    ).rejects.toThrow("AxonHub sign-in failed (HTTP 403)")
  })

  it("redacts bearer tokens from GraphQL error messages", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "graphql-redaction-token" }),
      ),
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({
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

  it("does not retry for generic token validation errors", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: "generic-token" })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json({
          errors: [{ message: "Token field is required" }],
        })
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "generic-token@example.com" },
        "query { viewer { id } }",
      ),
    ).rejects.toThrow("Token field is required")

    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(1)
  })

  it("retries a GraphQL request once with a fresh token when the cached token is unauthorized", async () => {
    let authHits = 0
    let graphQlHits = 0
    const authorizationHeaders: Array<string | null> = []

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({
          token: authHits === 1 ? "old-token" : "new-token",
        })
      }),
      http.post(GRAPHQL_URL, ({ request }) => {
        graphQlHits += 1
        authorizationHeaders.push(request.headers.get("authorization"))

        if (graphQlHits === 1) {
          return HttpResponse.json(
            { errors: [{ message: "expired token" }] },
            { status: 401 },
          )
        }

        return HttpResponse.json({ data: { ping: "pong" } })
      }),
    )

    await expect(
      graphqlRequest<{ ping: string }>(
        { ...config, email: "retry@example.com" },
        "query Ping",
      ),
    ).resolves.toEqual({
      ping: "pong",
    })

    expect(authHits).toBe(2)
    expect(authorizationHeaders).toEqual([
      "Bearer old-token",
      "Bearer new-token",
    ])
  })

  it("surfaces the refreshed-token failure instead of masking it as a generic auth error", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({
          token: authHits === 1 ? "expired-token" : "refreshed-token",
        })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1

        if (graphQlHits === 1) {
          return HttpResponse.json(
            { errors: [{ message: "expired token" }] },
            { status: 401 },
          )
        }

        return HttpResponse.json(
          { errors: [{ message: "invalid token format" }] },
          { status: 401 },
        )
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "retry-failure@example.com" },
        "query Ping",
      ),
    ).rejects.toThrow("invalid token format")

    expect(authHits).toBe(2)
  })

  it("reuses a single in-flight sign-in across concurrent GraphQL requests", async () => {
    let authHits = 0
    let graphQlHits = 0
    const deferredToken = Promise.resolve({ token: "shared-token" })

    server.use(
      http.post(AUTH_URL, async () => {
        authHits += 1
        return HttpResponse.json(await deferredToken)
      }),
      http.post(GRAPHQL_URL, async ({ request }) => {
        graphQlHits += 1
        expect(request.headers.get("authorization")).toBe("Bearer shared-token")
        return HttpResponse.json({ data: { ping: "pong" } })
      }),
    )

    await expect(
      Promise.all([
        graphqlRequest<{ ping: string }>(
          { ...config, email: "parallel@example.com" },
          "query PingOne",
        ),
        graphqlRequest<{ ping: string }>(
          { ...config, email: "parallel@example.com" },
          "query PingTwo",
        ),
      ]),
    ).resolves.toEqual([{ ping: "pong" }, { ping: "pong" }])

    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(2)
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
    expect(result.created_time).toBe(1_775_001_600)
    expect(result._axonHubData.id).toBe("channel_opaque_id")
  })

  it("falls back to zero when AxonHub timestamps are malformed", () => {
    const result = axonHubChannelToManagedSite({
      id: "bad-date-id",
      createdAt: "not-a-date",
      updatedAt: "2026-04-01T00:00:00.000Z",
      type: "openai",
      baseURL: "https://api.openai.com/v1",
      name: "OpenAI",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: null,
      supportedModels: [],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    })

    expect(result.created_time).toBe(0)
  })

  it("normalizes blank model mappings to an empty string", () => {
    const result = axonHubChannelToManagedSite({
      id: "blank-mapping-id",
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://api.openai.com/v1",
      name: "Blank Mapping",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: null,
      supportedModels: [],
      manualModels: [],
      defaultTestModel: null,
      settings: {
        modelMappings: [{ from: "  ", to: " " }],
      },
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    })

    expect(result.model_mapping).toBe("")
  })

  it("assigns distinct numeric ids for colliding opaque GraphQL ids", () => {
    const first = axonHubChannelToManagedSite({
      id: "5v-4p2p8",
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://api.openai.com/v1",
      name: "Collision A",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: null,
      supportedModels: [],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    })
    const second = axonHubChannelToManagedSite({
      id: "vt1gjdhl",
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://api.openai.com/v1",
      name: "Collision B",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: null,
      supportedModels: [],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    })

    expect(second.id).toBe(first.id + 1)
    expect(resolveAxonHubGraphqlId(first.id)).toBe("5v-4p2p8")
    expect(resolveAxonHubGraphqlId(second.id)).toBe("vt1gjdhl")
  })

  it("probes forward when a numeric GraphQL id collides with an opaque-id slot", () => {
    const opaque = axonHubChannelToManagedSite({
      id: "opaque-collision-id",
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://api.openai.com/v1",
      name: "Opaque Collision",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: null,
      supportedModels: [],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    })
    const numeric = axonHubChannelToManagedSite({
      id: String(opaque.id),
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://api.openai.com/v1",
      name: "Numeric Collision",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: null,
      supportedModels: [],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    })

    expect(numeric.id).toBe(opaque.id + 1)
    expect(resolveAxonHubGraphqlId(opaque.id)).toBe("opaque-collision-id")
    expect(resolveAxonHubGraphqlId(numeric.id)).toBe(String(opaque.id))
  })

  it("lists paginated channels and trims API key entries", async () => {
    let page = 0

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "list-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          variables?: { input?: { after?: string | null } }
        }
        page += 1

        if (!body.variables?.input?.after) {
          return HttpResponse.json({
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
                      credentials: { apiKeys: ["  sk-one  ", ""] },
                      supportedModels: ["gpt-4.1"],
                      manualModels: [],
                    },
                  },
                ],
                pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
                totalCount: 2,
              },
            },
          })
        }

        return HttpResponse.json({
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
        })
      }),
    )

    const result = await listChannels({
      ...config,
      email: "list@example.com",
    })

    expect(page).toBe(2)
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

  it("fails fast when AxonHub pagination repeats a cursor", async () => {
    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "repeat-token" })),
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({
          data: {
            queryChannels: {
              edges: [],
              pageInfo: { hasNextPage: true, endCursor: "cursor-repeat" },
              totalCount: 0,
            },
          },
        }),
      ),
    )

    await expect(
      listChannels({
        ...config,
        email: "repeat-cursor@example.com",
      }),
    ).rejects.toThrow("AxonHub channel pagination cursor repeated")
  })

  it("returns cached channels for blank searches and supports the search adapter wrapper", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: "search-token" })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json({
          data: {
            queryChannels: {
              edges: [
                {
                  node: {
                    id: "1",
                    type: "openai",
                    baseURL: "https://alpha.example.com",
                    name: "alpha",
                    status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                    credentials: { apiKey: "sk-alpha" },
                    supportedModels: ["gpt-4.1"],
                    manualModels: [],
                  },
                },
                {
                  node: {
                    id: "2",
                    type: "anthropic",
                    baseURL: "https://beta.example.com",
                    name: "beta",
                    status: AXON_HUB_CHANNEL_STATUS.DISABLED,
                    credentials: { apiKey: "sk-beta" },
                    supportedModels: [],
                    manualModels: ["claude-sonnet-4-5"],
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: 2,
            },
          },
        })
      }),
    )

    const searchConfig = {
      ...config,
      email: "blank-search@example.com",
    }

    await expect(searchChannels(searchConfig, "   ")).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({ name: "alpha" }),
        expect.objectContaining({ name: "beta" }),
      ],
    })

    await expect(
      searchChannelAdapter(buildRequest(), "alpha"),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ name: "alpha" })],
    })

    expect(authHits).toBe(2)
    expect(graphQlHits).toBe(2)
  })

  it("creates channels through the adapter wrapper and returns safe create errors", async () => {
    let statusHits = 0

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "create-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query?: string }

        if (body.query?.includes("mutation CreateChannel")) {
          return HttpResponse.json({
            data: {
              createChannel: {
                id: "13",
                type: "openai",
                baseURL: "https://created.example.com/v1",
                name: "Created Channel",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: { apiKeys: ["sk-created"] },
                supportedModels: ["gpt-4.1"],
                manualModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: { modelMappings: [] },
                orderingWeight: 5,
                remark: null,
              },
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannelStatus")) {
          statusHits += 1
          return HttpResponse.json({
            data: {
              updateChannelStatus: {
                id: "13",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
              },
            },
          })
        }

        return HttpResponse.json(
          { errors: [{ message: "Unexpected GraphQL operation" }] },
          { status: 500 },
        )
      }),
    )

    await expect(
      createChannelAdapter(buildRequest(), {
        channel: {
          type: "openai",
          name: "Created Channel",
          baseURL: "https://created.example.com/v1",
          credentials: { apiKeys: ["sk-created"] },
          supportedModels: ["gpt-4.1"],
          manualModels: ["gpt-4.1"],
          defaultTestModel: "gpt-4.1",
          settings: {},
          orderingWeight: 5,
          status: CHANNEL_STATUS.Enable,
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      message: "success",
    })
    expect(statusHits).toBe(1)

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "create-error" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query?: string }
        if (body.query?.includes("mutation CreateChannel")) {
          return HttpResponse.json(
            { errors: [{ message: "create exploded" }] },
            { status: 500 },
          )
        }

        return HttpResponse.json(
          { errors: [{ message: "Unexpected GraphQL operation" }] },
          { status: 500 },
        )
      }),
    )

    await expect(
      createChannelAdapter(buildRequest(), {
        channel: {
          type: "openai",
          name: "Broken Channel",
          baseURL: "https://broken.example.com/v1",
          credentials: { apiKeys: ["sk-broken"] },
          supportedModels: ["gpt-4.1"],
          manualModels: ["gpt-4.1"],
          defaultTestModel: "gpt-4.1",
          settings: {},
          orderingWeight: 0,
        },
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "create exploded",
    })
  })

  it("updates status zero through the adapter wrapper and returns a failure message when delete returns false", async () => {
    let statusHits = 0
    let deleteHits = 0

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "adapter-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query?: string }

        if (body.query?.includes("mutation UpdateChannel(")) {
          return HttpResponse.json({
            data: {
              updateChannel: {
                id: "7",
                type: "openai",
                baseURL: "https://adapter.example.com/v1",
                name: "Adapter Channel",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: { apiKey: "sk-adapter" },
                supportedModels: ["gpt-4.1"],
                manualModels: [],
                defaultTestModel: null,
                settings: {},
                orderingWeight: 0,
                remark: null,
                errorMessage: null,
              },
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannelStatus")) {
          statusHits += 1
          return HttpResponse.json({
            data: {
              updateChannelStatus: {
                id: "7",
                status: AXON_HUB_CHANNEL_STATUS.DISABLED,
              },
            },
          })
        }

        if (body.query?.includes("mutation DeleteChannel")) {
          deleteHits += 1
          return HttpResponse.json({
            data: {
              deleteChannel: false,
            },
          })
        }

        return HttpResponse.json(
          { errors: [{ message: "Unexpected GraphQL operation" }] },
          { status: 500 },
        )
      }),
    )

    await expect(
      updateChannelAdapter(buildRequest(), {
        id: 7,
        name: "Adapter Channel",
        status: CHANNEL_STATUS.Unknown,
      }),
    ).resolves.toMatchObject({
      success: true,
      message: "success",
    })
    expect(statusHits).toBe(1)

    await expect(deleteChannelAdapter(buildRequest(), 7)).resolves.toEqual({
      success: false,
      data: false,
      message: "Failed to delete AxonHub channel",
    })
    expect(deleteHits).toBe(1)
  })

  it("returns safe adapter errors for update/delete failures and exposes the groupless contract", async () => {
    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "adapter-fail" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
        }

        if (body.query?.includes("mutation UpdateChannel(")) {
          return HttpResponse.json(
            { errors: [{ message: "update exploded" }] },
            { status: 500 },
          )
        }

        if (body.query?.includes("mutation DeleteChannel")) {
          return HttpResponse.json(
            { errors: [{ message: "delete exploded" }] },
            { status: 500 },
          )
        }

        return HttpResponse.json(
          { errors: [{ message: "Unexpected GraphQL operation" }] },
          { status: 500 },
        )
      }),
    )

    await expect(
      updateChannelAdapter(buildRequest(), {
        id: 9,
        name: "Broken update",
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "update exploded",
    })

    await expect(deleteChannelAdapter(buildRequest(), 9)).resolves.toEqual({
      success: false,
      data: null,
      message: "delete exploded",
    })

    await expect(fetchSiteUserGroups()).resolves.toEqual([])
  })

  it("lists channels through the adapter wrapper", async () => {
    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "adapter-list" })),
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({
          data: {
            queryChannels: {
              edges: [
                {
                  node: {
                    id: "1",
                    type: "openai",
                    baseURL: "https://alpha.example.com",
                    name: "alpha",
                    status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                    credentials: { apiKey: "sk-alpha" },
                    supportedModels: ["gpt-4.1"],
                    manualModels: [],
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: 1,
            },
          },
        }),
      ),
    )

    await expect(listAllChannels(buildRequest())).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: 1, name: "alpha" })],
    })
  })

  it("reuses cached channel lists for repeated searches and invalidates after mutations", async () => {
    let authHits = 0
    let listHits = 0
    let createHits = 0
    let updateHits = 0
    let statusHits = 0
    let deleteHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: "cache-token" })
      }),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
        }

        if (body.query?.includes("query QueryChannels")) {
          listHits += 1
          return HttpResponse.json({
            data: {
              queryChannels: {
                edges: [
                  {
                    node: {
                      id: "1",
                      type: "openai",
                      baseURL: "https://alpha.example.com",
                      name: "alpha",
                      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                      credentials: { apiKey: "sk-alpha" },
                      supportedModels: ["gpt-4.1"],
                      manualModels: [],
                    },
                  },
                  {
                    node: {
                      id: "2",
                      type: "openai",
                      baseURL: "https://beta.example.com",
                      name: "beta",
                      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                      credentials: { apiKey: "sk-beta" },
                      supportedModels: ["gpt-4o"],
                      manualModels: [],
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 2,
              },
            },
          })
        }

        if (body.query?.includes("mutation CreateChannel")) {
          createHits += 1
          return HttpResponse.json({
            data: {
              createChannel: {
                id: "3",
                type: "openai",
                baseURL: "https://created.example.com",
                name: "created",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: { apiKeys: ["sk-created"] },
                supportedModels: ["gpt-4.1"],
                manualModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: { modelMappings: [] },
                orderingWeight: 0,
                remark: null,
              },
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannel(")) {
          updateHits += 1
          return HttpResponse.json({
            data: {
              updateChannel: {
                id: "1",
                type: "openai",
                baseURL: "https://alpha.example.com",
                name: "updated",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: { apiKeys: ["sk-alpha"] },
                supportedModels: ["gpt-4.1"],
                manualModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: { modelMappings: [] },
                orderingWeight: 0,
                errorMessage: null,
                remark: null,
              },
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannelStatus")) {
          statusHits += 1
          return HttpResponse.json({
            data: {
              updateChannelStatus: {
                id: "1",
                status: AXON_HUB_CHANNEL_STATUS.DISABLED,
              },
            },
          })
        }

        if (body.query?.includes("mutation DeleteChannel")) {
          deleteHits += 1
          return HttpResponse.json({
            data: {
              deleteChannel: true,
            },
          })
        }

        return HttpResponse.json(
          { errors: [{ message: "Unexpected GraphQL operation" }] },
          { status: 500 },
        )
      }),
    )

    const cacheConfig = { ...config, email: "cache@example.com" }

    await expect(searchChannels(cacheConfig, "alpha")).resolves.toMatchObject({
      total: 1,
    })
    await expect(searchChannels(cacheConfig, "beta")).resolves.toMatchObject({
      total: 1,
    })
    expect(listHits).toBe(1)

    await createAxonHubChannel(cacheConfig, {
      type: "openai",
      name: "created",
      baseURL: "https://created.example.com",
      credentials: { apiKeys: ["sk-created"] },
      supportedModels: ["gpt-4.1"],
      manualModels: ["gpt-4.1"],
      defaultTestModel: "gpt-4.1",
      settings: {},
      orderingWeight: 0,
    })
    await searchChannels(cacheConfig, "alpha")
    expect(listHits).toBe(2)

    await updateAxonHubChannel(cacheConfig, "1", { name: "updated" })
    await searchChannels(cacheConfig, "alpha")
    expect(listHits).toBe(3)

    await updateAxonHubChannelStatus(
      cacheConfig,
      "1",
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )
    await searchChannels(cacheConfig, "alpha")
    expect(listHits).toBe(4)

    await deleteAxonHubChannel(cacheConfig, "1")
    await searchChannels(cacheConfig, "alpha")
    expect(listHits).toBe(5)

    expect(authHits).toBe(1)
    expect(createHits).toBe(1)
    expect(updateHits).toBe(1)
    expect(statusHits).toBe(1)
    expect(deleteHits).toBe(1)
  })
})
