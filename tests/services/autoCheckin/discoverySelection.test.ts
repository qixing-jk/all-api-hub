import { beforeEach, expect, it, vi } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApi, fetchApiResponse } from "~/services/apiTransport/request"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configuration/configCodec"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { inspectCheckInMethods } from "~/services/checkin/autoCheckin/domain"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { createAutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import { AuthTypeEnum } from "~/types"
import type { CheckInMethodDetection, CheckInMethodId } from "~/types/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data: vi.fn(), envelope: vi.fn() },
}))
vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApi: vi.fn(),
  fetchApiResponse: vi.fn(),
}))
beforeEach(() => vi.resetAllMocks())

it("ignores invalid and non-web metadata URLs without choosing a peer", async () => {
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    message: "",
    data: { api_info: [{ url: "not a URL" }, { url: "ftp://xingya.site" }] },
  })
  const account = discoveryAccount()
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry(),
  })
  expect(result.config.selection).toEqual({ mode: "automatic" })
  expect(result.decision.outcome).toBe("ambiguous")
})

const discoveryAccount = (siteUrl = "https://mirror.example") =>
  buildSiteAccount({
    site_type: SITE_TYPES.NEW_API,
    site_url: siteUrl,
    checkIn: {
      automaticExecutionEnabled: false,
      selection: { mode: "automatic" },
      methodKnowledge: { methods: {} },
    },
  })
const matched = (): CheckInMethodDetection => ({
  outcome: "matched",
  evidence: { source: "probe", observedAt: 100 },
})
const unknown = (): CheckInMethodDetection => ({
  outcome: "unknown",
  reason: "network",
  attemptedAt: 100,
})
const unsupported = (): CheckInMethodDetection => ({
  outcome: "unsupported",
  evidence: { source: "probe", observedAt: 100 },
})
const peersRegistry = (
  detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>> = {
    "xingya:daily-checkin": matched(),
    "veloera:daily-checkin": matched(),
  },
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
) =>
  createAutoCheckinMethodRegistry(
    Object.entries(detections).map(([id, detection]) => ({
      id: id as CheckInMethodId,
      siteTypes: [siteType],
      discoveryOrigins:
        id === "xingya:daily-checkin"
          ? ["https://xingya.site", "https://xingya.space"]
          : ["https://other.example"],
      provider: {
        getReadiness: () => ({ ready: true }),
        detect: async () => detection!,
        checkIn: vi.fn(async () => ({ status: "success" as const })),
      },
    })),
  )

it.each(
  [
    "https://user@xingya.site/v1",
    "https://:password@xingya.site/v1",
    "https://xingya.site/v1?token=temporary",
  ].flatMap((url) =>
    [SITE_TYPES.NEW_API, SITE_TYPES.SUB2API].map((siteType) => ({
      url,
      siteType,
    })),
  ),
)(
  "ignores credential or query-bearing $siteType discovery evidence: $url",
  async ({ url, siteType }) => {
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
      success: true,
      message: "",
      data: { api_info: [{ url }] },
    })
    vi.mocked(fetchApi).mockResolvedValue({
      code: 0,
      message: "",
      data: { api_base_url: url, custom_endpoints: [{ endpoint: url }] },
    })
    const account = discoveryAccount()
    account.site_type = siteType
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      registry: peersRegistry(undefined, siteType),
    })
    expect(result.decision.outcome).toBe("ambiguous")
    expect(result.config.selection).toEqual({ mode: "automatic" })
  },
)

it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API])(
  "keeps a %s protocol tie when an advertised endpoint member is malformed",
  async (siteType) => {
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
      success: true,
      data: { api_info: [{ url: "https://xingya.site" }, { url: 42 }] },
      message: "",
    })
    vi.mocked(fetchApi).mockResolvedValue({
      code: 0,
      message: "",
      data: {
        api_base_url: "https://xingya.site",
        custom_endpoints: [{ endpoint: 42 }],
      },
    })
    const account = discoveryAccount()
    account.site_type = siteType
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      registry: peersRegistry(undefined, siteType),
    })
    expect(result.decision.outcome).toBe("ambiguous")
  },
)

