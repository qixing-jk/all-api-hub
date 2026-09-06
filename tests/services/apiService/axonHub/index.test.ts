import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import {
  __resetCachesForTesting,
  AxonHubRequestError,
  createAxonHubChannel,
  deleteAxonHubChannel,
  getAxonHubChannel,
  graphqlRequest,
  hasCompleteAxonHubAdvancedDetail,
  listAxonHubChannelPage,
  signIn,
  updateAxonHubChannel,
  updateAxonHubChannelStatus,
} from "~/services/apiService/axonHub"
import type { AxonHubChannel, AxonHubCreateChannelInput } from "~/types/axonHub"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://axonhub.example.com/",
  email: "admin@example.com",
  password: "secret",
}

const AUTH_URL = "https://axonhub.example.com/admin/auth/signin"
const GRAPHQL_URL = "https://axonhub.example.com/admin/graphql"

const extractSelectionBlock = (source: string, marker: string) => {
  const markerIndex = source.indexOf(marker)
  const openBrace = source.indexOf("{", markerIndex)
  if (markerIndex < 0 || openBrace < 0) {
    throw new Error(`missing GraphQL selection marker: ${marker}`)
  }
  let depth = 0
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1
    if (source[index] !== "}") continue
    depth -= 1
    if (depth === 0) return source.slice(openBrace + 1, index)
  }
  throw new Error(`unterminated GraphQL selection marker: ${marker}`)
}

const getTopLevelSelectionNames = (selection: string) => {
  const names = new Set<string>()
  let depth = 0
  for (const line of selection.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (depth === 0) {
      const name = /^([_A-Za-z][_0-9A-Za-z]*)\b/.exec(trimmed)?.[1]
      if (name) names.add(name)
    }
    for (const character of line) {
      if (character === "{") depth += 1
      if (character === "}") depth -= 1
    }
  }
  return names
}

