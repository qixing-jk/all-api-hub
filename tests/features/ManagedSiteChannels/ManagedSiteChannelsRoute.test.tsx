import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS } from "~/constants/sub2api"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ManagedSiteChannelsRoute } from "~/features/ManagedSiteChannels/ManagedSiteChannelsRoute"
import type { ManagedChannelsRowViewModel } from "~/features/ManagedSiteChannels/presentation/contracts"
import { MANAGED_RESOURCE_CHANNEL_FIELD_ROLES } from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import {
  getManagedSiteChannelRowActionsButtonTestId,
  getManagedSiteChannelRowSelectTestId,
  getManagedSiteChannelRowTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { recordGatewayGuidanceCompletion } from "~/features/UnifiedApiGuidance/recordGatewayGuidanceCompletion"
import enCommon from "~/locales/en/common.json"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import zhCnCommon from "~/locales/zh-CN/common.json"
import zhCnManagedSiteChannels from "~/locales/zh-CN/managedSiteChannels.json"
import * as definitionRegistry from "~/services/accountSiteDefinitions/registry"
import type {
  EditableResourceProjection,
  ManagedResourceRegistration,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { MANAGED_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/managedResourceNative"
import * as nativeRegistry from "~/services/apiAdapters/managedResources/registry"
import type { ManagedSiteTargetOption } from "~/services/managedSites/channelMigrationTargets"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import {
  createManagedResourceEditor,
  createManagedResourceFacts,
  createManagedResourceWorkspace,
} from "~~/tests/test-utils/managedResourceWorkspace"

const {
  toastSuccess,
  toastError,
  useListController,
  useMigrationController,
  useMutationController,
  getFieldPolicy,
  getTargetOptions,
  openManagedSiteModelSyncForChannel,
  syncChannels,
  trackProductAnalyticsActionStarted,
} = vi.hoisted(() => ({
  useListController: vi.fn(),
  useMigrationController: vi.fn(),
  useMutationController: vi.fn(),
  getFieldPolicy: vi.fn(),

  getTargetOptions: vi.fn<(...args: unknown[]) => ManagedSiteTargetOption[]>(
    () => [],
  ),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  openManagedSiteModelSyncForChannel: vi.fn(),
  syncChannels: vi.fn(async () => undefined),
  trackProductAnalyticsActionStarted: vi.fn(),
}))

vi.mock(
  "~/features/UnifiedApiGuidance/recordGatewayGuidanceCompletion",
  () => ({
    recordGatewayGuidanceCompletion: vi.fn(),
  }),
)

vi.mock("~/lib/notify", () => ({
  default: { success: toastSuccess, error: toastError },
}))

vi.mock(
  "~/features/ManagedSiteChannels/hooks/useManagedSiteChannelModelSync",
  () => ({
    useManagedSiteChannelModelSync: () => ({
      syncingResourceKeys: new Set<string>(),
      syncChannels,
    }),
  }),
)

vi.mock(
  "~/features/ManagedSiteChannels/components/ChannelFilterDialog",
  () => ({
    default: ({
      channel,
      open,
    }: {
      channel: { resourceRef: { resourceId: string }; name: string } | null
      open: boolean
    }) =>
      open && channel ? (
        <div data-testid="native-channel-filter-target">
          {channel.resourceRef.resourceId}:{channel.name}
        </div>
      ) : null,
  }),
)

vi.mock("~/services/productAnalytics/actions", async (importActual) => ({
  ...(await importActual()),
  trackProductAnalyticsActionStarted,
}))

vi.mock("~/utils/navigation", async (importActual) => ({
  ...(await importActual()),
  openManagedSiteModelSyncForChannel,
}))

vi.mock("~/contexts/UserPreferencesContext", async (importActual) => ({
  ...(await importActual()),
  useUserPreferencesContext: vi.fn(),
}))

vi.mock(
  "~/features/ManagedSiteChannels/controllers/useManagedResourceListController",
  () => ({ useManagedResourceListController: useListController }),
)
vi.mock(
  "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy",
  async (importActual) => ({
    ...(await importActual()),
    getManagedResourceFieldPolicy: getFieldPolicy,
  }),
)
vi.mock(
  "~/features/ManagedSiteChannels/controllers/useManagedResourceMutationController",
  () => ({ useManagedResourceMutationController: useMutationController }),
)
vi.mock(
  "~/features/ManagedSiteChannels/controllers/useManagedResourceMigrationController",
  () => ({ useManagedResourceMigrationController: useMigrationController }),
)
vi.mock("~/services/managedSites/channelMigrationTargets", () => ({
  getManagedSiteTargetOptions: getTargetOptions,
}))

const nativeRow = {
  rowKey: "opaque:native",
  testToken: "resource-1",
  displayIdentifier: "",
  displayIdentifierSort: "Native example",
  name: "Native example",
  baseURL: "https://api.example.invalid",
  searchText: "Native example",
  cells: {
    type: { kind: "text" as const, value: "openai", sortValue: "openai" },
    supportedModels: {
      kind: "groups" as const,
      values: ["model-example"],
      sortValue: "model-example",
    },
    tags: {
      kind: "groups" as const,
      values: ["tag-example"],
      sortValue: "tag-example",
    },
    status: {
      kind: "status" as const,
      value: "enabled",
      sortValue: "enabled",
      tone: "success" as const,
    },
  },
  capabilities: { canView: true, canEdit: true, canDelete: true },
}

const registrationFor = (
  siteType:
    | typeof SITE_TYPES.NEW_API
    | typeof SITE_TYPES.AXON_HUB
    | typeof SITE_TYPES.CLAUDE_CODE_HUB,
): ManagedResourceRegistration => ({
  siteType,
  kind: "channel",
  open: vi.fn(),
})

const installNativeDefinition = (
  siteType:
    | typeof SITE_TYPES.NEW_API
    | typeof SITE_TYPES.AXON_HUB
    | typeof SITE_TYPES.CLAUDE_CODE_HUB,
) => {
  const nativeDefinitionTemplate = definitionRegistry.getAccountSiteDefinition(
    SITE_TYPES.AXON_HUB,
  )!
  vi.spyOn(definitionRegistry, "getAccountSiteDefinition").mockReturnValue({
    ...nativeDefinitionTemplate,
    siteType,
    managedResource: {
      ...nativeDefinitionTemplate.managedResource!,
    },
  })
  vi.spyOn(nativeRegistry, "getManagedResourceRegistration").mockReturnValue(
    registrationFor(siteType),
  )
}

const installNativeControllers = (
  overrides: {
    list?: Record<string, unknown>
    mutation?: Record<string, unknown>
    migration?: Record<string, unknown>
  } = {},
) => {
  const refresh = vi.fn(async () => true)
  useListController.mockReturnValue({
    workspace: {},
    capabilities: {
      canSearch: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
    rows: [nativeRow],
    allRows: [nativeRow],
    totalRows: 1,
    failure: null,
    isLoading: false,
    pageIndex: 0,
    setPageIndex: vi.fn(),
    pageSize: 20,
    statusFilter: [],
    setStatusFilter: vi.fn(),
    selectedRowKeys: {},
    setSelectedRowKeys: vi.fn(),
    refresh,
    refreshSilently: refresh,
    reconcile: vi.fn(),
    acceptMutationResult: vi.fn(() => true),
    acceptDeletionResults: vi.fn(() => true),
    cancelCollection: vi.fn(),
    resolveRef: vi.fn(),
    mapFacts: vi.fn(),
    ...overrides.list,
  })
  useMutationController.mockReturnValue({
    capabilities: {
      canSearch: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
    detail: null,
    detailFailure: null,
    editor: null,
    editorMode: null,
    editorFailure: null,
    editorFeedback: null,
    isSaving: false,
    deleteState: {
      isOpen: false,
      isExecuting: false,
      rowKeys: [],
      results: [],
      requiresRefresh: false,
      requiresFreshRead: false,
      failure: null,
    },
    openDetail: vi.fn(),
    closeDetail: vi.fn(),
    openCreate: vi.fn(),
    openEdit: vi.fn(),
    closeEditor: vi.fn(),
    submit: vi.fn(async () => undefined),
    openDelete: vi.fn(),
    confirmDelete: vi.fn(),
    cancelDelete: vi.fn(),
    recoverFreshRead: vi.fn(),
    openBulkDelete: vi.fn(),
    ...overrides.mutation,
  })
  useMigrationController.mockReturnValue({
    selectedTarget: "",
    targets: [],
    preview: null,
    result: null,
    isConfirmationOpen: false,
    isRunning: false,
    isRecoveryRunning: false,
    refreshRequired: false,
    callbacks: {},
    ...overrides.migration,
  })
}

type NativePreferenceSiteType =
  | typeof SITE_TYPES.OCTOPUS
  | typeof SITE_TYPES.NEW_API
  | typeof SITE_TYPES.VELOERA
  | typeof SITE_TYPES.DONE_HUB
  | typeof SITE_TYPES.AXON_HUB
  | typeof SITE_TYPES.CLAUDE_CODE_HUB
  | typeof SITE_TYPES.SUB2API

const getNativePreferenceOverrides = (
  siteType: NativePreferenceSiteType,
): Partial<ReturnType<typeof buildUserPreferences>> => {
  switch (siteType) {
    case SITE_TYPES.OCTOPUS:
      return {
        octopus: {
          baseUrl: "https://console.example.invalid",
          username: "example-user",
          password: "example-credential",
        },
      }
    case SITE_TYPES.NEW_API:
      return {
        newApi: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
          userId: "42",
        },
      }
    case SITE_TYPES.VELOERA:
      return {
        veloera: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
          userId: "42",
        },
      }
    case SITE_TYPES.DONE_HUB:
      return {
        doneHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
          userId: "42",
        },
      }
    case SITE_TYPES.AXON_HUB:
      return {
        axonHub: {
          baseUrl: "https://console.example.invalid",
          email: "user@example.invalid",
          password: "example-credential",
        },
      }
    case SITE_TYPES.CLAUDE_CODE_HUB:
      return {
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }
    case SITE_TYPES.SUB2API:
      return {
        sub2apiManagedSite: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }
  }
}

const configureNativePreferences = (siteType: NativePreferenceSiteType) => {
  vi.mocked(useUserPreferencesContext).mockReturnValue({
    preferences: buildUserPreferences(getNativePreferenceOverrides(siteType)),
    managedSiteType: siteType,
    updateManagedSiteType: vi.fn(),
  } as unknown as ReturnType<typeof useUserPreferencesContext>)
}

describe("ManagedSiteChannelsRoute", () => {
  it("completes guidance only after a non-empty collection is accepted", () => {
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.NEW_API)
    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    expect(recordGatewayGuidanceCompletion).not.toHaveBeenCalled()
    const options = useListController.mock.calls.at(-1)?.[0]
    options.onResourcesAccepted(0)
    expect(recordGatewayGuidanceCompletion).not.toHaveBeenCalled()
    options.onResourcesAccepted(1)
    expect(recordGatewayGuidanceCompletion).toHaveBeenCalledOnce()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(recordGatewayGuidanceCompletion).mockClear()
    useListController.mockReset()
    useMutationController.mockReset()
    useMigrationController.mockReset()
    getFieldPolicy.mockReset()
    getTargetOptions.mockReset()
    getTargetOptions.mockReturnValue([])
    toastSuccess.mockReset()
    toastError.mockReset()
    openManagedSiteModelSyncForChannel.mockReset()
    syncChannels.mockReset()
    syncChannels.mockResolvedValue(undefined)
    trackProductAnalyticsActionStarted.mockReset()
  })

  it("routes the production New API definition through native controllers", () => {
    const onReplaceRouteQuery = vi.fn()
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.NEW_API)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        refreshKey={7}
        routeParams={{ search: "example", nativeView: "compact" }}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )

    expect(screen.getByText("Native example")).toBeVisible()
    expect(useListController).toHaveBeenCalledWith(
      expect.objectContaining({ refreshKey: 7, search: "example" }),
    )
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.openChannelConsole",
      }),
    ).toBeVisible()
  })

  it.each([
    SITE_TYPES.NEW_API,
    SITE_TYPES.VELOERA,
    SITE_TYPES.DONE_HUB,
    SITE_TYPES.OCTOPUS,
    SITE_TYPES.AXON_HUB,
    SITE_TYPES.CLAUDE_CODE_HUB,
    SITE_TYPES.SUB2API,
  ])(
    "focuses the stable resource identity for %s despite an unrelated search",
    (siteType) => {
      const rows = [42, 142].map((id) => ({
        ...nativeRow,
        rowKey: `row-${id}`,
        testToken: `resource-${id}`,
        name: `Example ${id}`,
        searchText: `Example ${id}`,
        cells: {
          ...nativeRow.cells,
          "newApi.id": {
            kind: "text" as const,
            value: String(id),
            sortValue: id,
          },
          "veloera.id": {
            kind: "text" as const,
            value: String(id),
            sortValue: id,
          },
          "doneHub.id": {
            kind: "text" as const,
            value: String(id),
            sortValue: id,
          },
        },
      }))
      const resourceId = siteType === SITE_TYPES.AXON_HUB ? "native/42+=" : "42"
      installNativeControllers({
        list: {
          allRows: rows,
          rows,
          totalRows: rows.length,
          resolveRef: (rowKey: string) => ({
            resourceId: rowKey === "row-42" ? resourceId : "142",
            siteType,
            kind: "channel",
            scopeKey: "example",
          }),
        },
      })
      configureNativePreferences(siteType)

      render(
        <ManagedSiteChannelsRoute
          siteType={siteType}
          routeParams={{ channelId: resourceId, search: "unrelated old query" }}
          onReplaceRouteQuery={vi.fn()}
        />,
      )

      expect(screen.getByText("Example 42")).toBeVisible()
      expect(screen.queryByText("Example 142")).not.toBeInTheDocument()
      expect(
        screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary),
      ).toHaveAttribute("data-total", "1")
      expect(useListController).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "" }),
      )
    },
  )

  it("matches a resource deep link by its full reference and resets selection on a scope change", () => {
    const ref = {
      siteType: SITE_TYPES.AXON_HUB,
      kind: "channel" as const,
      scopeKey: "https://console.example.invalid",
      resourceId: "opaque:42",
    }
    const foreignRef = { ...ref, scopeKey: "https://other.example.invalid" }
    const rows = ["Current", "Other"].map((name) => ({
      ...nativeRow,
      rowKey: name,
      testToken: name,
      name,
      searchText: name,
    }))
    const setSelectedRowKeys = vi.fn()
    installNativeControllers({
      list: {
        rows,
        allRows: rows,
        totalRows: 2,
        setSelectedRowKeys,
        resolveRef: (rowKey: string) =>
          rowKey === "Current" ? ref : foreignRef,
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)
    const onReplaceRouteQuery = vi.fn()
    const { rerender } = render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        routeParams={{ resourceRef: JSON.stringify(ref) }}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )

    expect(screen.getByText("Current")).toBeVisible()
    expect(screen.queryByText("Other")).not.toBeInTheDocument()

    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        routeParams={{ resourceRef: JSON.stringify(foreignRef) }}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )
    expect(screen.queryByText("Current")).not.toBeInTheDocument()
    expect(screen.queryByText("Other")).not.toBeInTheDocument()
    expect(setSelectedRowKeys).toHaveBeenCalledWith({})
  })

  it("routes the production Veloera definition through native controllers", () => {
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.VELOERA)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.VELOERA}
        routeParams={{ nativeView: "compact" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(
      nativeRegistry.getManagedResourceRegistration(
        SITE_TYPES.VELOERA,
        "channel",
      ),
    ).toMatchObject({ siteType: SITE_TYPES.VELOERA, kind: "channel" })
    expect(screen.getByText("Native example")).toBeVisible()
    expect(useListController).toHaveBeenCalled()
  })

  it("routes the production DoneHub definition through native controllers", () => {
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.DONE_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.DONE_HUB}
        routeParams={{ nativeView: "compact" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(
      nativeRegistry.getManagedResourceRegistration(
        SITE_TYPES.DONE_HUB,
        "channel",
      ),
    ).toMatchObject({ siteType: SITE_TYPES.DONE_HUB, kind: "channel" })
    expect(screen.getByText("Native example")).toBeVisible()
    expect(useListController).toHaveBeenCalled()
  })

  it("routes the production Octopus definition through native controllers", () => {
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.OCTOPUS)
    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.OCTOPUS}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    expect(screen.getByText("Native example")).toBeVisible()
  })

  it("routes the production AxonHub definition through native controllers", () => {
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        routeParams={{ nativeView: "compact" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
    ).toBeVisible()
    expect(useListController).toHaveBeenCalled()
    expect(
      screen.getByText(
        "managedSiteChannels:gatewayGuidance.headerDescription",
        { exact: false },
      ),
    ).toBeVisible()
  })

  it("restores managed-channel import guidance for an unfiltered native empty state", async () => {
    installNativeControllers({
      list: { rows: [], allRows: [], totalRows: 0, isLoading: false },
    })
    configureNativePreferences(SITE_TYPES.NEW_API)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(
      screen.getByText("managedSiteChannels:gatewayGuidance.empty.title"),
    ).toBeVisible()
    expect(
      await screen.findByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
      }),
    ).toBeVisible()
  })

  it("routes the production Sub2API definition through its full native field set", () => {
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.SUB2API)
    getFieldPolicy.mockReturnValue({
      fields: SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS.map((fieldId) => ({
        fieldId,
        resolveLabel: () => `sub2api:${fieldId}`,
      })),
    } as any)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.SUB2API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(useListController).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldIds: SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      }),
    )
  })

  it("wires capable native model and filter actions to real channel targets", async () => {
    const user = userEvent.setup()
    const targetRef = {
      siteType: SITE_TYPES.AXON_HUB,
      kind: "channel" as const,
      scopeKey: "https://console.example.invalid",
      resourceId: "native-channel-42",
    }
    const actionRow: ManagedChannelsRowViewModel = {
      ...nativeRow,
      channelActions: {
        channelType: "openai",
        canSyncModels: true,
        canOpenModelSync: true,
        canConfigureModelFilters: true,
      },
    }
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: {
        rows: [actionRow],
        allRows: [actionRow],
        selectedRowKeys: { [actionRow.rowKey]: true },
        resolveRef: vi.fn(() => ({
          siteType: SITE_TYPES.AXON_HUB,
          kind: "channel",
          scopeKey: "https://console.example.invalid",
          resourceId: "native-channel-42",
        })),
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const openActions = async () => {
      await user.click(
        screen.getByTestId(
          getManagedSiteChannelRowActionsButtonTestId(actionRow.testToken),
        ),
      )
    }

    await openActions()
    await user.click(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    )
    expect(syncChannels).toHaveBeenLastCalledWith(
      [targetRef],
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncManagedSiteChannel,
      }),
    )

    await openActions()
    await user.click(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.openSync",
      }),
    )
    expect(openManagedSiteModelSyncForChannel).toHaveBeenCalledWith(targetRef)

    await openActions()
    await user.click(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.filters",
      }),
    )
    expect(
      screen.getByTestId("native-channel-filter-target"),
    ).toHaveTextContent("native-channel-42:Native example")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.syncSelected",
      }),
    )
    expect(syncChannels).toHaveBeenLastCalledWith(
      [targetRef],
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteChannels,
      }),
    )
  })

  it("derives native channel actions from the resource capabilities", async () => {
    const user = userEvent.setup()
    const actionRow: ManagedChannelsRowViewModel = {
      ...nativeRow,
      channelActions: {
        channelType: "openai",
        canSyncModels: true,
        canOpenModelSync: true,
        canConfigureModelFilters: true,
      },
    }
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: { rows: [actionRow], allRows: [actionRow] },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    await user.click(
      screen.getByTestId(
        getManagedSiteChannelRowActionsButtonTestId(actionRow.testToken),
      ),
    )

    expect(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.openSync",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.filters",
      }),
    ).toBeVisible()
  })

  it("resets native sorting to the default for each site type", () => {
    const alphaRow = {
      ...nativeRow,
      rowKey: "opaque:alpha",
      testToken: "resource-alpha",
      displayIdentifier: "2",
      displayIdentifierSort: 2,
      name: "Alpha channel",
    }
    const zuluRow = {
      ...nativeRow,
      rowKey: "opaque:zulu",
      testToken: "resource-zulu",
      displayIdentifier: "1",
      displayIdentifierSort: 1,
      name: "Zulu channel",
    }
    installNativeControllers({
      list: {
        rows: [alphaRow, zuluRow],
        allRows: [alphaRow, zuluRow],
        totalRows: 2,
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)
    const onReplaceRouteQuery = vi.fn()
    const getRowIndex = (name: string) =>
      within(screen.getByRole("table"))
        .getAllByRole("row")
        .findIndex((row) => within(row).queryByText(name))

    const { rerender } = render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )

    expect(getRowIndex("Alpha channel")).toBeLessThan(
      getRowIndex("Zulu channel"),
    )

    configureNativePreferences(SITE_TYPES.SUB2API)
    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.SUB2API}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )

    expect(getRowIndex("Zulu channel")).toBeLessThan(
      getRowIndex("Alpha channel"),
    )

    configureNativePreferences(SITE_TYPES.AXON_HUB)
    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )

    expect(getRowIndex("Alpha channel")).toBeLessThan(
      getRowIndex("Zulu channel"),
    )
  })

  it.each([
    [
      MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
      "managedSiteChannels:alerts.authenticationFailed",
    ],
    [
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      "managedSiteChannels:alerts.permissionDenied",
    ],
    [
      MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
      "managedSiteChannels:alerts.unavailable",
    ],
  ] as const)("gives %s list failures actionable copy", (code, keyPrefix) => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: { rows: [], allRows: [], totalRows: 0, failure: { code } },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(`${keyPrefix}.title`)
    expect(alert).toHaveTextContent(`${keyPrefix}.description`)
  })

  it("prefers provider diagnostics over generic fallback copy", () => {
    installNativeDefinition(SITE_TYPES.NEW_API)
    installNativeControllers({
      list: {
        rows: [],
        allRows: [],
        totalRows: 0,
        failure: {
          code: MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
          message: "Provider rejected the request",
          upstreamCode: "channel_invalid",
        },
      },
    })
    configureNativePreferences(SITE_TYPES.NEW_API)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).not.toHaveTextContent(
      "common:rootErrorBoundary.genericDescription",
    )
    expect(alert).toHaveTextContent(
      "Provider rejected the request (channel_invalid)",
    )
  })

  it("maps confirmed native saves to the existing localized success toast", () => {
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const mutationOptions = useMutationController.mock.calls.at(-1)?.[0]
    mutationOptions?.onMutationConfirmed("create")
    mutationOptions?.onMutationSuccess("create")
    expect(recordGatewayGuidanceCompletion).toHaveBeenCalledOnce()
    mutationOptions?.onMutationConfirmed("edit")
    mutationOptions?.onMutationSuccess("edit")
    expect(recordGatewayGuidanceCompletion).toHaveBeenCalledOnce()

    expect(toastSuccess.mock.calls).toEqual([
      ["managedSiteChannels:toasts.channelSaved"],
      ["managedSiteChannels:toasts.channelUpdated"],
    ])
  })

  it("connects native mutation results to the collection acceptance seam", () => {
    const acceptMutationResult = vi.fn(() => true)
    const acceptDeletionResults = vi.fn(() => true)
    installNativeControllers({
      list: { acceptMutationResult, acceptDeletionResults },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(
      useMutationController.mock.calls.at(-1)?.[0]?.acceptMutationResult,
    ).toBe(acceptMutationResult)
    expect(
      useMutationController.mock.calls.at(-1)?.[0]?.acceptDeletionResults,
    ).toBe(acceptDeletionResults)
  })

  it("shows detail load diagnostics instead of dropping the failure", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        detailFailure: {
          code: MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
          message: "Channel detail was rejected",
          upstreamCode: "detail_invalid",
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(
      "Channel detail was rejected (detail_invalid)",
    )
  })

  it("shows editor open failures as a page alert", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        editorFeedback: {
          kind: "open-failed",
          failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable },
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(
      "managedSiteChannels:alerts.editorLoadError.title",
    )
    expect(alert).toHaveTextContent(
      "managedSiteChannels:alerts.editorLoadError.description",
    )
    expect(alert.querySelector(".lucide-circle-alert")).toBeInTheDocument()
  })

  it("keeps confirmed save failures in the editor with save-specific copy", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    const editor = createManagedResourceEditor({
      fields: [{ fieldId: "name", type: "text", required: true }],
      initialValues: { name: "Native example" } as EditableResourceProjection,
    })
    getFieldPolicy.mockReturnValue({
      fields: [
        {
          fieldId: "name",
          section: "basic",
          order: 1,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.name.label"),
          renderer: "text",
          channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
        },
      ],
      hiddenFields: [],
    })
    installNativeControllers({
      mutation: {
        editor,
        editorMode: "edit",
        editorFeedback: {
          kind: "save-failed",
          failure: {
            code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
            message: "Provider maintenance window",
          },
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(toastError).toHaveBeenCalledWith("Provider maintenance window")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it.each([
    MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
  ])(
    "shows a %s failure without field issues inside the open editor",
    (code) => {
      installNativeDefinition(SITE_TYPES.AXON_HUB)
      const editor = createManagedResourceEditor({
        fields: [{ fieldId: "name", type: "text", required: true }],
        initialValues: { name: "Native example" } as EditableResourceProjection,
      })
      getFieldPolicy.mockReturnValue({
        fields: [
          {
            fieldId: "name",
            section: "basic",
            order: 1,
            resolveLabel: (t: TFunction) =>
              t("channelDialog:fields.name.label"),
            renderer: "text",
            channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
          },
        ],
        hiddenFields: [],
      })
      installNativeControllers({
        mutation: {
          editor,
          editorMode: "edit",
          editorFeedback: {
            kind: "save-failed",
            failure: { code },
          },
        },
      })
      configureNativePreferences(SITE_TYPES.AXON_HUB)

      render(
        <ManagedSiteChannelsRoute
          siteType={SITE_TYPES.AXON_HUB}
          onReplaceRouteQuery={vi.fn()}
        />,
      )

      expect(screen.getAllByRole("dialog")).toHaveLength(1)
      expect(toastError).toHaveBeenCalledWith(
        "managedSiteChannels:alerts.editorSaveError.description",
      )
    },
  )

  it("uses a toast for save failures without a page banner", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        editor: null,
        editorMode: null,
        editorFeedback: {
          kind: "save-failed",
          failure: { code: MANAGED_RESOURCE_FAILURE_CODES.NotFound },
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith(
      "managedSiteChannels:alerts.editorSaveError.description",
    )
  })

  it("uses an error toast without opening a dialog for an uncertain mutation", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        editor: null,
        editorMode: null,
        editorFeedback: {
          kind: "save-uncertain",
          failure: {
            code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
            message: "Provider response was lost",
          },
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith("Provider response was lost")
  })

  it("uses localized fallback copy for an uncertain mutation without a message", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        editor: null,
        editorMode: null,
        editorFeedback: {
          kind: "save-uncertain",
          failure: {
            code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
          },
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(toastError).toHaveBeenCalledWith(
      "managedSiteChannels:alerts.partialMutation.description",
    )
  })

  it("shows confirmed saves with stale lists and recovers through toolbar refresh", async () => {
    const user = userEvent.setup()
    const refresh = vi.fn(async () => true)
    const recoverFreshRead = vi.fn(async () => true)
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: { refresh, refreshSilently: refresh },
      mutation: {
        editorFeedback: { kind: "saved-refresh-failed" },
        deleteState: {
          isOpen: false,
          isExecuting: false,
          rowKeys: [],
          results: [],
          requiresRefresh: true,
          requiresFreshRead: true,
          failure: null,
        },
        recoverFreshRead,
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(
      "managedSiteChannels:alerts.savedRefreshError.title",
    )
    expect(alert).toHaveTextContent(
      "managedSiteChannels:alerts.savedRefreshError.description",
    )
    expect(alert.querySelector(".lucide-triangle-alert")).toBeInTheDocument()
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
    ).toBeDisabled()
    expect(
      screen.queryByTestId(
        getManagedSiteChannelRowActionsButtonTestId(nativeRow.testToken),
      ),
    ).toBeNull()

    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
    )
    expect(recoverFreshRead).toHaveBeenCalledOnce()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("toasts successful deletion once without leaving a result panel", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        deleteState: {
          isOpen: false,
          isExecuting: false,
          rowKeys: [nativeRow.rowKey],
          results: [
            {
              rowKey: nativeRow.rowKey,
              status: "success",
              resultKey: "delete_success",
            },
          ],
          requiresRefresh: false,
          requiresFreshRead: false,
          failure: null,
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)
    const { rerender } = render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith(
      "managedSiteChannels:toasts.channelsDeleted",
    )
    expect(
      screen.queryByRole("status", {
        name: "managedSiteChannels:dialog.deleteResultsTitle",
      }),
    ).not.toBeInTheDocument()
    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it("snapshots native delete labels when confirmation starts", async () => {
    const user = userEvent.setup()
    const confirmDelete = vi.fn(async () => [])
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        deleteState: {
          isOpen: true,
          isExecuting: false,
          rowKeys: [nativeRow.rowKey],
          results: [],
          requiresRefresh: false,
          requiresFreshRead: false,
          failure: null,
        },
        confirmDelete,
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    const route = (
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />
    )
    const { rerender } = render(route)

    await user.click(
      screen.getByTestId(
        MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton,
      ),
    )
    expect(confirmDelete).toHaveBeenCalledOnce()

    installNativeControllers({
      list: { rows: [], allRows: [], totalRows: 0 },
      mutation: {
        deleteState: {
          isOpen: false,
          isExecuting: false,
          rowKeys: [nativeRow.rowKey],
          results: [
            {
              rowKey: nativeRow.rowKey,
              status: "failed",
              resultKey: "delete_failed",
            },
          ],
          requiresRefresh: false,
          requiresFreshRead: false,
          failure: null,
        },
      },
    })
    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByText(nativeRow.name)).toBeVisible()
  })

  it.each([undefined, "native-target"])(
    "opens native bulk-delete confirmation for selected opaque row keys with identity %s",
    async (channelId) => {
      const user = userEvent.setup()
      const openBulkDelete = vi.fn()
      installNativeDefinition(SITE_TYPES.AXON_HUB)
      installNativeControllers({
        list: {
          selectedRowKeys: {
            [nativeRow.rowKey]: true,
            "opaque:not-selected": false,
            ...(channelId ? { "opaque:outside-route": true } : {}),
          },
          resolveRef: (rowKey: string) => ({
            resourceId: rowKey === nativeRow.rowKey ? "native-target" : "other",
          }),
        },
        mutation: { openBulkDelete },
      })
      configureNativePreferences(SITE_TYPES.AXON_HUB)

      render(
        <ManagedSiteChannelsRoute
          siteType={SITE_TYPES.AXON_HUB}
          routeParams={channelId ? { channelId } : {}}
          onReplaceRouteQuery={vi.fn()}
        />,
      )

      await user.click(
        screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton),
      )

      expect(openBulkDelete).toHaveBeenCalledWith([nativeRow.rowKey])
    },
  )

  it("does not expose an opaque identifier for an unlabeled delete result", () => {
    const unknownRowKey = "opaque:missing"
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: { rows: [], allRows: [], totalRows: 0 },
      mutation: {
        deleteState: {
          isOpen: false,
          isExecuting: false,
          rowKeys: [unknownRowKey],
          results: [
            {
              rowKey: unknownRowKey,
              status: "failed",
              resultKey: "delete_failed",
            },
          ],
          requiresRefresh: false,
          requiresFreshRead: false,
          failure: null,
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const resultRegion = screen.getByRole("status")
    expect(within(resultRegion).getByRole("listitem")).not.toHaveTextContent(
      unknownRowKey,
    )
  })

  it("cancels an active list refresh before attempting locked recovery", async () => {
    const user = userEvent.setup()
    const refresh = vi.fn(async () => true)
    const cancelCollection = vi.fn()
    const recoverFreshRead = vi.fn(async () => true)
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: {
        isLoading: true,
        refresh,
        refreshSilently: refresh,
        cancelCollection,
      },
      mutation: {
        deleteState: {
          isOpen: false,
          isExecuting: false,
          rowKeys: [],
          results: [],
          requiresRefresh: true,
          requiresFreshRead: true,
          failure: null,
        },
        recoverFreshRead,
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
    )
    expect(cancelCollection).toHaveBeenCalledOnce()
    expect(recoverFreshRead).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("renders a numeric model count and retains the row for a manual-only local search", () => {
    const modelCountRow: ManagedChannelsRowViewModel = {
      ...nativeRow,
      searchText: `${nativeRow.searchText} manual-only-model`,
      cells: {
        ...nativeRow.cells,
        supportedModels: {
          kind: "text",
          value: "2",
          sortValue: 2,
        },
      },
    }
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: { rows: [modelCountRow], allRows: [modelCountRow] },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        routeParams={{ search: "manual-only-model" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const row = screen.getByTestId(getManagedSiteChannelRowTestId("resource-1"))
    expect(row).toBeVisible()
    expect(within(row).getByText("2")).toBeVisible()
    expect(within(row).queryByText("manual-only-model")).toBeNull()
  })

  it("renders an integration failure when native registration is missing", () => {
    const axonHubDefinition = definitionRegistry.getAccountSiteDefinition(
      SITE_TYPES.AXON_HUB,
    )
    expect(axonHubDefinition?.managedResource).toBeDefined()
    vi.spyOn(definitionRegistry, "getAccountSiteDefinition").mockReturnValue({
      ...axonHubDefinition!,
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      managedResource: { ...axonHubDefinition!.managedResource! },
    })
    vi.spyOn(nativeRegistry, "getManagedResourceRegistration").mockReturnValue(
      null,
    )

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        routeParams={{ nativeView: "compact" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "common:rootErrorBoundary.genericDescription",
    )
    expect(useListController).not.toHaveBeenCalled()
  })

  it("renders a controlled integration failure when product policy is missing", () => {
    vi.spyOn(definitionRegistry, "getAccountSiteDefinition").mockReturnValue(
      undefined,
    )

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "common:rootErrorBoundary.genericDescription",
    )
    expect(useListController).not.toHaveBeenCalled()
  })

  it("renders the shared toolbar, common columns, row controls, and stable test ids for a second native registration", async () => {
    const user = userEvent.setup()
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    installNativeControllers()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        routeParams={{ nativeView: "compact" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const buttons = screen.getAllByRole("button")
    expect(
      buttons.indexOf(
        screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
      ),
    ).toBeLessThan(
      buttons.indexOf(
        screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
      ),
    )
    expect(
      screen.getByRole("columnheader", {
        name: "managedSiteChannels:table.columns.id",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("columnheader", {
        name: "managedSiteChannels:table.columns.name",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("columnheader", {
        name: "managedSiteChannels:table.columns.type",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("columnheader", {
        name: "channelDialog:fields.models.label",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("columnheader", {
        name: "managedSiteChannels:table.columns.status",
      }),
    ).toBeVisible()
    expect(
      screen.getByTestId(getManagedSiteChannelRowSelectTestId("resource-1")),
    ).toBeVisible()

    await user.click(
      screen.getByTestId(
        getManagedSiteChannelRowActionsButtonTestId("resource-1"),
      ),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.delete",
      }),
    ).toBeVisible()
  })

  it("updates loaded rows and detail after a language change without refetching or resetting navigation", async () => {
    const resourceI18n = await createResourceTestI18n({
      en: { common: enCommon, managedSiteChannels: enManagedSiteChannels },
      "zh-CN": {
        common: zhCnCommon,
        managedSiteChannels: zhCnManagedSiteChannels,
      },
    })
    const [listModule, mutationModule, fieldPolicyModule] = await Promise.all([
      vi.importActual<
        typeof import("~/features/ManagedSiteChannels/controllers/useManagedResourceListController")
      >(
        "~/features/ManagedSiteChannels/controllers/useManagedResourceListController",
      ),
      vi.importActual<
        typeof import("~/features/ManagedSiteChannels/controllers/useManagedResourceMutationController")
      >(
        "~/features/ManagedSiteChannels/controllers/useManagedResourceMutationController",
      ),
      vi.importActual<
        typeof import("~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy")
      >(
        "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy",
      ),
    ])
    const facts = Array.from({ length: 12 }, (_, index) => ({
      ...createManagedResourceFacts(
        `private-id-${index + 1}`,
        `Example ${String(index + 1).padStart(2, "0")}`,
      ),
      fields: [
        { fieldId: "type", kind: "text" as const, value: "unknown-type" },
      ],
    }))
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      list: vi.fn(async () => ({ items: facts })),
      get: vi.fn(
        async (ref) =>
          facts.find((item) => item.ref.resourceId === ref.resourceId)!,
      ),
      openEditEditor: vi.fn(async () => editor),
    })
    installNativeControllers()
    useListController.mockImplementation(
      listModule.useManagedResourceListController,
    )
    useMutationController.mockImplementation(
      mutationModule.useManagedResourceMutationController,
    )
    getFieldPolicy.mockImplementation(
      fieldPolicyModule.getManagedResourceFieldPolicy,
    )
    vi.spyOn(nativeRegistry, "getManagedResourceRegistration").mockReturnValue({
      ...registrationFor(SITE_TYPES.AXON_HUB),
      open: vi.fn(async () => workspace),
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)
    getTargetOptions.mockReturnValue([
      {
        siteType: SITE_TYPES.NEW_API,
        labelKey: "settings:managedSite.newApi",
        messagesKey: "newapi",
        config: {
          baseUrl: "https://target.example.invalid",
          adminToken: "example-credential",
          userId: "example-user",
        },
      },
    ])
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={resourceI18n}>
        <ManagedSiteChannelsRoute
          siteType={SITE_TYPES.AXON_HUB}
          onReplaceRouteQuery={vi.fn()}
        />
      </I18nextProvider>,
    )

    await screen.findByText("Example 12")
    await user.click(
      screen.getByRole("button", {
        name: resourceI18n.t("managedSiteChannels:table.paginationNext"),
      }),
    )
    const rowToken = "resource-1"
    const row = screen.getByTestId(getManagedSiteChannelRowTestId(rowToken))
    await user.click(
      screen.getByTestId(getManagedSiteChannelRowSelectTestId(rowToken)),
    )
    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton),
    )
    await user.click(
      screen.getByTestId(getManagedSiteChannelRowActionsButtonTestId(rowToken)),
    )
    await user.click(
      screen.getByRole("menuitem", {
        name: resourceI18n.t("managedSiteChannels:table.rowActions.view"),
      }),
    )
    const detail = await screen.findByRole("dialog")
    const englishStatus = resourceI18n.t(
      "managedSiteChannels:editor.options.status.enabled",
    )
    expect(within(detail).getByText(englishStatus)).toBeVisible()
    expect(within(row).getByText(englishStatus)).toBeInTheDocument()

    await act(async () => resourceI18n.changeLanguage("zh-CN"))

    const chineseStatus = resourceI18n.t(
      "managedSiteChannels:editor.options.status.enabled",
    )
    expect(chineseStatus).not.toBe(englishStatus)
    expect(within(detail).getByText(chineseStatus)).toBeVisible()
    expect(within(row).getByText(chineseStatus)).toBeInTheDocument()
    expect(
      within(detail).getByText(
        resourceI18n.t(
          "managedSiteChannels:editor.options.channelType.unsupported",
        ),
      ),
    ).toBeVisible()
    expect(within(detail).queryByText(englishStatus)).not.toBeInTheDocument()
    expect(
      screen.getByTestId(getManagedSiteChannelRowSelectTestId(rowToken)),
    ).toBeChecked()
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary),
    ).toHaveAttribute("data-start", "11")
    expect(workspace.list).toHaveBeenCalledTimes(1)
    expect(workspace.get).toHaveBeenCalledTimes(1)

    await user.keyboard("{Escape}")
    const editPolicy = fieldPolicyModule.getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      "channel",
      "edit",
    )!
    getFieldPolicy.mockReturnValue({
      ...editPolicy,
      fields: editPolicy.fields.filter(({ fieldId }) => fieldId === "name"),
      hiddenFields: [],
    })
    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton),
    )
    await user.click(
      screen.getByTestId(getManagedSiteChannelRowActionsButtonTestId(rowToken)),
    )
    await user.click(
      screen.getByRole("menuitem", {
        name: resourceI18n.t("managedSiteChannels:table.rowActions.edit"),
      }),
    )
    const editDialog = await screen.findByRole("dialog")
    const nameInput = within(editDialog).getByRole("textbox")
    await user.clear(nameInput)
    await user.type(nameInput, "Unsaved local edit")

    await act(async () => resourceI18n.changeLanguage("en"))

    expect(nameInput).toHaveValue("Unsaved local edit")
    expect(
      screen.getByTestId(getManagedSiteChannelRowSelectTestId(rowToken)),
    ).toBeChecked()
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary),
    ).toHaveAttribute("data-start", "11")
    expect(workspace.openEditEditor).toHaveBeenCalledTimes(1)
    expect(editor.submit).not.toHaveBeenCalled()
    expect(workspace.list).toHaveBeenCalledTimes(1)
  })

  it("uses the latest route query when removing unsupported search", () => {
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    installNativeControllers()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)
    const onReplaceRouteQuery = vi.fn()
    const { rerender } = render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        routeParams={{ nativeView: "compact" }}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )
    const firstOptions = useListController.mock.calls[0][0]

    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        routeParams={{ nativeView: "expanded", search: "query" }}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )
    firstOptions.onUnsupportedSearch()
    expect(onReplaceRouteQuery).toHaveBeenCalledWith({
      nativeView: "expanded",
      search: undefined,
    })
  })

  it("resets pagination, status filters, and selection when a new identity deep link replaces the current list", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      ...nativeRow,
      rowKey: `row-${index + 1}`,
      testToken: `resource-${index + 1}`,
      name: `Example ${index + 1}`,
      searchText: `Example ${index + 1}`,
    }))
    installNativeControllers({
      list: {
        allRows: rows,
        rows,
        totalRows: rows.length,
        resolveRef: (rowKey: string) => ({ resourceId: rowKey.slice(4) }),
      },
    })
    const baseController = useListController()
    useListController.mockImplementation(function useTestListController() {
      const [pageIndex, setPageIndex] = useState(1)
      const [statusFilter, setStatusFilter] = useState(["disabled"])
      const [selectedRowKeys, setSelectedRowKeys] = useState({
        "row-1": true,
        "row-12": true,
      })
      return {
        ...baseController,
        pageIndex,
        setPageIndex,
        selectedRowKeys,
        setSelectedRowKeys,
        statusFilter,
        setStatusFilter,
      }
    })
    configureNativePreferences(SITE_TYPES.CLAUDE_CODE_HUB)
    const { rerender } = render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        routeParams={{ channelId: "12" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByText("Example 12")).toBeVisible()
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton),
    ).toBeDisabled()
  })

  it("paginates the complete native collection exactly once", () => {
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    const allRows = Array.from({ length: 12 }, (_, index) => ({
      ...nativeRow,
      rowKey: `opaque:${index + 1}`,
      testToken: `resource-${index + 1}`,
      name: `Native ${String(index + 1).padStart(2, "0")}`,
      searchText: `Native ${String(index + 1).padStart(2, "0")}`,
    }))
    installNativeControllers({
      list: {
        rows: allRows.slice(10),
        allRows,
        totalRows: allRows.length,
        pageIndex: 1,
      },
    })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByText("Native 11")).toBeVisible()
    expect(screen.getByText("Native 12")).toBeVisible()
    expect(screen.queryByText("Native 01")).toBeNull()
  })

  it("derives create capability from the resource workspace", () => {
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    installNativeControllers()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
    ).toBeVisible()
  })

  it("exposes Sub2API migration when another managed site is configured", async () => {
    const user = userEvent.setup()
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.SUB2API)
    getTargetOptions.mockReturnValue([
      {
        siteType: SITE_TYPES.NEW_API,
        labelKey: "settings:managedSite.newApi",
        messagesKey: "newapi",
        config: {
          baseUrl: "https://target.example.invalid",
          adminToken: "example-credential",
          userId: "example-user",
        },
      },
    ])

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.SUB2API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton),
    ).toBeVisible()
    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton),
    )
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateFiltered",
      }),
    ).toBeVisible()
  })

  it("enables native migration when a source capability and target exist", async () => {
    const user = userEvent.setup()
    const openDetail = vi.fn(async () => undefined)
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    installNativeControllers({ mutation: { openDetail } })
    getTargetOptions.mockReturnValue([
      {
        siteType: SITE_TYPES.NEW_API,
        labelKey: "settings:managedSite.newApi",
        messagesKey: "newapi",
        config: {
          baseUrl: "https://target.example.invalid",
          adminToken: "example-credential",
          userId: "example-user",
        },
      },
    ])
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton),
    )
    await user.click(
      screen.getByTestId(
        getManagedSiteChannelRowActionsButtonTestId("resource-1"),
      ),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.migrate",
      }),
    ).toBeVisible()
    await user.click(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.view",
      }),
    )
    expect(openDetail).toHaveBeenCalledWith("opaque:native")
    expect(trackProductAnalyticsActionStarted).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ViewManagedSiteChannel,
      }),
    )
    await user.click(
      screen.getByTestId(
        getManagedSiteChannelRowActionsButtonTestId("resource-1"),
      ),
    )
    await user.click(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.migrate",
      }),
    )
    expect(trackProductAnalyticsActionStarted).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelMigration,
      }),
    )
  })

  it("opens the shared editor shell for native editor state", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    const editor = createManagedResourceEditor({
      fields: [{ fieldId: "name", type: "text", required: true }],
      initialValues: { name: "Native example" } as EditableResourceProjection,
    })
    getFieldPolicy.mockReturnValue({
      fields: [
        {
          fieldId: "name",
          section: "basic",
          order: 1,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.name.label"),
          renderer: "text",
        },
      ],
      hiddenFields: [],
    })
    installNativeControllers({
      mutation: { editor, editorMode: "create" },
    })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        axonHub: {
          baseUrl: "https://console.example.invalid",
          email: "user@example.invalid",
          password: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.AXON_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const dialog = screen.getByRole("dialog", {
      name: "channelDialog:title.add",
    })
    expect(dialog).toBeVisible()
    expect(within(dialog).getByRole("textbox")).toHaveValue("Native example")
  })

  it("forwards native values to controller validation and submits final values", async () => {
    const user = userEvent.setup()
    const submit = vi.fn(async () => undefined)
    const validate = vi.fn((values: EditableResourceProjection) => {
      const key = values[AXON_HUB_CHANNEL_FIELD_IDS.KEY]
      const supportedModels =
        values[AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]
      return values[AXON_HUB_CHANNEL_FIELD_IDS.NAME] &&
        values[AXON_HUB_CHANNEL_FIELD_IDS.TYPE] &&
        key &&
        typeof key === "object" &&
        "kind" in key &&
        key.kind === "replace" &&
        Array.isArray(supportedModels) &&
        supportedModels.length > 0 &&
        values[AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]
        ? ({ valid: true } as const)
        : ({
            valid: false,
            issues: [
              {
                fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
                code: "required",
              },
            ],
          } as const)
    })
    const editor = createManagedResourceEditor({
      fields: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
          type: "text",
          required: true,
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
          type: "select",
          required: true,
          options: [{ value: AXON_HUB_CHANNEL_TYPE.OPENAI }],
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
          type: "secret",
          required: true,
          secretState: "unavailable",
          canReplace: true,
          allowClear: false,
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
          type: "multi-select",
          required: true,
          options: [],
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
          type: "select",
          required: true,
          options: [],
        },
      ],
      initialValues: {
        name: "",
        type: "",
        key: { kind: "unchanged" },
        supportedModels: [],
        defaultTestModel: "",
      },
      validate,
    })
    getFieldPolicy.mockReturnValue({
      fields: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
          section: "basic",
          order: 1,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.name.label"),
          renderer: "text",
          channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
          section: "basic",
          order: 2,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.type.label"),
          renderer: "select",
          channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type,
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
          section: "connection",
          order: 1,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.key.label"),
          renderer: "secret",
          channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
          section: "models",
          order: 1,
          resolveLabel: (t: TFunction) =>
            t("channelDialog:fields.models.label"),
          renderer: "multi-select",
          channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models,
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
          section: "models",
          order: 2,
          resolveLabel: (t: TFunction) =>
            t("managedSiteChannels:editor.fields.defaultTestModel.label"),
          renderer: "select",
          optionSourceFieldIds: [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS],
          autoSelectFirstOption: true,
        },
      ],
      hiddenFields: [],
    })
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: { editor, editorMode: "create", submit },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const submitButton = screen.getByTestId(
      CHANNEL_DIALOG_TEST_IDS.submitButton,
    )
    expect(submitButton).toBeDisabled()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:editor.validation.required"),
    ).not.toBeInTheDocument()

    await user.type(
      screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
      "Example channel",
    )
    await user.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.typeSelect))
    await user.click(
      await screen.findByRole("option", {
        name: "managedSiteChannels:editor.options.unknown",
      }),
    )
    await user.type(
      screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput),
      "example-key",
    )
    const modelsInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput)
    await user.click(modelsInput)
    await user.type(modelsInput, "model-example")
    await user.keyboard("{Enter}")

    await waitFor(() => expect(submitButton).toBeEnabled())
    await user.click(submitButton)

    expect(submit).toHaveBeenCalledWith({
      name: "Example channel",
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
      key: { kind: "replace", value: "example-key" },
      supportedModels: ["model-example"],
      defaultTestModel: "model-example",
    })
    expect(validate).toHaveBeenLastCalledWith({
      name: "Example channel",
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
      key: { kind: "replace", value: "example-key" },
      supportedModels: ["model-example"],
      defaultTestModel: "model-example",
    })
  })

  it("clears a validation message as soon as the field is corrected", async () => {
    const user = userEvent.setup()
    const validate = vi.fn((values: EditableResourceProjection) =>
      values.name
        ? ({ valid: true } as const)
        : ({
            valid: false,
            issues: [{ fieldId: "name", code: "required" }],
          } as const),
    )
    const editor = createManagedResourceEditor({
      initialValues: { name: "" },
      validate,
    })
    getFieldPolicy.mockReturnValue({
      fields: [
        {
          fieldId: "name",
          section: "basic",
          order: 1,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.name.label"),
          renderer: "text",
        },
      ],
      hiddenFields: [],
    })
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      mutation: {
        editor,
        editorMode: "create",
        editorFailure: {
          code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
          fieldIssues: [{ fieldId: "name", code: "required" }],
        },
      },
    })
    configureNativePreferences(SITE_TYPES.AXON_HUB)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const name = screen.getByRole("textbox", {
      name: /channelDialog:fields.name.label/,
    })
    expect(name).toHaveAccessibleDescription(
      "managedSiteChannels:editor.validation.required",
    )

    await user.type(name, "Corrected channel")

    expect(name).not.toHaveAttribute("aria-invalid", "true")
    expect(
      screen.queryByText("managedSiteChannels:editor.validation.required"),
    ).not.toBeInTheDocument()
    expect(validate).toHaveBeenLastCalledWith({ name: "Corrected channel" })
  })

  it("renders only definition-approved safe native detail fields", () => {
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    getFieldPolicy.mockReturnValue({
      fields: [
        {
          fieldId: "manualModels",
          section: "models",
          order: 1,
          resolveLabel: (t: TFunction) =>
            t("managedSiteChannels:editor.fields.manualModels.label"),
          renderer: "multi-select",
        },
        {
          fieldId: "remark",
          section: "metadata",
          order: 1,
          resolveLabel: (t: TFunction) =>
            t("managedSiteChannels:editor.fields.remark.label"),
          renderer: "textarea",
        },
      ],
      hiddenFields: [],
    })
    installNativeControllers({
      mutation: {
        detail: {
          ...nativeRow,
          name: "Detail example",
          cells: {
            ...nativeRow.cells,
            manualModels: {
              kind: "groups",
              values: ["manual-model"],
              sortValue: "manual-model",
            },
            remark: {
              kind: "text",
              value: "Approved remark",
              sortValue: "Approved remark",
            },
            backendMessage: {
              kind: "text",
              value: "private detail",
              sortValue: "private detail",
            },
          },
        },
      },
    })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        axonHub: {
          baseUrl: "https://console.example.invalid",
          email: "user@example.invalid",
          password: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.AXON_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByText("manual-model")).toBeVisible()
    expect(screen.getByText("Approved remark")).toBeVisible()
    expect(screen.queryByText("private detail")).toBeNull()
    expect(screen.queryByText("backendMessage")).toBeNull()
  })

  it.each([
    {
      label: "selected",
      buttonName: "managedSiteChannels:toolbar.migrateSelected",
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.OpenSelectedManagedSiteChannelMigration,
    },
    {
      label: "filtered",
      buttonName: "managedSiteChannels:toolbar.migrateFiltered",
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.OpenFilteredManagedSiteChannelMigration,
    },
  ])(
    "opens the shared migration dialog shell from native $label migration",
    async ({ buttonName, actionId }) => {
      const user = userEvent.setup()
      installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
      installNativeControllers({
        list: { selectedRowKeys: { "opaque:native": true } },
        migration: {
          targets: [{ value: SITE_TYPES.NEW_API, label: "New API" }],
        },
      })
      getTargetOptions.mockReturnValue([
        {
          siteType: SITE_TYPES.NEW_API,
          labelKey: "settings:managedSite.newApi",
          messagesKey: "newapi",
          config: {
            baseUrl: "https://new-api.example.invalid",
            adminToken: "example-credential",
            userId: "example-user",
          },
        },
      ])
      vi.mocked(useUserPreferencesContext).mockReturnValue({
        preferences: buildUserPreferences({
          claudeCodeHub: {
            baseUrl: "https://console.example.invalid",
            adminToken: "example-credential",
          },
          newApi: {
            baseUrl: "https://new-api.example.invalid",
            username: "example-user",
            password: "example-credential",
            totpSecret: "",
            userId: "",
            adminToken: "",
          },
        }),
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        updateManagedSiteType: vi.fn(),
      } as unknown as ReturnType<typeof useUserPreferencesContext>)

      render(
        <ManagedSiteChannelsRoute
          siteType={SITE_TYPES.CLAUDE_CODE_HUB}
          onReplaceRouteQuery={vi.fn()}
        />,
      )

      await user.click(
        screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton),
      )
      await user.click(
        screen.getByRole("button", {
          name: buttonName,
        }),
      )

      expect(screen.getByRole("dialog")).toBeVisible()
      expect(
        screen.getByText("managedSiteChannels:migration.title"),
      ).toBeVisible()
      const migrationActionIds = trackProductAnalyticsActionStarted.mock.calls
        .map(([context]) => context.actionId)
        .filter(
          (candidate) =>
            candidate ===
              PRODUCT_ANALYTICS_ACTION_IDS.ToggleManagedSiteChannelMigrationMode ||
            candidate === actionId,
        )
      expect(migrationActionIds).toEqual([
        PRODUCT_ANALYTICS_ACTION_IDS.ToggleManagedSiteChannelMigrationMode,
        actionId,
      ])
    },
  )

  it("keeps native loading, empty, and error states in the shared view", () => {
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    installNativeControllers({
      list: { rows: [], allRows: [], totalRows: 0, isLoading: true },
    })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    const { rerender } = render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    expect(screen.getByText("managedSiteChannels:table.loading")).toBeVisible()

    useListController.mockReturnValueOnce({
      ...useListController.mock.results[0]?.value,
      rows: [],
      allRows: [],
      totalRows: 0,
      isLoading: false,
    })
    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    expect(
      screen.getByText("managedSiteChannels:table.emptyNoChannels"),
    ).toBeVisible()

    useListController.mockReturnValueOnce({
      ...useListController.mock.results[0]?.value,
      rows: [],
      allRows: [],
      totalRows: 0,
      isLoading: false,
      failure: { code: "unavailable" },
    })
    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "managedSiteChannels:alerts.unavailable.description",
    )
  })

  it("uses the shared controlled configuration recovery state", () => {
    const refresh = vi.fn(async () => true)
    installNativeDefinition(SITE_TYPES.AXON_HUB)
    installNativeControllers({
      list: {
        rows: [],
        allRows: [],
        totalRows: 0,
        failure: {
          code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
        },
        refresh,
        refreshSilently: refresh,
      },
    })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences(),
      managedSiteType: SITE_TYPES.AXON_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByText("messages:axonhub.configMissing")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "common:actions.goToSettings" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "optionsOverview:unifiedApiGuidance.overview.reopen",
      }),
    ).toBeVisible()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("does not show unrelated resources for a missing native identity and lets the user clear it", async () => {
    const user = userEvent.setup()
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    installNativeControllers()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: buildUserPreferences({
        claudeCodeHub: {
          baseUrl: "https://console.example.invalid",
          adminToken: "example-credential",
        },
      }),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      updateManagedSiteType: vi.fn(),
    } as unknown as ReturnType<typeof useUserPreferencesContext>)
    const onReplaceRouteQuery = vi.fn()

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        routeParams={{
          channelId: "resource-1",
          search: "Native",
          nativeView: "compact",
        }}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )

    expect(onReplaceRouteQuery).not.toHaveBeenCalled()
    expect(screen.queryByText("Native example")).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.clearSearch",
      }),
    )
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput),
    ).toHaveFocus()
    expect(onReplaceRouteQuery).toHaveBeenLastCalledWith({
      channelId: undefined,
      search: undefined,
      nativeView: "compact",
    })
  })
})
