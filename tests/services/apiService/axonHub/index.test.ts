import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import {
  __resetCachesForTesting,
  axonHubChannelToManagedSite,
  AxonHubRequestError,
  createAxonHubChannel,
  createChannel as createChannelAdapter,
  deleteAxonHubChannel,
  deleteChannel as deleteChannelAdapter,
  fetchSiteUserGroups,
  getAxonHubChannel,
  graphqlRequest,
  listAllChannels,
  listAxonHubChannelPage,
  listChannels,
  resolveAxonHubGraphqlId,
  searchChannel as searchChannelAdapter,
  searchChannels,
  signIn,
  updateAxonHubChannel,
  updateAxonHubChannelStatus,
  updateChannel as updateChannelAdapter,
} from "~/services/apiService/axonHub"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import type { AxonHubChannel, AxonHubCreateChannelInput } from "~/types/axonHub"
import { CHANNEL_STATUS } from "~/types/managedSite"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://axonhub.example.com/",
  email: "admin@example.com",
  password: "secret",
}

const AUTH_URL = "https://axonhub.example.com/admin/auth/signin"
const GRAPHQL_URL = "https://axonhub.example.com/admin/graphql"

const nativeNullBaseUrlChannel: AxonHubChannel = {
  id: "gid://axonhub/Channel/native-null-base-url",
  type: "openai",
  baseURL: null,
  name: "Native page channel",
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  tags: ["table-tag"],
  credentials: null,
  supportedModels: ["model-alpha"],
  manualModels: [],
  defaultTestModel: "model-alpha",
  settings: null,
}

const buildPinnedChannelSettings = () => ({
  extraModelPrefix: null,
  modelMappings: [{ from: "model-alpha", to: "model-upstream" }],
  autoTrimedModelPrefixes: [],
  hideOriginalModels: null,
  hideMappedModels: null,
  lowercaseModelId: null,
  proxy: {
    type: "URL",
    url: null,
    username: null,
    password: null,
  },
  transformOptions: {
    forceArrayInstructions: false,
    forceArrayInputs: false,
    replaceDeveloperRoleWithSystem: false,
    reasoningEffortMapping: null,
  },
  headerOverrideOperations: [
    {
      op: "set",
      path: null,
      from: null,
      to: null,
      value: '{"enabled":true}',
      condition: null,
      match: null,
      index: null,
      splat: null,
    },
  ],
  bodyOverrideOperations: [],
  passThroughUserAgent: null,
  passThroughBody: null,
  rateLimit: {
    rpm: null,
    tpm: null,
    maxConcurrent: null,
    queueSize: null,
    queueTimeoutMs: null,
  },
  retryableStatusCodes: [429],
  retryableErrorPatterns: [{ pattern: "temporary", regex: false }],
  providerQuota: {
    opencodeGo: {
      workspaceId: null,
      authCookie: null,
    },
  },
})

const buildPinnedChannelCredentials = (
  overrides: Record<string, unknown> = {},
) => ({
  apiKey: null,
  apiKeys: null,
  gcp: null,
  oauth: null,
  ...overrides,
})

const buildNativeChannelDetail = (
  id: string,
  overrides: Record<string, unknown> = {},
) => ({
  __typename: "Channel",
  id,
  createdAt: "2026-07-17T00:00:00Z",
  updatedAt: "2026-07-17T00:00:00Z",
  type: "openai",
  baseURL: null,
  name: "Native detail channel",
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  policies: null,
  credentials: null,
  supportedModels: ["model-alpha"],
  autoSyncSupportedModels: false,
  autoSyncModelPattern: null,
  manualModels: [],
  tags: ["table-tag"],
  defaultTestModel: "model-alpha",
  settings: null,
  orderingWeight: 0,
  errorMessage: null,
  remark: null,
  endpoints: null,
  disabledAPIKeys: null,
  ...overrides,
})

const omitOutputField = (
  value: Record<string, unknown>,
  field: string,
): Record<string, unknown> => {
  const copy = { ...value }
  delete copy[field]
  return copy
}

const buildRequest = (): ApiServiceRequest => ({
  baseUrl: config.baseUrl,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: config.email,
    accessToken: config.password,
  },
})

type AxonHubGraphqlRoute = {
  matches: (query: string) => boolean
  respond: (request: {
    query: string
    variables?: Record<string, unknown>
  }) => Response
}

function matchesGraphqlOperation(operationName: string) {
  return (query: string) => query.includes(operationName)
}

function useAxonHubGraphqlRoutes(params: {
  token: string
  routes: AxonHubGraphqlRoute[]
}) {
  server.use(
    http.post(AUTH_URL, () => HttpResponse.json({ token: params.token })),
    http.post(GRAPHQL_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string
        variables?: Record<string, unknown>
      }
      const query = body.query ?? ""
      const route = params.routes.find((candidate) => candidate.matches(query))

      if (route) {
        return route.respond({ query, variables: body.variables })
      }

      return HttpResponse.json(
        { errors: [{ message: "Unexpected GraphQL operation" }] },
        { status: 500 },
      )
    }),
  )
}

