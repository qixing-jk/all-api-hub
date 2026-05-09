import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  useChannelDialog,
  useChannelDialogContext,
} from "~/components/dialogs/ChannelDialog"
import { ChannelType } from "~/constants"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import * as accountOperations from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import * as managedSiteService from "~/services/managedSites/managedSiteService"
import type { ManagedSiteService } from "~/services/managedSites/managedSiteService"
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
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
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

const getManagedSiteServiceSpy = vi.spyOn(
  managedSiteService,
  "getManagedSiteService",
)
const getAccountByIdSpy = vi.spyOn(accountStorage, "getAccountById")
const ensureAccountApiTokenSpy = vi.spyOn(
  accountOperations,
  "ensureAccountApiToken",
)
const resolveSub2ApiQuickCreateResolutionSpy = vi.spyOn(
  accountOperations,
  "resolveSub2ApiQuickCreateResolution",
)

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
    id: 1,
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
  checkIn: {
    enableDetection: false,
  },
  ...overrides,
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
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://upstream.example.com",
  token: "access-token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
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

const buildManagedSiteChannel = (
  overrides: Partial<ManagedSiteChannel> = {},
): ManagedSiteChannel =>
  ({
    id: 11,
    name: "Existing channel",
    base_url: "https://upstream.example.com",
    models: "gpt-4",
    key: "sk-test",
    type: ChannelType.OpenAI,
    status: 1,
    priority: 0,
    weight: 0,
    group: "default",
    ...overrides,
  }) as ManagedSiteChannel

const buildPreparedFormData = (
  overrides: Partial<
    ChannelFormData & { modelPrefillFetchFailed?: boolean }
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
    status: 1,
    ...overrides,
  }) satisfies ChannelFormData & { modelPrefillFetchFailed?: boolean }

const buildManagedSiteAssessment = (
  overrides: Partial<ManagedSiteTokenChannelAssessment> = {},
): ManagedSiteTokenChannelAssessment => {
  const matchedChannel = {
    id: 11,
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

const buildManagedSiteServiceMock = (
  overrides: Partial<ManagedSiteService> = {},
): Partial<ManagedSiteService> => ({
  siteType: "new-api",
  messagesKey: "newapi",
  getConfig: vi.fn(async () => ({
    baseUrl: "https://managed.example.com",
    token: "admin-token",
    userId: "1",
  })),
  prepareChannelFormData: vi.fn(async () => buildPreparedFormData()),
  searchChannel: vi.fn(async () => ({
    items: [],
    total: 0,
    type_counts: {},
  })),
  findMatchingChannel: vi.fn(async () => null),
  ...overrides,
})

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

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()

  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
      resolveApiTokenKey: (...args: any[]) => mockResolveApiTokenKey(...args),
    })),
  }
})

