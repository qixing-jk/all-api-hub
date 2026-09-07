import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useChannelDialog,
  useChannelDialogContext,
} from "~/components/dialogs/ChannelDialog"
import { ChannelType } from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAccountKeyResourceRuntimeKey,
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import * as accountTokenOperations from "~/services/accounts/ensureAccountApiToken"
import * as tokenQuickCreateResolution from "~/services/accounts/tokenQuickCreateResolution"
import {
  TOKEN_QUICK_CREATE_RESOLUTION_KINDS,
  type DefaultTokenQuickCreateResolution,
} from "~/services/accounts/tokenQuickCreateResolution"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { MANAGED_RESOURCE_CREATE_SEED_KINDS } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { TOKEN_PROVISIONING_BLOCK_REASONS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import * as nativeResourceRegistry from "~/services/apiAdapters/managedResources/registry"
import * as managedSiteRegistry from "~/services/apiAdapters/registry"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelAssessment,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { matchingResourceRef } from "~~/tests/test-utils/managedResourceMatching"
import { createManagedSiteCapabilitiesStub } from "~~/tests/test-utils/managedSiteCapabilitiesFactory"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { mockToastLoading, mockToastDismiss, mockToastError } = vi.hoisted(
  () => ({
    mockToastLoading: vi.fn(),
    mockToastDismiss: vi.fn(),
    mockToastError: vi.fn(),
  }),
)
const { mockFetchAccountTokens, mockResolveApiTokenKey } = vi.hoisted(() => ({
  mockFetchAccountTokens: vi.fn(),
  mockResolveApiTokenKey: vi.fn(),
}))

const getManagedSiteCapabilitiesSpy = vi.spyOn(
  managedSiteRegistry,
  "getManagedSiteCapabilities",
)
const getAccountByIdSpy = vi.spyOn(accountQueries, "getAccountById")
const ensureAccountApiTokenSpy = vi.spyOn(
  accountTokenOperations,
  "ensureAccountApiToken",
)
const resolveDefaultTokenQuickCreateResolutionSpy = vi.spyOn(
  tokenQuickCreateResolution,
  "resolveDefaultTokenQuickCreateResolution",
)

const buildSelectionRequiredResolution =
  (): DefaultTokenQuickCreateResolution => ({
    kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
    allowedGroups: ["default", "vip"],
    suggestedGroup: "default",
    groups: {},
  })

const buildSiteAccount = (
  overrides: Partial<SiteAccount> = {},
): SiteAccount => ({
  id: "account-id",
  site_name: "Account",
  site_url: "https://upstream.example.com",
  health: {
    status: SiteHealthStatus.Healthy,
  },
  site_type: SITE_TYPES.NEW_API,
  exchange_rate: 7,
  account_info: {
    id: "1",
    access_token: "access-token",
    username: "user",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: 0,
  updated_at: 0,
  created_at: 1577836800,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
  ...overrides,
  user_updated_at: overrides.user_updated_at ?? overrides.updated_at ?? 0,
  excludeFromTodayIncome: overrides.excludeFromTodayIncome === true,
})

const buildDisplaySiteData = (
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData => ({
  id: "account-id",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://upstream.example.com",
  token: "access-token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
  ...overrides,
})

const buildApiToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: 1,
  user_id: 1,
  key: "token",
  status: 1,
  name: "Token",
  created_time: 0,
  accessed_time: 0,
  expired_time: 0,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  ...overrides,
})

const buildManagedResourceMatchCandidate = (
  overrides: Partial<ManagedResourceMatchCandidate> = {},
): ManagedResourceMatchCandidate => ({
  ref: matchingResourceRef(11, { scopeKey: "https://managed.example.com" }),
  name: "Existing channel",
  base_url: "https://upstream.example.com",
  models: "gpt-4",
  key: "sk-test",
  type: ChannelType.OpenAI,
  ...overrides,
})

const buildPreparedFormData = (
  overrides: Partial<
    ManagedSiteChannelDraft & { modelPrefillFetchFailed?: boolean }
  > = {},
) =>
  ({
    name: "Auto channel",
    type: ChannelType.OpenAI,
    key: "sk-test",
    base_url: "https://upstream.example.com",
    models: ["gpt-4"],
    groups: ["default"],
    priority: 0,
    weight: 0,
    enabled: true,
    ...overrides,
  }) satisfies ManagedSiteChannelDraft & { modelPrefillFetchFailed?: boolean }

const buildManagedSiteAssessment = (
  overrides: Partial<ManagedSiteTokenChannelAssessment> = {},
): ManagedSiteTokenChannelAssessment => {
  const matchedChannel = {
    ref: matchingResourceRef(11, { scopeKey: "https://managed.example.com" }),
    name: "Existing channel",
  }

  return {
    searchBaseUrl: "https://upstream.example.com",
    searchCompleted: true,
    url: {
      matched: true,
      candidateCount: 1,
      channel: matchedChannel,
      ...(overrides.url ?? {}),
    },
    key: {
      comparable: true,
      matched: false,
      reason: "no-match",
      ...(overrides.key ?? {}),
    },
    models: {
      comparable: true,
      matched: true,
      reason: "exact",
      channel: matchedChannel,
      similarityScore: 1,
      ...(overrides.models ?? {}),
    },
    ...overrides,
  }
}

const buildManagedSiteCapabilitiesMock = (
  overrides: NonNullable<
    Parameters<typeof createManagedSiteCapabilitiesStub>[0]
  > = {},
): ManagedSiteCapabilities =>
  createManagedSiteCapabilitiesStub({
    ...overrides,
    config: {
      get: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      })),
      ...overrides.config,
    },
    channelDrafts: {
      prepareFormData: vi.fn(async () => buildPreparedFormData()),
      ...overrides.channelDrafts,
    },
  })