it("ranks Sub2API peers using its public API base and custom endpoints", async () => {
  vi.mocked(fetchApi).mockResolvedValue({
    code: 0,
    message: "",
    data: {
      api_base_url: "https://codexcli.club/v1",
      custom_endpoints: [
        { name: "Mirror", endpoint: "https://mirror.codexcli.club/v1" },
        { name: "Other", endpoint: "https://other.example/v1" },
      ],
    },
  })
  const account = discoveryAccount()
  account.site_type = SITE_TYPES.SUB2API
  const registry = createAutoCheckinMethodRegistry([
    {
      id: "genius-programmer:daily-checkin",
      siteTypes: [SITE_TYPES.SUB2API],
      discoveryOrigins: [
        "https://codexcli.club",
        "https://mirror.codexcli.club",
      ],
      provider: {
        getReadiness: () => ({ ready: true }),
        detect: async () => matched(),
        checkIn: vi.fn(),
      },
    },
    {
      id: "sub2api-pro:daily-checkin",
      siteTypes: [SITE_TYPES.SUB2API],
      discoveryOrigins: ["https://other.example"],
      provider: {
        getReadiness: () => ({ ready: true }),
        detect: async () => matched(),
        checkIn: vi.fn(),
      },
    },
  ])
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry,
  })
  expect(result.decision).toEqual({
    outcome: "resolved",
    methodId: "genius-programmer:daily-checkin",
  })
  expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
  expect(fetchApi).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: account.site_url,
      auth: { authType: AuthTypeEnum.None },
    }),
    expect.objectContaining({ endpoint: "/api/v1/settings/public" }),
  )
})

it("uses registered deployment hints without restricting mirror candidates", async () => {
  vi.mocked(fetchApi).mockResolvedValue({
    code: 0,
    message: "",
    data: { api_base_url: "https://codexcli.club/v1" },
  })
  const account = discoveryAccount()
  account.site_type = SITE_TYPES.SUB2API
  const methodIds: CheckInMethodId[] = [
    "genius-programmer:daily-checkin",
    "toolcode:daily-checkin",
  ]
  const registry = createAutoCheckinMethodRegistry(
    autoCheckinMethodRegistry.registrations
      .filter(({ id }) => methodIds.includes(id))
      .map((entry) => ({
        ...entry,
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => matched(),
          checkIn: vi.fn(),
        },
      })),
  )
  expect(
    registry.getCandidates(SITE_TYPES.SUB2API, account.site_url),
  ).toHaveLength(2)
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry,
  })
  expect(result.decision).toEqual({
    outcome: "resolved",
    methodId: "genius-programmer:daily-checkin",
  })
})

const knownSub2ApiSourceAddresses = [
  ["sub2api-pro:daily-checkin", "https://demo.sub2api.org"],
  ["genius-programmer:daily-checkin", "https://codexcli.club"],
  ["genius-programmer:daily-checkin", "https://api.codexcli.club"],
  ["toolcode:daily-checkin", "https://toolcode.top"],
  ["toolcode:daily-checkin", "https://toolcode.cc"],
  ["toolcode:daily-checkin", "https://api.fasttoken.top"],
  ["denxio:daily-checkin", "https://api.denxio.top"],
  ["hiyo:daily-checkin", "https://free.hiyo.top"],
  ["hiyo:daily-checkin", "https://codexfree.xiaotuxp.com"],
  ["xiaobai-code:daily-checkin", "https://token.dialoguedui.com"],
  ["xiaobai-code:daily-checkin", "https://img-api.dialoguedui.com"],
  ["clawhud:daily-checkin", "https://api.clawhud.com"],
  ["daigua:daily-checkin", "https://api.daigua.icu"],
  ["sidrune:daily-checkin", "https://global.sidrune.ai"],
  ["sidrune:daily-checkin", "https://cn.sidrune.ai"],
  ["nexavlinks:daily-checkin", "https://asia.nexavlinks.com"],
  ["nexavlinks:daily-checkin", "https://ai.man8out.com"],
  ["nexavlinks:daily-checkin", "https://www.nexavlinks.com"],
  ["freeapi:daily-checkin", "https://freeapi.site"],
  ["bai-api:daily-checkin", "https://byeapi.top"],
  ["bai-api:daily-checkin", "https://api.byeapi.top"],
] as const satisfies readonly (readonly [CheckInMethodId, string])[]

