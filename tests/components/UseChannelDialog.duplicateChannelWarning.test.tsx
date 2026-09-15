import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useChannelDialog,
  useChannelDialogContext,
} from "~/components/dialogs/ChannelDialog"
import {
  ChannelType,
  NEW_API_MANAGED_RESOURCE_FIELD_IDS,
} from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import * as accountKeyCreation from "~/services/accounts/accountKeyCreation"
import {
  buildAccountKeyResourceRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createUnattributedAccountCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { MANAGED_RESOURCE_CREATE_SEED_KINDS } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { createNewApiCreateEditor } from "~/services/apiAdapters/managedResources/newApiEditor"
import * as nativeResourceRegistry from "~/services/apiAdapters/managedResources/registry"
import * as managedSiteRegistry from "~/services/apiAdapters/registry"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { resolveDefaultChannelGroups } from "~/services/managedSites/providers/defaultChannelGroups"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelAssessment,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import {
  buildNewApiKeyCreationResult,
  buildNewApiRuntimeKey,
} from "~~/tests/test-utils/accountKeyFixtures"
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
const { mockFetchAccountTokens, mockResolveRuntimeKeySecret } = vi.hoisted(
  () => ({
    mockFetchAccountTokens: vi.fn(),
    mockResolveRuntimeKeySecret: vi.fn(),
  }),
)

const getManagedSiteCapabilitiesSpy = vi.spyOn(
  managedSiteRegistry,
  "getManagedSiteCapabilities",
)
const getAccountByIdSpy = vi.spyOn(accountQueries, "getAccountById")
const ensureAccountKeySpy = vi.spyOn(accountKeyCreation, "ensureAccountKey")

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

const buildNewApiToken = (
  overrides: Partial<NewApiToken> = {},
): NewApiToken => ({
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

vi.mock("~/lib/notify", () => ({
  default: {
    loading: mockToastLoading,
    dismiss: mockToastDismiss,
    error: mockToastError,
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getManagedSiteCapabilities: vi.fn(),
  getSiteTypeCapabilities: (siteType: string) => ({
    managedSites: { matching: { search: vi.fn() } },
    account: {
      keyResourceManagement: {
        defaultCreation: "editor-defaults",
        inventorySecretAvailability:
          siteType === SITE_TYPES.OPENROUTER
            ? "create-response-only"
            : "recoverable",
      },
    },
  }),
}))
vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    const { buildNewApiRuntimeKey } = await import(
      "~~/tests/test-utils/accountKeyFixtures"
    )
    const { formatAccountRuntimeKeySecretForSite } = await import(
      "~/services/accounts/accountRuntimeKeys"
    )
    return {
      ...actual,
      fetchDisplayAccountRuntimeKeys: async (account: DisplaySiteData) => {
        const inventory = await mockFetchAccountTokens(account)
        if (!Array.isArray(inventory))
          throw new AccountKeyResourceError({ code: "unexpected" })
        return inventory.map((token) => buildNewApiRuntimeKey(account, token))
      },
      resolveDisplayAccountRuntimeKeySecret: async (
        account: DisplaySiteData,
        runtimeKey: any,
        options: any,
      ) => {
        if (
          account.siteType === SITE_TYPES.OPENROUTER ||
          runtimeKey.source === "service_credential"
        )
          return actual.resolveDisplayAccountRuntimeKeySecret(
            account,
            runtimeKey,
            options,
          )
        return formatAccountRuntimeKeySecretForSite({
          ...runtimeKey,
          secret: await mockResolveRuntimeKeySecret(account, runtimeKey),
        })
      },
    }
  },
)

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
          siteType !== SITE_TYPES.DONE_HUB &&
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
    ensureAccountKeySpy.mockImplementation(() => {
      throw new Error("ensureAccountKey should not be called in this test")
    })
    mockFetchAccountTokens.mockReset()
    mockFetchAccountTokens.mockResolvedValue([])
    mockResolveRuntimeKeySecret.mockReset()
    mockResolveRuntimeKeySecret.mockImplementation(
      async (_account: unknown, key: { secret: string }) => key.secret,
    )
  })

  afterEach(() => {
    registrationSpy?.mockRestore()
    registrationSpy = undefined
  })

  it.each(["account", "credentials"] as const)(
    "queries destination groups once across %s import preparation and editor options",
    async (entrypoint) => {
      const fetchGroups = vi.fn(async () => ["default", "vip"])
      const service = buildManagedSiteCapabilitiesMock({
        channelDrafts: {
          prepareFormData: async (_source, options) =>
            buildPreparedFormData({
              groups: await resolveDefaultChannelGroups({
                getConfig: async () => ({
                  baseUrl: "https://managed.example.com",
                  adminToken: "admin-token",
                  userId: "1",
                }),
                fetchSiteUserGroups: fetchGroups,
                purpose: options?.purpose,
              }),
            }),
        },
      })
      getManagedSiteCapabilitiesSpy.mockReturnValue(service)
      nativeOpenCreateEditorMock.mockImplementation(async () => ({
        ...(await createNewApiCreateEditor({
          canLoadSecret: false,
          loadSecret: vi.fn(),
          fetchModels: vi.fn(),
          fetchDraftModels: vi.fn(),
          loadEditorGroups: fetchGroups,
        })),
        submit: vi.fn(),
      }))
      const { result } = await renderChannelDialogHook()
      await act(async () => {
        const opened =
          entrypoint === "account"
            ? await result.current.dialog.openWithAccount(
                buildDisplaySiteData(),
                buildNewApiRuntimeKey(
                  buildDisplaySiteData(),
                  buildNewApiToken(),
                ),
              )
            : await result.current.dialog.openWithCredentials({
                name: "Imported credential",
                baseUrl: "https://upstream.example.com",
                apiKey: "sk-test",
              })
        expect(opened.opened).toBe(true)
      })
      const editor = result.current.context.state.nativeCreate!.editor
      expect(
        await editor.loadOptions!(
          NEW_API_MANAGED_RESOURCE_FIELD_IDS.Groups,
          editor.initialValues,
        ),
      ).toEqual([{ value: "default" }, { value: "vip" }])
      expect(fetchGroups).toHaveBeenCalledTimes(1)
    },
  )

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
      buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
      )
    })

    expect(registrationSpy).toHaveBeenCalledWith(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
    )
    expect(openRegistration).toHaveBeenCalledOnce()
    expect(openCreateEditor).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Auto channel",
        channelType: "openai",
        credential: "sk-test",
        baseUrl: "https://upstream.example.com",
        enabled: true,
        models: ["gpt-4"],
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
      buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
      )
    })

    expect(openResult!).toEqual({ opened: false })
    expect(result.current.context.state.isOpen).toBe(false)
    expect(result.current.context.state.nativeCreate).toBeUndefined()
    expect(result.current.context.opening).toMatchObject({ status: "failure" })
    expect(mockToastError).not.toHaveBeenCalled()
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
      buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
      buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
    const providedToken = buildNewApiToken({
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), providedToken),
      )
    })

    expect(ensureAccountKeySpy).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(prepareChannelFormDataMock).toHaveBeenCalledWith(
      {
        name: "Account | Token (auto)",
        baseUrl: "https://upstream.example.com",
        apiKey: providedToken.key,
        modelHints: [],
      },
      { purpose: "native-editor" },
    )
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
        signal: expect.any(AbortSignal),
        seed: expect.objectContaining({
          name: "Account | Selected key (auto)",
          baseUrl,
          credential: secret,
        }),
      })
      expect(result.current.context.state.isOpen).toBe(true)
      expect(mockResolveRuntimeKeySecret).not.toHaveBeenCalled()
      expect(mockFetchAccountTokens).not.toHaveBeenCalled()
      expect(ensureAccountKeySpy).not.toHaveBeenCalled()
    },
  )

  it.each([
    { entrypoint: "account", secret: "sk-other\nsk-test", matched: true },
    { entrypoint: "credentials", secret: "sk-other\nsk-test", matched: true },
    { entrypoint: "account", secret: "sk-other\nsk-another", matched: false },
    {
      entrypoint: "credentials",
      secret: "sk-other\nsk-another",
      matched: false,
    },
    {
      entrypoint: "account",
      secret: "sk-other\nsk-****",
      matched: false,
      comparable: false,
    },
  ])(
    "compares retrievable DoneHub keys despite different models when importing from $entrypoint (matched: $matched)",
    async ({ entrypoint, secret, matched, comparable = true }) => {
      const candidate = buildManagedResourceMatchCandidate({
        ref: matchingResourceRef(22, {
          siteType: SITE_TYPES.DONE_HUB,
          scopeKey: "https://managed.example.com",
        }),
        key: "",
        models: "other-model",
      })
      const fetchSecretKey = vi.fn(async () => secret)
      const service = buildManagedSiteCapabilitiesMock({
        siteType: SITE_TYPES.DONE_HUB,
        matching: {
          search: vi.fn(async () => ({
            items: [candidate],
            total: 1,
            type_counts: {},
          })),
          fetchSecretKey,
          hydrateComparableKeys: vi.fn(
            async (
              _config: unknown,
              candidates: readonly ManagedResourceMatchCandidate[],
            ) => candidates.map((item) => ({ ...item, key: secret })),
          ),
        },
      })
      getManagedSiteCapabilitiesSpy.mockReturnValue(service)
      const { result } = await renderChannelDialogHook()
      await act(async () => {
        if (entrypoint === "account") {
          await result.current.dialog.openWithAccount(
            buildDisplaySiteData(),
            buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
          )
        } else {
          await result.current.dialog.openWithCredentials({
            name: "Saved key",
            baseUrl: "https://upstream.example.com",
            apiKey: "sk-test",
          })
        }
      })
      expect(result.current.context.state.isOpen).toBe(true)
      if (matched) {
        expect(
          result.current.context.state.nativeCreate?.advisoryWarning
            ?.assessment,
        ).toMatchObject({
          url: { matched: true },
          key: { comparable: true, matched: true },
          models: { matched: false },
        })
      } else if (comparable) {
        expect(
          result.current.context.state.nativeCreate?.advisoryWarning,
        ).toBeNull()
        expect(result.current.context.duplicateChannelWarning.isOpen).toBe(
          false,
        )
      }
      if (!comparable) {
        expect(
          result.current.context.state.nativeCreate?.advisoryWarning?.assessment
            ?.key,
        ).toMatchObject({ comparable: false, matched: false })
      }
      expect(fetchSecretKey).toHaveBeenCalledTimes(1)
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
        buildNewApiRuntimeKey(
          buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API }),
          buildNewApiToken(),
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
      )
    })

    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      nativeCreate: expect.objectContaining({ showModelPrefillWarning: false }),
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  const setupNativeCreationHandoff = async () => {
    const account = buildDisplaySiteData({ siteType: SITE_TYPES.SUB2API })
    const token = buildNewApiToken({
      id: 11,
      key: "sk-created-11",
      name: "Created key",
    })
    const creation = buildNewApiKeyCreationResult(account, token)
    const prepare = vi.fn(async (source: ManagedSiteChannelDraftSource) =>
      buildPreparedFormData({ key: source.apiKey, base_url: source.baseUrl }),
    )
    getManagedSiteCapabilitiesSpy.mockReturnValue(
      buildManagedSiteCapabilitiesMock({
        channelDrafts: { prepareFormData: prepare },
      }),
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: SITE_TYPES.SUB2API }),
    )
    ensureAccountKeySpy.mockResolvedValue({
      kind: "input-required",
      reason: "editor",
    })
    mockResolveRuntimeKeySecret.mockResolvedValue(token.key)
    const hook = await renderChannelDialogHook()
    return { ...hook, account, token, creation, prepare }
  }

  it("hands account creation to the native editor and resumes with the returned resource", async () => {
    const { result, account, creation, prepare, token } =
      await setupNativeCreationHandoff()
    await act(async () => {
      expect(
        await result.current.dialog.openWithAccount(account, null),
      ).toEqual({ opened: false, deferred: true })
    })
    expect(ensureAccountKeySpy).toHaveBeenCalledWith(account)
    expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
      isOpen: true,
      account,
    })
    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess(
        creation,
      )
    })
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: token.key }),
      { purpose: "native-editor" },
    )
    expect(nativeOpenCreateEditorMock).toHaveBeenLastCalledWith({
      signal: expect.any(AbortSignal),
      seed: expect.objectContaining({ credential: token.key }),
    })
    expect(result.current.context.state.isOpen).toBe(true)
  })

  it("recovers the exact returned reference even when several keys appear", async () => {
    const { result, account, creation, token, prepare } =
      await setupNativeCreationHandoff()
    mockFetchAccountTokens.mockResolvedValue([
      buildNewApiToken({ id: 10 }),
      token,
      buildNewApiToken({ id: 12 }),
    ])
    await act(async () => {
      await result.current.dialog.openWithAccount(account, null)
    })
    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess({
        ref: creation.ref,
        facts: null,
      })
    })
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: token.key }),
      { purpose: "native-editor" },
    )
    expect(ensureAccountKeySpy).toHaveBeenCalledTimes(1)
  })

  it.each([[], [buildNewApiToken({ id: 50 })], null])(
    "does not guess a created key from unrelated or invalid inventory: %s",
    async (inventory) => {
      const { result, account, creation, prepare } =
        await setupNativeCreationHandoff()
      mockFetchAccountTokens.mockResolvedValue(inventory)
      await act(async () => {
        await result.current.dialog.openWithAccount(account, null)
      })
      await act(async () => {
        await result.current.context.handleDefaultTokenQuickCreateSuccess({
          ref: creation.ref,
          facts: null,
        })
      })
      expect(mockToastError).toHaveBeenCalledWith(
        "messages:accountOperations.tokenNotFound",
      )
      expect(prepare).not.toHaveBeenCalled()
      expect(ensureAccountKeySpy).toHaveBeenCalledTimes(1)
    },
  )

  it("hands an unattributed one-time secret to the managed editor without inventing a resource ID", async () => {
    const { result, account } = await setupNativeCreationHandoff()
    const secret = createUnattributedAccountCreatedRuntimeSecret({
      accountId: account.id,
      displayName: "Response-only key",
      secret: "sk-only-once",
      credential: {
        accountName: account.name,
        baseUrl: account.baseUrl,
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        tagIds: [],
      },
    })
    await act(async () => {
      await result.current.dialog.openWithAccount(account, null)
    })
    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess({
        ref: null,
        facts: null,
        createdSecret: secret,
      })
    })
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(mockResolveRuntimeKeySecret).not.toHaveBeenCalled()
    expect(nativeOpenCreateEditorMock).toHaveBeenLastCalledWith({
      signal: expect.any(AbortSignal),
      seed: expect.objectContaining({ credential: secret.secret }),
    })
  })

  it("ignores a late creation callback after its native editor was closed", async () => {
    const { result, account, creation, prepare } =
      await setupNativeCreationHandoff()
    await act(async () => {
      await result.current.dialog.openWithAccount(account, null)
    })
    act(() => result.current.context.closeDefaultTokenQuickCreateDialog())
    await act(async () => {
      await result.current.context.handleDefaultTokenQuickCreateSuccess(
        creation,
      )
    })
    expect(prepare).not.toHaveBeenCalled()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("keeps a new creation session intact when an old callback arrives", async () => {
    const { result, account, creation } = await setupNativeCreationHandoff()
    const first = vi.fn()
    const second = vi.fn()
    act(() =>
      result.current.context.openDefaultTokenQuickCreateDialog({
        account,
        onSuccess: first,
      }),
    )
    const stale = result.current.context.handleDefaultTokenQuickCreateSuccess
    await act(async () => {
      result.current.context.closeDefaultTokenQuickCreateDialog()
      result.current.context.openDefaultTokenQuickCreateDialog({
        account: { ...account, id: "another-account" },
        onSuccess: second,
      })
      await stale(creation)
    })
    expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
      isOpen: true,
      account: { id: "another-account" },
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "honors cancellation before resuming a creation with observed facts: %s",
    async (hasFacts) => {
      const { result, account, creation, prepare } =
        await setupNativeCreationHandoff()
      let current = true
      await act(async () => {
        await result.current.dialog.openWithAccount(account, null, undefined, {
          shouldContinue: () => current,
        })
      })
      current = false
      await act(async () => {
        await result.current.context.handleDefaultTokenQuickCreateSuccess(
          hasFacts ? creation : { ref: creation.ref, facts: null },
        )
      })
      expect(mockFetchAccountTokens).not.toHaveBeenCalled()
      expect(prepare).not.toHaveBeenCalled()
    },
  )

  it("honors cancellation while the created resource is being recovered", async () => {
    const { result, account, creation, prepare } =
      await setupNativeCreationHandoff()
    const pending = createDeferred<NewApiToken[]>()
    mockFetchAccountTokens.mockReturnValue(pending.promise)
    let current = true
    await act(async () => {
      await result.current.dialog.openWithAccount(account, null, undefined, {
        shouldContinue: () => current,
      })
    })
    let resume: Promise<void> | undefined
    act(() => {
      resume = result.current.context.handleDefaultTokenQuickCreateSuccess({
        ref: creation.ref,
        facts: null,
      })
    })
    await waitFor(() => expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1))
    current = false
    await act(async () => {
      pending.resolve([buildNewApiToken({ id: 11 })])
      await resume
    })
    expect(prepare).not.toHaveBeenCalled()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it("does not open an empty-inventory creation prompt when keys already exist", async () => {
    mockFetchAccountTokens.mockResolvedValue([buildNewApiToken()])
    const { result } = await renderChannelDialogHook()
    await act(async () => {
      expect(
        await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
          buildDisplaySiteData(),
        ),
      ).toBe(false)
    })
    expect(result.current.context.defaultTokenQuickCreateDialog.isOpen).toBe(
      false,
    )
    expect(ensureAccountKeySpy).not.toHaveBeenCalled()
  })

  it.each([undefined, "Choose a native workspace"])(
    "opens the native editor and preserves its notice and callback: %s",
    async (notice) => {
      const { result, account, creation } = await setupNativeCreationHandoff()
      const onSuccess = vi.fn()
      await act(async () => {
        expect(
          await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
            account,
            { notice, onSuccess },
          ),
        ).toBe(true)
      })
      expect(
        result.current.context.defaultTokenQuickCreateDialog,
      ).toMatchObject({ isOpen: true, account, notice })
      await act(async () => {
        await result.current.context.handleDefaultTokenQuickCreateSuccess(
          creation,
        )
      })
      expect(onSuccess).toHaveBeenCalledWith(creation)
      expect(ensureAccountKeySpy).not.toHaveBeenCalled()
    },
  )

  it("shows an operation failure toast when the account details cannot be loaded", async () => {
    getAccountByIdSpy.mockResolvedValueOnce(null)

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
      buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
      matching: { exactMatchBasis: "url-key", search: searchChannelMock },
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
      buildNewApiRuntimeKey(
        buildDisplaySiteData(),
        buildNewApiToken({ key: "sk-test" }),
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

  it("clears a cached review advisory when all candidate keys differ despite matching models", async () => {
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
        undefined,
        { managedSiteStatus },
      )
    })

    expect(searchChannelMock).toHaveBeenCalledOnce()
    expect(result.current.context.duplicateChannelWarning.isOpen).toBe(false)
    expect(result.current.context.state.isOpen).toBe(true)
    expect(result.current.context.state.nativeCreate).toMatchObject({
      siteType: SITE_TYPES.NEW_API,
      advisoryWarning: null,
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
        buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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

  it("opens with an ensured native key and forwards managed editor completion", async () => {
    const { result, account, token } = await setupNativeCreationHandoff()
    ensureAccountKeySpy.mockResolvedValue({
      kind: "ready",
      runtimeKey: buildNewApiRuntimeKey(account, token),
    })
    const onSuccess = vi.fn()
    await act(async () => {
      expect(
        await result.current.dialog.openWithAccount(account, null, onSuccess),
      ).toEqual({ opened: true })
    })
    expect(ensureAccountKeySpy).toHaveBeenCalledWith(account)
    expect(nativeOpenCreateEditorMock).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      seed: expect.objectContaining({ credential: token.key }),
    })
    await act(async () =>
      result.current.context.handleSuccess({ success: true, message: "saved" }),
    )
    expect(onSuccess).toHaveBeenCalledWith({ success: true, message: "saved" })
  })

  it("stops the channel workflow when native ensure cannot read the inventory", async () => {
    const { result, account, prepare } = await setupNativeCreationHandoff()
    ensureAccountKeySpy.mockRejectedValue(
      new AccountKeyResourceError({ code: "unexpected" }),
    )
    await act(async () => {
      expect(
        await result.current.dialog.openWithAccount(account, null),
      ).toEqual({ opened: false })
    })
    expect(prepare).not.toHaveBeenCalled()
    expect(nativeOpenCreateEditorMock).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalled()
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
      buildNewApiRuntimeKey(buildDisplaySiteData(), buildNewApiToken()),
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
      signal: expect.any(AbortSignal),
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
