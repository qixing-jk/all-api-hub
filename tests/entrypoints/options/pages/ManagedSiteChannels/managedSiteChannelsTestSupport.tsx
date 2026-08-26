import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, vi } from "vitest"

import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { ChannelType } from "~/constants"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ManagedSiteChannels from "~/features/ManagedSiteChannels/ManagedSiteChannels"
import type { ChannelRow } from "~/features/ManagedSiteChannels/types"
import { fetchChannelFilters } from "~/features/ManagedSiteChannels/utils/channelFilters"
import { accountStorage } from "~/services/accounts/accountStorage"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  getManagedSiteService,
  getManagedSiteServiceForType,
} from "~/services/managedSites/managedSiteService"
import type {
  ManagedSiteMutationResult,
  ManagedSiteVoidMutationResult,
} from "~/services/managedSites/mutations/contracts"
import {
  ensureNewApiManagedSession,
  isNewApiVerifiedSessionActive,
  NEW_API_MANAGED_SESSION_STATUSES,
} from "~/services/managedSites/providers/newApiSession"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  type PRODUCT_ANALYTICS_ACTION_IDS,
  type PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

import {
  mockCompleteProductAnalyticsAction,
  mockResolveManagedUpstreamResourceCapabilities,
  mockStartProductAnalyticsAction,
  mockTrackProductAnalyticsActionCompleted,
  mockTrackProductAnalyticsActionStarted,
} from "./managedSiteChannelsMocks"

/** Shared assertion/rendering helpers for the ManagedSiteChannels page tests. */
export const expectManagedSiteChannelActionTracked = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => {
  expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
    actionId,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

export const expectManagedSiteChannelActionSpanStarted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => {
  expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
    actionId,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

export const waitForRowText = (text: string) =>
  waitFor(() => expect(screen.getByText(text)).toBeInTheDocument(), {
    timeout: 3000,
  })

export const waitForChannelsRefreshIdle = () =>
  waitFor(
    () => {
      expect(
        screen.getByRole("button", {
          name: "managedSiteChannels:toolbar.refresh",
        }),
      ).toBeEnabled()
    },
    { timeout: 3000 },
  )

export const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

export const succeededChannelDelete = (
  channelId: number,
): ManagedSiteVoidMutationResult => ({
  outcome: "succeeded",
  data: undefined,
  confirmedEffects: [
    {
      kind: "resource-deleted",
      resourceKind: "channel",
      resourceId: channelId,
    },
  ],
})

export const succeededChannelUpdate = <TData,>(
  channelId: number,
  data: TData,
): ManagedSiteMutationResult<TData> => ({
  outcome: "succeeded",
  data,
  confirmedEffects: [
    {
      kind: "resource-updated",
      resourceKind: "channel",
      resourceId: channelId,
    },
  ],
})

const rowActionMenuItemNames = [
  "managedSiteChannels:table.rowActions.edit",
  "managedSiteChannels:table.rowActions.view",
  "managedSiteChannels:table.rowActions.sync",
  "managedSiteChannels:table.rowActions.filters",
  "managedSiteChannels:table.rowActions.openSync",
  "managedSiteChannels:table.rowActions.migrate",
]

const getOpenRowActionItem = () =>
  rowActionMenuItemNames
    .map((name) => screen.queryByRole("menuitem", { name }))
    .find((item) => item !== null) ?? null

/**
 * Open the Radix row-actions dropdown with one user-event instance.
 *
 * Full-suite jsdom runs have been flaky when this helper mixed low-level
 * pointer events with separate user-event instances, so prefer the keyboard
 * path first and fall back to click-based interactions using the same user.
 */
export const openRowActionsMenu = async (
  row: HTMLElement,
  user = userEvent.setup(),
) => {
  const rowIdentityText =
    within(row)
      .queryAllByRole("cell")
      .map((cell) => cell.textContent?.trim())
      .find((text) => Boolean(text)) ?? null

  const getCurrentRow = () => {
    if (row.isConnected) {
      return row
    }

    if (!rowIdentityText) {
      return row
    }

    return (screen.queryByText(rowIdentityText)?.closest("tr") ??
      row) as HTMLElement
  }

  const getTrigger = () =>
    within(getCurrentRow()).getByRole("button", {
      name: "managedSiteChannels:table.columns.actions",
    })

  const hasRowActionContent = () => getOpenRowActionItem() !== null
  const isMenuOpen = () =>
    getTrigger().getAttribute("aria-expanded") === "true" ||
    screen.queryByRole("menu") !== null ||
    hasRowActionContent()
  const resetHalfOpenMenu = async () => {
    if (!isMenuOpen()) {
      return
    }

    const trigger = getTrigger()
    trigger.focus()
    await user.keyboard("{Escape}")

    try {
      await waitFor(
        () => {
          expect(isMenuOpen()).toBe(false)
        },
        { timeout: 1000 },
      )
    } catch {
      return
    }
  }

  const openAttempts = [
    async () => {
      const trigger = getTrigger()
      trigger.focus()
      await user.keyboard("{ArrowDown}")
    },
    async () => {
      await user.click(getTrigger())
    },
    async () => {
      const trigger = getTrigger()
      trigger.focus()
      await user.keyboard("{Enter}")
    },
    async () => {
      const trigger = getTrigger()
      trigger.focus()
      await user.keyboard("{Space}")
    },
  ]

  for (const attempt of openAttempts) {
    if (hasRowActionContent()) {
      return
    }

    await attempt()
    try {
      await waitFor(
        () => {
          expect(hasRowActionContent()).toBe(true)
        },
        { timeout: 1000 },
      )
      return
    } catch {
      await resetHalfOpenMenu()
    }
  }

  await waitFor(() => {
    expect(hasRowActionContent()).toBe(true)
  })
}

export const markGatewayGuidanceOnboardingCompletedMock = vi
  .fn()
  .mockResolvedValue({ ok: true })

/**
 * Registers the shared beforeEach/afterEach hooks. Call at the top of the
 * describe block in every split test file.
 */
export const setupManagedSiteChannelsTest = () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchChannelFilters).mockResolvedValue([])
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    mockTrackProductAnalyticsActionStarted.mockReset()
    mockTrackProductAnalyticsActionCompleted.mockReset()
    mockCompleteProductAnalyticsAction.mockReset()
    mockResolveManagedUpstreamResourceCapabilities.mockReturnValue({
      supported: false,
      siteType: SITE_TYPES.NEW_API,
      reason: "core-slice-disabled",
    })
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([])
    vi.mocked(apiCredentialProfilesStorage.listProfiles).mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
}