it.each(
  knownSub2ApiSourceAddresses.flatMap(([methodId, origin]) =>
    ["current", "api"].map((evidence) => ({ methodId, origin, evidence })),
  ),
)(
  "ranks $methodId from its $evidence address $origin",
  async ({ methodId, origin, evidence }) => {
    vi.mocked(fetchApi).mockResolvedValue({
      code: 0,
      message: "",
      data: evidence === "api" ? { api_base_url: `${origin}/v1` } : {},
    })
    const peerId: CheckInMethodId =
      methodId === "genius-programmer:daily-checkin"
        ? "toolcode:daily-checkin"
        : "genius-programmer:daily-checkin"
    const registry = createAutoCheckinMethodRegistry(
      autoCheckinMethodRegistry.registrations
        .filter(({ id }) => id === methodId || id === peerId)
        .map((entry) => ({
          ...entry,
          provider: {
            getReadiness: () => ({ ready: true }),
            detect: async () => matched(),
            checkIn: vi.fn(),
          },
        })),
    )
    const account = discoveryAccount(
      evidence === "current" ? origin : "https://mirror.example",
    )
    account.site_type = SITE_TYPES.SUB2API
    expect(
      registry.getCandidates(account.site_type, account.site_url),
    ).toHaveLength(2)
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      registry,
    })
    expect(result.decision).toEqual({ outcome: "resolved", methodId })
    for (const registration of registry.registrations)
      expect(registration.provider.checkIn).not.toHaveBeenCalled()
  },
)

it("counts AI-ROUTER's advertised API address while retaining its console eligibility gate", async () => {
  vi.mocked(fetchApi).mockResolvedValue({
    code: 0,
    message: "",
    data: {
      api_base_url: "https://api.ai-router.dev",
      custom_endpoints: [{ endpoint: "https://codexcli.club/v1" }],
    },
  })
  const registry = createAutoCheckinMethodRegistry(
    autoCheckinMethodRegistry.registrations
      .filter(
        ({ id }) =>
          id === "ai-router:daily-checkin" ||
          id === "genius-programmer:daily-checkin",
      )
      .map((entry) => ({
        ...entry,
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => matched(),
          checkIn: vi.fn(),
        },
      })),
  )
  expect(
    registry
      .getCandidates(SITE_TYPES.SUB2API, "https://mirror.example")
      .map(({ id }) => id),
  ).not.toContain("ai-router:daily-checkin")
  const account = discoveryAccount("https://ai-router.dev")
  account.site_type = SITE_TYPES.SUB2API
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry,
  })
  expect(result.decision).toEqual({
    outcome: "resolved",
    methodId: "ai-router:daily-checkin",
  })
})

const registeredSub2ApiPeers = () =>
  createAutoCheckinMethodRegistry(
    autoCheckinMethodRegistry.registrations
      .filter(
        ({ id }) =>
          id === "genius-programmer:daily-checkin" ||
          id === "toolcode:daily-checkin",
      )
      .map((entry) => ({
        ...entry,
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => matched(),
          checkIn: vi.fn(),
        },
      })),
  )

it.each([true, false])(
  "preserves native sibling certainty with a complete fingerprint: %s",
  async (complete) => {
    vi.mocked(fetchApi).mockImplementation(async (_request, options) => {
      if (options.endpoint === "/api/v1/settings/public")
        return {
          code: 0,
          message: "",
          data: { api_base_url: "https://codexcli.club/v1" },
        }
      throw new ApiError("Not found", 404, options.endpoint)
    })
    vi.mocked(fetchApiResponse).mockImplementation(
      async (_request, options) => {
        const path = options.endpoint.split("?")[0]
        if (path === "/api/v1/user/checkin/status")
          return {
            ok: true,
            status: 200,
            headers: {},
            body: {
              code: 0,
              message: "",
              data: {
                enabled: true,
                today_checked_in: false,
                ...(complete ? { recent_records: [] } : {}),
              },
            },
          }
        if (path === "/api/v1/engagement/checkin/status")
          return {
            ok: true,
            status: 200,
            headers: {},
            body: {
              code: 0,
              message: "",
              data: {
                checkin_enabled: true,
                checked_in_today: false,
                can_checkin: true,
              },
            },
          }
        return {
          ok: false,
          status: 404,
          headers: {},
          body: "404 page not found",
        }
      },
    )
    const account = discoveryAccount()
    account.site_type = SITE_TYPES.SUB2API
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
    })
    expect(result.detections["genius-programmer:daily-checkin"]?.outcome).toBe(
      "matched",
    )
    expect(result.detections["toolcode:daily-checkin"]?.outcome).toBe("matched")
    expect(result.detections["clawhud:daily-checkin"]?.outcome).toBe(
      complete ? "unsupported" : "unknown",
    )
    expect(result.decision.outcome).toBe(complete ? "resolved" : "ambiguous")
    if (complete)
      expect(result.config.selection.methodId).toBe(
        "genius-programmer:daily-checkin",
      )
  },
)

