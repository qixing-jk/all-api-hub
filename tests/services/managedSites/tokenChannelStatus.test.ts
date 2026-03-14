import { beforeEach, describe, expect, it, vi } from "vitest"

import { VELOERA } from "~/constants/siteType"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"
import {
  getManagedSiteTokenChannelStatus,
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
} from "~/services/managedSites/tokenChannelStatus"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildManagedSiteChannel,
} from "~~/tests/test-utils/factories"

const buildExpectedAssessment = (overrides: Record<string, unknown> = {}) => ({
  searchBaseUrl: "https://api.example.com",
  searchCompleted: true,
  url: {
    matched: true,
    candidateCount: 1,
    channel: {
      id: 12,
      name: "Managed Channel 12",
    },
  },
  key: {
    comparable: true,
    matched: true,
    reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
    channel: {
      id: 12,
      name: "Managed Channel 12",
    },
  },
  models: {
    comparable: true,
    matched: true,
    reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
    channel: {
      id: 12,
      name: "Managed Channel 12",
    },
    similarityScore: 1,
  },
  ...overrides,
})

const { resolveDisplayAccountTokenForSecretMock } = vi.hoisted(() => ({
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountTokenForSecret: (...args: unknown[]) =>
    resolveDisplayAccountTokenForSecretMock(...args),
}))

const createManagedSiteServiceStub = (
  overrides: Record<string, unknown> = {},
) =>
  ({
    siteType: "new-api",
    messagesKey: "newapi",
    searchChannel: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    }),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    checkValidConfig: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockResolvedValue({
      baseUrl: "https://managed.example",
      token: "managed-admin-token",
      userId: "1",
    }),
    fetchAvailableModels: vi.fn(),
    buildChannelName: vi.fn(),
    prepareChannelFormData: vi.fn().mockResolvedValue({
      name: "Managed Channel",
      type: 1,
      key: "test-token-key",
      base_url: "https://api.example.com",
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 1,
    }),
    buildChannelPayload: vi.fn(),
    findMatchingChannel: vi.fn().mockResolvedValue(null),
    autoConfigToManagedSite: vi.fn(),
    ...overrides,
  }) as any