export const buildPreferences = (options?: {
  managedSiteType?: ManagedSiteType
  withMigrationTarget?: boolean
}) => {
  const managedSiteType = options?.managedSiteType ?? SITE_TYPES.NEW_API

  return {
    managedSiteType,
    newApi: {
      baseUrl: "https://admin.example",
      adminToken: "new-api-token",
      userId: "1",
      username: "admin",
      password: "secret-password",
      totpSecret: "JBSWY3DPEHPK3PXP",
    },
    doneHub:
      options?.withMigrationTarget || managedSiteType === SITE_TYPES.DONE_HUB
        ? {
            baseUrl: "https://donehub.example",
            adminToken: "donehub-token",
            userId: "9",
          }
        : {
            baseUrl: "",
            adminToken: "",
            userId: "",
          },
    veloera:
      managedSiteType === SITE_TYPES.VELOERA
        ? {
            baseUrl: "https://veloera.example",
            adminToken: "veloera-token",
            userId: "5",
          }
        : {
            baseUrl: "",
            adminToken: "",
            userId: "",
          },
    octopus:
      managedSiteType === SITE_TYPES.OCTOPUS
        ? {
            baseUrl: "https://octopus.example",
            username: "octopus-admin",
            password: "octopus-password",
          }
        : {
            baseUrl: "",
            username: "",
            password: "",
          },
    axonHub:
      managedSiteType === SITE_TYPES.AXON_HUB
        ? {
            baseUrl: "https://axonhub.example",
            email: "admin@example.com",
            password: "axonhub-password",
          }
        : {
            baseUrl: "",
            email: "",
            password: "",
          },
    claudeCodeHub:
      managedSiteType === SITE_TYPES.CLAUDE_CODE_HUB
        ? {
            baseUrl: "https://cch.example",
            adminToken: "cch-token",
          }
        : {
            baseUrl: "",
            adminToken: "",
          },
  }
}