it.each([
  { name: "empty metadata", data: {}, expected: "resolved" },
  {
    name: "a malformed API base",
    data: { api_base_url: 42 },
    expected: "ambiguous",
  },
  {
    name: "a malformed endpoint list",
    data: { custom_endpoints: {} },
    expected: "ambiguous",
  },
  { name: "a missing envelope", data: undefined, expected: "ambiguous" },
])(
  "preserves Sub2API observation semantics for $name",
  async ({ data, expected }) => {
    vi.mocked(fetchApi).mockResolvedValue({ code: 0, message: "", data })
    const account = discoveryAccount("https://codexcli.club")
    account.site_type = SITE_TYPES.SUB2API
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      registry: registeredSub2ApiPeers(),
    })
    expect(result.decision.outcome).toBe(expected)
  },
)

it.each([
  {
    name: "registered API hostname",
    data: { custom_endpoints: [{ endpoint: "https://api.codexcli.club/v1" }] },
    expected: "resolved",
  },
  {
    name: "custom endpoint field",
    data: { custom_endpoints: [{ endpoint: "https://codexcli.club/v1" }] },
    expected: "resolved",
  },
  {
    name: "repeated hosts",
    data: {
      api_base_url: "https://codexcli.club",
      custom_endpoints: [
        ...Array(40).fill({ endpoint: "https://codexcli.club/v1" }),
        { endpoint: "https://toolcode.top/v1" },
      ],
    },
    expected: "ambiguous",
  },
  {
    name: "relative and non-HTTP addresses",
    data: {
      api_base_url: "/codexcli.club/v1",
      custom_endpoints: [{ endpoint: "file://codexcli.club" }],
    },
    expected: "ambiguous",
  },
  {
    name: "documentation and foreign-family metadata",
    data: {
      doc_url: "https://codexcli.club",
      api_info: [{ url: "https://codexcli.club" }],
    },
    expected: "ambiguous",
  },
])("ranks only advertised API URLs for $name", async ({ data, expected }) => {
  vi.mocked(fetchApi).mockResolvedValue({ code: 0, message: "", data })
  const account = discoveryAccount()
  account.site_type = SITE_TYPES.SUB2API
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: registeredSub2ApiPeers(),
  })
  expect(result.decision.outcome).toBe(expected)
})

it("keeps Sub2API public metadata in its browser partition without account credentials", async () => {
  vi.mocked(fetchApi).mockResolvedValue({
    code: 0,
    message: "",
    data: { api_base_url: "https://codexcli.club/v1" },
  })
  const account = discoveryAccount()
  account.site_type = SITE_TYPES.SUB2API
  const fetchContext = {
    kind: "current-tab" as const,
    tabId: 42,
    origin: account.site_url,
    incognito: true,
  }
  await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: registeredSub2ApiPeers(),
    request: {
      baseUrl: account.site_url,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test-token" },
      cookieAuthSessionCookie: "test-cookie",
      requestHeaders: { Authorization: "test-header" },
      fetchContext,
      currentTabFallback: "forbid",
      directRequestReason: "caller_managed",
    },
  })
  const publicCall = vi.mocked(fetchApi).mock.calls[0]
  if (!publicCall) throw new Error("Missing public metadata request")
  expect(publicCall[0]).toEqual({
    baseUrl: account.site_url,
    auth: { authType: AuthTypeEnum.None },
    directRequestReason: "provider_protocol",
    fetchContext,
    currentTabFallback: "forbid",
  })
  expect(publicCall[1].options?.signal?.aborted).toBe(true)
})