const nativeNullBaseUrlChannel: AxonHubChannel = {
  id: "gid://axonhub/Channel/native-null-base-url",
  type: "openai",
  baseURL: null,
  name: "Native page channel",
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  tags: ["table-tag"],
  credentials: null,
  supportedModels: ["model-alpha"],
  manualModels: ["manual-alpha"],
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
          supportedModels: ["model-alpha"],
          manualModels: ["manual-alpha"],
        }),
      ],
      total: 7,
      nextCursor: "upstream-next-cursor",
    })
    expect(page.items[0]).not.toHaveProperty("credentials")
    expect(page.items[0]).not.toHaveProperty("settings")

    expect(capturedQuery).toContain("queryChannels(input: $input)")
    expect(capturedQuery).toContain("tags")
    expect(capturedQuery).toContain("manualModels")
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
    const channelSelection = extractSelectionBlock(
      capturedQuery,
      "... on Channel",
    )
    expect([...getTopLevelSelectionNames(channelSelection)]).toEqual(
      expect.arrayContaining([
        "name",
        "type",
        "baseURL",
        "status",
        "credentials",
        "supportedModels",
        "manualModels",
        "defaultTestModel",
        "autoSyncSupportedModels",
        "autoSyncModelPattern",
        "tags",
        "orderingWeight",
        "remark",
        "settings",
      ]),
    )
    const credentialsSelection = extractSelectionBlock(
      channelSelection,
      "credentials",
    )
    expect([...getTopLevelSelectionNames(credentialsSelection)]).toEqual(
      expect.arrayContaining(["apiKey", "apiKeys", "gcp", "oauth"]),
    )
    expect([
      ...getTopLevelSelectionNames(
        extractSelectionBlock(credentialsSelection, "gcp"),
      ),
    ]).toEqual(expect.arrayContaining(["region", "projectID", "jsonData"]))
    expect([
      ...getTopLevelSelectionNames(
        extractSelectionBlock(credentialsSelection, "oauth"),
      ),
    ]).toEqual(
      expect.arrayContaining([
        "accessToken",
        "refreshToken",
        "clientID",
        "expiresAt",
        "tokenType",
        "scopes",
      ]),
    )
    expect([
      ...getTopLevelSelectionNames(
        extractSelectionBlock(channelSelection, "settings"),
      ),
    ]).toContain("extraModelPrefix")
    expect(capturedVariables).toEqual({ id: opaqueId })
  })

  it("accepts a complete pinned authoritative channel output", async () => {
    const id = "complete-pinned-output"
    const settings = buildPinnedChannelSettings()
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
      settings: {
        ...settings,
        headerOverrideOperations: [
          {
            ...settings.headerOverrideOperations[0],
            match: { path: "$.model", eq: "model-alpha" },
          },
        ],
        transformOptions: {
          ...settings.transformOptions,
          reasoningEffortMapping: [{ from: "high", to: "medium" }],
        },
      },
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
          expect.objectContaining({
            value: '{"enabled":true}',
            match: { path: "$.model", eq: "model-alpha" },
          }),
        ],
        bodyOverrideOperations: [],
        transformOptions: expect.objectContaining({
          reasoningEffortMapping: [{ from: "high", to: "medium" }],
        }),
      },
    })
  })

  it("selects only product-owned settings facts from channel detail", async () => {
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
    for (const replacementOnlyField of [
      "providerQuota",
      "modelProtocols",
      "proxy",
      "transformOptions",
      "headerOverrideOperations",
      "bodyOverrideOperations",
      "rateLimit",
    ]) {
      expect(detailQuery).not.toContain(replacementOnlyField)
    }
  })

  it("reprobes the advanced detail contract after a successful sign-in", async () => {
    const queries: string[] = []
    let rejectedAdvancedQuery = false

    useAxonHubGraphqlRoutes({
      token: "detail-fallback-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: ({ query, variables }) => {
            queries.push(query)
            if (query.includes("settings {") && !rejectedAdvancedQuery) {
              rejectedAdvancedQuery = true
              return HttpResponse.json({
                errors: [
                  {
                    message: "Cannot query field on ChannelSettings",
                    extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
                  },
                ],
              })
            }
            return HttpResponse.json({
              data: {
                node: buildNativeChannelDetail(
                  String(variables?.id),
                  query.includes("query GetAxonHubChannelCore")
                    ? {
                        settings: undefined,
                        policies: undefined,
                        endpoints: undefined,
                      }
                    : {},
                ),
              },
            })
          },
        },
      ],
    })

    const first = await getAxonHubChannel(config, "fallback-detail-one")
    const second = await getAxonHubChannel(config, "fallback-detail-two")
    await signIn(config)
    const third = await getAxonHubChannel(config, "fallback-detail-three")

    expect(queries).toHaveLength(4)
    expect(queries[0]).toContain("settings {")
    for (const query of queries.slice(1, 3)) {
      expect(query).toContain("query GetAxonHubChannelCore")
      expect(query).not.toContain("settings {")
      expect(query).not.toContain("policies {")
      expect(query).not.toContain("endpoints {")
      expect(query).not.toContain("oauth {")
    }
    expect(queries[3]).toContain("settings {")
    expect(hasCompleteAxonHubAdvancedDetail(first)).toBe(false)
    expect(hasCompleteAxonHubAdvancedDetail(second)).toBe(false)
    expect(hasCompleteAxonHubAdvancedDetail(third)).toBe(true)
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

  it("rejects incomplete product-owned detail output fields", async () => {
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
    const malformedConnections: unknown[] = [
      null,
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
      {
        edges: ["not-an-edge"],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 1,
      },
      {
        edges: [{ node: nativeNullBaseUrlChannel, cursor: 42 }],
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

  it("distinguishes missing and absent native detail results", async () => {
    const responses = [{}, { node: null }]
    let responseIndex = 0

    useAxonHubGraphqlRoutes({
      token: "missing-detail-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query GetAxonHubChannel"),
          respond: () =>
            HttpResponse.json({ data: responses[responseIndex++] }),
        },
      ],
    })

    await expect(
      getAxonHubChannel(config, "missing-detail-field"),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
    })
    await expect(
      getAxonHubChannel(config, "absent-detail-node"),
    ).rejects.toMatchObject({
      kind: "not-found",
      dispatch: "not-dispatched",
    })
  })

  it("accepts optional summary numbers and an omitted total count", async () => {
    useAxonHubGraphqlRoutes({
      token: "optional-summary-token",
      routes: [
        {
          matches: matchesGraphqlOperation("query ListAxonHubChannelPage"),
          respond: () =>
            HttpResponse.json({
              data: {
                queryChannels: {
                  edges: [
                    {
                      node: {
                        ...nativeNullBaseUrlChannel,
                        id: "summary-null-ordering",
                        orderingWeight: null,
                      },
                    },
                    {
                      node: {
                        ...nativeNullBaseUrlChannel,
                        id: "summary-finite-ordering",
                        orderingWeight: 1.5,
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            }),
        },
      ],
    })

    const page = await listAxonHubChannelPage(config, { limit: 10 })

    expect(page.items.map((item) => item.id)).toEqual([
      "summary-null-ordering",
      "summary-finite-ordering",
    ])
    expect(page).not.toHaveProperty("total")
  })

  it("sends verified update and clear fields unchanged", async () => {
    let capturedQuery = ""
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
          respond: ({ query, variables }) => {
            capturedQuery = query
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
    const mutationSelection = extractSelectionBlock(
      capturedQuery,
      "updateChannel(id: $id, input: $input)",
    )
    expect([...getTopLevelSelectionNames(mutationSelection)]).toEqual([
      "__typename",
      "id",
      "type",
      "baseURL",
      "name",
      "status",
    ])
    expect(capturedQuery).not.toContain("settings")
    expect(capturedQuery).not.toContain("credentials")
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
                  name: 42,
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
    const capturedQueries: string[] = []
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
          respond: ({ query, variables }) => {
            capturedQueries.push(query)
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
    expect(capturedQueries).toHaveLength(2)
    for (const query of capturedQueries) {
      expect(query).not.toContain("providerQuota")
    }
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

  it("preserves the original dispatched transport failure as the typed cause", async () => {
    const raw = new TypeError("connection closed")
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/admin/auth/signin")
          ? Promise.resolve(
              new Response(JSON.stringify({ token: "transport-cause-token" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            )
          : Promise.reject(raw),
      ),
    )

    const failure = await graphqlRequest(
      { ...config, email: "transport-cause@example.com" },
      "mutation TransportCause { updateThing }",
    ).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      kind: "unavailable",
      dispatch: "dispatched",
      responseReceived: false,
      raw,
      cause: raw,
    })
  })

  it("upgrades typed transport evidence after mutation dispatch", async () => {
    const raw = new Error("lower transport failure")
    const typed = new AxonHubRequestError(
      "unavailable",
      "not-dispatched",
      "typed transport failure",
      {
        responseReceived: false,
        statusCode: 503,
        code: "LOWER_TRANSPORT",
        raw,
        cause: raw,
        safeMessage: "safe transport failure",
      },
    )
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/admin/auth/signin")
          ? Promise.resolve(
              new Response(JSON.stringify({ token: "typed-evidence-token" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            )
          : Promise.reject(typed),
      ),
    )

    const failure = await graphqlRequest(
      { ...config, email: "typed-evidence@example.invalid" },
      "mutation TypedEvidence { updateThing }",
    ).catch((error: unknown) => error)

    expect(failure).not.toBe(typed)
    expect(failure).toMatchObject({
      kind: "unavailable",
      dispatch: "dispatched",
      message: "safe transport failure",
      responseReceived: false,
      statusCode: 503,
      code: "LOWER_TRANSPORT",
      raw,
      cause: raw,
      safeMessage: "safe transport failure",
    })
  })

  it.each([
    [
      "create",
      () =>
        createAxonHubChannel(config, {
          type: "openai",
          name: "Rejected create",
          credentials: { apiKeys: ["placeholder-key"] },
          supportedModels: ["model-alpha"],
          defaultTestModel: "model-alpha",
        }),
    ],
    [
      "update",
      () =>
        updateAxonHubChannel(config, "opaque-permission-id", {
          name: "Rejected",
        }),
    ],
    ["delete", () => deleteAxonHubChannel(config, "opaque-permission-id")],
  ] as const)(
    "does not retry an authentication-rejected %s after dispatch",
    async (_operation, mutate) => {
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
                  message: "expired token",
                },
              ],
            },
            { status: 401 },
          )
        }),
      )

      const failure = await mutate().catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(AxonHubRequestError)
      expect(failure).toMatchObject({
        kind: "authentication",
        dispatch: "dispatched",
        message: "authentication",
      })
      expect(authHits).toBe(1)
      expect(graphQlHits).toBe(1)
    },
  )

  it("does not retry a comment-prefixed GraphQL mutation after dispatch", async () => {
    let authHits = 0
    let graphQlHits = 0

    server.use(
      http.post(AUTH_URL, () => {
        authHits += 1
        return HttpResponse.json({ token: `comment-token-${authHits}` })
      }),
      http.post(GRAPHQL_URL, () => {
        graphQlHits += 1
        return HttpResponse.json(
          { errors: [{ message: "expired token" }] },
          { status: 401 },
        )
      }),
    )

    const failure = await graphqlRequest(
      config,
      "# generated operation\nmutation CommentPrefixed { updateThing }",
    ).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      kind: "authentication",
      dispatch: "dispatched",
    })
    expect(authHits).toBe(1)
    expect(graphQlHits).toBe(1)
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

  it("preserves a validated GraphQL code after an earlier message-only error", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "graphql-code-token" }),
      ),
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json({
          errors: [
            { message: "request rejected" },
            {
              message: "authentication required",
              extensions: { code: "UNAUTHENTICATED" },
            },
          ],
        }),
      ),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "graphql-code@example.invalid" },
        "query { viewer { id } }",
        undefined,
        { retryAuth: false },
      ),
    ).rejects.toMatchObject({
      kind: "authentication",
      dispatch: "not-dispatched",
      code: "UNAUTHENTICATED",
      message: "authentication",
    })
  })

  it("classifies GraphQL not-found and message-only permission failures", async () => {
    const responses = [
      HttpResponse.json({ errors: [{ message: "missing" }] }, { status: 404 }),
      HttpResponse.json({ errors: [{ message: "permission denied" }] }),
    ]
    let responseIndex = 0

    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "classification-token" }),
      ),
      http.post(GRAPHQL_URL, () => responses[responseIndex++]),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "not-found-classification@example.com" },
        "query MissingChannel",
        undefined,
        { retryAuth: false },
      ),
    ).rejects.toMatchObject({
      kind: "not-found",
      dispatch: "not-dispatched",
    })
    await expect(
      graphqlRequest(
        { ...config, email: "permission-classification@example.com" },
        "query ForbiddenChannel",
        undefined,
        { retryAuth: false },
      ),
    ).rejects.toMatchObject({
      kind: "permission",
      dispatch: "not-dispatched",
    })
  })

  it("classifies non-JSON GraphQL rejection and success responses safely", async () => {
    const responses = [
      HttpResponse.text("bad request", { status: 400 }),
      HttpResponse.text("not JSON", { status: 200 }),
    ]
    let responseIndex = 0

    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "non-json-classification-token" }),
      ),
      http.post(GRAPHQL_URL, () => responses[responseIndex++]),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "non-json-rejection@example.com" },
        "query RejectedNonJson",
        undefined,
        { retryAuth: false },
      ),
    ).rejects.toMatchObject({
      kind: "upstream-rejected",
      dispatch: "not-dispatched",
    })
    await expect(
      graphqlRequest(
        { ...config, email: "non-json-success@example.com" },
        "query SuccessfulNonJson",
        undefined,
        { retryAuth: false },
      ),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
    })
  })

  it("rejects a GraphQL envelope whose data is explicitly null", async () => {
    server.use(
      http.post(AUTH_URL, () =>
        HttpResponse.json({ token: "null-data-token" }),
      ),
      http.post(GRAPHQL_URL, () => HttpResponse.json({ data: null })),
    )

    await expect(
      graphqlRequest(
        { ...config, email: "null-data@example.com" },
        "query NullData",
      ),
    ).rejects.toMatchObject({
      kind: "protocol",
      dispatch: "not-dispatched",
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

  it.each([
    {
      name: "HTTP 401",
      response: () =>
        HttpResponse.json(
          { errors: [{ message: "Bearer secret-token is expired" }] },
          { status: 401 },
        ),
      expectedCode: undefined,
      expectedStatusCode: 401,
    },
    {
      name: "UNAUTHENTICATED GraphQL error",
      response: () =>
        HttpResponse.json({
          errors: [
            {
              message: "Bearer secret-token is expired",
              extensions: { code: "UNAUTHENTICATED" },
            },
          ],
        }),
      expectedCode: "UNAUTHENTICATED",
      expectedStatusCode: 200,
    },
  ])(
    "does not refresh or replay a dispatched mutation after $name",
    async ({ response, expectedCode, expectedStatusCode }) => {
      let authHits = 0
      let graphQlHits = 0

      server.use(
        http.post(AUTH_URL, () => {
          authHits += 1
          return HttpResponse.json({
            token: `initial-mutation-token-${authHits}`,
          })
        }),
        http.post(GRAPHQL_URL, () => {
          graphQlHits += 1
          return response()
        }),
      )

      await expect(
        graphqlRequest(
          { ...config, email: "refresh-failure@example.com" },
          "mutation RefreshFailure { updateThing }",
        ),
      ).rejects.toMatchObject({
        kind: "authentication",
        dispatch: "dispatched",
        responseReceived: true,
        statusCode: expectedStatusCode,
        code: expectedCode,
        message: "authentication",
      })
      expect(authHits).toBe(1)
      expect(graphQlHits).toBe(1)
    },
  )

  it("keeps a mutation dispatched when its caller aborts after an auth rejection", async () => {
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
      kind: "authentication",
      dispatch: "dispatched",
      message: "authentication",
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
})