describe("AxonHub API service", () => {
  beforeEach(() => {
    __resetCachesForTesting()
    server.resetHandlers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("returns one native AxonHub channel page with its upstream cursor", async () => {
    let capturedQuery = ""
    let capturedVariables: Record<string, unknown> | undefined

    useAxonHubGraphqlRoutes({
      token: "page-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query ListAxonHubChannelPage"),
          respond: ({ query, variables }) => {
            capturedQuery = query
            capturedVariables = variables
            return HttpResponse.json({
              data: {
                queryChannels: {
                  edges: [
                    {
                      node: nativeNullBaseUrlChannel,
                      cursor: "edge-cursor",
                    },
                  ],
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: "upstream-next-cursor",
                  },
                  totalCount: 7,
                },
              },
            })
          },
        },
      ],
    })

    const page = await listAxonHubChannelPage(config, {
      cursor: "upstream-current-cursor",
      limit: 25,
    })

    expect(page).toEqual({
      items: [
        expect.objectContaining({
          id: "gid://axonhub/Channel/native-null-base-url",
          name: "Native page channel",
          baseURL: null,
          tags: ["table-tag"],
        }),
      ],
      total: 7,
      nextCursor: "upstream-next-cursor",
    })
    expect(page.items[0]).not.toHaveProperty("credentials")
    expect(page.items[0]).not.toHaveProperty("settings")

    expect(capturedQuery).toContain("queryChannels(input: $input)")
    expect(capturedQuery).toContain("tags")
    for (const detailOnlySelection of [
      "settings",
      "modelMappings",
      "credentials",
      "apiKey",
      "apiKeys",
      "oauth",
      "accessToken",
      "refreshToken",
      "proxy",
      "password",
      "providerQuota",
      "authCookie",
      "headerOverrideOperations",
      "bodyOverrideOperations",
      "disabledAPIKeys",
    ]) {
      expect(capturedQuery).not.toContain(detailOnlySelection)
    }
    expect(capturedVariables).toEqual({
      input: { first: 25, after: "upstream-current-cursor" },
    })
  })

  it("loads native AxonHub detail by opaque GraphQL id", async () => {
    const opaqueId = "gid://axonhub/Channel/native-detail"
    let capturedQuery = ""
    let capturedVariables: Record<string, unknown> | undefined

    useAxonHubGraphqlRoutes({
      token: "detail-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: ({ query, variables }) => {
            capturedQuery = query
            capturedVariables = variables
            return HttpResponse.json({
              data: {
                node: buildNativeChannelDetail(opaqueId),
              },
            })
          },
        },
      ],
    })

    await expect(getAxonHubChannel(config, opaqueId)).resolves.toMatchObject({
      id: opaqueId,
      name: "Native detail channel",
      baseURL: null,
      credentials: null,
    })
    expect(capturedQuery).toContain("__typename")
    expect(capturedVariables).toEqual({ id: opaqueId })
  })

  it("accepts a complete pinned authoritative channel output", async () => {
    const id = "complete-pinned-output"
    const completeChannel = buildNativeChannelDetail(id, {
      policies: { stream: null },
      credentials: {
        apiKey: null,
        apiKeys: [],
        gcp: {
          region: "example-region",
          projectID: "example-project",
          jsonData: "{}",
        },
        oauth: {
          accessToken: null,
          refreshToken: null,
          clientID: null,
          expiresAt: null,
          tokenType: null,
          scopes: [],
        },
      },
      settings: buildPinnedChannelSettings(),
      endpoints: [
        {
          apiFormat: "openai",
          path: null,
          baseURL: null,
          transport: null,
        },
      ],
      disabledAPIKeys: [
        {
          key: "placeholder-key",
          disabledAt: "2026-07-17T00:00:00Z",
          errorCode: 401,
          reason: null,
        },
      ],
    })

    useAxonHubGraphqlRoutes({
      token: "complete-output-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: () => HttpResponse.json({ data: { node: completeChannel } }),
        },
      ],
    })

    await expect(getAxonHubChannel(config, id)).resolves.toMatchObject({
      id,
      settings: {
        headerOverrideOperations: [
          expect.objectContaining({ value: '{"enabled":true}' }),
        ],
        bodyOverrideOperations: [],
      },
    })
  })

  it("selects every pinned beta5 settings field required for replacement preservation", async () => {
    let detailQuery = ""

    useAxonHubGraphqlRoutes({
      token: "settings-selection-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: ({ query }) => {
            detailQuery = query
            return HttpResponse.json({
              data: {
                node: buildNativeChannelDetail("opaque-settings-id", {
                  baseURL: "https://settings.example.invalid/v1",
                  name: "Settings channel",
                  supportedModels: [],
                }),
              },
            })
          },
        },
      ],
    })

    await getAxonHubChannel(config, "opaque-settings-id")

    expect(detailQuery).toMatch(/settings\s*\{[^}]*extraModelPrefix/s)
    expect(detailQuery).toMatch(/modelMappings\s*\{\s*from\s+to\s*\}/s)
    expect(detailQuery).toContain("autoTrimedModelPrefixes")
    expect(detailQuery).toContain("hideOriginalModels")
    expect(detailQuery).toContain("hideMappedModels")
    expect(detailQuery).toContain("lowercaseModelId")
    expect(detailQuery).toMatch(
      /proxy\s*\{\s*type\s+url\s+username\s+password\s*\}/s,
    )
    expect(detailQuery).toMatch(
      /transformOptions\s*\{[^}]*forceArrayInstructions[^}]*forceArrayInputs[^}]*replaceDeveloperRoleWithSystem[^}]*reasoningEffortMapping\s*\{\s*from\s+to\s*\}/s,
    )
    for (const selection of [
      "headerOverrideOperations",
      "bodyOverrideOperations",
    ]) {
      expect(detailQuery).toMatch(
        new RegExp(
          `${selection}\\s*\\{[^}]*op[^}]*path[^}]*from[^}]*to[^}]*value[^}]*condition[^}]*match\\s*\\{\\s*path\\s+eq\\s*\\}[^}]*index[^}]*splat`,
          "s",
        ),
      )
    }
    expect(detailQuery).toContain("passThroughUserAgent")
    expect(detailQuery).toContain("passThroughBody")
    expect(detailQuery).toMatch(
      /rateLimit\s*\{\s*rpm\s+tpm\s+maxConcurrent\s+queueSize\s+queueTimeoutMs\s*\}/s,
    )
    expect(detailQuery).toContain("retryableStatusCodes")
    expect(detailQuery).toMatch(
      /retryableErrorPatterns\s*\{\s*pattern\s+regex\s*\}/s,
    )
    expect(detailQuery).toMatch(
      /providerQuota\s*\{\s*opencodeGo\s*\{\s*workspaceId\s+authCookie\s*\}\s*\}/s,
    )
  })

  it("rejects malformed native detail nodes as controlled protocol failures", async () => {
    const malformedNodes = [
      "not-an-object",
      { __typename: "User", id: "wrong-type" },
      { __typename: "Channel", name: "missing-id" },
    ]
    let responseIndex = 0

    useAxonHubGraphqlRoutes({
      token: "malformed-detail-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: () =>
            HttpResponse.json({
              data: { node: malformedNodes[responseIndex++] },
            }),
        },
      ],
    })

    for (const [index] of malformedNodes.entries()) {
      await expect(
        getAxonHubChannel(config, `malformed-detail-${index}`),
      ).rejects.toMatchObject({
        kind: "protocol",
        dispatch: "not-dispatched",
        message: "protocol",
      })
    }
  })

  it("rejects a native detail response retargeted to another channel", async () => {
    useAxonHubGraphqlRoutes({
      token: "retargeted-detail-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: () =>
            HttpResponse.json({
              data: {
                node: buildNativeChannelDetail("different-channel-id"),
              },
            }),
        },
      ],
    })

    await expect(
      getAxonHubChannel(config, "requested-channel-id"),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
      message: "protocol",
    })
  })

  it("rejects malformed authoritative nested channel fields", async () => {
    const malformedDetails = [
      { credentials: { apiKeys: ["valid-key", 42] } },
      { credentials: { oauth: { scopes: ["scope", false] } } },
      { settings: { modelMappings: [null] } },
      { settings: { proxy: { type: "http", url: 42 } } },
      { settings: { rateLimit: { rpm: "fast" } } },
      { settings: { rateLimit: { queueTimeoutMs: 1.5 } } },
      {
        settings: {
          providerQuota: { opencodeGo: { workspaceId: 42 } },
        },
      },
      { endpoints: [{ apiFormat: "openai", path: 42 }] },
    ]
    let responseIndex = 0

    useAxonHubGraphqlRoutes({
      token: "malformed-nested-detail-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: () => {
            const index = responseIndex++
            return HttpResponse.json({
              data: {
                node: buildNativeChannelDetail(
                  `malformed-nested-${index}`,
                  malformedDetails[index],
                ),
              },
            })
          },
        },
      ],
    })

    for (const [index] of malformedDetails.entries()) {
      await expect(
        getAxonHubChannel(config, `malformed-nested-${index}`),
      ).rejects.toMatchObject({
        kind: "protocol",
        dispatch: "not-dispatched",
        message: "protocol",
      })
    }
  })

  it("rejects incomplete pinned authoritative output fields", async () => {
    const completeSettings = buildPinnedChannelSettings()
    const invalidDetails = [
      omitOutputField(
        buildNativeChannelDetail("missing-created-at"),
        "createdAt",
      ),
      buildNativeChannelDetail("null-updated-at", { updatedAt: null }),
      omitOutputField(
        buildNativeChannelDetail("missing-supported-models"),
        "supportedModels",
      ),
      buildNativeChannelDetail("null-supported-models", {
        supportedModels: null,
      }),
      buildNativeChannelDetail("null-supported-model-entry", {
        supportedModels: ["model-alpha", null],
      }),
      omitOutputField(
        buildNativeChannelDetail("missing-auto-sync"),
        "autoSyncSupportedModels",
      ),
      buildNativeChannelDetail("null-auto-sync", {
        autoSyncSupportedModels: null,
      }),
      buildNativeChannelDetail("null-default-model", {
        defaultTestModel: null,
      }),
      omitOutputField(
        buildNativeChannelDetail("missing-ordering-weight"),
        "orderingWeight",
      ),
      buildNativeChannelDetail("fractional-ordering-weight", {
        orderingWeight: 1.5,
      }),
      buildNativeChannelDetail("missing-header-overrides", {
        settings: omitOutputField(completeSettings, "headerOverrideOperations"),
      }),
      buildNativeChannelDetail("null-body-overrides", {
        settings: { ...completeSettings, bodyOverrideOperations: null },
      }),
      buildNativeChannelDetail("missing-transform-boolean", {
        settings: {
          ...completeSettings,
          transformOptions: omitOutputField(
            completeSettings.transformOptions,
            "forceArrayInputs",
          ),
        },
      }),
      buildNativeChannelDetail("missing-retry-regex", {
        settings: {
          ...completeSettings,
          retryableErrorPatterns: [{ pattern: "temporary" }],
        },
      }),
    ]
    let responseIndex = 0

    useAxonHubGraphqlRoutes({
      token: "incomplete-output-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: () =>
            HttpResponse.json({
              data: { node: invalidDetails[responseIndex++] },
            }),
        },
      ],
    })

    for (const detail of invalidDetails) {
      await expect(
        getAxonHubChannel(config, detail.id as string),
      ).rejects.toMatchObject({
        kind: "protocol",
        dispatch: "not-dispatched",
        message: "protocol",
      })
    }
  })

  it("rejects malformed native pages instead of silently truncating them", async () => {
    const malformedConnections = [
      {
        edges: [{ node: "not-a-channel" }],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 1,
      },
      {
        edges: [],
        pageInfo: { hasNextPage: true, endCursor: "" },
        totalCount: 0,
      },
      {
        edges: [],
        pageInfo: "not-page-info",
        totalCount: 0,
      },
      {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: "1",
      },
      {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: -1,
      },
      {
        edges: [
          {
            node: {
              ...nativeNullBaseUrlChannel,
              tags: ["valid-tag", 42],
            },
            cursor: "malformed-tags-cursor",
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 1,
      },
    ]
    let responseIndex = 0

    useAxonHubGraphqlRoutes({
      token: "malformed-page-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query ListAxonHubChannelPage"),
          respond: () =>
            HttpResponse.json({
              data: { queryChannels: malformedConnections[responseIndex++] },
            }),
        },
      ],
    })

    for (const [index] of malformedConnections.entries()) {
      await expect(
        listAxonHubChannelPage(config, { limit: 10, cursor: `${index}` }),
      ).rejects.toMatchObject({
        kind: "protocol",
        dispatch: "not-dispatched",
        message: "protocol",
      })
    }
  })

  it("sends verified update and clear fields unchanged", async () => {
    let capturedVariables: Record<string, unknown> | undefined
    const input = {
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      supportedModels: ["model-alpha"],
      appendSupportedModels: ["model-beta"],
      manualModels: ["manual-alpha"],
      appendManualModels: ["manual-beta"],
      tags: ["primary"],
      appendTags: ["secondary"],
      endpoints: [{ apiFormat: "openai/chat_completions", path: "/v1/chat" }],
      appendEndpoints: [
        { apiFormat: "openai/responses", path: "/v1/responses" },
      ],
      settings: {
        extraModelPrefix: "replacement-prefix",
        modelMappings: [{ from: "model-alpha", to: "model-upstream" }],
        autoTrimedModelPrefixes: ["provider"],
        hideOriginalModels: true,
        hideMappedModels: false,
        lowercaseModelId: true,
        proxy: {
          type: "URL",
          url: "https://proxy.example.invalid",
          username: "proxy-user",
          password: "proxy-password",
        },
        transformOptions: {
          forceArrayInstructions: true,
          forceArrayInputs: false,
          replaceDeveloperRoleWithSystem: true,
          reasoningEffortMapping: [{ from: "high", to: "maximum" }],
        },
        headerOverrideOperations: [
          {
            op: "array_insert",
            path: "X-Test",
            from: "X-Source",
            to: "X-Target",
            value: "header-value",
            condition: "enabled",
            match: { path: "kind", eq: "example" },
            index: 1,
            splat: false,
          },
        ],
        bodyOverrideOperations: [
          {
            op: "array_remove",
            path: "items",
            from: "source",
            to: "target",
            value: "body-value",
            condition: "enabled",
            match: { path: "kind", eq: "example" },
            index: 2,
            splat: true,
          },
        ],
        passThroughUserAgent: null,
        passThroughBody: true,
        rateLimit: {
          rpm: 10,
          tpm: 20,
          maxConcurrent: 3,
          queueSize: 4,
          queueTimeoutMs: 500,
        },
        retryableStatusCodes: [408, 429],
        retryableErrorPatterns: [{ pattern: "temporary", regex: false }],
        providerQuota: {
          opencodeGo: {
            workspaceId: "workspace-example",
            authCookie: "cookie-example",
          },
        },
      },
      clearBaseURL: true,
      clearManualModels: true,
      clearAutoSyncModelPattern: true,
      clearTags: true,
      clearPolicies: true,
      clearSettings: true,
      clearErrorMessage: true,
      clearRemark: true,
      clearEndpoints: true,
    }

    useAxonHubGraphqlRoutes({
      token: "update-fields-token",
      routes: [
        {
          matches: matchesGraphqlOperation("mutation UpdateChannel"),
          respond: ({ variables }) => {
            capturedVariables = variables
            return HttpResponse.json({
              data: {
                updateChannel: buildNativeChannelDetail("opaque-update-id", {
                  baseURL: "https://updated.example.invalid/v1",
                  name: "Updated channel",
                  status: AXON_HUB_CHANNEL_STATUS.DISABLED,
                  supportedModels: ["model-alpha", "model-beta"],
                }),
              },
            })
          },
        },
      ],
    })

    await updateAxonHubChannel(config, "opaque-update-id", input)

    expect(capturedVariables).toEqual({ id: "opaque-update-id", input })
  })

  it("rejects malformed mutation roots with dispatched protocol failures", async () => {
    useAxonHubGraphqlRoutes({
      token: "malformed-mutation-token",
      routes: [
        {
          matches: matchesGraphqlOperation("mutation CreateChannel"),
          respond: () => HttpResponse.json({ data: { createChannel: true } }),
        },
        {
          matches: matchesGraphqlOperation("mutation UpdateChannel"),
          respond: () =>
            HttpResponse.json({
              data: {
                updateChannel: buildNativeChannelDetail("malformed-update", {
                  settings: { modelMappings: [null] },
                }),
              },
            }),
        },
        {
          matches: matchesGraphqlOperation("mutation UpdateChannelStatus"),
          respond: () =>
            HttpResponse.json({
              data: { updateChannelStatus: { id: "missing-status" } },
            }),
        },
        {
          matches: matchesGraphqlOperation("mutation DeleteChannel"),
          respond: () => HttpResponse.json({ data: { deleteChannel: "yes" } }),
        },
      ],
    })

    const expectedFailure = {
      kind: "protocol",
      dispatch: "dispatched",
      message: "protocol",
    }
    await expect(
      createAxonHubChannel(config, {
        type: "openai",
        name: "Malformed create",
        credentials: { apiKeys: ["placeholder-key"] },
        supportedModels: ["model-alpha"],
        defaultTestModel: "model-alpha",
      }),
    ).rejects.toMatchObject(expectedFailure)
    await expect(
      updateAxonHubChannel(config, "malformed-update", {
        name: "Malformed update",
      }),
    ).rejects.toMatchObject(expectedFailure)
    await expect(
      updateAxonHubChannelStatus(
        config,
        "malformed-status",
        AXON_HUB_CHANNEL_STATUS.ENABLED,
      ),
    ).rejects.toMatchObject(expectedFailure)
    await expect(
      deleteAxonHubChannel(config, "malformed-delete"),
    ).rejects.toMatchObject(expectedFailure)
  })

  it("correlates authoritative mutation channel identities and status", async () => {
    const capturedQueries: string[] = []
    let statusResponse = 0

    useAxonHubGraphqlRoutes({
      token: "mutation-correlation-token",
      routes: [
        {
          matches: matchesGraphqlOperation("mutation CreateChannel"),
          respond: ({ query }) => {
            capturedQueries.push(query)
            return HttpResponse.json({
              data: {
                createChannel: buildNativeChannelDetail("created-id", {
                  __typename: "User",
                }),
              },
            })
          },
        },
        {
          matches: matchesGraphqlOperation("mutation UpdateChannel("),
          respond: ({ query }) => {
            capturedQueries.push(query)
            return HttpResponse.json({
              data: {
                updateChannel: buildNativeChannelDetail("retargeted-id"),
              },
            })
          },
        },
        {
          matches: matchesGraphqlOperation("mutation UpdateChannelStatus"),
          respond: ({ query, variables }) => {
            capturedQueries.push(query)
            statusResponse += 1
            return HttpResponse.json({
              data: {
                updateChannelStatus: {
                  __typename: "Channel",
                  id:
                    statusResponse === 1
                      ? "retargeted-status-id"
                      : variables?.id,
                  status:
                    statusResponse === 2
                      ? AXON_HUB_CHANNEL_STATUS.DISABLED
                      : variables?.status,
                },
              },
            })
          },
        },
      ],
    })

    const expectedFailure = {
      kind: "protocol",
      dispatch: "dispatched",
      message: "protocol",
    }
    await expect(
      createAxonHubChannel(config, {
        type: "openai",
        name: "Wrong typename",
        credentials: { apiKeys: ["placeholder-key"] },
        supportedModels: ["model-alpha"],
        defaultTestModel: "model-alpha",
      }),
    ).rejects.toMatchObject(expectedFailure)
    await expect(
      updateAxonHubChannel(config, "requested-update-id", {
        name: "Retargeted update",
      }),
    ).rejects.toMatchObject(expectedFailure)
    await expect(
      updateAxonHubChannelStatus(
        config,
        "status-id",
        AXON_HUB_CHANNEL_STATUS.ENABLED,
      ),
    ).rejects.toMatchObject(expectedFailure)
    await expect(
      updateAxonHubChannelStatus(
        config,
        "status-id",
        AXON_HUB_CHANNEL_STATUS.ENABLED,
      ),
    ).rejects.toMatchObject(expectedFailure)
    await expect(
      updateAxonHubChannelStatus(
        config,
        "status-id",
        AXON_HUB_CHANNEL_STATUS.ENABLED,
      ),
    ).resolves.toEqual({
      id: "status-id",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    })

    expect(capturedQueries).toHaveLength(5)
    for (const query of capturedQueries) {
      expect(query).toContain("__typename")
    }
  })

  it("omits or passes null create baseURL according to the native protocol", async () => {
    const capturedInputs: unknown[] = []
    const omittedBaseUrlInput: AxonHubCreateChannelInput = {
      type: "openai",
      name: "No base URL",
      credentials: { apiKeys: ["placeholder-key"] },
      supportedModels: ["model-alpha"],
      defaultTestModel: "model-alpha",
    }
    const nullBaseUrlInput: AxonHubCreateChannelInput = {
      ...omittedBaseUrlInput,
      name: "Null base URL",
      baseURL: null,
    }

    useAxonHubGraphqlRoutes({
      token: "nullable-create-token",
      routes: [
        {
          matches: matchesGraphqlOperation("mutation CreateChannel"),
          respond: ({ variables }) => {
            capturedInputs.push(variables?.input)
            return HttpResponse.json({
              data: {
                createChannel: buildNativeChannelDetail(
                  `nullable-create-${capturedInputs.length}`,
                  {
                    name: "Created channel",
                  },
                ),
              },
            })
          },
        },
      ],
    })

    await createAxonHubChannel(config, omittedBaseUrlInput)
    await createAxonHubChannel(config, nullBaseUrlInput)

    expect(capturedInputs).toEqual([omittedBaseUrlInput, nullBaseUrlInput])
  })

  it("normalizes a null native baseURL only in the legacy projection", () => {
    const projected = axonHubChannelToManagedSite(nativeNullBaseUrlChannel)

    expect(projected.base_url).toBe("")
    expect(projected._axonHubData.baseURL).toBeNull()
  })

  it("classifies abort before mutation dispatch as not-dispatched", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(
      updateAxonHubChannel(
        config,
        "opaque-pre-abort",
        { name: "Ignored" },
        {
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({
      name: "AxonHubRequestError",
      kind: "aborted",
      dispatch: "not-dispatched",
      message: "aborted",
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("classifies abort after mutation dispatch as dispatched", async () => {
    const controller = new AbortController()
    let mutationSignal: AbortSignal | undefined

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/admin/auth/signin")) {
          return Promise.resolve(
            new Response(JSON.stringify({ token: "mutation-abort-token" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }

        mutationSignal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          mutationSignal?.addEventListener("abort", () => {
            reject(
              mutationSignal?.reason ??
                new DOMException("The operation was aborted", "AbortError"),
            )
          })
        })
      }),
    )

    const request = updateAxonHubChannel(
      config,
      "opaque-inflight-abort",
      { name: "Interrupted" },
      { signal: controller.signal },
    )
    const expectation = expect(request).rejects.toMatchObject({
      name: "AxonHubRequestError",
      kind: "aborted",
      dispatch: "dispatched",
      message: "aborted",
    })

    await vi.waitFor(() => expect(mutationSignal).toBe(controller.signal))
    controller.abort()
    await expectation
  })

  it("classifies an abort while consuming a mutation body as dispatched", async () => {
    const abortError = new Error("body consumption cancelled")
    abortError.name = "AbortError"

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/admin/auth/signin")) {
          return Promise.resolve(
            new Response(JSON.stringify({ token: "body-abort-token" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(abortError),
        } as unknown as Response)
      }),
    )

    await expect(
      updateAxonHubChannel(config, "body-abort", { name: "Interrupted" }),
    ).rejects.toMatchObject({
      kind: "aborted",
      dispatch: "dispatched",
      message: "aborted",
    })
  })

  it("retains controlled status and dispatch phase in AxonHub protocol failures", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: `permission-token-${authHits}` })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json(
          {
            errors: [
              {
                message:
                  graphQlHits === 1 ? "expired token" : "permission denied",
              },
            ],
          },
          { status: graphQlHits === 1 ? 401 : 403 },
        )
      }),
    )

    const failure = await updateAxonHubChannel(config, "opaque-permission-id", {
      name: "Rejected",
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AxonHubRequestError)
    expect(failure).toMatchObject({
      kind: "permission",
      dispatch: "dispatched",
      message: "permission",
    })
    expect(authHits).toBe(2)
    expect(graphQlHits).toBe(2)
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

  it("classifies an abort while consuming a sign-in body as not-dispatched", async () => {
    const abortError = new Error("sign-in body cancelled")
    abortError.name = "AbortError"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(abortError),
      } as unknown as Response),
    )

    await expect(signIn(config)).rejects.toMatchObject({
      kind: "aborted",
      dispatch: "not-dispatched",
      message: "aborted",
    })
  })

  it("classifies rejected admin credentials without exposing response body", async () => {
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
    ).rejects.toMatchObject({
      kind: "authentication",
      dispatch: "not-dispatched",
      message: "authentication",
    })
  })

  it("classifies other sign-in rejections without exposing response body", async () => {
    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({}, { status: 403 })),
    )

    await expect(
      signIn({ ...config, email: "cors@example.com" }),
    ).rejects.toMatchObject({
      kind: "authentication",
      dispatch: "not-dispatched",
      message: "authentication",
    })
  })

  it("classifies an unavailable AxonHub sign-in endpoint separately from credential rejection", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json(
          { message: "internal details must stay private" },
          { status: 503 },
        ),
      ),
    )

    await expect(
      signIn({ ...config, email: "unavailable@example.com" }),
    ).rejects.toMatchObject({
      kind: "unavailable",
      dispatch: "not-dispatched",
      message: "unavailable",
    })
  })

  it("classifies a malformed successful sign-in response as a protocol failure", async () => {
    server.use(http.post(AUTH_URL, () => HttpResponse.json(null)))

    await expect(
      signIn({ ...config, email: "malformed@example.com" }),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
      message: "protocol",
    })
  })

  it("does not expose GraphQL response messages", async () => {
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
    ).rejects.toMatchObject({
      kind: "upstream-rejected",
      dispatch: "not-dispatched",
      message: "upstream-rejected",
    })
  })

  it("classifies HTTP 500 GraphQL errors as unavailable by dispatch phase", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: "server-error-token" })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json(
          { errors: [{ message: "operation failed" }] },
          { status: 500 },
        )
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "server-error@example.com" },
        "query ServerErrorRead",
      ),
    ).rejects.toMatchObject({
      kind: "unavailable",
      dispatch: "not-dispatched",
      message: "unavailable",
    })
    await expect(
      graphqlRequest(
        { ...config, email: "server-error@example.com" },
        "mutation ServerErrorWrite { updateThing }",
      ),
    ).rejects.toMatchObject({
      kind: "unavailable",
      dispatch: "dispatched",
      message: "unavailable",
    })

    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(2)
  })

  it("does not refresh or replay a forbidden mutation", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: `forbidden-token-${authHits}` })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json(
          {
            errors: [
              {
                message: "request rejected",
                extensions: { code: "FORBIDDEN" },
              },
            ],
          },
          { status: 403 },
        )
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "forbidden-mutation@example.com" },
        "mutation ForbiddenWrite { updateThing }",
      ),
    ).rejects.toMatchObject({
      kind: "permission",
      dispatch: "dispatched",
      message: "permission",
    })
    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(1)
  })

  it("marks a mutation not dispatched when refresh sign-in fails before replay", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        if (authHits === 1) {
          return HttpResponse.json({ token: "initial-mutation-token" })
        }
        return HttpResponse.json({ message: "unavailable" }, { status: 503 })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json(
          {
            errors: [
              {
                message: "request rejected",
                extensions: { code: "UNAUTHENTICATED" },
              },
            ],
          },
          { status: 401 },
        )
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "refresh-failure@example.com" },
        "mutation RefreshFailure { updateThing }",
      ),
    ).rejects.toMatchObject({
      kind: "unavailable",
      dispatch: "not-dispatched",
      message: "unavailable",
    })
    expect(authHits).toBe(2)
    expect(graphQlHits).toBe(1)
  })

  it("marks a mutation not dispatched when aborted before auth replay", async () => {
    const controller = new AbortController()
    let authHits = 0
    let graphQlHits = 0

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/admin/auth/signin")) {
          authHits += 1
          return Promise.resolve(
            new Response(JSON.stringify({ token: "initial-abort-token" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }

        graphQlHits += 1
        controller.abort()
        return Promise.resolve(
          new Response(
            JSON.stringify({
              errors: [
                {
                  message: "request rejected",
                  extensions: { code: "UNAUTHENTICATED" },
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "pre-replay-abort@example.com" },
        "mutation PreReplayAbort { updateThing }",
        undefined,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({
      kind: "aborted",
      dispatch: "not-dispatched",
      message: "aborted",
    })
    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(1)
  })

  it("refreshes only for an explicit UNAUTHENTICATED GraphQL code", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: `coded-auth-token-${authHits}` })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json({
          errors: [
            {
              message: "request rejected",
              extensions: { code: "UNAUTHENTICATED" },
            },
          ],
        })
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "coded-auth@example.com" },
        "query CodedAuthentication",
      ),
    ).rejects.toMatchObject({
      kind: "authentication",
      dispatch: "not-dispatched",
      message: "authentication",
    })
    expect(authHits).toBe(2)
    expect(graphQlHits).toBe(2)
  })

  it("classifies an explicit FORBIDDEN GraphQL code without refreshing", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({
          token: `coded-permission-token-${authHits}`,
        })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json({
          errors: [
            {
              message: "request rejected",
              extensions: { code: "FORBIDDEN" },
            },
          ],
        })
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "coded-permission@example.com" },
        "query CodedPermission",
      ),
    ).rejects.toMatchObject({
      kind: "permission",
      dispatch: "not-dispatched",
      message: "permission",
    })
    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(1)
  })

  it("rejects malformed GraphQL extension codes as protocol failures", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "malformed-extension-token" }),
      ),
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({
          errors: [
            {
              message: "request rejected",
              extensions: { code: 403 },
            },
          ],
        }),
      ),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "malformed-extension@example.com" },
        "query MalformedExtension",
      ),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
      message: "protocol",
    })
  })

  it("classifies malformed successful GraphQL payloads as protocol failures", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "malformed-graphql-token" }),
      ),
      http.post(GRAPHQL_URL, () => HttpResponse.json(null)),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "malformed-graphql@example.com" },
        "query MalformedPayload",
      ),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
      message: "protocol",
    })
  })

  it("rejects malformed GraphQL error envelopes as protocol failures", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "malformed-errors-token" }),
      ),
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({ errors: "not-an-error-array" }),
      ),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "malformed-errors@example.com" },
        "query MalformedErrors",
      ),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
      message: "protocol",
    })
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
    ).rejects.toMatchObject({
      kind: "upstream-rejected",
      dispatch: "not-dispatched",
    })

    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(1)
  })

  it("passes the caller abort signal to hung AxonHub GraphQL requests", async () => {
    const controller = new AbortController()
    let graphqlSignal: AbortSignal | undefined

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/admin/auth/signin")) {
          return Promise.resolve(
            new Response(JSON.stringify({ token: "timeout-token" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }

        graphqlSignal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) {
            reject(new Error("missing abort signal"))
            return
          }

          signal.addEventListener("abort", () => {
            reject(
              signal.reason ??
                new DOMException("The operation was aborted", "AbortError"),
            )
          })
        })
      }),
    )

    const abortReason = new Error("caller cancelled")
    abortReason.name = "AbortError"
    const request = graphqlRequest(
      { ...config, email: "graphql-abort@example.com" },
      "query Ping",
      undefined,
      { retryAuth: false, signal: controller.signal },
    )
    const expectation = expect(request).rejects.toMatchObject({
      kind: "aborted",
      dispatch: "not-dispatched",
      message: "aborted",
    })

    await vi.waitFor(() => expect(graphqlSignal).toBe(controller.signal))
    controller.abort(abortReason)

    expect(graphqlSignal?.aborted).toBe(true)
    await expectation
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

  it("refreshes once when a non-JSON GraphQL response is unauthorized", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: `non-json-token-${authHits}` })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        if (graphQlHits === 1) {
          return HttpResponse.text("unauthorized HTML", { status: 401 })
        }
        return HttpResponse.json({ data: { ping: "pong" } })
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "non-json-unauthorized@example.com" },
        "query NonJsonUnauthorized",
      ),
    ).resolves.toEqual({ ping: "pong" })
    expect(authHits).toBe(2)
    expect(graphQlHits).toBe(2)
  })

  it("classifies a message-only authentication error without refreshing", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: `revoked-token-${authHits}` })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json({
          errors: [{ message: "revoked token" }],
        })
      }),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "revoked-token@example.com" },
        "query RevokedToken",
      ),
    ).rejects.toMatchObject({
      kind: "authentication",
      dispatch: "not-dispatched",
      message: "authentication",
    })
    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(1)
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
    ).rejects.toMatchObject({
      kind: "authentication",
      dispatch: "not-dispatched",
      message: "authentication",
    })

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

  it("lets a caller abort independently while waiting for an uncancellable shared sign-in", async () => {
    const controller = new AbortController()
    let authHits = 0
    let resolveAuth:
      | ((response: Response | PromiseLike<Response>) => void)
      | undefined

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/admin/auth/signin")) {
          authHits += 1
          return new Promise<Response>((resolve) => {
            resolveAuth = resolve
          })
        }

        return Promise.resolve(
          new Response(JSON.stringify({ data: { ping: "pong" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }),
    )

    const firstRequest = graphqlRequest<{ ping: string }>(
      { ...config, email: "shared-abort@example.com" },
      "query PingOne",
    )
    await vi.waitFor(() => expect(authHits).toBe(1))

    const timedRequest = graphqlRequest<{ ping: string }>(
      { ...config, email: "shared-abort@example.com" },
      "query PingTwo",
      undefined,
      { signal: controller.signal },
    )
    const abortReason = new Error("caller cancelled")
    abortReason.name = "AbortError"
    const expectation = expect(timedRequest).rejects.toMatchObject({
      kind: "aborted",
      dispatch: "not-dispatched",
      message: "aborted",
    })

    controller.abort(abortReason)

    await expectation
    expect(authHits).toBe(1)

    resolveAuth?.(
      new Response(JSON.stringify({ token: "shared-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(firstRequest).resolves.toEqual({ ping: "pong" })
  })

  it("rejects immediately when a caller waits on shared sign-in with an already-aborted signal", async () => {
    const controller = new AbortController()
    const abortReason = new Error("already cancelled")
    controller.abort(abortReason)
    let authHits = 0
    let resolveAuth:
      | ((response: Response | PromiseLike<Response>) => void)
      | undefined

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/admin/auth/signin")) {
          authHits += 1
          return new Promise<Response>((resolve) => {
            resolveAuth = resolve
          })
        }

        return Promise.resolve(
          new Response(JSON.stringify({ data: { ping: "pong" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }),
    )

    const firstRequest = graphqlRequest<{ ping: string }>(
      { ...config, email: "already-aborted-shared@example.com" },
      "query PingOne",
    )
    await vi.waitFor(() => expect(authHits).toBe(1))

    await expect(
      graphqlRequest<{ ping: string }>(
        { ...config, email: "already-aborted-shared@example.com" },
        "query PingTwo",
        undefined,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({
      kind: "aborted",
      dispatch: "not-dispatched",
      message: "aborted",
    })

    resolveAuth?.(
      new Response(JSON.stringify({ token: "shared-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(firstRequest).resolves.toEqual({ ping: "pong" })
  })

  it("uses a default AbortError when an already-aborted caller has no reason", async () => {
    let authHits = 0
    let resolveAuth:
      | ((response: Response | PromiseLike<Response>) => void)
      | undefined
    const signalWithoutReason = {
      aborted: true,
      reason: undefined,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/admin/auth/signin")) {
          authHits += 1
          return new Promise<Response>((resolve) => {
            resolveAuth = resolve
          })
        }

        return Promise.resolve(
          new Response(JSON.stringify({ data: { ping: "pong" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }),
    )

    const firstRequest = graphqlRequest<{ ping: string }>(
      { ...config, email: "default-abort-error@example.com" },
      "query PingOne",
    )
    await vi.waitFor(() => expect(authHits).toBe(1))

    await expect(
      graphqlRequest<{ ping: string }>(
        { ...config, email: "default-abort-error@example.com" },
        "query PingTwo",
        undefined,
        { signal: signalWithoutReason },
      ),
    ).rejects.toMatchObject({
      name: "AxonHubRequestError",
      kind: "aborted",
      dispatch: "not-dispatched",
      message: "aborted",
    })
    expect(signalWithoutReason.addEventListener).not.toHaveBeenCalled()

    resolveAuth?.(
      new Response(JSON.stringify({ token: "shared-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(firstRequest).resolves.toEqual({ ping: "pong" })
  })

  it("does not share a signal-bound sign-in with later callers", async () => {
    let authHits = 0
    let graphQlHits = 0
    const firstController = new AbortController()

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/admin/auth/signin")) {
          authHits += 1
          if (authHits === 1) {
            return new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(
                  new DOMException("The operation was aborted", "AbortError"),
                )
              })
            })
          }

          return Promise.resolve(
            new Response(JSON.stringify({ token: "independent-token" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }

        graphQlHits += 1
        return Promise.resolve(
          new Response(JSON.stringify({ data: { ping: "pong" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }),
    )

    const firstRequest = graphqlRequest<{ ping: string }>(
      { ...config, email: "signal-bound@example.com" },
      "query PingOne",
      undefined,
      { signal: firstController.signal },
    )

    const secondRequest = graphqlRequest<{ ping: string }>(
      { ...config, email: "signal-bound@example.com" },
      "query PingTwo",
    )

    firstController.abort()

    await expect(firstRequest).rejects.toThrow(/aborted/i)
    await expect(secondRequest).resolves.toEqual({ ping: "pong" })
    expect(authHits).toBe(2)
    expect(graphQlHits).toBe(1)
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

  it("sanitizes legacy managed-site rows to the compatibility allowlist", () => {
    const result = axonHubChannelToManagedSite(
      buildNativeChannelDetail("sensitive-detail", {
        credentials: {
          apiKey: "legacy-primary-key",
          apiKeys: ["primary-key", "secondary-key"],
          gcp: {
            region: "example-region",
            projectID: "example-project",
            jsonData: "gcp-json-sentinel",
          },
          oauth: {
            accessToken: "oauth-access-sentinel",
            refreshToken: "oauth-refresh-sentinel",
          },
        },
        settings: {
          extraModelPrefix: "prefix-",
          modelMappings: [
            {
              from: "model-alpha",
              to: "model-upstream",
              leaked: "mapping-extra-sentinel",
            },
          ],
          transformOptions: {
            forceArrayInstructions: true,
            forceArrayInputs: false,
            replaceDeveloperRoleWithSystem: true,
            reasoningEffortMapping: [
              {
                from: "high",
                to: "medium",
                leaked: "reasoning-extra-sentinel",
              },
            ],
            leaked: "transform-extra-sentinel",
          },
          proxy: { password: "proxy-password-sentinel" },
          headerOverrideOperations: [{ value: "header-override-sentinel" }],
          bodyOverrideOperations: [{ value: "body-override-sentinel" }],
          rateLimit: {
            rpm: 10,
            tpm: 20,
            maxConcurrent: 2,
            queueSize: 3,
            queueTimeoutMs: 4,
            leaked: "rate-limit-extra-sentinel",
          },
          retryableStatusCodes: [429],
          retryableErrorPatterns: [
            {
              pattern: "temporary",
              regex: false,
              leaked: "retry-extra-sentinel",
            },
          ],
          providerQuota: {
            opencodeGo: { authCookie: "provider-cookie-sentinel" },
          },
        },
        disabledAPIKeys: [
          {
            key: "disabled-key-sentinel",
            disabledAt: "2026-07-17T00:00:00Z",
            errorCode: 401,
          },
        ],
      }) as AxonHubChannel,
    )

    expect(result.key).toBe("primary-key")
    expect(result._axonHubData.credentials).toEqual({
      apiKeys: ["primary-key"],
    })
    expect(result._axonHubData.settings).toMatchObject({
      modelMappings: [{ from: "model-alpha", to: "model-upstream" }],
      transformOptions: {
        forceArrayInstructions: true,
        forceArrayInputs: false,
        replaceDeveloperRoleWithSystem: true,
        reasoningEffortMapping: [{ from: "high", to: "medium" }],
      },
      rateLimit: {
        rpm: 10,
        tpm: 20,
        maxConcurrent: 2,
        queueSize: 3,
        queueTimeoutMs: 4,
      },
      retryableErrorPatterns: [{ pattern: "temporary", regex: false }],
    })

    const serialized = JSON.stringify(result)
    for (const sentinel of [
      "legacy-primary-key",
      "secondary-key",
      "gcp-json-sentinel",
      "oauth-access-sentinel",
      "oauth-refresh-sentinel",
      "proxy-password-sentinel",
      "header-override-sentinel",
      "body-override-sentinel",
      "provider-cookie-sentinel",
      "disabled-key-sentinel",
      "mapping-extra-sentinel",
      "reasoning-extra-sentinel",
      "transform-extra-sentinel",
      "rate-limit-extra-sentinel",
      "retry-extra-sentinel",
    ]) {
      expect(serialized).not.toContain(sentinel)
    }
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

  it("hydrates legacy paginated channels without retaining details in the list cache", async () => {
    const firstId = "gid://axonhub/Channel/one"
    const secondId = "gid://axonhub/Channel/two"
    let listPageHits = 0
    const detailIds: unknown[] = []
    const detailQueries: string[] = []
    const listQueries: string[] = []

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "list-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
          variables?: { input?: { after?: string | null } }
        }
        if (body.query?.includes("query GetAxonHubChannel")) {
          detailQueries.push(body.query)
          const id = (body.variables as { id?: unknown } | undefined)?.id
          detailIds.push(id)
          const isFirst = id === firstId
          return HttpResponse.json({
            data: {
              node: buildNativeChannelDetail(id as string, {
                type: isFirst ? "openai" : "anthropic",
                baseURL: isFirst
                  ? "https://one.example.com"
                  : "https://two.example.com",
                name: isFirst ? "one" : "two",
                status: isFirst
                  ? AXON_HUB_CHANNEL_STATUS.ENABLED
                  : AXON_HUB_CHANNEL_STATUS.DISABLED,
                credentials: isFirst
                  ? buildPinnedChannelCredentials({
                      apiKeys: ["  sk-one  ", ""],
                    })
                  : buildPinnedChannelCredentials({ apiKey: "sk-two" }),
                supportedModels: isFirst ? ["gpt-4.1"] : [],
                manualModels: isFirst ? [] : ["claude-sonnet-4-5"],
                settings: isFirst
                  ? {
                      ...buildPinnedChannelSettings(),
                      modelMappings: [
                        { from: "gpt-4.1", to: "gpt-4.1-upstream" },
                      ],
                      lowercaseModelId: true,
                    }
                  : null,
              }),
            },
          })
        }

        listPageHits += 1
        listQueries.push(body.query ?? "")

        if (!body.variables?.input?.after) {
          return HttpResponse.json({
            data: {
              queryChannels: {
                edges: [
                  {
                    node: {
                      id: firstId,
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
                    id: secondId,
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

    const listConfig = {
      ...config,
      email: "list@example.com",
    }
    const result = await listChannels(listConfig)
    await listChannels(listConfig)

    expect(listPageHits).toBe(2)
    expect(detailIds).toEqual([firstId, secondId, firstId, secondId])
    for (const query of listQueries) {
      expect(query).not.toContain("credentials")
      expect(query).not.toContain("settings")
    }
    for (const query of detailQueries) {
      for (const sensitiveSelection of [
        "jsonData",
        "oauth",
        "accessToken",
        "refreshToken",
        "proxy",
        "password",
        "providerQuota",
        "authCookie",
        "headerOverrideOperations",
        "bodyOverrideOperations",
        "disabledAPIKeys",
      ]) {
        expect(query).not.toContain(sensitiveSelection)
      }
    }
    expect(JSON.stringify(result.items)).not.toContain("proxy-password")
    expect(JSON.stringify(result.items)).not.toContain("cookie-example")
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        key: "sk-one",
        type: "openai",
        status: CHANNEL_STATUS.Enable,
        model_mapping: JSON.stringify({
          "gpt-4.1": "gpt-4.1-upstream",
        }),
        setting: expect.stringContaining('"lowercaseModelId":true'),
      }),
    )
    expect(result.items[1]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
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

  it("bounds legacy detail hydration while preserving list order", async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `bounded-${index}`)
    let active = 0
    let maxActive = 0
    let started = 0
    let releaseDetails: (() => void) | undefined
    const detailGate = new Promise<void>((resolve) => {
      releaseDetails = resolve
    })

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "bounded-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
          variables?: { id?: string }
        }
        if (body.query?.includes("query GetAxonHubChannel")) {
          const id = body.variables?.id ?? "missing"
          started += 1
          active += 1
          maxActive = Math.max(maxActive, active)
          await detailGate
          active -= 1
          return HttpResponse.json({
            data: {
              node: buildNativeChannelDetail(id, { name: id }),
            },
          })
        }

        return HttpResponse.json({
          data: {
            queryChannels: {
              edges: ids.map((id) => ({
                node: {
                  id,
                  type: "openai",
                  baseURL: null,
                  name: id,
                  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                  tags: [],
                  supportedModels: [],
                },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: ids.length,
            },
          },
        })
      }),
    )

    const pending = listChannels({ ...config, email: "bounded@example.com" })
    await vi.waitFor(() => expect(started).toBeGreaterThanOrEqual(4))
    const startedBeforeRelease = started
    releaseDetails?.()
    const result = await pending

    expect(startedBeforeRelease).toBe(4)
    expect(maxActive).toBe(4)
    expect(result.items.map((item) => item.name)).toEqual(ids)
  })

  it("stops scheduling legacy detail hydration after the first failure", async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `failure-${index}`)
    let started = 0
    let releaseDetails: (() => void) | undefined
    const detailGate = new Promise<void>((resolve) => {
      releaseDetails = resolve
    })

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "failure-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
          variables?: { id?: string }
        }
        if (body.query?.includes("query GetAxonHubChannel")) {
          const id = body.variables?.id ?? "missing"
          started += 1
          if (id === ids[0]) {
            return HttpResponse.json(
              { errors: [{ message: "detail failed" }] },
              { status: 400 },
            )
          }
          await detailGate
          return HttpResponse.json({
            data: { node: buildNativeChannelDetail(id, { name: id }) },
          })
        }

        return HttpResponse.json({
          data: {
            queryChannels: {
              edges: ids.map((id) => ({
                node: {
                  id,
                  type: "openai",
                  baseURL: null,
                  name: id,
                  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                  tags: [],
                  supportedModels: [],
                },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: ids.length,
            },
          },
        })
      }),
    )

    const outcome = listChannels({
      ...config,
      email: "failure@example.com",
    }).catch((error) => error)
    await vi.waitFor(() => expect(started).toBeGreaterThanOrEqual(4))
    releaseDetails?.()
    const error = await outcome

    expect(error).toMatchObject({ kind: "upstream-rejected" })
    expect(started).toBe(4)
  })

  it("stops scheduling legacy detail hydration after cancellation", async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `abort-${index}`)
    const controller = new AbortController()
    let started = 0
    let releaseDetails: (() => void) | undefined
    const detailGate = new Promise<void>((resolve) => {
      releaseDetails = resolve
    })

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "abort-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
          variables?: { id?: string }
        }
        if (body.query?.includes("query GetAxonHubChannel")) {
          const id = body.variables?.id ?? "missing"
          started += 1
          await detailGate
          return HttpResponse.json({
            data: { node: buildNativeChannelDetail(id, { name: id }) },
          })
        }

        return HttpResponse.json({
          data: {
            queryChannels: {
              edges: ids.map((id) => ({
                node: {
                  id,
                  type: "openai",
                  baseURL: null,
                  name: id,
                  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                  tags: [],
                  supportedModels: [],
                },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: ids.length,
            },
          },
        })
      }),
    )

    const outcome = listChannels(
      { ...config, email: "abort-hydration@example.com" },
      { signal: controller.signal },
    ).catch((error) => error)
    await vi.waitFor(() => expect(started).toBe(4))
    controller.abort()
    releaseDetails?.()
    const error = await outcome

    expect(error).toMatchObject({ kind: "aborted" })
    expect(started).toBe(4)
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
      http.post(GRAPHQL_URL, async ({ request }) => {
        graphQlHits += 1
        const body = (await request.json()) as {
          query?: string
          variables?: { id?: unknown }
        }
        if (body.query?.includes("query GetAxonHubChannel")) {
          const isAlpha = body.variables?.id === "1"
          return HttpResponse.json({
            data: {
              node: buildNativeChannelDetail(body.variables?.id as string, {
                type: isAlpha ? "openai" : "anthropic",
                baseURL: isAlpha
                  ? "https://alpha.example.com"
                  : "https://beta.example.com",
                name: isAlpha ? "alpha" : "beta",
                status: isAlpha
                  ? AXON_HUB_CHANNEL_STATUS.ENABLED
                  : AXON_HUB_CHANNEL_STATUS.DISABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKey: isAlpha ? "sk-alpha" : "sk-beta",
                }),
                supportedModels: isAlpha ? ["gpt-4.1"] : [],
                manualModels: isAlpha ? [] : ["claude-sonnet-4-5"],
              }),
            },
          })
        }

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
      searchChannels(searchConfig, "sk-beta"),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ name: "beta", key: "sk-beta" })],
    })

    await expect(
      searchChannelAdapter(buildRequest(), "alpha"),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ name: "alpha" })],
    })

    expect(authHits).toBe(2)
    expect(graphQlHits).toBe(8)
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
              createChannel: buildNativeChannelDetail("13", {
                baseURL: "https://created.example.com/v1",
                name: "Created Channel",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKeys: ["sk-created"],
                }),
                supportedModels: ["gpt-4.1"],
                manualModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: {
                  ...buildPinnedChannelSettings(),
                  modelMappings: [],
                },
                orderingWeight: 5,
              }),
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannelStatus")) {
          statusHits += 1
          return HttpResponse.json({
            data: {
              updateChannelStatus: {
                __typename: "Channel",
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
      data: expect.objectContaining({
        status: CHANNEL_STATUS.Enable,
      }),
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
      message: "unavailable",
    })
  })

  it("invalidates cached channel lists after adapter mutations", async () => {
    let listHits = 0

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "mutation-cache" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query?: string }

        if (body.query?.includes("query QueryChannels")) {
          listHits += 1
          return HttpResponse.json({
            data: {
              queryChannels: {
                edges: [],
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 0,
              },
            },
          })
        }

        if (body.query?.includes("mutation CreateChannel")) {
          return HttpResponse.json({
            data: {
              createChannel: buildNativeChannelDetail("13", {
                baseURL: "https://created.example.com/v1",
                name: "Created Channel",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKeys: ["sk-created"],
                }),
                supportedModels: ["gpt-4.1"],
                manualModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: {
                  ...buildPinnedChannelSettings(),
                  modelMappings: [],
                },
                orderingWeight: 5,
              }),
            },
          })
        }

        return HttpResponse.json(
          { errors: [{ message: "Unexpected GraphQL operation" }] },
          { status: 500 },
        )
      }),
    )

    await listChannels(config)
    await listChannels(config)
    expect(listHits).toBe(1)

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
        },
      }),
    ).resolves.toMatchObject({ success: true })

    await listChannels(config)
    expect(listHits).toBe(2)
  })

  it("invalidates cached channel lists when create succeeds but status update fails", async () => {
    let listHits = 0

    useAxonHubGraphqlRoutes({
      token: "partial-create-cache",
      routes: [
        {
          matches: matchesGraphqlOperation("query QueryChannels"),
          respond: () => {
            listHits += 1
            return HttpResponse.json({
              data: {
                queryChannels: {
                  edges: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                  totalCount: 0,
                },
              },
            })
          },
        },
        {
          matches: matchesGraphqlOperation("mutation CreateChannel"),
          respond: () =>
            HttpResponse.json({
              data: {
                createChannel: buildNativeChannelDetail("13", {
                  baseURL: "https://created.example.com/v1",
                  name: "Created Channel",
                  status: AXON_HUB_CHANNEL_STATUS.DISABLED,
                  credentials: buildPinnedChannelCredentials({
                    apiKeys: ["sk-created"],
                  }),
                  supportedModels: ["gpt-4.1"],
                  manualModels: ["gpt-4.1"],
                  defaultTestModel: "gpt-4.1",
                  settings: {
                    ...buildPinnedChannelSettings(),
                    modelMappings: [],
                  },
                  orderingWeight: 5,
                }),
              },
            }),
        },
        {
          matches: matchesGraphqlOperation("mutation UpdateChannelStatus"),
          respond: () =>
            HttpResponse.json(
              { errors: [{ message: "status exploded" }] },
              { status: 500 },
            ),
        },
      ],
    })

    await listChannels(config)
    await listChannels(config)
    expect(listHits).toBe(1)

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
      success: false,
      message: "unavailable",
    })

    await listChannels(config)
    expect(listHits).toBe(2)
  })

  it("invalidates cached channel lists when update succeeds but status update fails", async () => {
    const graphqlId = "gid://axonhub/Channel/13"
    const rowId = axonHubChannelToManagedSite({
      id: graphqlId,
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://updated.example.com/v1",
      name: "Updated Channel",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      credentials: { apiKey: "sk-updated" },
      supportedModels: ["gpt-4.1"],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    }).id
    let listHits = 0

    useAxonHubGraphqlRoutes({
      token: "partial-update-cache",
      routes: [
        {
          matches: matchesGraphqlOperation("query QueryChannels"),
          respond: () => {
            listHits += 1
            return HttpResponse.json({
              data: {
                queryChannels: {
                  edges: [
                    {
                      node: {
                        id: graphqlId,
                        type: "openai",
                        baseURL: "https://updated.example.com/v1",
                        name: "Updated Channel",
                        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
                        credentials: { apiKey: "sk-updated" },
                        supportedModels: ["gpt-4.1"],
                        manualModels: [],
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                  totalCount: 1,
                },
              },
            })
          },
        },
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: () =>
            HttpResponse.json({
              data: {
                node: buildNativeChannelDetail(graphqlId, {
                  baseURL: "https://updated.example.com/v1",
                  name: "Updated Channel",
                  status: AXON_HUB_CHANNEL_STATUS.DISABLED,
                  credentials: buildPinnedChannelCredentials({
                    apiKey: "sk-updated",
                  }),
                  supportedModels: ["gpt-4.1"],
                  settings: buildPinnedChannelSettings(),
                }),
              },
            }),
        },
        {
          matches: matchesGraphqlOperation("mutation UpdateChannel("),
          respond: () =>
            HttpResponse.json({
              data: {
                updateChannel: buildNativeChannelDetail(graphqlId, {
                  baseURL: "https://updated.example.com/v1",
                  name: "Updated Channel",
                  status: AXON_HUB_CHANNEL_STATUS.DISABLED,
                  credentials: buildPinnedChannelCredentials({
                    apiKeys: ["sk-updated"],
                  }),
                  supportedModels: ["gpt-4.1"],
                  manualModels: ["gpt-4.1"],
                  defaultTestModel: "gpt-4.1",
                  settings: {
                    ...buildPinnedChannelSettings(),
                    modelMappings: [],
                  },
                  orderingWeight: 5,
                }),
              },
            }),
        },
        {
          matches: matchesGraphqlOperation("mutation UpdateChannelStatus"),
          respond: () =>
            HttpResponse.json(
              { errors: [{ message: "status exploded" }] },
              { status: 500 },
            ),
        },
      ],
    })

    await listChannels(config)
    await listChannels(config)
    expect(listHits).toBe(1)

    await expect(
      updateChannelAdapter(buildRequest(), {
        id: rowId,
        type: "openai",
        name: "Updated Channel",
        baseURL: "https://updated.example.com/v1",
        credentials: { apiKeys: ["sk-updated"] },
        supportedModels: ["gpt-4.1"],
        manualModels: ["gpt-4.1"],
        defaultTestModel: "gpt-4.1",
        settings: {},
        orderingWeight: 5,
        status: CHANNEL_STATUS.Enable,
      }),
    ).resolves.toMatchObject({
      success: false,
      message: "unavailable",
    })

    await listChannels(config)
    expect(listHits).toBe(2)
  })

  it("updates status zero through the adapter wrapper and returns a failure message when delete returns false", async () => {
    const graphqlId = "gid://axonhub/Channel/7"
    const rowId = axonHubChannelToManagedSite({
      id: graphqlId,
      createdAt: null,
      updatedAt: null,
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
    }).id
    let statusHits = 0
    let deleteHits = 0

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "adapter-token" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query?: string }

        if (body.query?.includes("query QueryChannels")) {
          return HttpResponse.json({
            data: {
              queryChannels: {
                edges: [
                  {
                    node: {
                      id: graphqlId,
                      type: "openai",
                      baseURL: "https://adapter.example.com/v1",
                      name: "Adapter Channel",
                      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                      credentials: { apiKey: "sk-adapter" },
                      supportedModels: ["gpt-4.1"],
                      manualModels: [],
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 1,
              },
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannel(")) {
          return HttpResponse.json({
            data: {
              updateChannel: buildNativeChannelDetail(graphqlId, {
                baseURL: "https://adapter.example.com/v1",
                name: "Adapter Channel",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKey: "sk-adapter",
                }),
                supportedModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: buildPinnedChannelSettings(),
                orderingWeight: 0,
              }),
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannelStatus")) {
          statusHits += 1
          return HttpResponse.json({
            data: {
              updateChannelStatus: {
                __typename: "Channel",
                id: graphqlId,
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
        id: rowId,
        name: "Adapter Channel",
        status: CHANNEL_STATUS.Unknown,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        status: CHANNEL_STATUS.ManuallyDisabled,
      }),
      message: "success",
    })
    expect(statusHits).toBe(1)

    await expect(deleteChannelAdapter(buildRequest(), rowId)).resolves.toEqual({
      success: false,
      data: false,
      message: "Failed to delete AxonHub channel",
    })
    expect(deleteHits).toBe(1)
  })

  it("returns safe adapter errors for update/delete failures and exposes the groupless contract", async () => {
    const graphqlId = "gid://axonhub/Channel/9"
    const rowId = axonHubChannelToManagedSite({
      id: graphqlId,
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://broken.example.com/v1",
      name: "Broken update",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: { apiKey: "sk-broken" },
      supportedModels: ["gpt-4.1"],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    }).id

    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "adapter-fail" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
        }

        if (body.query?.includes("query QueryChannels")) {
          return HttpResponse.json({
            data: {
              queryChannels: {
                edges: [
                  {
                    node: {
                      id: graphqlId,
                      type: "openai",
                      baseURL: "https://broken.example.com/v1",
                      name: "Broken update",
                      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                      credentials: { apiKey: "sk-broken" },
                      supportedModels: ["gpt-4.1"],
                      manualModels: [],
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 1,
              },
            },
          })
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
        id: rowId,
        name: "Broken update",
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "unavailable",
    })

    await expect(deleteChannelAdapter(buildRequest(), rowId)).resolves.toEqual({
      success: false,
      data: null,
      message: "unavailable",
    })

    await expect(fetchSiteUserGroups()).resolves.toEqual([])
  })

  it("lists channels through the adapter wrapper", async () => {
    server.use(
      http.post(AUTH_URL, () => HttpResponse.json({ token: "adapter-list" })),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query?: string }
        if (body.query?.includes("query GetAxonHubChannel")) {
          return HttpResponse.json({
            data: {
              node: buildNativeChannelDetail("1", {
                baseURL: "https://alpha.example.com",
                name: "alpha",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKey: "sk-alpha",
                }),
                supportedModels: ["gpt-4.1"],
              }),
            },
          })
        }

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
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: 1,
            },
          },
        })
      }),
    )

    await expect(listAllChannels(buildRequest())).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: 1, name: "alpha" })],
    })
  })

  it("hydrates AxonHub GraphQL ids before adapter delete mutations", async () => {
    const graphqlId = "gid://axonhub/Channel/7"
    const rowId = axonHubChannelToManagedSite({
      id: graphqlId,
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://alpha.example.com",
      name: "alpha",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: { apiKey: "sk-alpha" },
      supportedModels: ["gpt-4.1"],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    }).id
    __resetCachesForTesting()

    let listHits = 0
    let deletedId: unknown

    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "adapter-delete-gid" }),
      ),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
          variables?: { id?: unknown }
        }

        if (body.query?.includes("query QueryChannels")) {
          listHits += 1
          return HttpResponse.json({
            data: {
              queryChannels: {
                edges: [
                  {
                    node: {
                      id: graphqlId,
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
          })
        }

        if (body.query?.includes("query GetAxonHubChannel")) {
          return HttpResponse.json({
            data: {
              node: buildNativeChannelDetail(graphqlId, {
                baseURL: "https://alpha.example.com",
                name: "alpha",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKey: "sk-alpha",
                }),
                supportedModels: ["gpt-4.1"],
              }),
            },
          })
        }

        if (body.query?.includes("mutation DeleteChannel")) {
          deletedId = body.variables?.id
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

    await expect(deleteChannelAdapter(buildRequest(), rowId)).resolves.toEqual({
      success: true,
      data: true,
      message: "success",
    })

    expect(listHits).toBe(1)
    expect(deletedId).toBe(graphqlId)
  })

  it("uses opaque mapped AxonHub GraphQL ids for adapter delete mutations", async () => {
    const graphqlId = "opaque-channel-id"
    const rowId = axonHubChannelToManagedSite({
      id: graphqlId,
      createdAt: null,
      updatedAt: null,
      type: "openai",
      baseURL: "https://opaque.example.com",
      name: "opaque",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      credentials: { apiKey: "sk-opaque" },
      supportedModels: ["gpt-4.1"],
      manualModels: [],
      defaultTestModel: null,
      settings: {},
      orderingWeight: 0,
      remark: null,
      errorMessage: null,
    }).id

    let deletedId: unknown

    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "adapter-delete-opaque" }),
      ),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string
          variables?: { id?: unknown }
        }

        if (body.query?.includes("mutation DeleteChannel")) {
          deletedId = body.variables?.id
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

    await expect(deleteChannelAdapter(buildRequest(), rowId)).resolves.toEqual({
      success: true,
      data: true,
      message: "success",
    })

    expect(deletedId).toBe(graphqlId)
  })

  it("reports an error when an AxonHub numeric row id cannot be hydrated", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "adapter-delete-unmapped" }),
      ),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query?: string }

        if (body.query?.includes("query QueryChannels")) {
          return HttpResponse.json({
            data: {
              queryChannels: {
                edges: [],
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 0,
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

    await expect(deleteChannelAdapter(buildRequest(), 999)).resolves.toEqual({
      success: false,
      data: null,
      message: "Unable to resolve AxonHub GraphQL id for channel 999",
    })
  })

  it("reuses cached channel lists for repeated searches and invalidates after mutations", async () => {
    let authHits = 0
    let listHits = 0
    let detailHits = 0
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
          variables?: { id?: unknown }
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

        if (body.query?.includes("query GetAxonHubChannel")) {
          detailHits += 1
          const isAlpha = body.variables?.id === "1"
          return HttpResponse.json({
            data: {
              node: buildNativeChannelDetail(body.variables?.id as string, {
                baseURL: isAlpha
                  ? "https://alpha.example.com"
                  : "https://beta.example.com",
                name: isAlpha ? "alpha" : "beta",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKey: isAlpha ? "sk-alpha" : "sk-beta",
                }),
                supportedModels: [isAlpha ? "gpt-4.1" : "gpt-4o"],
              }),
            },
          })
        }

        if (body.query?.includes("mutation CreateChannel")) {
          createHits += 1
          return HttpResponse.json({
            data: {
              createChannel: buildNativeChannelDetail("3", {
                baseURL: "https://created.example.com",
                name: "created",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKeys: ["sk-created"],
                }),
                supportedModels: ["gpt-4.1"],
                manualModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: {
                  ...buildPinnedChannelSettings(),
                  modelMappings: [],
                },
                orderingWeight: 0,
              }),
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannel(")) {
          updateHits += 1
          return HttpResponse.json({
            data: {
              updateChannel: buildNativeChannelDetail("1", {
                baseURL: "https://alpha.example.com",
                name: "updated",
                status: AXON_HUB_CHANNEL_STATUS.ENABLED,
                credentials: buildPinnedChannelCredentials({
                  apiKeys: ["sk-alpha"],
                }),
                supportedModels: ["gpt-4.1"],
                manualModels: ["gpt-4.1"],
                defaultTestModel: "gpt-4.1",
                settings: {
                  ...buildPinnedChannelSettings(),
                  modelMappings: [],
                },
                orderingWeight: 0,
              }),
            },
          })
        }

        if (body.query?.includes("mutation UpdateChannelStatus")) {
          statusHits += 1
          return HttpResponse.json({
            data: {
              updateChannelStatus: {
                __typename: "Channel",
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
    expect(detailHits).toBe(12)

    expect(authHits).toBe(1)
    expect(createHits).toBe(1)
    expect(updateHits).toBe(1)
    expect(statusHits).toBe(1)
    expect(deleteHits).toBe(1)
  })
})
