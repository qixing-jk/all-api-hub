import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { axonHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/axonHub"
import { claudeCodeHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/claudeCodeHub"
import { sub2ApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/sub2api"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import {
  getAxonHubChannelSecretKey,
  listAxonHubChannelPage,
} from "~/services/apiService/axonHub"
import {
  getUnmaskedProviderKey,
  searchProviders,
} from "~/services/apiService/claudeCodeHub"
import { listAllChannels } from "~/services/apiService/veloera"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  listSub2ApiApiKeyAccounts,
  revealSub2ApiApiKey,
  searchSub2ApiApiKeyAccounts,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
} from "~/services/managedSites/providers/sub2api"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  buildManagedResourceMatchCandidate,
  matchingResourceRef,
} from "~~/tests/test-utils/managedResourceMatching"

vi.mock("~/services/apiService/axonHub", async (original) => ({
  ...(await original<typeof import("~/services/apiService/axonHub")>()),
  listAxonHubChannelPage: vi.fn(),
  getAxonHubChannelSecretKey: vi.fn(),
}))
vi.mock("~/services/apiService/veloera", async (original) => ({
  ...(await original<typeof import("~/services/apiService/veloera")>()),
  listAllChannels: vi.fn(),
}))
vi.mock("~/services/managedSites/providers/sub2api", async (original) => ({
  ...(await original<
    typeof import("~/services/managedSites/providers/sub2api")
  >()),
  listSub2ApiApiKeyAccounts: vi.fn(),
  searchSub2ApiApiKeyAccounts: vi.fn(),
  revealSub2ApiApiKey: vi.fn(),
}))

vi.mock("~/services/apiService/claudeCodeHub", async (original) => ({
  ...(await original<typeof import("~/services/apiService/claudeCodeHub")>()),
  searchProviders: vi.fn(),
  getUnmaskedProviderKey: vi.fn(),
}))

const axonConfig = {
  baseUrl: "https://managed.example",
  email: "admin@example.com",
  password: "test-password",
}
const subConfig = {
  baseUrl: "https://managed.example",
  adminToken: "test-admin-key",
}

const secretProviders = [
  {
    capabilities: axonHubManagedSiteCapabilities,
    reveal: getAxonHubChannelSecretKey,
  },
  {
    capabilities: claudeCodeHubManagedSiteCapabilities,
    reveal: getUnmaskedProviderKey,
  },
  { capabilities: sub2ApiManagedSiteCapabilities, reveal: revealSub2ApiApiKey },
]

