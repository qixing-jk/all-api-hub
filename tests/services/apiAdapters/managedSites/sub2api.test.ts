import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
import { sub2ApiManagedSiteChannels } from "~/services/apiAdapters/managedSites/sub2api"
import { MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS } from "~/services/managedSites/channelMatch"
import {
  createSub2ApiApiKeyAccount,
  revealSub2ApiApiKey,
} from "~/services/managedSites/providers/sub2api"

vi.mock("~/services/managedSites/providers/sub2api", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/managedSites/providers/sub2api")
    >()
  return {
    ...actual,
    createSub2ApiApiKeyAccount: vi.fn(),
    revealSub2ApiApiKey: vi.fn(),
  }
})

const config = {
  baseUrl: "https://sub2api.example.invalid",
  adminToken: "admin-key",
}
const candidates = [
  { id: 11, name: "First", key: "********" },
  { id: 12, name: "Second", key: "********" },
] as any

describe("Sub2API managed-site adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("re-reads selected keys for duplicate comparison and normal key viewing", async () => {
    vi.mocked(revealSub2ApiApiKey)
      .mockResolvedValueOnce("sk-first")
      .mockResolvedValueOnce("sk-second")
      .mockResolvedValueOnce("sk-selected")

    await expect(
      sub2ApiManagedSiteChannels.hydrateComparableKeys!(config, candidates),
    ).resolves.toEqual([
      expect.objectContaining({ id: 11, key: "sk-first" }),
      expect.objectContaining({ id: 12, key: "sk-second" }),
    ])
    await expect(
      sub2ApiManagedSiteChannels.fetchSecretKey!(config, 12),
    ).resolves.toBe("sk-selected")
  })

  it("keeps failed key resolution unknown instead of claiming no duplicate", async () => {
    vi.mocked(revealSub2ApiApiKey).mockRejectedValueOnce(
      new Error("key export unavailable"),
    )

    await expect(
      sub2ApiManagedSiteChannels.hydrateComparableKeys!(config, candidates),
    ).rejects.toMatchObject({
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    })
  })

  it("forwards imported notes and routing fields to native account creation", async () => {
    vi.mocked(createSub2ApiApiKeyAccount).mockImplementationOnce(
      async (_config, _input, options) => {
        options?.observer?.onDispatch()
        options?.observer?.onResponse()
        return {
          id: 17,
          name: "Imported account",
          platform: "openai",
          type: "apikey",
          credentials_status: { has_api_key: true },
          status: "active",
        }
      },
    )

    await sub2ApiManagedSiteChannels.create(config, {
      mode: "single",
      channel: {
        name: "Imported account",
        type: ChannelType.OpenAI,
        key: "import-secret",
        base_url: "https://api.example.invalid/v1",
        models: "",
        groups: [],
        priority: 8,
        weight: 3,
        status: 1,
        remark: "Imported note",
      },
    })

    expect(createSub2ApiApiKeyAccount).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        name: "Imported account",
        platform: "openai",
        baseUrl: "https://api.example.invalid/v1",
        apiKey: "import-secret",
        concurrency: 3,
        priority: 8,
        notes: "Imported note",
      }),
      expect.any(Object),
    )
  })
})
