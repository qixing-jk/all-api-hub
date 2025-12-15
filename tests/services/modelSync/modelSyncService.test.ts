import { describe, expect, it, vi } from "vitest"

import { VELOERA } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { ModelSyncService } from "~/services/modelSync/modelSyncService"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"

const listAllChannelsMock = vi.fn()
const fetchChannelModelsMock = vi.fn()
const updateChannelModelsMock = vi.fn()
const updateChannelModelMappingMock = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    listAllChannels: listAllChannelsMock,
    fetchChannelModels: fetchChannelModelsMock,
    updateChannelModels: updateChannelModelsMock,
    updateChannelModelMapping: updateChannelModelMappingMock,
  })),
}))

describe("ModelSyncService - allowed model filtering", () => {
  const createService = (allowed?: string[]) =>
    new ModelSyncService(
      "https://example.com",
      "dummy-token",
      "1",
      undefined,
      allowed,
    )

  const callFilter = (service: ModelSyncService, models: string[]) =>
    (service as any).filterAllowedModels(models) as string[]

  it("returns trimmed unique models when no allow-list exists", () => {
    const service = createService()

    const result = callFilter(service, [
      "  gpt-4o  ",
      "gpt-4o",
      "claude-3",
      "  ",
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("filters models using the configured allow-list", () => {
    const service = createService(["gpt-4o", "claude-3"])

    const result = callFilter(service, [
      " gpt-4o  ",
      "gpt-4o-mini",
      "claude-3",
      "unknown-model",
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("deduplicates after filtering", () => {
    const service = createService(["gpt-4o"])

    const result = callFilter(service, ["gpt-4o", " gpt-4o  ", "gpt-4o"])

    expect(result).toEqual(["gpt-4o"])
  })
})

describe("ModelSyncService - siteType routing", () => {
  it("forwards ManagedSiteType hint to apiService listAllChannels", async () => {
    listAllChannelsMock.mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })

    const service = new ModelSyncService(
      "https://example.com",
      "token",
      "1",
      undefined,
      undefined,
      undefined,
      undefined,
      VELOERA,
    )

    await service.listChannels()

    expect(getApiService).toHaveBeenCalledWith(VELOERA)
    expect(listAllChannelsMock).toHaveBeenCalled()
  })
})

describe("ModelSyncService - global and channel filters", () => {
  const baseModels = ["gpt-4o", "gpt-4o-mini", "claude-3", "local-debug-model"]

  const makeRule = (
    partial: Partial<ChannelModelFilterRule>,
  ): ChannelModelFilterRule => ({
    id: partial.id ?? "id",
    name: partial.name ?? "rule",
    pattern: partial.pattern ?? "",
    isRegex: partial.isRegex ?? false,
    action: partial.action ?? "include",
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? Date.now(),
    updatedAt: partial.updatedAt ?? Date.now(),
    description: partial.description,
  })

  const callApplyFilters = (
    rules: ChannelModelFilterRule[] | null | undefined,
    models: string[],
  ): string[] => {
    const service = new ModelSyncService("https://example.com", "token")
    return (service as any).applyFilters(rules, models)
  }

  it("returns normalized models when no filters are provided", () => {
    const result = callApplyFilters(undefined, [" gpt-4o ", "gpt-4o", ""])
    expect(result).toEqual(["gpt-4o"])
  })

  it("applies include-then-exclude logic correctly", () => {
    const rules: ChannelModelFilterRule[] = [
      makeRule({
        id: "include-openai",
        name: "Include GPT-4 family",
        pattern: "gpt-4o",
        isRegex: false,
        action: "include",
      }),
      makeRule({
        id: "exclude-mini",
        name: "Exclude mini",
        pattern: "mini",
        isRegex: false,
        action: "exclude",
      }),
    ]

    const result = callApplyFilters(rules, baseModels)
    expect(result).toEqual(["gpt-4o"])
  })

  it("supports regex patterns in filters", () => {
    const rules: ChannelModelFilterRule[] = [
      makeRule({
        id: "include-gpt",
        name: "Include GPT*",
        pattern: "^gpt-",
        isRegex: true,
        action: "include",
      }),
    ]

    const result = callApplyFilters(rules, baseModels)
    expect(result.sort()).toEqual(["gpt-4o", "gpt-4o-mini"].sort())
  })
})
