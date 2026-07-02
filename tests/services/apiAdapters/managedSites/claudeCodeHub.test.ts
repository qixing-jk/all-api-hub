import { describe, expect, it, vi } from "vitest"

const claudeCodeHubProvider = vi.hoisted(() => ({
  checkValidClaudeCodeHubConfig: vi.fn(),
  listChannels: vi.fn(),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  hydrateComparableChannelKeys: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/claudeCodeHub", () => ({
  ...claudeCodeHubProvider,
}))

describe("Claude Code Hub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://claude-code-hub.example.invalid",
    adminToken: "admin-token",
  }

  it("exposes secret-key and comparable-key hydration helpers", async () => {
    const listResponse = {
      items: [{ id: 1, name: "Claude Code Hub" }],
      total: 1,
      type_counts: { claude: 1 },
    }
    claudeCodeHubProvider.listChannels.mockResolvedValue(listResponse)
    claudeCodeHubProvider.fetchChannelSecretKey.mockResolvedValue("real-key")
    claudeCodeHubProvider.hydrateComparableChannelKeys.mockResolvedValue([
      { id: 1, key: "real-key" },
    ])

    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    await expect(claudeCodeHubManagedSiteChannels.list?.(config)).resolves.toBe(
      listResponse,
    )
    await expect(
      claudeCodeHubManagedSiteChannels.fetchSecretKey?.(config, 1),
    ).resolves.toBe("real-key")
    await expect(
      claudeCodeHubManagedSiteChannels.hydrateComparableKeys?.(config, [
        { id: 1, key: "masked" } as never,
      ]),
    ).resolves.toEqual([{ id: 1, key: "real-key" }])
  })

  it("does not expose model-sync methods", async () => {
    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    expect(claudeCodeHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(claudeCodeHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(claudeCodeHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("exposes provider config and draft functions", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    expect(claudeCodeHubManagedSiteCapabilities.config.checkValid).toBe(
      claudeCodeHubProvider.checkValidClaudeCodeHubConfig,
    )
    expect(claudeCodeHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: claudeCodeHubProvider.fetchAvailableModels,
      buildName: claudeCodeHubProvider.buildChannelName,
      prepareFormData: claudeCodeHubProvider.prepareChannelFormData,
      buildPayload: claudeCodeHubProvider.buildChannelPayload,
    })
    expect(claudeCodeHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })
})
