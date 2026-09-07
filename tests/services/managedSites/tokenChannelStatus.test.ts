import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAccountKeyResourceRuntimeKey,
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
  formatAccountRuntimeKeySecretForSite,
} from "~/services/accounts/accountRuntimeKeys"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  getManagedSiteTokenChannelStatus,
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  resolveManagedSiteTokenChannelStatusWithVerifiedKey,
} from "~/services/managedSites/tokenChannelStatus"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import type { ManagedSiteChannelDraftSource } from "~/types/managedSiteChannelDraft"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildManagedSiteChannel,
} from "~~/tests/test-utils/factories"
import { createManagedSiteCapabilitiesStub } from "~~/tests/test-utils/managedSiteCapabilitiesFactory"

const buildExpectedAssessment = (
  overrides: Record<string, unknown> = {},
  resourceId?: string | number,
) => ({
  searchBaseUrl: "https://api.example.com",
  searchCompleted: true,
  url: {
    matched: true,
    candidateCount: 1,
    channel: {
      id: resourceId ?? 12,
      ...(resourceId !== undefined ? { resourceId } : {}),
      name: "Managed Channel 12",
    },
  },
  key: {
    comparable: true,
    matched: true,
    reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
    channel: {
      id: resourceId ?? 12,
      ...(resourceId !== undefined ? { resourceId } : {}),
      name: "Managed Channel 12",
    },
  },
  models: {
    comparable: true,
    matched: true,
    reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
    channel: {
      id: resourceId ?? 12,
      ...(resourceId !== undefined ? { resourceId } : {}),
      name: "Managed Channel 12",
    },
    similarityScore: 1,
  },
  ...overrides,
})

const sessionResyncExecution = {
  version: 2 as const,
  kind: "automatic" as const,
  feature: "managed_site_channels" as const,
  trigger: "background_recovery" as const,
  surface: "background" as const,
}

const sessionResyncOptions = {
  protectionBypassExecution: sessionResyncExecution,
}

const { resolveDisplayAccountRuntimeKeySecretMock } = vi.hoisted(() => ({
  resolveDisplayAccountRuntimeKeySecretMock: vi.fn(),
}))

const { getNewApiLoginAssistConfigMock } = vi.hoisted(() => ({
  getNewApiLoginAssistConfigMock: vi.fn(),
}))

const { hasNewApiAuthenticatedBrowserSessionMock } = vi.hoisted(() => ({
  hasNewApiAuthenticatedBrowserSessionMock: vi.fn(),
}))

const { resolveManagedUpstreamResourceFeatureCapabilitiesMock } = vi.hoisted(
  () => ({
    resolveManagedUpstreamResourceFeatureCapabilitiesMock: vi.fn(),
  }),
)

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret: (...args: unknown[]) =>
    resolveDisplayAccountRuntimeKeySecretMock(...args),
}))

vi.mock(
  "~/services/managedSites/providers/newApiChannelSecrets",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/providers/newApiChannelSecrets")
      >()

    return {
      ...actual,
      getNewApiLoginAssistConfig: (...args: unknown[]) =>
        getNewApiLoginAssistConfigMock(...args),
    }
  },
)

vi.mock(
  "~/services/managedSites/providers/newApiSession",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/providers/newApiSession")
      >()

    return {
      ...actual,
      hasNewApiAuthenticatedBrowserSession: (...args: unknown[]) =>
        hasNewApiAuthenticatedBrowserSessionMock(...args),
    }
  },
)

const buildRecoverableVerificationUnavailableStatus = (
  overrides: Record<string, unknown> = {},
) => ({
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
        id: 12,
        name: "Managed Channel 12",
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
        id: 12,
        name: "Managed Channel 12",
      },
      similarityScore: 1,
    },
  },
  ...overrides,
})