describe("useChannelDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockToastLoading.mockReturnValue("toast-id")
    getAccountByIdSpy.mockResolvedValue(buildSiteAccount())
    ensureAccountApiTokenSpy.mockImplementation(() => {
      throw new Error("ensureAccountApiToken should not be called in this test")
    })
    resolveSub2ApiQuickCreateResolutionSpy.mockReset()
    mockFetchAccountTokens.mockReset()
    mockFetchAccountTokens.mockResolvedValue([])
    mockResolveApiTokenKey.mockReset()
    mockResolveApiTokenKey.mockImplementation(
      async (_request: unknown, token: { key: string }) => token.key,
    )
  })

  it("shows warning and cancels when user does not continue", async () => {
    const existingChannel = buildManagedSiteChannel()
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
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
            status: 1,
          }) satisfies ChannelFormData,
      ),
      searchChannel: vi.fn(async () => ({
        items: [existingChannel],
        total: 1,
        type_counts: {},
      })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
      buildApiToken(),
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

    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens ChannelDialog when user continues despite duplicate", async () => {
    const existingChannel = buildManagedSiteChannel()
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
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
            status: 1,
          }) satisfies ChannelFormData,
      ),
      searchChannel: vi.fn(async () => ({
        items: [existingChannel],
        total: 1,
        type_counts: {},
      })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
      buildApiToken(),
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing channel",
      })
    })

    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(true)
      await openPromise
    })

    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      mode: DIALOG_MODES.ADD,
      initialValues: {
        name: "Auto channel",
        models: ["gpt-4"],
        groups: ["default"],
      },
      initialModels: ["gpt-4"],
      initialGroups: ["default"],
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens ChannelDialog when New API exact duplicate verification is unavailable", async () => {
    const hiddenKeyChannel = buildManagedSiteChannel({
      id: 22,
      key: "",
    })
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
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
            status: 1,
          }) satisfies ChannelFormData,
      ),
      searchChannel: vi.fn(async () => ({
        items: [hiddenKeyChannel],
        total: 1,
        type_counts: {},
      })),
      findMatchingChannel: vi.fn(async () => {
        throw new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
        )
      }),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
        buildApiToken(),
      )
    })

    expect(result.current.context.duplicateChannelWarning).toEqual({
      isOpen: false,
      existingChannelName: null,
    })
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      mode: DIALOG_MODES.ADD,
      initialValues: {
        name: "Auto channel",
        models: ["gpt-4"],
        groups: ["default"],
      },
      initialModels: ["gpt-4"],
      initialGroups: ["default"],
      advisoryWarning: {
        kind: "verificationRequired",
        title: "channelDialog:warnings.verificationRequired.title",
        description: "channelDialog:warnings.verificationRequired.description",
      },
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens ChannelDialog with a prefill warning when the provider marks model preload as failed", async () => {
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
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
            status: 1,
          }) satisfies ChannelFormData,
      ),
      searchChannel: vi.fn(async () => ({
        items: [],
        total: 0,
        type_counts: {},
      })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
        buildApiToken(),
      )
    })

    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      mode: DIALOG_MODES.ADD,
      initialValues: {
        name: "Auto channel",
        models: [],
        groups: ["default"],
      },
      initialModels: [],
      initialGroups: ["default"],
      showModelPrefillWarning: true,
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("does not show a prefill warning for an intentionally empty model list", async () => {
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
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
            status: 1,
          }) satisfies ChannelFormData,
      ),
      searchChannel: vi.fn(async () => ({
        items: [],
        total: 0,
        type_counts: {},
      })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
        buildApiToken(),
      )
    })

    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      mode: DIALOG_MODES.ADD,
      initialValues: {
        name: "Auto channel",
        models: [],
        groups: ["default"],
      },
      initialModels: [],
      initialGroups: ["default"],
      showModelPrefillWarning: false,
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens the global Sub2API token dialog when multiple groups are available", async () => {
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(),
      searchChannel: vi.fn(),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "sub2api" }),
    )
    resolveSub2ApiQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
    })

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

    expect(result.current.context.sub2apiTokenDialog).toMatchObject({
      isOpen: true,
      allowedGroups: ["default", "vip"],
      notice: "messages:sub2api.createRequiresGroupSelection",
    })
    expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("resumes the Sub2API token ensure flow after the token dialog succeeds", async () => {
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
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
            status: 1,
          }) satisfies ChannelFormData,
      ),
      searchChannel: vi.fn(async () => ({
        items: [],
        total: 0,
        type_counts: {},
      })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )
    getAccountByIdSpy.mockResolvedValue(
      buildSiteAccount({ site_type: "sub2api" }),
    )
    mockFetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([buildApiToken()])
    resolveSub2ApiQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
    })

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

    expect(result.current.context.sub2apiTokenDialog.isOpen).toBe(true)

    await act(async () => {
      await result.current.context.handleSub2ApiTokenSuccess()
    })

    expect(result.current.context.sub2apiTokenDialog.isOpen).toBe(false)
    expect(resolveSub2ApiQuickCreateResolutionSpy).toHaveBeenCalledTimes(1)
    expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
  })

  it("does not open the Sub2API quick-create dialog when tokens already exist", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([buildApiToken()])

    const { result } = await renderChannelDialogHook()

    let didOpen = false
    await act(async () => {
      didOpen = await result.current.dialog.openSub2ApiTokenCreationDialog(
        buildDisplaySiteData({ siteType: "sub2api" }),
      )
    })

    expect(didOpen).toBe(false)
    expect(resolveSub2ApiQuickCreateResolutionSpy).not.toHaveBeenCalled()
    expect(result.current.context.sub2apiTokenDialog.isOpen).toBe(false)
  })

  it("surfaces blocked Sub2API quick-create resolutions without opening the dialog", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveSub2ApiQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: "blocked",
      message: "No valid upstream groups are available",
    })

    const { result } = await renderChannelDialogHook()

    let didOpen = true
    await act(async () => {
      didOpen = await result.current.dialog.openSub2ApiTokenCreationDialog(
        buildDisplaySiteData({ siteType: "sub2api" }),
      )
    })

    expect(didOpen).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith(
      "No valid upstream groups are available",
    )
    expect(result.current.context.sub2apiTokenDialog.isOpen).toBe(false)
  })

  it("opens the Sub2API quick-create dialog with the default notice and resumes the caller callback", async () => {
    const onSuccess = vi.fn(async () => {})

    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveSub2ApiQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
    })

    const { result } = await renderChannelDialogHook()

    let didOpen = false
    await act(async () => {
      didOpen = await result.current.dialog.openSub2ApiTokenCreationDialog(
        buildDisplaySiteData({ siteType: "sub2api" }),
        { onSuccess },
      )
    })

    expect(didOpen).toBe(true)
    expect(result.current.context.sub2apiTokenDialog).toMatchObject({
      isOpen: true,
      allowedGroups: ["default", "vip"],
      notice: "messages:sub2api.createRequiresGroupSelection",
    })

    await act(async () => {
      await result.current.context.handleSub2ApiTokenSuccess()
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("opens the Sub2API quick-create dialog with a resolved single group and preserves a custom notice", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([])
    resolveSub2ApiQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: "ready",
      group: "ops",
    })

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openSub2ApiTokenCreationDialog(
        buildDisplaySiteData({ siteType: "sub2api" }),
        { notice: "Use the audited group" },
      )
    })

    expect(result.current.context.sub2apiTokenDialog).toMatchObject({
      isOpen: true,
      allowedGroups: ["ops"],
      notice: "Use the audited group",
    })
  })

  it("shows an operation failure toast when the account details cannot be loaded", async () => {
    getAccountByIdSpy.mockResolvedValueOnce(null)

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildApiToken(),
      )
    })

    expect(getManagedSiteServiceSpy).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith(expect.any(String), {
      id: "toast-id",
    })
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("shows the managed-site configuration error and aborts opening from an account", async () => {
    const mockService = buildManagedSiteServiceMock({
      getConfig: vi.fn(async () => null),
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        buildApiToken(),
      )
    })

    expect(mockToastError).toHaveBeenCalledWith(expect.any(String), {
      id: "toast-id",
    })
    expect(result.current.context.state.isOpen).toBe(false)
  })

  it("uses an explicit managed-site duplicate status without re-running channel search", async () => {
    const searchChannelMock = vi.fn(async () => ({
      items: [buildManagedSiteChannel()],
      total: 1,
      type_counts: {},
    }))
    const mockService = buildManagedSiteServiceMock({
      searchChannel: searchChannelMock,
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )

    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 11,
        name: "Existing channel",
      },
      assessment: buildManagedSiteAssessment(),
    }

    const { result } = await renderChannelDialogHook()

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
      buildApiToken(),
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

  it("opens with a review advisory when the managed-site status requires confirmation", async () => {
    const searchChannelMock = vi.fn()
    const mockService = buildManagedSiteServiceMock({
      searchChannel: searchChannelMock,
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
        buildApiToken(),
        undefined,
        { managedSiteStatus },
      )
    })

    expect(searchChannelMock).not.toHaveBeenCalled()
    expect(result.current.context.duplicateChannelWarning.isOpen).toBe(false)
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      advisoryWarning: {
        kind: "reviewSuggested",
        title: "channelDialog:warnings.reviewSuggested.title",
        description: "channelDialog:warnings.reviewSuggested.description",
      },
    })
  })

  it("opens with a verification advisory when exact comparison is explicitly unavailable", async () => {
    const searchChannelMock = vi.fn()
    const mockService = buildManagedSiteServiceMock({
      searchChannel: searchChannelMock,
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
        buildApiToken(),
        undefined,
        { managedSiteStatus },
      )
    })

    expect(searchChannelMock).not.toHaveBeenCalled()
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      advisoryWarning: {
        kind: "verificationRequired",
        title: "channelDialog:warnings.verificationRequired.title",
        description: "channelDialog:warnings.verificationRequired.description",
      },
    })
  })

  it("falls back to ensuring an account token when token discovery returns an unexpected payload", async () => {
    const prepareChannelFormDataMock = vi.fn(
      async (_account: DisplaySiteData, token: ApiToken) =>
        buildPreparedFormData({
          key: token.key,
        }),
    )
    const mockService = buildManagedSiteServiceMock({
      prepareChannelFormData: prepareChannelFormDataMock,
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )
    mockFetchAccountTokens.mockResolvedValueOnce({ items: [] })
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
      "toast-id",
    )
    expect(prepareChannelFormDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "account-id",
      }),
      expect.objectContaining({
        key: "ensured-token",
      }),
    )
    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      initialValues: {
        key: "ensured-token",
      },
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

  it("shows a duplicate warning when opening from raw credentials and aborts on cancel", async () => {
    const existingChannel = buildManagedSiteChannel({
      key: "sk-credential",
    })
    const mockService = buildManagedSiteServiceMock({
      searchChannel: vi.fn(async () => ({
        items: [existingChannel],
        total: 1,
        type_counts: {},
      })),
      prepareChannelFormData: vi.fn(async () =>
        buildPreparedFormData({
          key: "sk-credential",
        }),
      ),
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
    const mockService = buildManagedSiteServiceMock({
      getConfig: vi.fn(async () => null),
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
      async (account: DisplaySiteData, token: ApiToken) => {
        expect(account).toMatchObject({
          id: "api-credential-profile:Saved credential",
          name: "Saved credential",
          baseUrl: "https://upstream.example.com",
        })
        expect(token).toMatchObject({
          name: "Saved credential",
          key: "sk-credential",
        })

        return buildPreparedFormData({
          key: token.key,
          base_url: account.baseUrl,
        })
      },
    )
    const mockService = buildManagedSiteServiceMock({
      prepareChannelFormData: prepareChannelFormDataMock,
    })
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
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
      initialValues: {
        key: "sk-credential",
        base_url: "https://upstream.example.com",
      },
      initialModels: ["gpt-4"],
      initialGroups: ["default"],
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
