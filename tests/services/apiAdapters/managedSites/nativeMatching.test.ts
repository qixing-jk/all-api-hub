import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { axonHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/axonHub"
import { claudeCodeHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/claudeCodeHub"
import { sub2ApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/sub2api"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import {
  getAxonHubChannelSecretKey,
  listAxonHubChannelPage,
} from "~/services/apiService/axonHub"
import { searchProviders } from "~/services/apiService/claudeCodeHub"
import { listAllChannels, searchChannel } from "~/services/apiService/veloera"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  listSub2ApiApiKeyAccounts,
  revealSub2ApiApiKey,
  searchSub2ApiApiKeyAccounts,
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
      models: "claude-sonnet",
    })
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