export const mockMutablePreferencesContext = (
  getState: () => {
    managedSiteType: ManagedSiteType
    preferences: ReturnType<typeof buildPreferences>
    extras?: Record<string, unknown>
  },
) => {
  vi.mocked(useUserPreferencesContext).mockImplementation(() => {
    const { managedSiteType, preferences, extras } = getState()
    return {
      preferences,
      managedSiteType,
      newApiBaseUrl: preferences.newApi.baseUrl,
      newApiUserId: preferences.newApi.userId,
      newApiUsername: preferences.newApi.username,
      newApiPassword: preferences.newApi.password,
      newApiTotpSecret: preferences.newApi.totpSecret,
      markGatewayGuidanceOnboardingCompleted:
        markGatewayGuidanceOnboardingCompletedMock,
      ...extras,
    } as any
  })
}

export const buildChannelListData = (items: any[]) => ({
  items,
  total: items.length,
  type_counts: {},
})

export const mockChannels = (
  channels: any[],
  options?: {
    managedSiteType?: ManagedSiteType
    messagesKey?: string
    withMigrationTarget?: boolean
    fetchChannelSecretKey?: (...args: unknown[]) => Promise<string>
  },
) => {
  const managedSiteType = options?.managedSiteType ?? SITE_TYPES.NEW_API
  const messagesKey =
    options?.messagesKey ??
    (managedSiteType === SITE_TYPES.DONE_HUB
      ? "donehub"
      : managedSiteType === SITE_TYPES.VELOERA
        ? "veloera"
        : managedSiteType === SITE_TYPES.AXON_HUB
          ? "axonhub"
          : managedSiteType === SITE_TYPES.CLAUDE_CODE_HUB
            ? "claudecodehub"
            : "newapi")
  const preferences = buildPreferences({
    managedSiteType,
    withMigrationTarget: options?.withMigrationTarget,
  })

  vi.mocked(useUserPreferencesContext).mockReturnValue({
    preferences,
    managedSiteType,
    newApiBaseUrl: preferences.newApi.baseUrl,
    newApiUserId: preferences.newApi.userId,
    newApiUsername: preferences.newApi.username,
    newApiPassword: preferences.newApi.password,
    newApiTotpSecret: preferences.newApi.totpSecret,
    markGatewayGuidanceOnboardingCompleted:
      markGatewayGuidanceOnboardingCompletedMock,
  } as any)

  const service = {
    siteType: managedSiteType,
    messagesKey,
    getConfig: vi.fn().mockResolvedValue({
      baseUrl: "https://admin.example",
      adminToken: "t",
      userId: "1",
    }),
    listChannels: vi.fn().mockResolvedValue(buildChannelListData(channels)),
    fetchChannelSecretKey: options?.fetchChannelSecretKey,
  } as any

  vi.mocked(getManagedSiteService).mockResolvedValue(service)

  vi.mocked(isNewApiVerifiedSessionActive).mockReturnValue(true)
  vi.mocked(ensureNewApiManagedSession).mockResolvedValue({
    status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
    methods: {
      twoFactorEnabled: true,
      passkeyEnabled: false,
    },
  } as any)

  vi.mocked(getManagedSiteServiceForType).mockReturnValue({
    siteType: SITE_TYPES.DONE_HUB,
    messagesKey: "donehub",
    getConfig: vi.fn().mockResolvedValue({
      baseUrl: "https://donehub.example",
      token: "donehub-token",
      userId: "9",
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
  } as any)

  return service
}

export const setupStaleChannelResponseAfterSiteSwitch = async () => {
  class NonSignalingAbortController {
    readonly signal = { aborted: false } as AbortSignal
    abort = vi.fn()
  }
  vi.stubGlobal("AbortController", NonSignalingAbortController)

  let currentManagedSiteType: ManagedSiteType = SITE_TYPES.NEW_API
  let currentPreferences = buildPreferences({
    managedSiteType: currentManagedSiteType,
    withMigrationTarget: true,
  })
  const staleResponse =
    createDeferred<ReturnType<typeof buildChannelListData>>()
  const listChannels = vi
    .fn()
    .mockResolvedValueOnce(
      buildChannelListData([
        { id: 1, name: "Alpha", base_url: "https://site-a.example" },
      ]),
    )
    .mockReturnValueOnce(staleResponse.promise)
    .mockResolvedValueOnce(
      buildChannelListData([
        { id: 2, name: "Beta", base_url: "https://site-b.example" },
      ]),
    )

  vi.mocked(useUserPreferencesContext).mockImplementation(
    () =>
      ({
        preferences: currentPreferences,
        managedSiteType: currentManagedSiteType,
        newApiBaseUrl: currentPreferences.newApi.baseUrl,
        newApiUserId: currentPreferences.newApi.userId,
        newApiUsername: currentPreferences.newApi.username,
        newApiPassword: currentPreferences.newApi.password,
        newApiTotpSecret: currentPreferences.newApi.totpSecret,
        markGatewayGuidanceOnboardingCompleted:
          markGatewayGuidanceOnboardingCompletedMock,
      }) as any,
  )
  vi.mocked(getManagedSiteService).mockImplementation(
    async () =>
      ({
        siteType: currentManagedSiteType,
        messagesKey:
          currentManagedSiteType === SITE_TYPES.DONE_HUB ? "donehub" : "newapi",
        getConfig: vi.fn().mockResolvedValue({
          baseUrl:
            currentManagedSiteType === SITE_TYPES.DONE_HUB
              ? "https://donehub.example"
              : "https://admin.example",
          token: "token",
          userId: "1",
        }),
        listChannels,
      }) as any,
  )

  const { rerender } = render(<ManagedSiteChannels />)
  await waitForRowText("Alpha")
  await userEvent.click(
    screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.refresh",
    }),
  )
  await waitFor(() => expect(listChannels).toHaveBeenCalledTimes(2))

  currentManagedSiteType = SITE_TYPES.DONE_HUB
  currentPreferences = buildPreferences({
    managedSiteType: currentManagedSiteType,
    withMigrationTarget: true,
  })
  rerender(<ManagedSiteChannels />)

  await waitForRowText("Beta")
  expect(listChannels).toHaveBeenCalledTimes(3)

  return {
    listChannels,
    staleResponse,
  }
}

