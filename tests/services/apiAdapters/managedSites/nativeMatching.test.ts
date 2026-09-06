import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants"
import { SITE_TYPES } from "~/constants/siteType"
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
import { listAllChannels, searchChannel } from "~/services/apiService/veloera"
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

vi.mock("~/services/apiService/axonHub", async (original) => ({
  ...(await original<typeof import("~/services/apiService/axonHub")>()),
  listAxonHubChannelPage: vi.fn(),
  getAxonHubChannelSecretKey: vi.fn(),
}))
vi.mock("~/services/apiService/veloera", async (original) => ({
  ...(await original<typeof import("~/services/apiService/veloera")>()),
  listAllChannels: vi.fn(),
  searchChannel: vi.fn(),
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

describe("native managed-resource matching", () => {
  beforeEach(() => vi.clearAllMocks())

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
      service: {
        siteType: SITE_TYPES.AXON_HUB,
        searchChannel: matching.search,
        hydrateComparableChannelKeys: matching.hydrateComparableKeys,
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
    expect(listAxonHubChannelPage).toHaveBeenLastCalledWith(axonConfig, {
      cursor: "page-2",
      limit: 100,
    })
    expect(result.key.channel).toEqual({
      id: "Channel:opaque-id",
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
      { ...list!.items[0], id: "usable", key: "existing-key" },
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
      matching.fetchSecretKey!(axonConfig, "opaque", options),
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
      requireCompleteInventory: true,
    })
    expect(searchChannel).not.toHaveBeenCalled()
    expect(result?.items[0]).not.toHaveProperty("balance")
    expect(result?.items[0].id).toBe(5)
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
      id: 8,
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
      id: 7,
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
          id: 9,
          name: "Sub2API Account 9",
          type: ChannelType.Anthropic,
          base_url: "",
          key: "",
          models: "",
        },
        {
          id: 10,
          name: "Unconfigured",
          type: ChannelType.OpenAI,
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
      id: 8,
      name: "Masked account",
      type: ChannelType.OpenAI,
      base_url: "https://upstream.example",
      models: "gpt-4o",
      key: "********",
    }
    const usable = { ...masked, id: 9, key: "existing-key" }
    vi.mocked(revealSub2ApiApiKey).mockResolvedValue("resolved-key")

    await expect(matching.fetchSecretKey!(subConfig, 8)).resolves.toBe(
      "resolved-key",
    )
    await expect(
      matching.hydrateComparableKeys!(subConfig, [masked, usable]),
    ).resolves.toEqual([{ ...masked, key: "resolved-key" }, usable])
    expect(masked.key).toBe("********")
    expect(revealSub2ApiApiKey).toHaveBeenCalledTimes(2)
    expect(revealSub2ApiApiKey).toHaveBeenLastCalledWith(subConfig, 8)
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
              id: 8,
              name: "Masked account",
              type: ChannelType.OpenAI,
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
              id: 8,
              name: "Masked account",
              type: ChannelType.OpenAI,
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
          id: 8,
          name: "Provider 8",
          type: "openai-compatible",
          base_url: "",
          key: "available-key",
          models: "",
        },
        {
          id: 9,
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
      id: 8,
      name: "Masked provider",
      type: "claude",
      base_url: "https://upstream.example",
      models: "claude-sonnet",
      key: "********",
    }
    const usable = { ...masked, id: 9, key: "existing-key" }
    vi.mocked(getUnmaskedProviderKey)
      .mockResolvedValueOnce("direct-key")
      .mockResolvedValueOnce(" hydrated-key ")

    await expect(matching.fetchSecretKey!(subConfig, 7)).resolves.toBe(
      "direct-key",
    )
    await expect(
      matching.hydrateComparableKeys!(subConfig, [masked, usable]),
    ).resolves.toEqual([{ ...masked, key: "hydrated-key" }, usable])
    expect(masked.key).toBe("********")
    expect(getUnmaskedProviderKey).toHaveBeenCalledTimes(2)
    expect(getUnmaskedProviderKey).toHaveBeenNthCalledWith(1, subConfig, 7)
    expect(getUnmaskedProviderKey).toHaveBeenNthCalledWith(2, subConfig, 8)
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
        "opaque-id",
      ),
    ).rejects.toThrow("Invalid numeric resource id")
    expect(revealSub2ApiApiKey).not.toHaveBeenCalled()
  })
})