it("lets the current hostname break a confirmed tie even when api_info is empty", async () => {
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    message: "",
    data: {},
  })
  const account = discoveryAccount("https://xingya.space/dashboard")
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry(),
  })
  expect(result.decision).toEqual({
    outcome: "resolved",
    methodId: "xingya:daily-checkin",
  })
})

it.each(["metadata", "public protocol"] as const)(
  "preserves the browser partition without forwarding credentials for %s",
  async (scenario) => {
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
      success: true,
      message: "",
      data: { xingya_checkin_available: true, api_info: [] },
    })
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({ enabled: false })
    const account = discoveryAccount("https://xingya.space")
    account.authType = AuthTypeEnum.Cookie
    const fetchContext = {
      kind: "current-tab" as const,
      tabId: 42,
      origin: account.site_url,
      incognito: true,
    }
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      ...(scenario === "metadata" ? { registry: peersRegistry() } : {}),
      request: {
        baseUrl: account.site_url,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test-token" },
        cookieAuthSessionCookie: "test-cookie",
        requestHeaders: { Authorization: "test-header" },
        directRequestReason: "caller_managed",
        fetchContext,
        currentTabFallback: "forbid",
      },
    })
    expect(result.decision.outcome).toBe("resolved")
    const publicRequest = vi
      .mocked(newApiFamilyRequests.envelope)
      .mock.calls.find(
        ([_request, options]) => options.endpoint === "/api/status",
      )?.[0]
    expect(publicRequest).toEqual({
      baseUrl: account.site_url,
      auth: { authType: AuthTypeEnum.None },
      directRequestReason: "provider_protocol",
      fetchContext,
      currentTabFallback: "forbid",
    })
  },
)

it.each([
  {
    name: "equal positive overlaps",
    urls: ["https://xingya.site", "https://other.example"],
  },
  { name: "no overlapping hosts", urls: ["https://unrelated.example"] },
  {
    name: "duplicates cannot win",
    urls: [
      "https://xingya.site/a",
      "https://xingya.site/b",
      "https://other.example",
    ],
  },
  {
    name: "duplicates beyond the raw row limit cannot hide a peer",
    urls: [
      ...Array<string>(32).fill("https://xingya.site"),
      "https://other.example",
    ],
  },
  {
    name: "host suffixes and invalid schemes",
    urls: ["https://xingya.site.attacker.example", "file://xingya.space"],
  },
])("keeps $name ambiguous", async ({ urls }) => {
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    message: "",
    data: { api_info: urls.map((url) => ({ url })) },
  })
  const account = discoveryAccount()
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry(),
  })
  expect(result.decision.outcome).toBe("ambiguous")
  expect(result.config.selection).toEqual({ mode: "automatic" })
})

it.each([
  { name: "a failed request", response: undefined },
  {
    name: "a malformed New API endpoint list",
    response: { success: true, message: "", data: { api_info: {} } },
  },
  {
    name: "an unsuccessful envelope",
    response: {
      success: false,
      message: "denied",
      data: { api_info: [{ url: "https://xingya.space" }] },
    },
  },
  {
    name: "a malformed envelope",
    response: {
      success: "true",
      message: "",
      data: { api_info: [{ url: "https://xingya.space" }] },
    },
  },
])("preserves ambiguity on $name", async ({ response }) => {
  if (response)
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue(
      response as never,
    )
  else
    vi.mocked(newApiFamilyRequests.envelope).mockRejectedValue(
      new Error("offline"),
    )
  const account = discoveryAccount()
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry(),
  })
  expect(result.decision.outcome).toBe("ambiguous")
  expect(result.config.selection).toEqual({ mode: "automatic" })
})

it.each([
  {
    generic: matched(),
    specific: unsupported(),
    expected: "resolved",
    methodId: "new-api:daily-checkin",
  },
  {
    generic: matched(),
    specific: unknown(),
    expected: "unknown",
    methodId: undefined,
  },
  {
    generic: unknown(),
    specific: matched(),
    expected: "resolved",
    methodId: "xingya:daily-checkin",
  },
])(
  "ranks protocol evidence with generic=$generic.outcome and specific=$specific.outcome",
  async ({ generic, specific, expected, methodId }) => {
    const account = discoveryAccount()
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      registry: peersRegistry({
        "new-api:daily-checkin": generic,
        "xingya:daily-checkin": specific,
      }),
    })
    expect(result.decision.outcome).toBe(expected)
    expect(result.config.selection.methodId).toBe(methodId)
    expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
  },
)