describe("getManagedSiteTokenChannelStatus", () => {
  beforeEach(() => {
    resolveDisplayAccountTokenForSecretMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockImplementation(
      async (_account, token) => token,
    )
  })

  it("returns added when an exact comparable channel match exists", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const exactMatch = buildManagedSiteChannel({
      id: 12,
      name: "Managed Channel 12",
      base_url: "https://api.example.com",
      models: "gpt-4o",
      key: "test-token-key",
    })
    const service = createManagedSiteServiceStub({
      findMatchingChannel: vi.fn().mockResolvedValue(exactMatch),
      searchChannel: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      }),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 12,
        name: "Managed Channel 12",
      },
      assessment: buildExpectedAssessment(),
    })
  })

  it("returns not-added when exact comparison completes without a match", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      }),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
      assessment: {
        searchBaseUrl: "https://api.example.com",
        searchCompleted: true,
        url: {
          matched: false,
          candidateCount: 0,
          channel: undefined,
        },
        key: {
          comparable: false,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
          channel: undefined,
        },
        models: {
          comparable: false,
          matched: false,
          reason:
            MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE,
          channel: undefined,
        },
      },
    })
  })

  it("returns unknown assessment metadata when only base URL and models match", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 23,
            name: "Managed Channel 23",
            base_url: "https://api.example.com",
            models: "gpt-4o",
            key: "different-key",
          }),
        ],
        total: 1,
        type_counts: {},
      }),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
      assessment: {
        searchBaseUrl: "https://api.example.com",
        searchCompleted: true,
        url: {
          matched: true,
          candidateCount: 1,
          channel: {
            id: 23,
            name: "Managed Channel 23",
          },
        },
        key: {
          comparable: true,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
          channel: undefined,
        },
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
          channel: {
            id: 23,
            name: "Managed Channel 23",
          },
          similarityScore: 1,
        },
      },
    })
  })

  it("returns exact-verification-unavailable when URL evidence exists but channel keys are not comparable", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 23_1,
            name: "Managed Channel 23 Hidden Key",
            base_url: "https://api.example.com",
            models: "gpt-4o",
            key: "",
          }),
        ],
        total: 1,
        type_counts: {},
      }),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      assessment: {
        searchBaseUrl: "https://api.example.com",
        searchCompleted: true,
        url: {
          matched: true,
          candidateCount: 1,
          channel: {
            id: 23_1,
            name: "Managed Channel 23 Hidden Key",
          },
        },
        key: {
          comparable: false,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
          channel: undefined,
        },
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
          channel: {
            id: 23_1,
            name: "Managed Channel 23 Hidden Key",
          },
          similarityScore: 1,
        },
      },
    })
  })

  it("returns unknown assessment metadata when only the key matches", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 24,
            name: "Managed Channel 24",
            base_url: "https://api.example.com",
            models: "gpt-4.1",
            key: "test-token-key",
          }),
        ],
        total: 1,
        type_counts: {},
      }),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
      assessment: {
        searchBaseUrl: "https://api.example.com",
        searchCompleted: true,
        url: {
          matched: true,
          candidateCount: 1,
          channel: {
            id: 24,
            name: "Managed Channel 24",
          },
        },
        key: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
          channel: {
            id: 24,
            name: "Managed Channel 24",
          },
        },
        models: {
          comparable: true,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
          channel: undefined,
        },
      },
    })
  })

  it("returns exact-verification-unavailable when no comparable key or ranked match exists", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "" })
    const service = createManagedSiteServiceStub({
      prepareChannelFormData: vi.fn().mockResolvedValue({
        name: "Managed Channel",
        type: 1,
        key: "",
        base_url: "https://api.example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      }),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      assessment: {
        searchBaseUrl: "https://api.example.com",
        searchCompleted: true,
        url: {
          matched: false,
          candidateCount: 0,
          channel: undefined,
        },
        key: {
          comparable: false,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED,
          channel: undefined,
        },
        models: {
          comparable: false,
          matched: false,
          reason:
            MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE,
          channel: undefined,
        },
      },
    })
  })

  it("returns unknown config-missing when managed-site admin config is unavailable", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const service = createManagedSiteServiceStub({
      getConfig: vi.fn().mockResolvedValue(null),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason: MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING,
    })
  })

  it("returns unknown when the managed site is Veloera because base URL search is unsupported", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const searchChannel = vi.fn()
    const prepareChannelFormData = vi.fn()
    const service = createManagedSiteServiceStub({
      siteType: VELOERA,
      searchChannel,
      prepareChannelFormData,
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(supportsManagedSiteBaseUrlChannelLookup(service.siteType)).toBe(
      false,
    )
    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.VELOERA_BASE_URL_SEARCH_UNSUPPORTED,
    })
    expect(searchChannel).not.toHaveBeenCalled()
    expect(prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("returns backend-search-failed without assessment when the backend search cannot complete", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue(null),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED,
    })
    expect(result).not.toHaveProperty("assessment")
  })

  it("redacts token and admin secrets from failure diagnostics", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "secret-token-value" })
    const service = createManagedSiteServiceStub({
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://managed.example",
        token: "secret-admin-value",
        userId: "1",
      }),
      prepareChannelFormData: vi
        .fn()
        .mockRejectedValue(
          new Error("secret-token-value secret-admin-value exploded"),
        ),
    })

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result.status).toBe(MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN)
    if (result.status !== MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN) {
      throw new Error("Expected unknown result")
    }

    if (!("diagnostic" in result)) {
      throw new Error("Expected diagnostic to be present")
    }

    expect(result.reason).toBe(
      MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED,
    )
    expect(result.diagnostic).toContain("[REDACTED]")
    expect(result.diagnostic).not.toContain("secret-token-value")
    expect(result.diagnostic).not.toContain("secret-admin-value")
  })

  it("returns unknown exact-verification-unavailable when secret resolution fails", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "sk-abcd************wxyz" })
    const service = createManagedSiteServiceStub({
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://managed.example",
        token: "secret-admin-value",
        userId: "1",
      }),
    })

    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error("sk-abcd************wxyz secret-admin-value blocked"),
    )

    const result = await getManagedSiteTokenChannelStatus({
      account,
      token,
      service,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      diagnostic: "[REDACTED] [REDACTED] blocked",
    })
  })
})
