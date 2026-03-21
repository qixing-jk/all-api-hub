import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
import { DONE_HUB, NEW_API, OCTOPUS } from "~/constants/siteType"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
} from "~/types/managedSiteMigration"

const mockGetManagedSiteServiceForType = vi.fn()
const mockFetchDoneHubChannel = vi.fn()

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: mockGetManagedSiteServiceForType,
}))

vi.mock("~/services/apiService/doneHub", () => ({
  fetchChannel: mockFetchDoneHubChannel,
}))

const buildManagedSiteChannel = (
  overrides: Partial<ManagedSiteChannel> = {},
): ManagedSiteChannel =>
  ({
    id: 1,
    type: ChannelType.OpenAI,
    key: "channel-key",
    name: "Alpha",
    base_url: "https://source.example.com",
    models: "gpt-4o,gpt-4o-mini",
    status: 1,
    weight: 0,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 0,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
    ...overrides,
  }) satisfies ManagedSiteChannel

const buildPreferences = (
  overrides: Partial<UserPreferences> = {},
): UserPreferences =>
  ({
    ...DEFAULT_PREFERENCES,
    doneHub: {
      baseUrl: "https://donehub.example.com",
      adminToken: "donehub-token",
      userId: "9",
    },
    ...overrides,
  }) satisfies UserPreferences

describe("channelMigration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetManagedSiteServiceForType.mockReturnValue({
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://target.example.com",
        token: "target-token",
        userId: "1",
      }),
      buildChannelPayload: vi.fn((draft: any) => ({
        mode: "single",
        channel: {
          name: draft.name,
          key: draft.key,
        },
      })),
      createChannel: vi.fn().mockResolvedValue({
        success: true,
        message: "ok",
      }),
    })
  })

  it("blocks New API preview items when source-key verification does not complete", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: NEW_API,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 11,
          key: "",
        }),
      ],
      resolveNewApiSourceKey: vi
        .fn()
        .mockRejectedValue(new Error("Verification required")),
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 11,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      blockingMessage: "Verification required",
    })
  })

  it("hydrates Done Hub keys and warns about Octopus-specific field normalization", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockFetchDoneHubChannel.mockResolvedValue(
      buildManagedSiteChannel({
        id: 21,
        key: "real-donehub-key",
      }),
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: DONE_HUB,
      targetSiteType: OCTOPUS,
      channels: [
        buildManagedSiteChannel({
          id: 21,
          key: "",
          type: ChannelType.Gemini,
          base_url: "https://provider.example.com",
          group: "vip,default",
          priority: 10,
          weight: 5,
          status: 3,
          model_mapping: '{"gpt-4o":"gpt-4.1"}',
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      key: "real-donehub-key",
      base_url: "https://provider.example.com/v1",
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 2,
      type: 3,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      ]),
    )
  })

  it("creates only ready channels and skips blocked rows during execution", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    const targetService = mockGetManagedSiteServiceForType()

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: NEW_API,
        targetSiteType: DONE_HUB,
        generalWarningCodes: [],
        totalCount: 2,
        readyCount: 1,
        blockedCount: 1,
        items: [
          {
            channelId: 31,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 31, name: "Ready" }),
            draft: {
              name: "Ready",
              type: ChannelType.OpenAI,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
          {
            channelId: 32,
            channelName: "Blocked",
            sourceChannel: buildManagedSiteChannel({ id: 32, name: "Blocked" }),
            draft: null,
            status: "blocked",
            warningCodes: [],
            blockingReasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
            blockingMessage: "Missing key",
          },
        ],
      },
    })

    expect(targetService.buildChannelPayload).toHaveBeenCalledTimes(1)
    expect(targetService.createChannel).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      totalSelected: 2,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 1,
    })
    expect(result.items).toEqual([
      {
        channelId: 31,
        channelName: "Ready",
        success: true,
        skipped: false,
      },
      {
        channelId: 32,
        channelName: "Blocked",
        success: false,
        skipped: true,
        error: "Missing key",
      },
    ])
  })
})