it("never uses metadata to promote an unknown peer", async () => {
  const account = discoveryAccount("https://xingya.space")
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry({
      "xingya:daily-checkin": unknown(),
      "veloera:daily-checkin": matched(),
    }),
  })
  expect(result.decision.outcome).toBe("unknown")
  expect(result.config.selection.methodId).toBeUndefined()
  expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
})

it("keeps confirmed peers ambiguous when the site has no metadata capability", async () => {
  const account = discoveryAccount("https://xingya.site")
  account.site_type = SITE_TYPES.OPENROUTER
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry(undefined, SITE_TYPES.OPENROUTER),
  })
  expect(result.decision.outcome).toBe("ambiguous")
  expect(result.config.selection).toEqual({ mode: "automatic" })
  expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
  expect(fetchApi).not.toHaveBeenCalled()
})

it("keeps a tie when New API metadata has no response data", async () => {
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    message: "",
    data: null,
  })
  const account = discoveryAccount("https://xingya.site")
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry(),
  })
  expect(result.decision.outcome).toBe("ambiguous")
  expect(result.config.selection).toEqual({ mode: "automatic" })
})

it("does not keep an automatic generic fallback when a more specific probe becomes unknown", async () => {
  const account = discoveryAccount()
  account.checkIn.automaticExecutionEnabled = true
  account.checkIn.selection = {
    mode: "automatic",
    methodId: "new-api:daily-checkin",
  }
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry({
      "new-api:daily-checkin": matched(),
      "xingya:daily-checkin": unknown(),
    }),
  })
  expect(result.decision.outcome).toBe("unknown")
  expect(result.config.selection).toEqual({ mode: "automatic" })
  expect(
    inspectAccountCheckIn({
      config: result.config,
      siteType: SITE_TYPES.NEW_API,
      siteUrl: account.site_url,
    }).executionEligibility.eligible,
  ).toBe(false)
})

it("does not keep an automatic generic choice beneath ambiguous specific protocols", async () => {
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    message: "",
    data: {},
  })
  const account = discoveryAccount()
  account.checkIn.selection = {
    mode: "automatic",
    methodId: "new-api:daily-checkin",
  }
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry({
      "new-api:daily-checkin": matched(),
      "xingya:daily-checkin": matched(),
      "veloera:daily-checkin": matched(),
    }),
  })
  expect(result.decision.outcome).toBe("ambiguous")
  expect(result.config.selection).toEqual({ mode: "automatic" })
})

it("preserves a manual generic choice and makes no metadata request", async () => {
  const account = discoveryAccount("https://xingya.space")
  account.checkIn.selection = {
    mode: "manual",
    methodId: "new-api:daily-checkin",
  }
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry: peersRegistry({
      "new-api:daily-checkin": matched(),
      "xingya:daily-checkin": matched(),
    }),
  })
  expect(result.config.selection).toEqual(account.checkIn.selection)
  expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
})

it.each(["timeout", "abort"] as const)(
  "ignores late metadata after %s",
  async (scenario) => {
    let resolveMetadata!: (value: unknown) => void
    const controller = new AbortController()
    vi.mocked(newApiFamilyRequests.envelope).mockImplementation(async () => {
      if (scenario === "abort") controller.abort()
      return new Promise((resolve) => {
        resolveMetadata = resolve
      }) as never
    })
    const account = discoveryAccount()
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      registry: peersRegistry(),
      perAdapterTimeoutMs: 20,
      deadlineMs: 30,
      signal: controller.signal,
    })
    expect(result.decision.outcome).toBe("ambiguous")
    const snapshot = JSON.stringify(result)
    resolveMetadata({
      success: true,
      data: { api_info: [{ url: "https://xingya.space" }] },
    })
    await Promise.resolve()
    expect(JSON.stringify(result)).toBe(snapshot)
    const signal = vi.mocked(newApiFamilyRequests.envelope).mock.calls[0]?.[1]
      .options?.signal
    expect(signal?.aborted).toBe(true)
  },
)

