import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { axonHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/axonHub"
import { sub2ApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/sub2api"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import { listAxonHubChannelPage } from "~/services/apiService/axonHub"
import { listAllChannels, searchChannel } from "~/services/apiService/veloera"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  listSub2ApiApiKeyAccounts,
  revealSub2ApiApiKey,
  searchSub2ApiApiKeyAccounts,
} from "~/services/managedSites/providers/sub2api"

vi.mock("~/services/apiService/axonHub", async (original) => ({
  ...(await original<typeof import("~/services/apiService/axonHub")>()),
  listAxonHubChannelPage: vi.fn(),
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
            credentials: { apiKeys: ["test-key"] },
          },
        ],
      })
    const matching = axonHubManagedSiteCapabilities.matching
    const result = await resolveManagedSiteChannelMatch({
      service: {
        siteType: SITE_TYPES.AXON_HUB,
        searchChannel: matching.search,
      },
      managedConfig: axonConfig,
      accountBaseUrl: "https://upstream.example",
      models: ["gpt-4o"],
      key: "test-key",
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