export const buildCompleteChannelRow = (
  overrides: Record<string, unknown> = {},
): ChannelRow =>
  ({
    id: 9,
    type: ChannelType.OpenAI,
    key: "",
    name: "Created Channel",
    base_url: "https://created.example",
    models: "gpt-4o",
    status: 1,
    priority: 0,
    weight: 0,
    group: "default",
    ...overrides,
  }) as ChannelRow

export const fillAndSubmitChannelDialog = async (
  user: ReturnType<typeof userEvent.setup>,
  params: {
    name: string
    key?: string
    baseUrl?: string
    model?: string
  },
) => {
  const nameInput = await screen.findByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
  await user.clear(nameInput)
  await user.type(nameInput, params.name)

  const keyInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
  await user.clear(keyInput)
  await user.type(keyInput, params.key ?? "sk-created")

  const baseUrlInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput)
  await user.clear(baseUrlInput)
  await user.type(baseUrlInput, params.baseUrl ?? "https://created.example")

  const modelsInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput)
  await user.type(modelsInput, params.model ?? "gpt-4o")
  await user.keyboard("{Enter}")
  await user.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))
}

export const mockNewApiServiceWithCreate = (
  createChannel: unknown,
  channelListSequence: any[][] = [[]],
) => {
  const listChannels = vi.fn()
  channelListSequence.forEach((channels) => {
    listChannels.mockResolvedValueOnce(buildChannelListData(channels))
  })
  listChannels.mockResolvedValue(
    buildChannelListData(channelListSequence.at(-1) ?? []),
  )

  const service = {
    siteType: SITE_TYPES.NEW_API,
    messagesKey: "newapi",
    getConfig: vi.fn().mockResolvedValue({
      baseUrl: "https://admin.example",
      adminToken: "t",
      userId: "1",
    }),
    listChannels,
    buildChannelPayload: vi.fn((draft: any) => ({
      mode: "single",
      channel: draft,
    })),
    createChannel,
  } as any

  vi.mocked(getManagedSiteService).mockResolvedValue(service)
  return service
}

export const ChannelDialogSuccessProbe = ({ result }: { result: unknown }) => {
  const { state } = useChannelDialogContext()

  return (
    <button
      disabled={!state.onSuccessCallback}
      onClick={() => state.onSuccessCallback?.(result)}
      type="button"
    >
      apply dialog success
    </button>
  )
}