it.each([0, -1, 33, 1.5, "2", null])(
  "discards invalid persisted overlap %s",
  (score) => {
    const config = discoveryAccount().checkIn
    config.methodKnowledge.methods["xingya:daily-checkin"] = {
      detection: {
        outcome: "matched",
        evidence: {
          source: "probe",
          observedAt: 100,
          domainMatchCount: score as never,
        },
      },
    }
    const reread = normalizeCheckInConfigV7(config)
    expect(
      reread.methodKnowledge.methods["xingya:daily-checkin"]?.detection,
    ).toEqual(matched())
  },
)

it.each([32, 33])(
  "keeps a %s-host score consistent with persisted decision bounds",
  async (count) => {
    const hosts = Array.from(
      { length: count },
      (_unused, index) => `https://hint-${index}.example`,
    )
    const ids = ["xingya:daily-checkin", "veloera:daily-checkin"] as const
    const registry = createAutoCheckinMethodRegistry(
      ids.map((id) => ({
        id,
        siteTypes: [SITE_TYPES.NEW_API],
        discoveryOrigins: id === ids[0] ? ["https://xingya.site"] : hosts,
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => matched(),
          checkIn: async () => ({ status: "success" as const }),
        },
      })),
    )
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
      success: true,
      message: "",
      data: {
        api_info: ["https://xingya.site", ...hosts].map((url) => ({ url })),
      },
    })
    const account = discoveryAccount()
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      registry,
    })
    expect(result.decision).toEqual(
      count === 32
        ? { outcome: "resolved", methodId: ids[1] }
        : { outcome: "ambiguous", methodIds: [...ids] },
    )
    const reread = normalizeCheckInConfigV7(
      JSON.parse(JSON.stringify(result.config)),
    )
    expect(
      inspectCheckInMethods({ config: reread, candidateMethodIds: ids })
        .decision,
    ).toEqual(result.decision)
  },
)

it("falls back to generic New API after a protected Xingya probe and an absent public marker", async () => {
  vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
    enabled: true,
    stats: { checked_in_today: false },
  })
  vi.mocked(newApiFamilyRequests.envelope).mockImplementation(
    async (_request, options) => {
      if (options.endpoint === "/api/status")
        return { success: true, message: "", data: { checkin_enabled: true } }
      throw new ApiError("Unauthorized", 401, options.endpoint)
    },
  )
  const account = discoveryAccount("https://normal.example")
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
  })
  expect(result.decision).toEqual({
    outcome: "resolved",
    methodId: "new-api:daily-checkin",
  })
})

it.each([null, "true", 1, {}])(
  "keeps a malformed public Xingya marker %s unknown instead of selecting generic",
  async (marker) => {
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
      success: true,
      message: "",
      data: { xingya_checkin_available: marker },
    })
    const account = discoveryAccount()
    account.authType = AuthTypeEnum.Cookie
    const result = await discoverCheckInMethods({
      account,
      config: account.checkIn,
    })
    expect(result.decision.outcome).toBe("unknown")
    expect(result.config.selection.methodId).toBeUndefined()
    expect(result.detections["xingya:daily-checkin"]).toMatchObject({
      outcome: "unknown",
      reason: "invalid_response",
    })
  },
)

