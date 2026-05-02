import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { ChannelType } from "~/constants/managedSite"
import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
} from "~/constants/siteType"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
} from "~/types/managedSiteMigration"
import { OctopusOutboundType } from "~/types/octopus"

const mockGetManagedSiteServiceForType = vi.fn()
const mockDoneHubBuildChannelPayload = vi.fn()
const mockDoneHubCreateChannel = vi.fn()
const mockDoneHubFetchChannelSecretKey = vi.fn()
const mockDoneHubGetConfig = vi.fn()
const mockVeloeraFetchChannelSecretKey = vi.fn()
const mockVeloeraGetConfig = vi.fn()
const mockAxonHubBuildChannelPayload = vi.fn()
const mockAxonHubCreateChannel = vi.fn()
const mockAxonHubGetConfig = vi.fn()
const mockClaudeCodeHubBuildChannelPayload = vi.fn()
const mockClaudeCodeHubCreateChannel = vi.fn()
const mockClaudeCodeHubGetConfig = vi.fn()

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: mockGetManagedSiteServiceForType,
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
    mockDoneHubGetConfig.mockResolvedValue({
      baseUrl: "https://donehub.example.com",
      token: "donehub-token",
      userId: "9",
    })
    mockDoneHubBuildChannelPayload.mockImplementation((draft: any) => ({
      mode: "single",
      channel: {
        name: draft.name,
        key: draft.key,
      },
    }))
    mockDoneHubCreateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    mockDoneHubFetchChannelSecretKey.mockResolvedValue("real-donehub-key")
    mockVeloeraGetConfig.mockResolvedValue({
      baseUrl: "https://veloera.example.com",
      token: "veloera-token",
      userId: "8",
    })
    mockVeloeraFetchChannelSecretKey.mockResolvedValue("real-veloera-key")
    mockAxonHubGetConfig.mockResolvedValue({
      baseUrl: "https://axonhub.example.com",
      token: "axonhub-password",
      userId: "admin@example.com",
    })
    mockAxonHubBuildChannelPayload.mockImplementation((draft: any) => ({
      mode: "single",
      channel: {
        name: draft.name,
        type: draft.type,
        key: draft.key,
        base_url: draft.base_url,
        models: draft.models.join(","),
        groups: [],
        priority: 0,
        weight: draft.weight,
        status: draft.status,
      },
    }))
    mockAxonHubCreateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    mockClaudeCodeHubGetConfig.mockResolvedValue({
      baseUrl: "https://cch.example.com",
      token: "cch-token",
      userId: "admin",
    })
    mockClaudeCodeHubBuildChannelPayload.mockImplementation((draft: any) => ({
      mode: "single",
      channel: {
        name: draft.name,
        type: draft.type,
        key: draft.key,
        base_url: draft.base_url,
        models: draft.models.join(","),
        groups: draft.groups,
        group: draft.groups[0],
        priority: draft.priority,
        weight: draft.weight,
        status: draft.status,
      },
    }))
    mockClaudeCodeHubCreateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    mockGetManagedSiteServiceForType.mockImplementation((siteType: string) => {
      if (siteType === DONE_HUB) {
        return {
          getConfig: mockDoneHubGetConfig,
          buildChannelPayload: mockDoneHubBuildChannelPayload,
          createChannel: mockDoneHubCreateChannel,
          fetchChannelSecretKey: mockDoneHubFetchChannelSecretKey,
        }
      }

      if (siteType === VELOERA) {
        return {
          getConfig: mockVeloeraGetConfig,
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
          fetchChannelSecretKey: mockVeloeraFetchChannelSecretKey,
        }
      }

      if (siteType === AXON_HUB) {
        return {
          getConfig: mockAxonHubGetConfig,
          buildChannelPayload: mockAxonHubBuildChannelPayload,
          createChannel: mockAxonHubCreateChannel,
        }
      }

      if (siteType === CLAUDE_CODE_HUB) {
        return {
          getConfig: mockClaudeCodeHubGetConfig,
          buildChannelPayload: mockClaudeCodeHubBuildChannelPayload,
          createChannel: mockClaudeCodeHubCreateChannel,
        }
      }

      return {
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
      }
    })
  })

  it("blocks New API preview items when a masked source key still requires verification", async () => {
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
          key: "sk-********",
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

  it("blocks New API preview items when masked source keys have no resolver available", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: NEW_API,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 12,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.items[0]).toMatchObject({
      channelId: 12,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("hydrates masked Done Hub keys and warns about Octopus-specific field normalization", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: DONE_HUB,
      targetSiteType: OCTOPUS,
      channels: [
        buildManagedSiteChannel({
          id: 21,
          key: "sk-********",
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

    expect(mockDoneHubFetchChannelSecretKey).toHaveBeenCalledWith(
      "https://donehub.example.com",
      "donehub-token",
      "9",
      21,
    )
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

  it("hydrates masked Veloera keys through the managed-site service loader", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        veloera: {
          baseUrl: "https://veloera.example.com",
          adminToken: "veloera-token",
          userId: "8",
        },
      }),
      sourceSiteType: VELOERA,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22,
          key: "sk-********",
        }),
      ],
    })

    expect(mockVeloeraFetchChannelSecretKey).toHaveBeenCalledWith(
      "https://veloera.example.com",
      "veloera-token",
      "8",
      22,
    )
    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.key).toBe("real-veloera-key")
  })

  it("blocks managed-site preview items when source admin config is missing", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        doneHub: {
          baseUrl: "",
          adminToken: "",
          userId: "",
        },
      }),
      sourceSiteType: DONE_HUB,
      targetSiteType: VELOERA,
      channels: [
        buildManagedSiteChannel({
          id: 22_1,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_1,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      blockingMessage: "Source managed-site configuration is missing.",
    })
  })

  it("blocks managed-site preview items when the provider cannot hydrate secret keys", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockGetManagedSiteServiceForType.mockImplementation((siteType: string) => {
      if (siteType === DONE_HUB) {
        return {
          getConfig: mockDoneHubGetConfig,
          buildChannelPayload: mockDoneHubBuildChannelPayload,
          createChannel: mockDoneHubCreateChannel,
        }
      }

      return {
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
      }
    })

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: DONE_HUB,
      targetSiteType: VELOERA,
      channels: [
        buildManagedSiteChannel({
          id: 22_2,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_2,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("maps Octopus source channels back to shared fields and preserves migration warnings", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: OCTOPUS,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_3,
          name: "   ",
          type: OctopusOutboundType.Gemini,
          key: "  octopus-secret  ",
          base_url: " https://octopus-upstream.example.com/v1/ ",
          group: "   ",
          setting: '{"retry":true}',
          channel_info: {
            is_multi_key: true,
            multi_key_size: 2,
            multi_key_status_list: [1, 2],
            multi_key_polling_index: 1,
            multi_key_mode: "round-robin",
          },
        }),
      ],
    })

    expect(preview.items[0].draft).toMatchObject({
      name: "Channel #223",
      type: ChannelType.Gemini,
      key: "octopus-secret",
      base_url: "https://octopus-upstream.example.com/v1/",
      groups: ["default"],
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("maps AxonHub string channel types to shared channel types and warns about remapping", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: AXON_HUB,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_4,
          type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.type).toBe(ChannelType.Anthropic)
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("falls back unknown AxonHub string channel types to OpenAI and warns about remapping", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: AXON_HUB,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_5,
          type: "future-provider",
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.type).toBe(ChannelType.OpenAI)
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("maps Claude Code Hub source providers to shared channel types when real key material is available", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: CLAUDE_CODE_HUB,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_51,
          name: "Codex Provider",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
          key: "sk-********",
          base_url: " https://cch-upstream.example.com/v1 ",
          models: "gpt-4o,gpt-4.1",
          group: "paid",
          priority: 7,
          weight: 3,
          status: 1,
          _claudeCodeHubData: {
            key: "  cch-real-key  ",
          },
        } as Partial<ManagedSiteChannel>),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: "ready",
      draft: {
        name: "Codex Provider",
        type: ChannelType.OpenAI,
        key: "cch-real-key",
        base_url: "https://cch-upstream.example.com/v1",
        models: ["gpt-4o", "gpt-4.1"],
        groups: ["paid"],
        priority: 7,
        weight: 3,
        status: 1,
      },
    })
    expect(preview.items[0].warningCodes).toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
    )
  })

  it("maps New API source channels to AxonHub string channel types and target-safe fields", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: NEW_API,
      targetSiteType: AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_6,
          type: ChannelType.Gemini,
          key: "  source-key  ",
          group: "default,vip",
          priority: 9,
          weight: 4,
          status: 3,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      type: AXON_HUB_CHANNEL_TYPE.GEMINI,
      key: "source-key",
      groups: ["default"],
      priority: 0,
      weight: 4,
      status: 2,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      ]),
    )
  })

  it("warns about AxonHub default group forcing only when the emitted group differs", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: NEW_API,
      targetSiteType: AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_61,
          group: "default",
        }),
        buildManagedSiteChannel({
          id: 22_62,
          group: "",
        }),
        buildManagedSiteChannel({
          id: 22_63,
          group: " default ",
        }),
      ],
    })

    expect(preview.items[0].draft?.groups).toEqual(["default"])
    expect(preview.items[0].warningCodes).not.toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
    expect(preview.items[1].draft?.groups).toEqual(["default"])
    expect(preview.items[1].warningCodes).toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
    expect(preview.items[2].draft?.groups).toEqual(["default"])
    expect(preview.items[2].warningCodes).not.toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
  })

  it("falls back unmapped shared channel types to AxonHub OpenAI and warns", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: NEW_API,
      targetSiteType: AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_7,
          type: ChannelType.Midjourney,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.type).toBe(AXON_HUB_CHANNEL_TYPE.OPENAI)
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("maps New API source channels to Claude Code Hub provider types and provider-safe fields", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: NEW_API,
      targetSiteType: CLAUDE_CODE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_71,
          type: ChannelType.Anthropic,
          key: "  source-key  ",
          base_url: " https://source.example.com/v1 ",
          models: "claude-3-5-sonnet",
          group: "default,vip",
          priority: 9,
          weight: 4,
          status: 3,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "source-key",
      base_url: "https://source.example.com/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["default"],
      priority: 9,
      weight: 4,
      status: 2,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      ]),
    )
  })

  it("falls back unmapped shared channel types to Claude Code Hub OpenAI-compatible and warns", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: NEW_API,
      targetSiteType: CLAUDE_CODE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_72,
          type: ChannelType.Midjourney,
          key: "source-key",
          weight: 0,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
      groups: ["default"],
      weight: 1,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
      ]),
    )
  })

  it("blocks only AxonHub source rows without usable key material", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: AXON_HUB,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_8,
          name: "Ready",
          type: AXON_HUB_CHANNEL_TYPE.OPENROUTER,
          key: "axonhub-real-key",
        }),
        buildManagedSiteChannel({
          id: 22_9,
          name: "Masked",
          type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_8,
      status: "ready",
      draft: {
        type: ChannelType.OpenRouter,
        key: "axonhub-real-key",
      },
    })
    expect(preview.items[1]).toMatchObject({
      channelId: 22_9,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("blocks only Claude Code Hub source providers without usable key material", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: CLAUDE_CODE_HUB,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_91,
          name: "Ready",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          key: "",
          _claudeCodeHubData: {
            key: "cch-real-key",
          },
        } as Partial<ManagedSiteChannel>),
        buildManagedSiteChannel({
          id: 22_92,
          name: "Masked",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
          key: "sk-********",
          _claudeCodeHubData: {
            maskedKey: "sk-********",
          },
        } as Partial<ManagedSiteChannel>),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_91,
      status: "ready",
      draft: {
        type: ChannelType.Anthropic,
        key: "cch-real-key",
      },
    })
    expect(preview.items[1]).toMatchObject({
      channelId: 22_92,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("limits concurrent preview key resolution while preserving channel order", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const channels = Array.from({ length: 7 }, (_, index) =>
      buildManagedSiteChannel({
        id: 100 + index,
        name: `Channel ${index + 1}`,
        key: "sk-********",
      }),
    )
    const releaseResolvers: Array<() => void> = []
    let activeResolvers = 0
    let maxActiveResolvers = 0

    const previewPromise = prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: NEW_API,
      targetSiteType: DONE_HUB,
      channels,
      resolveNewApiSourceKey: vi.fn(async ({ channelId }) => {
        activeResolvers += 1
        maxActiveResolvers = Math.max(maxActiveResolvers, activeResolvers)

        await new Promise<void>((resolve) => {
          releaseResolvers.push(() => {
            activeResolvers -= 1
            resolve()
          })
        })

        return `real-key-${channelId}`
      }),
    })

    await vi.waitFor(() => {
      expect(releaseResolvers).toHaveLength(5)
    })
    expect(maxActiveResolvers).toBe(5)

    const firstWave = releaseResolvers.splice(0, 5)
    firstWave.forEach((release) => release())

    await vi.waitFor(() => {
      expect(releaseResolvers).toHaveLength(2)
    })

    const secondWave = releaseResolvers.splice(0, 2)
    secondWave.forEach((release) => release())

    const preview = await previewPromise

    expect(maxActiveResolvers).toBe(5)
    expect(preview.items.map((item) => item.channelId)).toEqual(
      channels.map((channel) => channel.id),
    )
    expect(preview.readyCount).toBe(channels.length)
  })

  it("blocks preview items when hydrated source keys are still masked", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockVeloeraFetchChannelSecretKey.mockResolvedValue("sk-********")

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        veloera: {
          baseUrl: "https://veloera.example.com",
          adminToken: "veloera-token",
          userId: "8",
        },
      }),
      sourceSiteType: VELOERA,
      targetSiteType: DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 23,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 23,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("creates only ready channels and skips blocked rows during execution", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

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

    expect(mockDoneHubBuildChannelPayload).toHaveBeenCalledTimes(1)
    expect(mockDoneHubCreateChannel).toHaveBeenCalledTimes(1)
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
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        error: "Missing key",
      },
    ])
  })

  it("creates AxonHub targets through the managed-site service and keeps failures per row", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockAxonHubCreateChannel
      .mockResolvedValueOnce({
        success: false,
        message: "AxonHub rejected channel",
      })
      .mockResolvedValueOnce({
        success: true,
        message: "ok",
      })

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: NEW_API,
        targetSiteType: AXON_HUB,
        generalWarningCodes: [],
        totalCount: 2,
        readyCount: 2,
        blockedCount: 0,
        items: [
          {
            channelId: 61,
            channelName: "Rejected",
            sourceChannel: buildManagedSiteChannel({
              id: 61,
              name: "Rejected",
            }),
            draft: {
              name: "Rejected",
              type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
              key: "rejected-key",
              base_url: "https://source.example.com",
              models: ["claude-3-5-sonnet"],
              groups: ["default"],
              priority: 0,
              weight: 2,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
          {
            channelId: 62,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 62, name: "Ready" }),
            draft: {
              name: "Ready",
              type: AXON_HUB_CHANNEL_TYPE.OPENAI,
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
        ],
      },
    })

    expect(mockAxonHubBuildChannelPayload).toHaveBeenCalledTimes(2)
    expect(mockAxonHubCreateChannel).toHaveBeenCalledTimes(2)
    expect(mockAxonHubCreateChannel).toHaveBeenNthCalledWith(
      1,
      "https://axonhub.example.com",
      "axonhub-password",
      "admin@example.com",
      expect.objectContaining({
        channel: expect.objectContaining({
          type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
          key: "rejected-key",
          models: "claude-3-5-sonnet",
        }),
      }),
    )
    expect(result).toMatchObject({
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          channelId: 61,
          success: false,
          skipped: false,
          error: "AxonHub rejected channel",
        },
        {
          channelId: 62,
          success: true,
          skipped: false,
        },
      ],
    })
  })

  it("creates Claude Code Hub targets through the managed-site service and keeps failures per row", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockClaudeCodeHubCreateChannel
      .mockResolvedValueOnce({
        success: false,
        message: "Claude Code Hub rejected provider",
      })
      .mockResolvedValueOnce({
        success: true,
        message: "ok",
      })

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: NEW_API,
        targetSiteType: CLAUDE_CODE_HUB,
        generalWarningCodes: [],
        totalCount: 2,
        readyCount: 2,
        blockedCount: 0,
        items: [
          {
            channelId: 71,
            channelName: "Rejected",
            sourceChannel: buildManagedSiteChannel({
              id: 71,
              name: "Rejected",
            }),
            draft: {
              name: "Rejected",
              type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
              key: "rejected-key",
              base_url: "https://source.example.com",
              models: ["claude-3-5-sonnet"],
              groups: ["default"],
              priority: 1,
              weight: 2,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
          {
            channelId: 72,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 72, name: "Ready" }),
            draft: {
              name: "Ready",
              type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 1,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
        ],
      },
    })

    expect(mockClaudeCodeHubBuildChannelPayload).toHaveBeenCalledTimes(2)
    expect(mockClaudeCodeHubCreateChannel).toHaveBeenCalledTimes(2)
    expect(mockClaudeCodeHubCreateChannel).toHaveBeenNthCalledWith(
      1,
      "https://cch.example.com",
      "cch-token",
      "admin",
      expect.objectContaining({
        channel: expect.objectContaining({
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          key: "rejected-key",
          models: "claude-3-5-sonnet",
        }),
      }),
    )
    expect(result).toMatchObject({
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          channelId: 71,
          success: false,
          skipped: false,
          error: "Claude Code Hub rejected provider",
        },
        {
          channelId: 72,
          success: true,
          skipped: false,
        },
      ],
    })
  })

  it("preserves blocker details when execution fails before creating target channels", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockDoneHubGetConfig.mockResolvedValue(null)

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
            channelId: 41,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 41, name: "Ready" }),
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
            channelId: 42,
            channelName: "Blocked",
            sourceChannel: buildManagedSiteChannel({ id: 42, name: "Blocked" }),
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

    expect(result.items).toEqual([
      {
        channelId: 41,
        channelName: "Ready",
        success: false,
        skipped: false,
        error: "Target managed-site configuration is missing.",
      },
      {
        channelId: 42,
        channelName: "Blocked",
        success: false,
        skipped: true,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        error: "Missing key",
      },
    ])
  })

  it("uses a local fallback message when target creation fails without an error message", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockDoneHubCreateChannel.mockResolvedValue({
      success: false,
      message: "",
    })

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: NEW_API,
        targetSiteType: DONE_HUB,
        generalWarningCodes: [],
        totalCount: 1,
        readyCount: 1,
        blockedCount: 0,
        items: [
          {
            channelId: 51,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 51, name: "Ready" }),
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
        ],
      },
    })

    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 0,
    })
    expect(result.items).toEqual([
      {
        channelId: 51,
        channelName: "Ready",
        success: false,
        skipped: false,
        error: "Unknown error",
      },
    ])
  })

  it("reports thrown target creation errors for ready rows", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockDoneHubCreateChannel.mockRejectedValue(new Error("Create exploded"))

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: NEW_API,
        targetSiteType: DONE_HUB,
        generalWarningCodes: [],
        totalCount: 1,
        readyCount: 1,
        blockedCount: 0,
        items: [
          {
            channelId: 52,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 52, name: "Ready" }),
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
        ],
      },
    })

    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 0,
    })
    expect(result.items).toEqual([
      {
        channelId: 52,
        channelName: "Ready",
        success: false,
        skipped: false,
        error: "Create exploded",
      },
    ])
  })
})