const nativeOpenCreateEditorMock = vi.fn()

const renderChannelDialogHook = async () => {
  const rendered = renderHook(() => ({
    dialog: useChannelDialog(),
    context: useChannelDialogContext(),
  }))

  await waitFor(() => {
    expect(rendered.result.current).not.toBeNull()
  })

  return rendered
}

vi.mock("react-hot-toast", () => ({
  default: {
    loading: mockToastLoading,
    dismiss: mockToastDismiss,
    error: mockToastError,
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getManagedSiteCapabilities: vi.fn(),
  getSiteTypeCapabilities: () => ({
    managedSites: { matching: { search: vi.fn() } },
    account: {
      keyManagement: {
        fetchTokens: (...args: any[]) => mockFetchAccountTokens(...args),
        createToken: vi.fn(),
        resolveTokenKey: ({ request, token }: any) =>
          mockResolveApiTokenKey(request, token),
        deleteToken: vi.fn(),
        fetchUserGroups: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
    },
  }),
}))

describe("useChannelDialog", () => {
  let registrationSpy: { mockRestore: () => void } | undefined

  beforeEach(() => {
    vi.clearAllMocks()

    nativeOpenCreateEditorMock.mockImplementation(async (options: any) => ({
      fields: [],
      initialValues: { name: options.seed?.name ?? "Imported channel" },
      validate: vi.fn(() => ({ valid: true as const })),
      submit: vi.fn(),
    }))
    registrationSpy = vi
      .spyOn(nativeResourceRegistry, "getManagedResourceRegistration")
      .mockImplementation((siteType, kind) => {
        if (
          siteType !== SITE_TYPES.NEW_API &&
          siteType !== SITE_TYPES.SUB2API
        ) {
          return null
        }

        return {
          siteType,
          kind,
          createSeedKinds: [
            MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
          ],
          open: vi.fn(async () => ({
            capabilities: {
              canSearch: true,
              canCreate: true,
              canUpdate: true,
              canDelete: true,
            },
            list: vi.fn(),
            get: vi.fn(),
            openCreateEditor: nativeOpenCreateEditorMock,
            openEditEditor: vi.fn(),
            delete: vi.fn(),
          })),
        }
      })

    mockToastLoading.mockReturnValue("toast-id")
    getAccountByIdSpy.mockResolvedValue(buildSiteAccount())
    ensureAccountApiTokenSpy.mockImplementation(() => {
      throw new Error("ensureAccountApiToken should not be called in this test")
    })
    resolveDefaultTokenQuickCreateResolutionSpy.mockReset()
    mockFetchAccountTokens.mockReset()
    mockFetchAccountTokens.mockResolvedValue([])
    mockResolveApiTokenKey.mockReset()
    mockResolveApiTokenKey.mockImplementation(
      async (_request: unknown, token: { key: string }) => token.key,
    )
  })

  afterEach(() => {
    registrationSpy?.mockRestore()
    registrationSpy = undefined
  })

  it("shows warning and cancels when user does not continue", async () => {
    const existingChannel = buildManagedResourceMatchCandidate()
    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(
          async () =>
            ({
              name: "Auto channel",
              type: ChannelType.OpenAI,
              key: "sk-test",
              base_url: "https://upstream.example.com",
              models: ["gpt-4"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              enabled: true,
            }) satisfies ManagedSiteChannelDraft,
        ),
      },
      matching: {
        search: vi.fn(async () => ({
          items: [existingChannel],
          total: 1,
          type_counts: {},
        })),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
      buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken(),
      ),
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing channel",
      })
    })

    let openResult: Awaited<typeof openPromise> | undefined
    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(false)
      openResult = await openPromise
    })

    expect(openResult).toEqual({ opened: false })
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens AxonHub account imports with the native create editor projection", async () => {
    const editor = {
      fields: [],
      initialValues: {
        name: "Auto channel",
        type: "openai",
        baseURL: "https://upstream.example.com",
        status: "enabled",
        key: { kind: "replace" as const, value: "sk-test" },
        supportedModels: ["gpt-4"],
        manualModels: ["gpt-4"],
        defaultTestModel: "gpt-4",
        orderingWeight: 7,
      },
      validate: vi.fn(() => ({ valid: true as const })),
      submit: vi.fn(),
    }
    const openCreateEditor = vi.fn(async () => editor)
    const openRegistration = vi.fn(async () => ({
      capabilities: {
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      },
      list: vi.fn(),
      get: vi.fn(),
      openCreateEditor,
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }))
    registrationSpy = vi
      .spyOn(nativeResourceRegistry, "getManagedResourceRegistration")
      .mockReturnValue({
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        createSeedKinds: [
          MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        ],
        open: openRegistration,
      })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      buildManagedSiteCapabilitiesMock({
        siteType: SITE_TYPES.AXON_HUB,
        channelDrafts: {
          prepareFormData: vi.fn(async () =>
            buildPreparedFormData({
              type: "openai",
              weight: 7,
              enabled: true,
            }),
          ),
        },
      }) as ManagedSiteCapabilities,
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      )
    })

    expect(registrationSpy).toHaveBeenCalledWith(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
    )
    expect(openRegistration).toHaveBeenCalledOnce()
    expect(openCreateEditor).toHaveBeenCalledWith({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Auto channel",
        channelType: "openai",
        credential: "sk-test",
        baseUrl: "https://upstream.example.com",
        enabled: true,
        models: ["gpt-4"],
        orderingWeight: 7,
        priority: 0,
        notes: "",
      },
    })
    expect(result.current.context.state.nativeCreate).toMatchObject({
      siteType: SITE_TYPES.AXON_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      editor,
    })
  })

  it("does not open a native editor after its caller cancels while the editor loads", async () => {
    const editor = {
      fields: [],
      initialValues: { name: "Imported channel" },
      validate: vi.fn(() => ({ valid: true as const })),
      submit: vi.fn(),
    }
    const pendingEditor = createDeferred<typeof editor>()
    const openCreateEditor = vi.fn(() => pendingEditor.promise)
    registrationSpy = vi
      .spyOn(nativeResourceRegistry, "getManagedResourceRegistration")
      .mockReturnValue({
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        createSeedKinds: [
          MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        ],
        open: vi.fn(async () => ({
          capabilities: {
            canSearch: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true,
          },
          list: vi.fn(),
          get: vi.fn(),
          openCreateEditor,
          openEditEditor: vi.fn(),
          delete: vi.fn(),
        })),
      })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      buildManagedSiteCapabilitiesMock({
        siteType: SITE_TYPES.AXON_HUB,
      }) as ManagedSiteCapabilities,
    )
    let shouldContinue = true
    const { result } = await renderChannelDialogHook()

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
      buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken(),
      ),
      undefined,
      { shouldContinue: () => shouldContinue },
    )
    await waitFor(() => expect(openCreateEditor).toHaveBeenCalledOnce())

    shouldContinue = false
    let openResult: Awaited<typeof openPromise> | undefined
    await act(async () => {
      pendingEditor.resolve(editor)
      openResult = await openPromise
    })

    expect(openResult).toEqual({ opened: false })
    expect(result.current.context.state.isOpen).toBe(false)
    expect(result.current.context.state.nativeCreate).toBeUndefined()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("reports unavailable import support without opening a dialog", async () => {
    registrationSpy = vi
      .spyOn(nativeResourceRegistry, "getManagedResourceRegistration")
      .mockReturnValue(null)
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      buildManagedSiteCapabilitiesMock({
        siteType: SITE_TYPES.AXON_HUB,
      }) as ManagedSiteCapabilities,
    )
    const { result } = await renderChannelDialogHook()

    let openResult: Awaited<
      ReturnType<typeof result.current.dialog.openWithAccount>
    >
    await act(async () => {
      openResult = await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      )
    })

    expect(openResult!).toEqual({ opened: false })
    expect(result.current.context.state.isOpen).toBe(false)
    expect(result.current.context.state.nativeCreate).toBeUndefined()
    expect(mockToastError).toHaveBeenCalled()
  })

  it("shows duplicate channel warning from migrated resource candidates", async () => {
    const mockService = buildManagedSiteCapabilitiesMock({
      matching: {
        search: vi.fn(async () => ({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(81, {
                scopeKey: "https://managed.example.com",
              }),
              name: "Resource duplicate channel",
            }),
          ],
          total: 1,
          type_counts: {},
        })),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = await renderChannelDialogHook()

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
      buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken(),
      ),
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Resource duplicate channel",
      })
    })

    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(false)
      await openPromise
    })

    expect(mockService.matching.search).toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("opens ChannelDialog when user continues despite duplicate", async () => {
    const existingChannel = buildManagedResourceMatchCandidate()
    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(
          async () =>
            ({
              name: "Auto channel",
              type: ChannelType.OpenAI,
              key: "sk-test",
              base_url: "https://upstream.example.com",
              models: ["gpt-4"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              enabled: true,
            }) satisfies ManagedSiteChannelDraft,
        ),
      },
      matching: {
        search: vi.fn(async () => ({
          items: [existingChannel],
          total: 1,
          type_counts: {},
        })),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    const openPromise = result.current.dialog.openWithAccount(
      buildSiteAccount(),
      buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken(),
      ),
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing channel",
      })
    })

    let openResult: Awaited<typeof openPromise> | undefined
    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(true)
      openResult = await openPromise
    })

    expect(openResult).toEqual({ opened: true })
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: expect.objectContaining({
        editor: expect.objectContaining({
          initialValues: { name: "Auto channel" },
        }),
      }),
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("does not ensure or create a token when openWithAccount receives a token", async () => {
    const providedToken = buildApiToken({
      id: 123,
      key: "sk-provided-token",
    })
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(buildSiteAccount())

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          providedToken,
        ),
      )
    })

    expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(prepareChannelFormDataMock).toHaveBeenCalledWith({
      name: "Account | Token (auto)",
      baseUrl: "https://upstream.example.com",
      apiKey: providedToken.key,
      modelHints: [],
    })
    expect(result.current.context.state.isOpen).toBe(true)
  })

  it.each(["service credential", "native key"])(
    "imports a %s with its own API endpoint and supplied secret",
    async (sourceKind) => {
      const account = buildDisplaySiteData({
        baseUrl: "https://dashboard.example.invalid",
        siteType:
          sourceKind === "service credential"
            ? SITE_TYPES.SHAREDCHAT
            : SITE_TYPES.OPENROUTER,
      })
      const baseUrl = "http://gateway.lan:3000/api/v1"
      const secret = "test-create-response-secret"
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
      getManagedSiteCapabilitiesSpy.mockReturnValue(
        buildManagedSiteCapabilitiesMock({
          channelDrafts: {
            prepareFormData: vi.fn(
              async (source: ManagedSiteChannelDraftSource) =>
                buildPreparedFormData({
                  name: source.name,
                  key: source.apiKey,
                  base_url: source.baseUrl,
                }),
            ),
          },
        }),
      )
      const { result } = await renderChannelDialogHook()

      await act(async () => {
        expect(
          await result.current.dialog.openWithAccount(account, runtimeKey),
        ).toEqual({ opened: true })
      })

      expect(nativeOpenCreateEditorMock).toHaveBeenCalledWith({
        seed: expect.objectContaining({
          name: "Account | Selected key (auto)",
          baseUrl,
          credential: secret,
        }),
      })
      expect(result.current.context.state.isOpen).toBe(true)
      expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
      expect(mockFetchAccountTokens).not.toHaveBeenCalled()
      expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    },
  )

  it("opens ChannelDialog when New API exact duplicate verification is unavailable", async () => {
    const hiddenKeyChannel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(22, { scopeKey: "https://managed.example.com" }),
      key: "",
    })
    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(
          async () =>
            ({
              name: "Auto channel",
              type: ChannelType.OpenAI,
              key: "sk-test",
              base_url: "https://upstream.example.com",
              models: ["gpt-4"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              enabled: true,
            }) satisfies ManagedSiteChannelDraft,
        ),
      },
      matching: {
        search: vi.fn(async () => ({
          items: [hiddenKeyChannel],
          total: 1,
          type_counts: {},
        })),
        hydrateComparableKeys: vi.fn(async () => {
          throw new MatchResolutionUnresolvedError(
            MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
          )
        }),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      )
    })

    expect(result.current.context.duplicateChannelWarning).toEqual({
      isOpen: false,
      existingChannelName: null,
    })
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: expect.objectContaining({
        editor: expect.objectContaining({
          initialValues: { name: "Auto channel" },
        }),
        advisoryWarning: expect.objectContaining({
          kind: "verificationRequired",
        }),
      }),
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens a Sub2API native editor with a verification advisory when key comparison requires verification", async () => {
    const hiddenKeyChannel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(23, {
        siteType: SITE_TYPES.SUB2API,
        scopeKey: "https://managed.example.com",
      }),
      key: "",
    })
    const editor = {
      fields: [],
      initialValues: { name: "Auto channel" },
      validate: vi.fn(() => ({ valid: true as const })),
      submit: vi.fn(),
    }
    registrationSpy = vi
      .spyOn(nativeResourceRegistry, "getManagedResourceRegistration")
      .mockReturnValue({
        siteType: SITE_TYPES.SUB2API,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        createSeedKinds: [
          MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        ],
        open: vi.fn(async () => ({
          capabilities: {
            canSearch: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true,
          },
          list: vi.fn(),
          get: vi.fn(),
          openCreateEditor: vi.fn(async () => editor),
          openEditEditor: vi.fn(),
          delete: vi.fn(),
        })),
      })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      buildManagedSiteCapabilitiesMock({
        siteType: SITE_TYPES.SUB2API,
        matching: {
          search: vi.fn(async () => ({
            items: [hiddenKeyChannel],
            total: 1,
            type_counts: {},
          })),
          hydrateComparableKeys: vi.fn(async () => {
            throw new MatchResolutionUnresolvedError(
              MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
            )
          }),
        },
      }) as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
          buildApiToken(),
        ),
      )
    })

    expect(result.current.context.state.nativeCreate).toMatchObject({
      siteType: SITE_TYPES.SUB2API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      editor,
      advisoryWarning: {
        kind: "verificationRequired",
        title: "channelDialog:warnings.verificationRequired.title",
        description: "channelDialog:warnings.verificationRequired.description",
      },
    })
  })

  it("opens ChannelDialog with a prefill warning when the provider marks model preload as failed", async () => {
    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(
          async () =>
            ({
              name: "Auto channel",
              type: ChannelType.OpenAI,
              key: "sk-test",
              base_url: "https://upstream.example.com",
              models: [],
              modelPrefillFetchFailed: true,
              groups: ["default"],
              priority: 0,
              weight: 0,
              enabled: true,
            }) satisfies ManagedSiteChannelDraft,
        ),
      },
      matching: {
        search: vi.fn(async () => ({
          items: [],
          total: 0,
          type_counts: {},
        })),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      )
    })

    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: expect.objectContaining({ showModelPrefillWarning: true }),
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("does not show a prefill warning for an intentionally empty model list", async () => {
    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(
          async () =>
            ({
              name: "Auto channel",
              type: ChannelType.OpenAI,
              key: "sk-test",
              base_url: "https://upstream.example.com",
              models: [],
              groups: ["default"],
              priority: 0,
              weight: 0,
              enabled: true,
            }) satisfies ManagedSiteChannelDraft,
        ),
      },
      matching: {
        search: vi.fn(async () => ({
          items: [],
          total: 0,
          type_counts: {},
        })),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      )
    })

    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: expect.objectContaining({ showModelPrefillWarning: false }),
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens the global Sub2API token dialog when multiple groups are available", async () => {
    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: { prepareFormData: vi.fn() },
      matching: { search: vi.fn() },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "sub2api" }),
    )
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: "sub2api" }),
        null,
      )
    })

    expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
      isOpen: true,
      allowedGroups: ["default", "vip"],
      notice: "messages:tokenProvisioning.createRequiresGroupSelection",
    })
    expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("resumes the Sub2API token ensure flow after the token dialog succeeds", async () => {
    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(
          async () =>
            ({
              name: "Auto channel",
              type: ChannelType.OpenAI,
              key: "sk-test",
              base_url: "https://upstream.example.com",
              models: ["gpt-4"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              enabled: true,
            }) satisfies ManagedSiteChannelDraft,
        ),
      },
      matching: {
        search: vi.fn(async () => ({
          items: [],
          total: 0,
          type_counts: {},
        })),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "sub2api" }),
    )
    mockFetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([buildApiToken()])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: "sub2api" }),
        null,
      )
    })

    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      true,
    )

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess()
    })

    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      false,
    )
    expect(resolveDefaultTokenQuickCreateResolutionSpy).toHaveBeenCalledTimes(1)
    expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
  })

  it("ensures a token with full generic quick-create token data", async () => {
    const policyTokenData = {
      name: "Channel Policy Token",
      remain_quota: 65432,
      expired_time: -1,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "ops",
    }
    const createdToken = buildApiToken({ id: 30, key: "sk-created" })

    const mockService = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn(async () => ({
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(async () =>
          buildPreparedFormData({
            key: createdToken.key,
          }),
        ),
      },
      matching: {
        search: vi.fn(async () => ({
          items: [],
          total: 0,
          type_counts: {},
        })),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "new-api" }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: policyTokenData,
    })
    ensureAccountApiTokenSpy.mockResolvedValueOnce(createdToken)
    mockResolveApiTokenKey.mockResolvedValueOnce(createdToken)

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: "new-api" }),
        null,
      )
    })

    expect(resolveDefaultTokenQuickCreateResolutionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ siteType: "new-api" }),
    )
    expect(ensureAccountApiTokenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ site_type: "new-api" }),
      expect.objectContaining({ siteType: "new-api" }),
      expect.objectContaining({
        toastId: "toast-id",
        defaultTokenData: policyTokenData,
      }),
    )
  })

  it("surfaces blocked default-token creation while opening from an account", async () => {
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      siteType: SITE_TYPES.SUB2API,
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      message: "No valid upstream groups are available",
    })

    const { result } = await renderChannelDialogHook()

    let openResult: Awaited<
      ReturnType<typeof result.current.dialog.openWithAccount>
    > | null = null
    await act(async () => {
      openResult = await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        null,
      )
    })

    expect(openResult).toEqual({ opened: false })
    expect(mockToastError).toHaveBeenCalledWith(
      "No valid upstream groups are available",
      { id: "toast-id" },
    )
    expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("cancels account opening when the caller continuation guard cancels after quick-create resolution", async () => {
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    let shouldContinueCalls = 0
    const { result } = await renderChannelDialogHook()

    let openResult: Awaited<
      ReturnType<typeof result.current.dialog.openWithAccount>
    > | null = null
    await act(async () => {
      openResult = await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        null,
        undefined,
        {
          shouldContinue: () => {
            shouldContinueCalls += 1
            return shouldContinueCalls < 2
          },
        },
      )
    })

    expect(openResult).toEqual({ opened: false })
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      false,
    )
    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("resumes Sub2API channel opening with the single new refetched token when AddTokenDialog does not return one", async () => {
    const existingToken = buildApiToken({
      id: 3,
      key: "sk-existing-3",
      name: "Existing token",
    })
    const createdToken = buildApiToken({
      id: 11,
      key: "sk-created-11",
      name: "Created token",
    })
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      siteType: SITE_TYPES.SUB2API,
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "sub2api" }),
    )
    mockFetchAccountTokens
      .mockResolvedValueOnce([existingToken, undefined] as ApiToken[])
      .mockResolvedValueOnce([createdToken, existingToken])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: "sub2api" }),
        null,
      )
    })

    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      true,
    )

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess()
    })

    expect(prepareChannelFormDataMock).toHaveBeenCalledWith({
      name: "Account | Created token (auto)",
      baseUrl: "https://upstream.example.com",
      apiKey: createdToken.key,
      modelHints: [],
    })
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: {
        siteType: SITE_TYPES.SUB2API,
      },
    })
    expect(nativeOpenCreateEditorMock).toHaveBeenLastCalledWith({
      seed: expect.objectContaining({ credential: createdToken.key }),
    })
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("resumes Sub2API channel opening with a token returned from AddTokenDialog", async () => {
    const createdToken = buildApiToken({
      id: 11,
      key: "sk-created-11",
      name: "Created token",
    })
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      siteType: SITE_TYPES.SUB2API,
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        null,
      )
    })

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess(
        createdToken,
      )
    })

    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(prepareChannelFormDataMock).toHaveBeenCalledWith({
      name: "Account | Created token (auto)",
      baseUrl: "https://upstream.example.com",
      apiKey: createdToken.key,
      modelHints: [],
    })
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: {
        siteType: SITE_TYPES.SUB2API,
      },
    })
    expect(nativeOpenCreateEditorMock).toHaveBeenLastCalledWith({
      seed: expect.objectContaining({ credential: createdToken.key }),
    })
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("ignores late Sub2API token success after the dialog was closed", async () => {
    const createdToken = buildApiToken({
      id: 11,
      key: "sk-created-11",
      name: "Created token",
    })
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "sub2api" }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = await renderChannelDialogHook()

    let openResult: Awaited<
      ReturnType<typeof result.current.dialog.openWithAccount>
    > | null = null
    await act(async () => {
      openResult = await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: "sub2api" }),
        null,
      )
    })

    expect(openResult).toEqual({ opened: false, deferred: true })
    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      true,
    )

    act(() => {
      result.current.context.closeDefaultTokenQuickCreateDialog()
    })

    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      false,
    )

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess(
        createdToken,
      )
    })

    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("ignores stale Sub2API token success from session A immediately after session B opens", async () => {
    const createdToken = buildApiToken({
      id: 21,
      key: "sk-created-21",
      name: "Created token",
    })
    const sessionAOnSuccess = vi.fn()
    const sessionBOnSuccess = vi.fn()
    const sessionAAccount = buildDisplaySiteData({
      id: "account-a",
      name: "Account A",
      siteType: "sub2api",
    })
    const sessionBAccount = buildDisplaySiteData({
      id: "account-b",
      name: "Account B",
      siteType: "sub2api",
    })
    const { result } = await renderChannelDialogHook()

    act(() => {
      result.current.context.openDefaultTokenQuickCreateDialog({
        account: sessionAAccount,
        allowedGroups: ["default"],
        onSuccess: sessionAOnSuccess,
      })
    })

    expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
      isOpen: true,
      account: sessionAAccount,
      allowedGroups: ["default"],
    })

    const sessionASuccessHandler =
      result.current.context.handleDefaultTokenQuickCreateSuccess

    await act(async () => {
      result.current.context.closeDefaultTokenQuickCreateDialog()
      result.current.context.openDefaultTokenQuickCreateDialog({
        account: sessionBAccount,
        allowedGroups: ["vip"],
        onSuccess: sessionBOnSuccess,
      })
      await sessionASuccessHandler(createdToken)
    })

    expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
      isOpen: true,
      account: sessionBAccount,
      allowedGroups: ["vip"],
    })
    expect(result.current.context.state.isOpen).toBe(false)
    expect(sessionAOnSuccess).not.toHaveBeenCalled()
    expect(sessionBOnSuccess).not.toHaveBeenCalled()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("fails closed when Sub2API token refetch cannot identify a single new token after dialog success", async () => {
    const existingToken = buildApiToken({
      id: 3,
      key: "sk-existing-3",
      name: "Existing token",
    })
    const ambiguousTokenA = buildApiToken({
      id: 11,
      key: "sk-created-11",
      name: "Created token A",
    })
    const ambiguousTokenB = buildApiToken({
      id: 12,
      key: "sk-created-12",
      name: "Created token B",
    })
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "sub2api" }),
    )
    mockFetchAccountTokens
      .mockResolvedValueOnce([existingToken, undefined] as ApiToken[])
      .mockResolvedValueOnce([existingToken, ambiguousTokenA, ambiguousTokenB])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: "sub2api" }),
        null,
      )
    })

    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      true,
    )

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess()
    })

    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith(
      "messages:accountOperations.createTokenFailed",
    )
  })

  it("fails closed when Sub2API token refetch returns a non-array after dialog success", async () => {
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([]).mockResolvedValueOnce(null)
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        null,
      )
    })

    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      true,
    )

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess()
    })

    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith(
      "messages:accountOperations.createTokenFailed",
    )
  })

  it("cancels deferred Sub2API resume before using a returned created token", async () => {
    const createdToken = buildApiToken({
      id: 11,
      key: "sk-created-11",
      name: "Created token",
    })
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    let shouldContinue = true
    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        null,
        undefined,
        { shouldContinue: () => shouldContinue },
      )
    })

    shouldContinue = false

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess(
        createdToken,
      )
    })

    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("cancels deferred Sub2API resume before refetching tokens", async () => {
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    let shouldContinueCalls = 0
    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        null,
        undefined,
        {
          shouldContinue: () => {
            shouldContinueCalls += 1
            return shouldContinueCalls < 4
          },
        },
      )
    })

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess()
    })

    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("cancels deferred Sub2API resume after refetching tokens but before recovery", async () => {
    const existingToken = buildApiToken({
      id: 3,
      key: "sk-existing-3",
      name: "Existing token",
    })
    const createdToken = buildApiToken({
      id: 11,
      key: "sk-created-11",
      name: "Created token",
    })
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    mockFetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdToken, existingToken])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    let shouldContinueCalls = 0
    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
        null,
        undefined,
        {
          shouldContinue: () => {
            shouldContinueCalls += 1
            return shouldContinueCalls < 5
          },
        },
      )
    })

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess()
    })

    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
    expect(prepareChannelFormDataMock).not.toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("does not open the Sub2API quick-create dialog when tokens already exist", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([buildApiToken()])

    const { result } = await renderChannelDialogHook()

    let didOpen = false
    await act(async () => {
      didOpen =
        await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
          buildDisplaySiteData({ siteType: "sub2api" }),
        )
    })

    expect(didOpen).toBe(false)
    expect(resolveDefaultTokenQuickCreateResolutionSpy).not.toHaveBeenCalled()
    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      false,
    )
  })

  it("surfaces blocked Sub2API quick-create resolutions without opening the dialog", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      message: "No valid upstream groups are available",
    })

    const { result } = await renderChannelDialogHook()

    let didOpen = true
    await act(async () => {
      didOpen =
        await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
          buildDisplaySiteData({ siteType: "sub2api" }),
        )
    })

    expect(didOpen).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith(
      "No valid upstream groups are available",
    )
    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      false,
    )
  })

  it("opens the Sub2API quick-create dialog with the default notice and resumes the caller callback", async () => {
    const onSuccess = vi.fn(async () => {})

    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce(
      buildSelectionRequiredResolution(),
    )

    const { result } = await renderChannelDialogHook()

    let didOpen = false
    await act(async () => {
      didOpen =
        await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
          buildDisplaySiteData({ siteType: "sub2api" }),
          { onSuccess },
        )
    })

    expect(didOpen).toBe(true)
    expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
      isOpen: true,
      allowedGroups: ["default", "vip"],
      notice: "messages:tokenProvisioning.createRequiresGroupSelection",
    })

    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess()
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("opens the Sub2API quick-create dialog with a resolved single group and preserves a custom notice", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: {
        name: "Default token",
        remain_quota: 500000,
        expired_time: -1,
        unlimited_quota: false,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        group: "ops",
      },
    })

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
        buildDisplaySiteData({ siteType: "sub2api" }),
        { notice: "Use the audited group" },
      )
    })

    expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
      isOpen: true,
      allowedGroups: ["ops"],
      notice: "Use the audited group",
    })
  })

  it("shows feedback when a resolved quick-create group is empty", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: {
        name: "Default token",
        remain_quota: 500000,
        expired_time: -1,
        unlimited_quota: false,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        group: "   ",
      },
    })

    const { result } = await renderChannelDialogHook()

    let didOpen = true
    await act(async () => {
      didOpen =
        await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
          buildDisplaySiteData({ siteType: "sub2api" }),
        )
    })

    expect(didOpen).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith(
      "messages:tokenProvisioning.createRequiresGroup",
    )
    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      false,
    )
  })

  it("shows an operation failure toast when the account details cannot be loaded", async () => {
    getAccountByIdSpy.mockResolvedValueOnce(null)

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      )
    })

    expect(getManagedSiteCapabilitiesSpy).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith(expect.any(String), {
      id: "toast-id",
    })
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("shows the managed-site configuration error and aborts opening from an account", async () => {
    const mockService = buildManagedSiteCapabilitiesMock({
      config: { get: vi.fn(async () => null) },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
      )
    })

    expect(mockToastError).toHaveBeenCalledWith(expect.any(String), {
      id: "toast-id",
    })
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("uses an explicit managed-site duplicate status without re-running channel search", async () => {
    const searchChannelMock = vi.fn(async () => ({
      items: [buildManagedResourceMatchCandidate()],
      total: 1,
      type_counts: {},
    }))
    const mockService = buildManagedSiteCapabilitiesMock({
      matching: { search: searchChannelMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        ref: matchingResourceRef(11, {
          scopeKey: "https://managed.example.com",
        }),
        name: "Existing channel",
      },
      assessment: buildManagedSiteAssessment(),
    }

    const { result } = await renderChannelDialogHook()

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
      buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken(),
      ),
      undefined,
      { managedSiteStatus },
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing channel",
      })
    })

    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(false)
      await openPromise
    })

    expect(searchChannelMock).not.toHaveBeenCalled()
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("rechecks a non-terminal cached status before opening an import", async () => {
    const searchChannelMock = vi.fn(async () => ({
      items: [
        buildManagedResourceMatchCandidate({
          ref: matchingResourceRef(11, {
            siteType: SITE_TYPES.SUB2API,
            scopeKey: "https://managed.example.com",
          }),
          name: "Existing API-key account",
          models: "",
        }),
      ],
      total: 1,
      type_counts: {},
    }))
    const mockService = buildManagedSiteCapabilitiesMock({
      siteType: SITE_TYPES.SUB2API,
      channelDrafts: {
        prepareFormData: vi.fn(async () =>
          buildPreparedFormData({ models: [], groups: [] }),
        ),
      },
      matching: { search: searchChannelMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED,
      diagnostic: "missing-comparable-inputs",
    }
    const { result } = await renderChannelDialogHook()

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
      buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken({ key: "sk-test" }),
      ),
      undefined,
      { managedSiteStatus },
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing API-key account",
      })
    })

    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(false)
      await openPromise
    })

    expect(searchChannelMock).toHaveBeenCalledOnce()
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("refreshes a cached review advisory before opening", async () => {
    const searchChannelMock = vi.fn(async () => ({
      items: [buildManagedResourceMatchCandidate({ key: "different-key" })],
      total: 1,
      type_counts: {},
    }))
    const mockService = buildManagedSiteCapabilitiesMock({
      matching: { search: searchChannelMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
      assessment: buildManagedSiteAssessment(),
    }

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
        undefined,
        { managedSiteStatus },
      )
    })

    expect(searchChannelMock).toHaveBeenCalledOnce()
    expect(result.current.context.duplicateChannelWarning.isOpen).toBe(false)
    expect(result.current.context.state.isOpen).toBe(true)
    expect(result.current.context.state.nativeCreate).toMatchObject({
      siteType: SITE_TYPES.NEW_API,
      advisoryWarning: {
        kind: "reviewSuggested",
        title: "channelDialog:warnings.reviewSuggested.title",
        description: "channelDialog:warnings.reviewSuggested.description",
      },
    })
  })

  it("refreshes a cached verification advisory before opening", async () => {
    const searchChannelMock = vi.fn(async () => ({
      items: [buildManagedResourceMatchCandidate({ key: "" })],
      total: 1,
      type_counts: {},
    }))
    const mockService = buildManagedSiteCapabilitiesMock({
      matching: {
        search: searchChannelMock,
        hydrateComparableKeys: vi.fn(async () => {
          throw new MatchResolutionUnresolvedError(
            MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
          )
        }),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      assessment: buildManagedSiteAssessment({
        key: {
          comparable: false,
          matched: false,
          reason: "comparison-unavailable",
        },
      }),
    }

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildDisplayAccountTokenRuntimeKey(
          buildDisplaySiteData(),
          buildApiToken(),
        ),
        undefined,
        { managedSiteStatus },
      )
    })

    expect(searchChannelMock).toHaveBeenCalledOnce()
    expect(result.current.context.state.nativeCreate).toMatchObject({
      siteType: SITE_TYPES.NEW_API,
      advisoryWarning: {
        kind: "verificationRequired",
        title: "channelDialog:warnings.verificationRequired.title",
        description: "channelDialog:warnings.verificationRequired.description",
      },
    })
  })

  it("falls back to ensuring an account token when token discovery returns an unexpected payload", async () => {
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) =>
        buildPreparedFormData({
          key: source.apiKey,
        }),
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )
    mockFetchAccountTokens.mockResolvedValueOnce({ items: [] })
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: {
        name: "Default token",
        remain_quota: 500000,
        expired_time: -1,
        unlimited_quota: false,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        group: "",
      },
    })
    ensureAccountApiTokenSpy.mockResolvedValueOnce(
      buildApiToken({
        key: "ensured-token",
      }),
    )

    const onSuccess = vi.fn()
    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        null,
        onSuccess,
      )
    })

    expect(ensureAccountApiTokenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "account-id",
      }),
      expect.objectContaining({
        id: "account-id",
      }),
      expect.objectContaining({
        toastId: "toast-id",
      }),
    )
    expect(prepareChannelFormDataMock).toHaveBeenCalledWith({
      name: "Account | Token (auto)",
      baseUrl: "https://upstream.example.com",
      apiKey: "sk-ensured-token",
      modelHints: [],
    })
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: {
        siteType: SITE_TYPES.NEW_API,
      },
    })
    expect(nativeOpenCreateEditorMock).toHaveBeenLastCalledWith({
      seed: expect.objectContaining({ credential: "sk-ensured-token" }),
    })

    await act(async () => {
      result.current.context.handleSuccess({
        success: true,
        message: "saved",
      })
    })

    expect(onSuccess).toHaveBeenCalledWith({
      success: true,
      message: "saved",
    })
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("returns closed without opening when the caller continuation guard cancels before dialog open", async () => {
    let releasePrepare: (() => void) | undefined
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) => {
        await new Promise<void>((resolve) => {
          releasePrepare = resolve
        })

        return buildPreparedFormData({
          key: source.apiKey,
        })
      },
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    let shouldContinue = true
    const { result } = await renderChannelDialogHook()

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
      buildDisplayAccountTokenRuntimeKey(
        buildDisplaySiteData(),
        buildApiToken(),
      ),
      undefined,
      {
        shouldContinue: () => shouldContinue,
      },
    )

    await waitFor(() => {
      expect(prepareChannelFormDataMock).toHaveBeenCalledTimes(1)
    })

    shouldContinue = false

    let openResult: Awaited<typeof openPromise> | undefined
    await act(async () => {
      releasePrepare?.()
      openResult = await openPromise
    })

    expect(openResult).toEqual({ opened: false })
    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("shows a duplicate warning when opening from raw credentials and aborts on cancel", async () => {
    const existingChannel = buildManagedResourceMatchCandidate({
      key: "sk-credential",
    })
    const mockService = buildManagedSiteCapabilitiesMock({
      matching: {
        search: vi.fn(async () => ({
          items: [existingChannel],
          total: 1,
          type_counts: {},
        })),
      },
      channelDrafts: {
        prepareFormData: vi.fn(async () =>
          buildPreparedFormData({
            key: "sk-credential",
          }),
        ),
      },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = await renderChannelDialogHook()

    const openPromise = result.current.dialog.openWithCredentials({
      name: "Saved credential",
      baseUrl: "https://upstream.example.com",
      apiKey: "sk-credential",
    })

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing channel",
      })
    })

    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(false)
      await openPromise
    })

    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("shows the managed-site configuration error and aborts opening from raw credentials", async () => {
    const mockService = buildManagedSiteCapabilitiesMock({
      config: { get: vi.fn(async () => null) },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithCredentials({
        name: "Saved credential",
        baseUrl: "https://upstream.example.com",
        apiKey: "sk-credential",
      })
    })

    expect(mockToastError).toHaveBeenCalledWith(expect.any(String), {
      id: "toast-id",
    })
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("opens from raw credentials and forwards the caller success callback", async () => {
    const prepareChannelFormDataMock = vi.fn(
      async (source: ManagedSiteChannelDraftSource) => {
        expect(source).toEqual({
          name: "Saved credential | Saved credential (auto)",
          baseUrl: "https://upstream.example.com",
          apiKey: "sk-credential",
          modelHints: [],
        })
        return buildPreparedFormData({
          key: source.apiKey,
          base_url: source.baseUrl,
        })
      },
    )
    const mockService = buildManagedSiteCapabilitiesMock({
      channelDrafts: { prepareFormData: prepareChannelFormDataMock },
    })
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      mockService as ManagedSiteCapabilities,
    )

    const onSuccess = vi.fn()
    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithCredentials(
        {
          name: "Saved credential",
          baseUrl: "https://upstream.example.com",
          apiKey: "sk-credential",
        },
        onSuccess,
      )
    })

    expect(prepareChannelFormDataMock).toHaveBeenCalledTimes(1)
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: {
        siteType: SITE_TYPES.NEW_API,
      },
    })
    expect(nativeOpenCreateEditorMock).toHaveBeenLastCalledWith({
      seed: expect.objectContaining({
        credential: "sk-credential",
        baseUrl: "https://upstream.example.com",
        models: ["gpt-4"],
      }),
    })

    await act(async () => {
      result.current.context.handleSuccess({
        success: true,
        message: "credential saved",
      })
    })

    expect(onSuccess).toHaveBeenCalledWith({
      success: true,
      message: "credential saved",
    })
    expect(result.current.context.state.isOpen).toBe(false)
  })
})