it("uses unique hostname overlap only as the last tie-break and preserves it on readback", async () => {
  const ids = ["xingya:daily-checkin", "veloera:daily-checkin"] as const
  const registry = createAutoCheckinMethodRegistry(
    ids.map((id) => ({
      id,
      siteTypes: [SITE_TYPES.NEW_API],
      discoveryOrigins:
        id === ids[0]
          ? ["https://xingya.site", "https://xingya.space"]
          : ["https://other.example"],
      provider: {
        getReadiness: () => ({ ready: true }),
        detect: async () => ({
          outcome: "matched" as const,
          evidence: { source: "probe" as const, observedAt: 100 },
        }),
        checkIn: async () => ({ status: "success" as const }),
      },
    })),
  )
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    message: "",
    data: {
      api_info: [
        { url: "https://XINGYA.site/path" },
        { url: "https://xingya.site/duplicate" },
        { url: "https://xingya.space" },
        { url: "https://other.example" },
        { url: "https://xingya.site.attacker.example" },
        { url: "file://xingya.space" },
      ],
    },
  })
  const account = buildSiteAccount({
    site_type: SITE_TYPES.NEW_API,
    site_url: "https://mirror.example",
    checkIn: {
      automaticExecutionEnabled: false,
      selection: { mode: "automatic" },
      methodKnowledge: { methods: {} },
    },
  })
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry,
  })
  expect(result.decision).toEqual({ outcome: "resolved", methodId: ids[0] })
  expect(result.config.selection.methodId).toBe(ids[0])
  const reread = normalizeCheckInConfigV7(
    JSON.parse(JSON.stringify(result.config)),
  )
  expect(
    inspectCheckInMethods({ config: reread, candidateMethodIds: ids }).decision,
  ).toEqual(result.decision)
  expect(newApiFamilyRequests.envelope).toHaveBeenCalledOnce()
})

it("discovers Xingya on its space console from public protocol evidence with no login", async () => {
  // Public GET observations from both consoles on 2026-11-15: generic status 401,
  // public checkin_enabled:false and xingya_checkin_available:true.
  vi.mocked(newApiFamilyRequests.data).mockImplementation(
    async (_request, options) => {
      if (options.endpoint === "/api/status") return { checkin_enabled: false }
      throw new ApiError(
        "Unauthorized, invalid access token",
        401,
        options.endpoint,
      )
    },
  )
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    message: "",
    data: { xingya_checkin_available: true, version: "xingya-rc50" },
  })
  const account = buildSiteAccount({
    site_type: SITE_TYPES.NEW_API,
    site_url: "https://xingya.space",
    authType: AuthTypeEnum.Cookie,
    account_info: { ...buildSiteAccount().account_info, access_token: "" },
    checkIn: {
      automaticExecutionEnabled: false,
      selection: { mode: "automatic" },
      methodKnowledge: { methods: {} },
    },
  })
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
  })
  expect(Object.keys(result.detections)).toEqual(
    expect.arrayContaining(["xingya:daily-checkin", "new-api:daily-checkin"]),
  )
  expect(result.decision).toEqual({
    outcome: "resolved",
    methodId: "xingya:daily-checkin",
  })
  expect(result.config.selection.methodId).toBe("xingya:daily-checkin")
  expect(newApiFamilyRequests.envelope).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: "https://xingya.space",
      auth: { authType: "none" },
    }),
    expect.objectContaining({ endpoint: "/api/status" }),
  )
})

it("automatically replaces a matched generic choice with a disabled specific protocol", async () => {
  const registry = createAutoCheckinMethodRegistry(
    (["new-api:daily-checkin", "xingya:daily-checkin"] as const).map((id) => ({
      id,
      siteTypes: [SITE_TYPES.NEW_API],
      provider: {
        getReadiness: () => ({ ready: true }),
        detect: async () => ({
          detection: {
            outcome: "matched" as const,
            evidence: { source: "probe" as const, observedAt: 100 },
          },
          status: {
            outcome: "known" as const,
            availability:
              id === "xingya:daily-checkin"
                ? ("disabled" as const)
                : ("enabled" as const),
            evidence: { source: "probe" as const, observedAt: 100 },
          },
        }),
        checkIn: async () => ({ status: "success" as const }),
      },
    })),
  )
  const account = buildSiteAccount({
    site_type: SITE_TYPES.NEW_API,
    site_url: "https://xingya.site",
    checkIn: {
      automaticExecutionEnabled: true,
      selection: { mode: "automatic", methodId: "new-api:daily-checkin" },
      methodKnowledge: { methods: {} },
    },
  })
  const result = await discoverCheckInMethods({
    account,
    config: account.checkIn,
    registry,
  })
  expect(result.decision).toEqual({
    outcome: "resolved",
    methodId: "xingya:daily-checkin",
  })
  expect(result.config.selection.methodId).toBe("xingya:daily-checkin")
  expect(
    inspectAccountCheckIn({
      config: result.config,
      siteType: SITE_TYPES.NEW_API,
      siteUrl: account.site_url,
    }).executionEligibility,
  ).toEqual({ eligible: false, skipReason: "method_disabled" })
})