describe("resolveManagedSiteTokenChannelStatusWithVerifiedKey", () => {
  it("returns the original status when there is no assessment to update", () => {
    const status = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED,
    }

    expect(
      resolveManagedSiteTokenChannelStatusWithVerifiedKey({
        status,
        tokenKey: "sk-token-secret",
        channelId: 12,
        channelKey: "sk-token-secret",
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toBe(status)
  })

  it("records a resolved channel key when the assessment no longer has that channel", () => {
    const result = resolveManagedSiteTokenChannelStatusWithVerifiedKey({
      status: buildRecoverableVerificationUnavailableStatus({
        models: {
          comparable: true,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
          channel: undefined,
        },
      }) as any,
      tokenKey: "sk-token-secret",
      channelId: 999,
      channelKey: "sk-token-secret",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      resolvedChannelKeysById: {
        999: "sk-token-secret",
      },
    })
  })

  it("marks the token as added when the verified channel key matches the token key", () => {
    const result = resolveManagedSiteTokenChannelStatusWithVerifiedKey({
      status: buildRecoverableVerificationUnavailableStatus() as any,
      tokenKey: "sk-token-secret",
      channelId: 12,
      channelKey: "sk-token-secret",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 12,
        name: "Managed Channel 12",
      },
      resolvedChannelKeysById: {
        12: "sk-token-secret",
      },
      assessment: buildExpectedAssessment(),
    })
  })

  it("keeps the status as requiring confirmation when the verified key does not match", () => {
    const result = resolveManagedSiteTokenChannelStatusWithVerifiedKey({
      status: buildRecoverableVerificationUnavailableStatus() as any,
      tokenKey: "sk-token-secret",
      channelId: 12,
      channelKey: "sk-other-secret",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
      resolvedChannelKeysById: {
        12: "sk-other-secret",
      },
      assessment: buildExpectedAssessment({
        key: {
          comparable: true,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
          channel: undefined,
        },
      }),
    })
  })

  it("marks the token as not added when the verified key has no URL, key, or model match", () => {
    const status = buildRecoverableVerificationUnavailableStatus() as any
    status.assessment = {
      ...status.assessment,
      url: {
        matched: false,
        candidateCount: 0,
        channel: {
          id: 12,
          name: "Managed Channel 12",
        },
      },
      models: {
        comparable: true,
        matched: false,
        reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
        channel: undefined,
      },
    }

    const result = resolveManagedSiteTokenChannelStatusWithVerifiedKey({
      status,
      tokenKey: "sk-token-secret",
      channelId: 12,
      channelKey: "sk-other-secret",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
      resolvedChannelKeysById: {
        12: "sk-other-secret",
      },
      assessment: {
        url: {
          matched: false,
        },
        key: {
          matched: false,
        },
        models: {
          matched: false,
        },
      },
    })
  })
})

describe("getManagedSiteTokenChannelStatus", () => {
  beforeEach(() => {
    resolveDisplayAccountRuntimeKeySecretMock.mockReset()
    resolveDisplayAccountRuntimeKeySecretMock.mockImplementation(
      async (_account, token) => token,
    )
    getNewApiLoginAssistConfigMock.mockReset()
    getNewApiLoginAssistConfigMock.mockResolvedValue({
      baseUrl: "https://managed.example",
      username: "admin",
      password: "secret-password",
      totpSecret: "JBSWY3DPEHPK3PXP",
    })
    hasNewApiAuthenticatedBrowserSessionMock.mockReset()
    hasNewApiAuthenticatedBrowserSessionMock.mockResolvedValue(false)
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReset()
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockImplementation(
      (siteType, feature) => ({
        supported: false,
        siteType,
        feature,
        reason: "feature-slice-disabled",
      }),
    )
  })

  it.each([
    { siteType: SITE_TYPES.NEW_API, resourceId: 12 },
    { siteType: SITE_TYPES.AXON_HUB, resourceId: "native/12+=" },
  ])(
    "preserves the stable $siteType identity when an exact comparable channel match exists",
    async ({ siteType, resourceId }) => {
      const account = buildDisplaySiteData({
        baseUrl: "https://api.example.com",
      })
      const token = buildApiToken({ key: "test-token-key" })
      const exactMatch = {
        ...buildManagedSiteChannel({
          id: 12,
          name: "Managed Channel 12",
          base_url: "https://api.example.com",
          models: "gpt-4o",
          key: "test-token-key",
        }),
        id: resourceId,
      }
      const managedSite = createManagedSiteCapabilitiesStub({
        siteType,
        matching: {
          search: vi.fn().mockResolvedValue({
            items: [exactMatch],
            total: 1,
            type_counts: {},
          }),
        },
      })

      const result = await getManagedSiteTokenChannelStatus({
        runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
        managedSite,
      })

      expect(result).toEqual({
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
        matchedChannel: {
          id: resourceId,
          resourceId,
          name: "Managed Channel 12",
        },
        assessment: buildExpectedAssessment({}, resourceId),
      })
    },
  )

  it("lets the provider match policy evaluate an empty model list", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const exactMatch = buildManagedSiteChannel({
      id: 13,
      name: "URL and key duplicate",
      base_url: "https://api.example.com",
      models: "",
      key: "test-token-key",
    })
    const searchChannel = vi
      .fn()
      .mockResolvedValue({ items: [exactMatch], total: 1, type_counts: {} })
    const managedSite = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.SUB2API,
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          name: "Imported account",
          type: 1,
          key: "test-token-key",
          base_url: "https://api.example.com",
          models: [],
          groups: [],
          priority: 1,
          weight: 1,
          enabled: true,
        }),
      },
      matching: { search: searchChannel },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
    })

    expect(searchChannel).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 13,
        name: "URL and key duplicate",
      },
    })
  })

  it.each(["service credential", "native key"])(
    "matches a %s using its API endpoint and supplied secret",
    async (sourceKind) => {
      const account = buildDisplaySiteData({
        baseUrl: "https://dashboard.example.invalid",
        siteType:
          sourceKind === "service credential"
            ? SITE_TYPES.SHAREDCHAT
            : SITE_TYPES.OPENROUTER,
      })
      const baseUrl = "https://runtime.example.invalid/api/v1"
      const secret = "test-native-create-secret"
      const runtimeKey =
        sourceKind === "service credential"
          ? buildServiceCredentialRuntimeKey(account, {
              kind: "singleton_service_key",
              service: "codex",
              label: "Selected key",
              key: secret,
              baseUrl,
              isAuthenticated: true,
            })
          : {
              ...buildAccountKeyResourceRuntimeKey(account, {
                ref: {
                  accountId: account.id,
                  siteType: account.siteType,
                  scopeKey: "workspace-a",
                  resourceId: "opaque-key/7",
                },
                label: "Selected key",
                secret,
              }),
              baseUrl,
            }
      const managedSite = createManagedSiteCapabilitiesStub({
        channelDrafts: {
          prepareFormData: vi.fn(
            async (source: ManagedSiteChannelDraftSource) => ({
              name: source.name,
              type: 1,
              key: source.apiKey,
              base_url: source.baseUrl,
              models: ["gpt-4o"],
              groups: [],
              priority: 0,
              weight: 0,
              enabled: true,
            }),
          ),
        },
        matching: {
          search: vi.fn().mockResolvedValue({
            items: [
              buildManagedSiteChannel({
                id: 17,
                name: "Imported key",
                base_url: baseUrl,
                key: secret,
                models: "gpt-4o",
              }),
            ],
            total: 1,
            type_counts: {},
          }),
        },
      })

      const status = await getManagedSiteTokenChannelStatus({
        runtimeKey,
        managedSite,
      })

      expect(status).toMatchObject({
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
        matchedChannel: { id: 17, name: "Imported key" },
      })
      expect(managedSite.channelDrafts.prepareFormData).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl, apiKey: secret }),
        expect.anything(),
      )
      expect(resolveDisplayAccountRuntimeKeySecretMock).not.toHaveBeenCalled()
    },
  )

  it("maps incomplete match evidence instead of rejecting it before matching", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const searchChannel = vi.fn().mockResolvedValue({
      items: [
        buildManagedSiteChannel({
          id: 14,
          name: "Candidate requiring model comparison",
          base_url: "https://api.example.com",
          models: "gpt-4o",
          key: "test-token-key",
        }),
      ],
      total: 1,
      type_counts: {},
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          name: "Imported channel",
          type: 1,
          key: "test-token-key",
          base_url: "https://api.example.com",
          models: [],
          groups: [],
          priority: 0,
          weight: 0,
          enabled: true,
        }),
      },
      matching: { search: searchChannel },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
    })

    expect(searchChannel).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
      assessment: {
        url: { matched: true },
        key: { matched: true },
        models: {
          comparable: false,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED,
        },
      },
    })
  })

  it("returns not-added when exact comparison completes without a match", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [],
          total: 0,
          type_counts: {},
        }),
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
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
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
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
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
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
            resourceId: 23,
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
            resourceId: 23,
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
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
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
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
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
            resourceId: 23_1,
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
            resourceId: 23_1,
            name: "Managed Channel 23 Hidden Key",
          },
          similarityScore: 1,
        },
      },
      recovery: {
        siteType: "new-api",
        managedBaseUrl: "https://managed.example",
        searchBaseUrl: "https://api.example.com",
        loginCredentialsConfigured: true,
        authenticatedBrowserSessionExists: false,
        automaticCodeConfigured: true,
      },
    })
  })

  it("returns exact verification unavailable when candidate key hydration cannot resolve comparable keys", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedSiteChannel({
              id: 77,
              key: "",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o",
            }),
          ],
          total: 1,
          type_counts: {},
        }),
        hydrateComparableKeys: vi.fn(async () => {
          throw new MatchResolutionUnresolvedError(
            MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
          )
        }),
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
    })

    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
    })
  })

  it("uses a resolved hidden channel key for exact matching even when the list payload still masks it", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
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
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
      resolvedChannelKeysById: {
        23_1: "test-token-key",
      },
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 23_1,
        resourceId: 23_1,
        name: "Managed Channel 23 Hidden Key",
      },
      resolvedChannelKeysById: {
        23_1: "test-token-key",
      },
      assessment: {
        searchBaseUrl: "https://api.example.com",
        searchCompleted: true,
        url: {
          matched: true,
          candidateCount: 1,
          channel: {
            id: 23_1,
            resourceId: 23_1,
            name: "Managed Channel 23 Hidden Key",
          },
        },
        key: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
          channel: {
            id: 23_1,
            resourceId: 23_1,
            name: "Managed Channel 23 Hidden Key",
          },
        },
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
          channel: {
            id: 23_1,
            resourceId: 23_1,
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
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
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
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
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
            resourceId: 24,
            name: "Managed Channel 24",
          },
        },
        key: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
          channel: {
            id: 24,
            resourceId: 24,
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
    const managedSite = createManagedSiteCapabilitiesStub({
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          name: "Managed Channel",
          type: 1,
          key: "",
          base_url: "https://api.example.com",
          models: ["gpt-4o"],
          groups: ["default"],
          priority: 0,
          weight: 0,
          enabled: true,
        }),
      },
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [],
          total: 0,
          type_counts: {},
        }),
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
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
    expect(result).not.toHaveProperty("recovery")
  })

  it("degrades recovery metadata gracefully when the browser-session probe fails", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
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
      },
    })

    hasNewApiAuthenticatedBrowserSessionMock.mockRejectedValueOnce(
      new Error("session probe failed"),
    )

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
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
            resourceId: 23_1,
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
            resourceId: 23_1,
            name: "Managed Channel 23 Hidden Key",
          },
          similarityScore: 1,
        },
      },
    })
    expect(result).not.toHaveProperty("recovery")
  })

  it("returns unknown config-missing when managed-site admin config is unavailable", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const managedSite = createManagedSiteCapabilitiesStub({
      config: { get: vi.fn().mockResolvedValue(null) },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason: MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING,
    })
  })

  it("checks Veloera through the registered matching capability", async () => {
    const searchChannel = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, type_counts: {} })
    const managedSite = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.VELOERA,
      matching: { search: searchChannel },
    })
    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken(),
      ),
      managedSite,
    })
    expect(supportsManagedSiteBaseUrlChannelLookup(managedSite.siteType)).toBe(
      true,
    )
    expect(searchChannel).toHaveBeenCalledOnce()
    expect(result.status).toBe(MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED)
  })

  it("checks Claude Code Hub token channel status through base URL search", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const searchChannel = vi.fn().mockResolvedValue({
      items: [
        buildManagedSiteChannel({
          id: 42,
          name: "Claude Code Hub Provider",
          base_url: "https://api.example.com",
          key: "test-token-key",
          models: "gpt-4o",
        }),
      ],
      total: 1,
      type_counts: {},
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      matching: { search: searchChannel },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
    })

    expect(supportsManagedSiteBaseUrlChannelLookup(managedSite.siteType)).toBe(
      true,
    )
    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 42,
        name: "Claude Code Hub Provider",
      },
    })
    expect(searchChannel).toHaveBeenCalled()
  })

  it("resolves Claude Code Hub masked provider keys before token channel comparison", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("test-token-key")
    const searchChannel = vi.fn().mockResolvedValue({
      items: [
        buildManagedSiteChannel({
          id: 43,
          name: "Masked Claude Code Hub Provider",
          base_url: "https://api.example.com",
          key: "sk-***",
          models: "gpt-4o",
        }),
      ],
      total: 1,
      type_counts: {},
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      matching: {
        search: searchChannel,
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
      protectionBypassExecution: sessionResyncExecution,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      {
        baseUrl: "https://managed.example",
        adminToken: "managed-admin-token",
        userId: "1",
      },
      43,
      sessionResyncOptions,
    )
    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 43,
        name: "Masked Claude Code Hub Provider",
      },
    })
  })

  it("returns backend-search-failed without assessment when the backend search cannot complete", async () => {
    const account = buildDisplaySiteData({ baseUrl: "https://api.example.com" })
    const token = buildApiToken({ key: "test-token-key" })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: { search: vi.fn().mockResolvedValue(null) },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED,
    })
    expect(result).not.toHaveProperty("assessment")
  })

  it("redacts raw and formatted key values and admin secrets from failure diagnostics", async () => {
    const account = buildDisplaySiteData({
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://api.example.com",
    })
    const token = buildApiToken({ key: "secret-token-value" })
    const runtimeKey = formatAccountRuntimeKeySecretForSite(
      buildDisplayAccountTokenRuntimeKey(account, token),
    )
    const managedSite = createManagedSiteCapabilitiesStub({
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://managed.example",
          adminToken: "secret-admin-value",
          userId: "1",
        }),
      },
      channelDrafts: {
        prepareFormData: vi
          .fn()
          .mockRejectedValue(
            new Error(
              "secret-token-value sk-secret-token-value secret-admin-value exploded",
            ),
          ),
      },
    })

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey,
      managedSite,
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
    const managedSite = createManagedSiteCapabilitiesStub({
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://managed.example",
          adminToken: "secret-admin-value",
          userId: "1",
        }),
      },
    })

    resolveDisplayAccountRuntimeKeySecretMock.mockRejectedValueOnce(
      new Error("sk-abcd************wxyz secret-admin-value blocked"),
    )

    const result = await getManagedSiteTokenChannelStatus({
      runtimeKey: buildDisplayAccountTokenRuntimeKey(account, token),
      managedSite,
    })

    expect(result).toEqual({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      diagnostic: "[REDACTED] [REDACTED] blocked",
    })
    expect(result).not.toHaveProperty("recovery")
  })
})