describe("native managed-resource matching", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shares the complete AxonHub pagination across different upstream URLs", async () => {
    const page =
      createDeferred<Awaited<ReturnType<typeof listAxonHubChannelPage>>>()
    vi.mocked(listAxonHubChannelPage)
      .mockReturnValueOnce(page.promise)
      .mockResolvedValue({ items: [] })
    const matching = axonHubManagedSiteCapabilities.matching
    const first = matching.search(axonConfig, "https://first.example")
    const second = matching.search({ ...axonConfig }, "https://second.example")
    expect(listAxonHubChannelPage).toHaveBeenCalledTimes(1)
    page.resolve({ items: [], nextCursor: "last-page" })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { items: [], total: 0, type_counts: {} },
      { items: [], total: 0, type_counts: {} },
    ])
    expect(listAxonHubChannelPage).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      site: "Sub2API",
      read: vi.mocked(listSub2ApiApiKeyAccounts),
      search: (url: string) =>
        sub2ApiManagedSiteCapabilities.matching.search(subConfig, url),
    },
    {
      site: "Veloera",
      read: vi.mocked(listAllChannels),
      search: (url: string) =>
        veloeraManagedSiteCapabilities.matching.search(
          { ...subConfig, userId: "1" },
          url,
        ),
    },
  ])(
    "shares $site inventory across different upstream URLs",
    async ({ read, search }) => {
      const inventory = createDeferred<{
        items: never[]
        total: number
        type_counts: Record<string, number>
      }>()
      read.mockReturnValue(inventory.promise)
      const first = search("https://first.example")
      const second = search("https://second.example")
      expect(read).toHaveBeenCalledTimes(1)
      inventory.resolve({ items: [], total: 0, type_counts: {} })
      await expect(Promise.all([first, second])).resolves.toEqual([
        { items: [], total: 0, type_counts: {} },
        { items: [], total: 0, type_counts: {} },
      ])
    },
  )

  it.each(secretProviders)(
    "validates the entire $capabilities.siteType hydration selection before revealing its first key",
    async ({ capabilities, reveal }) => {
      const candidates = [
        buildManagedResourceMatchCandidate({
          ref: matchingResourceRef(7, { siteType: capabilities.siteType }),
          key: "********",
        }),
        buildManagedResourceMatchCandidate({
          ref: matchingResourceRef(8, {
            siteType: capabilities.siteType,
            scopeKey: "https://other.example",
          }),
          key: "********",
        }),
      ]

      await expect(
        capabilities.matching.hydrateComparableKeys!(
          { ...axonConfig, ...subConfig },
          candidates,
        ),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(reveal).not.toHaveBeenCalled()
      expect(candidates.map((candidate) => candidate.key)).toEqual([
        "********",
        "********",
      ])
    },
  )

  it.each(secretProviders)(
    "rejects a foreign site type or resource kind before a $capabilities.siteType secret read",
    async ({ capabilities, reveal }) => {
      const ref = matchingResourceRef(7, { siteType: capabilities.siteType })
      for (const foreignRef of [
        { ...ref, siteType: SITE_TYPES.NEW_API },
        { ...ref, kind: "token" as ManagedResourceRef["kind"] },
      ]) {
        await expect(
          capabilities.matching.fetchSecretKey!(
            { ...axonConfig, ...subConfig },
            foreignRef,
          ),
        ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      }
      expect(reveal).not.toHaveBeenCalled()
    },
  )

  it("rejects a foreign deployment before revealing a matching resource key", async () => {
    await expect(
      axonHubManagedSiteCapabilities.matching.fetchSecretKey!(axonConfig, {
        siteType: SITE_TYPES.AXON_HUB,
        kind: "channel",
        scopeKey: "https://other.example",
        resourceId: "Channel:opaque-id",
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(getAxonHubChannelSecretKey).not.toHaveBeenCalled()
  })

  it("retains opaque AxonHub identity through pagination and exact matching", async () => {
    vi.mocked(listAxonHubChannelPage)
      .mockResolvedValueOnce({ items: [], nextCursor: "page-2" })
      .mockResolvedValueOnce({
        items: [
          {
            id: "Channel:opaque-id",
            name: "Native channel",
            type: "openai",
            status: "enabled",
            baseURL: "https://upstream.example/v1",
            supportedModels: ["gpt-4o"],
          },
        ],
      })
    const matching = axonHubManagedSiteCapabilities.matching
    vi.mocked(getAxonHubChannelSecretKey).mockResolvedValue("test-key")
    const result = await resolveManagedSiteChannelMatch({
      managedSite: {
        siteType: SITE_TYPES.AXON_HUB,
        matching: {
          search: matching.search,
          hydrateComparableKeys: matching.hydrateComparableKeys,
        },
      },
      managedConfig: axonConfig,
      accountBaseUrl: "https://upstream.example",
      models: ["gpt-4o"],
      key: "test-key",
      resolveHiddenKeys: true,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
      ),
    })
    expect(listAxonHubChannelPage).toHaveBeenLastCalledWith(
      axonConfig,
      {
        cursor: "page-2",
        limit: 100,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result.key.channel).toEqual({
      ref: matchingResourceRef("Channel:opaque-id", {
        siteType: SITE_TYPES.AXON_HUB,
      }),
      name: "Native channel",
      type: "openai",
      base_url: "https://upstream.example/v1",
      models: "gpt-4o",
      key: "test-key",
    })
    expect(result.models.matched).toBe(true)
    expect(getAxonHubChannelSecretKey).toHaveBeenCalledWith(
      axonConfig,
      "Channel:opaque-id",
      expect.anything(),
    )
  })

  it("does not expose AxonHub list credentials and hydrates masked keys with cancellation", async () => {
    vi.mocked(listAxonHubChannelPage).mockResolvedValue({
      items: [
        {
          id: "opaque",
          name: "Channel",
          type: "openai",
          credentials: { apiKey: "private-list-key" },
        } as never,
      ],
    })
    const matching = axonHubManagedSiteCapabilities.matching
    const list = await matching.search(axonConfig, "")
    expect(JSON.stringify(list)).not.toContain("private-list-key")
    const signal = new AbortController().signal
    const options = {
      signal,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
      ),
    }
    vi.mocked(getAxonHubChannelSecretKey).mockResolvedValue("first\nsecond")
    const candidates = [
      { ...list!.items[0], key: "********" },
      {
        ...list!.items[0],
        ref: matchingResourceRef("usable", { siteType: SITE_TYPES.AXON_HUB }),
        key: "existing-key",
      },
    ]
    await expect(
      matching.hydrateComparableKeys!(axonConfig, candidates, options),
    ).resolves.toEqual([
      { ...candidates[0], key: "first\nsecond" },
      candidates[1],
    ])
    expect(getAxonHubChannelSecretKey).toHaveBeenCalledOnce()
    expect(getAxonHubChannelSecretKey).toHaveBeenCalledWith(
      axonConfig,
      "opaque",
      options,
    )
    const aborted = new DOMException("Aborted", "AbortError")
    vi.mocked(getAxonHubChannelSecretKey).mockRejectedValue(aborted)
    await expect(
      matching.fetchSecretKey!(axonConfig, list!.items[0].ref, options),
    ).rejects.toBe(aborted)
  })

  it("rejects repeated AxonHub cursors instead of declaring an incomplete inventory complete", async () => {
    vi.mocked(listAxonHubChannelPage).mockResolvedValue({
      items: [],
      nextCursor: "same",
    })
    await expect(
      axonHubManagedSiteCapabilities.matching.search(
        axonConfig,
        "https://upstream.example",
      ),
    ).rejects.toThrow("Incomplete")
    expect(listAxonHubChannelPage).toHaveBeenCalledTimes(2)
  })

  it("uses the complete Veloera inventory and returns only matching inputs", async () => {
    vi.mocked(listAllChannels).mockResolvedValue({
      items: [
        {
          id: 5,
          name: "Native",
          type: 1,
          base_url: "https://upstream.example",
          models: "gpt-4o",
          key: "test-key",
          balance: 123,
        } as never,
      ],
      total: 1,
      type_counts: { "1": 1 },
    })
    const result = await veloeraManagedSiteCapabilities.matching.search(
      {
        baseUrl: "https://managed.example",
        adminToken: "test-admin",
        userId: "1",
      },
      "https://upstream.example",
    )
    expect(listAllChannels).toHaveBeenCalledWith(expect.anything(), {
      signal: expect.any(AbortSignal),
      requireCompleteInventory: true,
    })
    expect(result?.items[0]).not.toHaveProperty("balance")
    expect(result?.items[0].ref).toEqual(
      matchingResourceRef(5, { siteType: SITE_TYPES.VELOERA }),
    )
  })

  it("inventories Sub2API API-key accounts without name search or exposing credentials", async () => {
    vi.mocked(listSub2ApiApiKeyAccounts).mockResolvedValue({
      items: [
        {
          id: 8,
          name: "Unrelated name",
          type: "apikey",
          platform: "openai",
          credentials: {
            base_url: "https://upstream.example",
            api_key: "must-not-leak",
          },
          credentials_status: { has_api_key: true },
        } as never,
      ],
      total: 1,
    })
    const result = await sub2ApiManagedSiteCapabilities.matching.search(
      subConfig,
      "https://upstream.example",
    )
    expect(searchSub2ApiApiKeyAccounts).not.toHaveBeenCalled()
    expect(result?.items[0]).toMatchObject({
      ref: matchingResourceRef(8, { siteType: SITE_TYPES.SUB2API }),
      type: "openai",
      base_url: "https://upstream.example",
      models: "",
      key: "********",
    })
    expect(JSON.stringify(result)).not.toContain("must-not-leak")
  })

  it("uses only exact Claude Code Hub model rules for duplicate evidence", async () => {
    vi.mocked(searchProviders).mockResolvedValue([
      {
        id: 7,
        name: "Provider",
        url: "https://upstream.example",
        providerType: "claude",
        maskedKey: "********",
        allowedModels: [
          { matchType: "prefix", pattern: "claude-" },
          { matchType: "exact", pattern: "claude-sonnet" },
          " gpt-4o ",
          { pattern: "gpt-4o" },
          { matchType: "exact" },
        ],
      },
    ])
    const result = await claudeCodeHubManagedSiteCapabilities.matching.search(
      { baseUrl: "https://managed.example", adminToken: "test-admin" },
      "https://upstream.example",
    )
    expect(result?.items[0]).toEqual({
      ref: matchingResourceRef(7, { siteType: SITE_TYPES.CLAUDE_CODE_HUB }),
      name: "Provider",
      type: "claude",
      base_url: "https://upstream.example",
      key: "********",
      models: "claude-sonnet,gpt-4o",
    })
  })

  it("handles incomplete Sub2API metadata without treating OAuth accounts as API-key candidates", async () => {
    vi.mocked(listSub2ApiApiKeyAccounts).mockResolvedValue({
      items: [
        {
          id: 9,
          name: "",
          type: "apikey",
          platform: "anthropic",
          credentials: { base_url: 42 },
          credentials_status: { has_api_key: false },
        },
        { id: 10, name: "Unconfigured", type: "apikey", platform: "openai" },
        { id: 11, name: "OAuth", type: "oauth", platform: "openai" },
      ],
      total: 3,
    })

    await expect(
      sub2ApiManagedSiteCapabilities.matching.search(subConfig, "upstream"),
    ).resolves.toEqual({
      items: [
        {
          ref: matchingResourceRef(9, { siteType: SITE_TYPES.SUB2API }),
          name: "Sub2API Account 9",
          type: "anthropic",
          base_url: "",
          key: "",
          models: "",
        },
        {
          ref: matchingResourceRef(10, { siteType: SITE_TYPES.SUB2API }),
          name: "Unconfigured",
          type: "openai",
          base_url: "",
          key: "",
          models: "",
        },
      ],
      total: 3,
      type_counts: {},
    })
  })

  it("resolves Sub2API masked keys while preserving usable keys and candidate metadata", async () => {
    const matching = sub2ApiManagedSiteCapabilities.matching
    const masked = {
      ref: matchingResourceRef(8, { siteType: SITE_TYPES.SUB2API }),
      name: "Masked account",
      type: "openai",
      base_url: "https://upstream.example",
      models: "gpt-4o",
      key: "********",
    }
    const usable = {
      ...masked,
      ref: matchingResourceRef(9, { siteType: SITE_TYPES.SUB2API }),
      key: "existing-key",
    }
    vi.mocked(revealSub2ApiApiKey).mockResolvedValue("resolved-key")

    await expect(matching.fetchSecretKey!(subConfig, masked.ref)).resolves.toBe(
      "resolved-key",
    )
    await expect(
      matching.hydrateComparableKeys!(subConfig, [masked, usable]),
    ).resolves.toEqual([{ ...masked, key: "resolved-key" }, usable])
    expect(masked.key).toBe("********")
    expect(revealSub2ApiApiKey).toHaveBeenCalledTimes(2)
    expect(revealSub2ApiApiKey).toHaveBeenLastCalledWith(
      subConfig,
      8,
      undefined,
    )
  })

  it.each([
    {
      name: "step-up verification",
      error: new Sub2ApiAdminApiError(
        "Provider requires verification",
        403,
        SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
      ),
      reason: "verification-required",
    },
    {
      name: "other provider rejection",
      error: new Sub2ApiAdminApiError(
        "Private provider diagnostic",
        500,
        "FAILED",
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
      ),
      reason: "key-resolution-failed",
    },
    {
      name: "transport failure",
      error: new Error("Private transport diagnostic"),
      reason: "key-resolution-failed",
    },
  ])(
    "keeps Sub2API $name unresolved with a safe reason",
    async ({ error, reason }) => {
      vi.mocked(revealSub2ApiApiKey).mockRejectedValue(error)

      await expect(
        sub2ApiManagedSiteCapabilities.matching.hydrateComparableKeys!(
          subConfig,
          [
            {
              ref: matchingResourceRef(8, { siteType: SITE_TYPES.SUB2API }),
              name: "Masked account",
              type: "openai",
              base_url: "https://upstream.example",
              models: "",
              key: "********",
            },
          ],
        ),
      ).rejects.toMatchObject({
        name: "MatchResolutionUnresolvedError",
        message: reason,
        reason,
      })
    },
  )

  it.each(["AbortError", "TimeoutError"])(
    "preserves Sub2API %s cancellation instead of reporting a failed comparison",
    async (name) => {
      const error = new DOMException("Cancelled", name)
      vi.mocked(revealSub2ApiApiKey).mockRejectedValue(error)

      await expect(
        sub2ApiManagedSiteCapabilities.matching.hydrateComparableKeys!(
          subConfig,
          [
            {
              ref: matchingResourceRef(8, { siteType: SITE_TYPES.SUB2API }),
              name: "Masked account",
              type: "openai",
              base_url: "https://upstream.example",
              models: "",
              key: "********",
            },
          ],
        ),
      ).rejects.toBe(error)
    },
  )

  it("defaults incomplete Claude Code Hub metadata and retains an available unmasked key", async () => {
    vi.mocked(searchProviders).mockResolvedValue([
      { id: 8, name: "", url: "", key: "available-key" },
      { id: 9, name: "Unconfigured", url: "" },
    ])

    await expect(
      claudeCodeHubManagedSiteCapabilities.matching.search(
        subConfig,
        "upstream",
      ),
    ).resolves.toEqual({
      items: [
        {
          ref: matchingResourceRef(8, { siteType: SITE_TYPES.CLAUDE_CODE_HUB }),
          name: "Provider 8",
          type: "openai-compatible",
          base_url: "",
          key: "available-key",
          models: "",
        },
        {
          ref: matchingResourceRef(9, { siteType: SITE_TYPES.CLAUDE_CODE_HUB }),
          name: "Unconfigured",
          type: "openai-compatible",
          base_url: "",
          key: "",
          models: "",
        },
      ],
      total: 2,
      type_counts: {},
    })
  })

  it("resolves Claude Code Hub keys through native provider identities without mutating candidates", async () => {
    const matching = claudeCodeHubManagedSiteCapabilities.matching
    const masked = {
      ref: matchingResourceRef(8, { siteType: SITE_TYPES.CLAUDE_CODE_HUB }),
      name: "Masked provider",
      type: "claude",
      base_url: "https://upstream.example",
      models: "claude-sonnet",
      key: "********",
    }
    const usable = {
      ...masked,
      ref: matchingResourceRef(9, { siteType: SITE_TYPES.CLAUDE_CODE_HUB }),
      key: "existing-key",
    }
    vi.mocked(getUnmaskedProviderKey)
      .mockResolvedValueOnce("direct-key")
      .mockResolvedValueOnce(" hydrated-key ")

    await expect(
      matching.fetchSecretKey!(
        subConfig,
        matchingResourceRef(7, { siteType: SITE_TYPES.CLAUDE_CODE_HUB }),
      ),
    ).resolves.toBe("direct-key")
    await expect(
      matching.hydrateComparableKeys!(subConfig, [masked, usable]),
    ).resolves.toEqual([{ ...masked, key: "hydrated-key" }, usable])
    expect(masked.key).toBe("********")
    expect(getUnmaskedProviderKey).toHaveBeenCalledTimes(2)
    expect(getUnmaskedProviderKey).toHaveBeenNthCalledWith(
      1,
      subConfig,
      7,
      undefined,
    )
    expect(getUnmaskedProviderKey).toHaveBeenNthCalledWith(
      2,
      subConfig,
      8,
      undefined,
    )
  })

  it("redacts the Claude Code Hub admin key from failed matching reads", async () => {
    vi.mocked(searchProviders).mockRejectedValue(
      new Error(`Request rejected for ${subConfig.adminToken}`),
    )

    const result = await claudeCodeHubManagedSiteCapabilities.matching
      .search(subConfig, "upstream")
      .catch((error: unknown) => error)
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).not.toContain(subConfig.adminToken)
  })

  it("refuses opaque ids before a numeric provider secret request", async () => {
    await expect(
      sub2ApiManagedSiteCapabilities.matching.fetchSecretKey!(
        subConfig,
        matchingResourceRef("opaque-id", { siteType: SITE_TYPES.SUB2API }),
      ),
    ).rejects.toThrow("Invalid numeric resource id")
    expect(revealSub2ApiApiKey).not.toHaveBeenCalled()
  })
})
