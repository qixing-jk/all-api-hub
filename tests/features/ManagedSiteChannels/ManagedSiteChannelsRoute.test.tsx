import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ChannelEditorShell } from "~/components/dialogs/ChannelDialog/components/ChannelEditorShell"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ManagedSiteChannelsRoute } from "~/features/ManagedSiteChannels/ManagedSiteChannelsRoute"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsLabels,
  ManagedChannelsRowViewModel,
  ManagedSiteMigrationCallbacks,
  ManagedSiteMigrationLabels,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import { ManagedSiteChannelsView } from "~/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView"
import { ManagedSiteMigrationDialogView } from "~/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView"
import {
  getManagedSiteChannelRowActionsButtonTestId,
  getManagedSiteChannelRowSelectTestId,
  getManagedSiteChannelRowTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import {
  MANAGED_RESOURCE_MODES,
  MANAGED_RESOURCE_PRODUCT_ACTIONS,
  type ManagedResourceProductAction,
} from "~/services/accountSiteDefinitions/contracts"
import * as definitionRegistry from "~/services/accountSiteDefinitions/registry"
import type {
  EditableResourceProjection,
  ManagedResourceRegistration,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { MANAGED_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/managedResourceNative"
import * as nativeRegistry from "~/services/apiAdapters/managedResources/registry"
import type { ManagedSiteTargetOption } from "~/services/managedSites/utils/managedSite"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
import { createManagedResourceEditor } from "~~/tests/test-utils/managedResourceWorkspace"

const nestedLegacyLabels = new Proxy<Record<string, string>>(
  {},
  { get: (_target, key) => `legacy:${String(key)}` },
)
const legacyLabels = new Proxy<Record<string, unknown>>(
  {},
  {
    get: (_target, key) =>
      ["deleteResultStatusLabels", "rowActions", "statusLabels"].includes(
        String(key),
      )
        ? nestedLegacyLabels
        : `legacy:${String(key)}`,
  },
) as unknown as ManagedChannelsLabels

const legacyCallbacks = {
  onRefresh: vi.fn(),
  onSearchChange: vi.fn(),
  onReplaceRouteQuery: vi.fn(),
  onSettings: vi.fn(),
  onConfigurationRequired: vi.fn(),
  onSiteTypeChange: vi.fn(),
  onChannelIdFilterChange: vi.fn(),
  onStatusFilterChange: vi.fn(),
  onSortingChange: vi.fn(),
  onColumnVisibilityChange: vi.fn(),
  onPaginationChange: vi.fn(),
  onSelectedRowKeysChange: vi.fn(),
  onCreate: vi.fn(),
  onToggleMigrationMode: vi.fn(),
  onMigrateSelected: vi.fn(),
  onMigrateFiltered: vi.fn(),
  onEdit: vi.fn(),
  onView: vi.fn(),
  onMigrate: vi.fn(),
  onDelete: vi.fn(),
  onSync: vi.fn(async () => undefined),
  onOpenSync: vi.fn(async () => undefined),
  onFilters: vi.fn(),
  onDeleteSelected: vi.fn(),
  onSyncSelected: vi.fn(async () => undefined),
  onDeleteConfirm: vi.fn(),
  onDeleteCancel: vi.fn(),
} satisfies ManagedChannelsCallbacks

const legacyMigrationLabels = new Proxy<Record<string, string>>(
  {},
  { get: (_target, key) => `legacy:migration.${String(key)}` },
) as ManagedSiteMigrationLabels

const legacyMigrationCallbacks = {
  onTargetChange: vi.fn(),
  onRefreshPreview: vi.fn(),
  onRecoverRefreshRequired: vi.fn(),
  onConfirm: vi.fn(),
  onClose: vi.fn(),
  onOpenConfirmation: vi.fn(),
  onCloseConfirmation: vi.fn(),
} satisfies ManagedSiteMigrationCallbacks

function LegacyManagedSiteChannelsFixture() {
  const valueColumn = (id: string) => ({
    id,
    label: `legacy:${id}`,
    renderer: "value" as const,
    accessor: { kind: "cell" as const, key: id },
    canHide: true,
    defaultVisible: true,
    visible: true,
    extension: { kind: "legacy-common" as const },
  })
  const columns = [
    {
      id: "select",
      label: "",
      renderer: "select" as const,
      canHide: false,
      defaultVisible: true,
      visible: true,
      extension: { kind: "legacy-common" as const },
    },
    {
      id: "id",
      label: "legacy:id",
      renderer: "identifier" as const,
      accessor: { kind: "displayIdentifier" as const },
      canHide: true,
      defaultVisible: true,
      visible: true,
      extension: { kind: "legacy-common" as const },
    },
    {
      id: "name",
      label: "legacy:name",
      renderer: "channel" as const,
      accessor: { kind: "name" as const },
      canHide: false,
      defaultVisible: true,
      visible: true,
      extension: { kind: "legacy-common" as const },
    },
    valueColumn("type"),
    valueColumn("supportedModels"),
    {
      ...valueColumn("status"),
      facet: { kind: "status" as const },
    },
    valueColumn("tags"),
    {
      id: "actions",
      label: "legacy:actions",
      renderer: "actions" as const,
      canHide: false,
      defaultVisible: true,
      visible: true,
      extension: { kind: "legacy-common" as const },
    },
  ]
  const row = {
    rowKey: "opaque:legacy",
    testToken: "legacy-resource-1",
    displayIdentifier: "1",
    displayIdentifierSort: 1,
    name: "Legacy example",
    baseURL: "https://legacy.example.invalid",
    searchText: "Legacy example https://legacy.example.invalid",
    cells: {
      type: { kind: "text" as const, value: "OpenAI", sortValue: "OpenAI" },
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
        value: "Enabled",
        sortValue: "enabled",
        tone: "success" as const,
      },
    },
    capabilities: { canView: true, canEdit: true, canDelete: true },
  }

  const scenario = legacyFixtureScenario.current
  const isLoading = scenario === "loading"
  const hasRows = !["loading", "empty", "error"].includes(scenario)
  const searchValue = scenario === "focus" ? "Legacy" : ""

  return (
    <>
      <ManagedSiteChannelsView
        state={{
          rows: hasRows ? [row] : [],
          routeQuery: searchValue ? { search: searchValue } : {},
          siteTypeValue: "legacy",
          siteTypeOptions: [{ value: "legacy", label: "Legacy" }],
          selectedRowKeys: {},
          sorting: [{ id: "id", desc: true }],
          searchValue,
          channelIdFilterValue: "",
          statusFilterValues: [],
          pagination: { pageIndex: 0, pageSize: 10 },
          total: hasRows ? 1 : 0,
          isLoading,
          isRefreshing: false,
          failure:
            scenario === "error"
              ? { message: "legacy:error-message", category: "legacy:error" }
              : null,
          isConfigurationMissing: false,
          migrationMode: false,
          columns,
          deleteState: {
            isOpen: false,
            isWorking: false,
            rowKeys: [],
            results: [],
            requiresRefresh: false,
          },
        }}
        capabilities={{
          canCreate: true,
          canRefresh: true,
          canDeleteSelected: true,
          canSyncSelected: false,
          canToggleMigration: false,
          canMigrateSelected: false,
          canMigrateFiltered: false,
          showNewApiOnlyActions: false,
          hasMigrationTargets: false,
        }}
        callbacks={legacyCallbacks}
        labels={legacyLabels}
        title="legacy managed channels"
        description="Legacy fixture"
        configurationMissingDescription="Configure the legacy fixture"
        siteTypeLabel="Legacy site type"
      />
      {scenario === "editor" ? (
        <ChannelEditorShell
          isOpen
          title="legacy:editor"
          description="legacy:editor-description"
          onClose={vi.fn()}
          onSubmit={(event) => event.preventDefault()}
          submitLabel="legacy:save"
          closeLabel="legacy:cancel"
        >
          <input
            aria-label="legacy editor field"
            defaultValue="Legacy example"
          />
        </ChannelEditorShell>
      ) : null}
      {scenario === "migration" ? (
        <ManagedSiteMigrationDialogView
          isOpen
          selectedTarget=""
          targets={[]}
          preview={null}
          result={null}
          labels={legacyMigrationLabels}
          isConfirmationOpen={false}
          callbacks={legacyMigrationCallbacks}
        />
      ) : null}
    </>
  )
}

const {
  legacyRender,
  toastSuccess,
  useListController,
  useMigrationController,
  useMutationController,
  getFieldPolicy,
  getTargetOptions,
  legacyFixtureScenario,
} = vi.hoisted(() => ({
  legacyRender: vi.fn(),
  useListController: vi.fn(),
  useMigrationController: vi.fn(),
  useMutationController: vi.fn(),
  getFieldPolicy: vi.fn(),
  legacyFixtureScenario: {
    current: "normal" as
      | "normal"
      | "loading"
      | "empty"
      | "error"
      | "editor"
      | "migration"
      | "focus",
  },
  getTargetOptions: vi.fn<(...args: unknown[]) => ManagedSiteTargetOption[]>(
    () => [],
  ),
  toastSuccess: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: { success: toastSuccess },
}))

vi.mock("~/features/ManagedSiteChannels/ManagedSiteChannels", () => ({
  default: (props: unknown) => {
    legacyRender(props)
    return <LegacyManagedSiteChannelsFixture />
  },
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
vi.mock("~/services/managedSites/utils/managedSite", async (importActual) => ({
  ...(await importActual()),
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
    type: { kind: "text" as const, value: "OpenAI", sortValue: "OpenAI" },
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
      value: "Enabled",
      sortValue: "enabled",
      tone: "success" as const,
    },
  },
  capabilities: { canView: true, canEdit: true, canDelete: true },
}

const registrationFor = (
  siteType: typeof SITE_TYPES.AXON_HUB | typeof SITE_TYPES.CLAUDE_CODE_HUB,
): ManagedResourceRegistration => ({
  siteType,
  kind: "channel",
  open: vi.fn(),
})

const installNativeDefinition = (
  siteType: typeof SITE_TYPES.AXON_HUB | typeof SITE_TYPES.CLAUDE_CODE_HUB,
  actions?: readonly ManagedResourceProductAction[],
) => {
  const axonHubDefinition = definitionRegistry.getAccountSiteDefinition(
    SITE_TYPES.AXON_HUB,
  )!
  vi.spyOn(definitionRegistry, "getAccountSiteDefinition").mockReturnValue({
    ...axonHubDefinition,
    siteType,
    managedResource: {
      ...axonHubDefinition.managedResource!,
      mode: MANAGED_RESOURCE_MODES.NativeResource,
      ...(actions ? { actions } : {}),
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
    submit: vi.fn(),
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

const configureNativePreferences = (
  siteType: typeof SITE_TYPES.AXON_HUB | typeof SITE_TYPES.CLAUDE_CODE_HUB,
) => {
  vi.mocked(useUserPreferencesContext).mockReturnValue({
    preferences: buildUserPreferences({
      ...(siteType === SITE_TYPES.AXON_HUB
        ? {
            axonHub: {
              baseUrl: "https://console.example.invalid",
              email: "user@example.invalid",
              password: "example-credential",
            },
          }
        : {
            claudeCodeHub: {
              baseUrl: "https://console.example.invalid",
              adminToken: "example-credential",
            },
          }),
    }),
    managedSiteType: siteType,
    updateManagedSiteType: vi.fn(),
  } as unknown as ReturnType<typeof useUserPreferencesContext>)
}

describe("ManagedSiteChannelsRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    legacyRender.mockClear()
    useListController.mockReset()
    useMutationController.mockReset()
    useMigrationController.mockReset()
    getFieldPolicy.mockReset()
    getTargetOptions.mockReset()
    getTargetOptions.mockReturnValue([])
    toastSuccess.mockReset()
    legacyFixtureScenario.current = "normal"
  })

  it("keeps the production New API definition on the legacy controller", () => {
    const onReplaceRouteQuery = vi.fn()

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        refreshKey={7}
        routeParams={{ search: "example", nativeView: "compact" }}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />,
    )

    expect(screen.getByText("legacy managed channels")).toBeVisible()
    expect(
      definitionRegistry.getAccountSiteDefinition(SITE_TYPES.NEW_API)
        ?.managedResource?.mode,
    ).toBe(MANAGED_RESOURCE_MODES.LegacyChannel)
    expect(legacyRender).toHaveBeenCalledWith({
      siteType: SITE_TYPES.NEW_API,
      refreshKey: 7,
      routeParams: { search: "example", nativeView: "compact" },
      onReplaceRouteQuery,
    })
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
      definitionRegistry.getAccountSiteDefinition(SITE_TYPES.AXON_HUB)
        ?.managedResource?.mode,
    ).toBe(MANAGED_RESOURCE_MODES.NativeResource)
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
    ).toBeVisible()
    expect(legacyRender).not.toHaveBeenCalled()
    expect(useListController).toHaveBeenCalled()
    expect(
      screen.getByText("managedSiteChannels:resourceDescription"),
    ).toBeVisible()
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
    mutationOptions?.onMutationSuccess("create")
    mutationOptions?.onMutationSuccess("edit")

    expect(toastSuccess.mock.calls).toEqual([
      ["managedSiteChannels:toasts.channelSaved"],
      ["managedSiteChannels:toasts.channelUpdated"],
    ])
  })

  it("keeps the shared legacy and native route surfaces structurally aligned", () => {
    const readSurface = (testToken: string) => {
      const buttons = screen.getAllByRole("button")
      const refresh = screen.getByTestId(
        MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton,
      )
      const create = screen.getByTestId(
        MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton,
      )
      return {
        refreshBeforeCreate: buttons.indexOf(refresh) < buttons.indexOf(create),
        columnCount: screen.getAllByRole("columnheader").length,
        hasRowSelect: Boolean(
          screen.getByTestId(getManagedSiteChannelRowSelectTestId(testToken)),
        ),
        hasRowActions: Boolean(
          screen.getByTestId(
            getManagedSiteChannelRowActionsButtonTestId(testToken),
          ),
        ),
      }
    }

    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    const legacySurface = readSurface("legacy-resource-1")
    cleanup()

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

    expect(readSurface("resource-1")).toEqual(legacySurface)
  })

  it.each(["loading", "empty", "error"] as const)(
    "keeps the shared %s state aligned between legacy and native routes",
    (scenario) => {
      const readState = (testToken: string) => {
        const content = document.body.textContent ?? ""
        return {
          hasAlert: Boolean(screen.queryByRole("alert")),
          hasRow: Boolean(
            screen.queryByTestId(
              getManagedSiteChannelRowSelectTestId(testToken),
            ),
          ),
          hasLoadingText: content.includes("loading"),
          hasEmptyText: content.includes("empty"),
        }
      }

      legacyFixtureScenario.current = scenario
      render(
        <ManagedSiteChannelsRoute
          siteType={SITE_TYPES.NEW_API}
          onReplaceRouteQuery={vi.fn()}
        />,
      )
      const legacyState = readState("legacy-resource-1")
      cleanup()

      installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
      installNativeControllers({
        list:
          scenario === "loading"
            ? { rows: [], allRows: [], totalRows: 0, isLoading: true }
            : scenario === "empty"
              ? { rows: [], allRows: [], totalRows: 0 }
              : {
                  rows: [],
                  allRows: [],
                  totalRows: 0,
                  failure: { code: "unavailable" },
                },
      })
      configureNativePreferences(SITE_TYPES.CLAUDE_CODE_HUB)
      render(
        <ManagedSiteChannelsRoute
          siteType={SITE_TYPES.CLAUDE_CODE_HUB}
          onReplaceRouteQuery={vi.fn()}
        />,
      )

      expect(readState("resource-1")).toEqual(legacyState)
    },
  )

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

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "managedSiteChannels:alerts.editorSaveError.title",
    )
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "managedSiteChannels:alerts.editorSaveError.description",
    )
  })

  it("keeps save failures visible on the page after the editor closes", () => {
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "managedSiteChannels:alerts.editorSaveError.title",
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "managedSiteChannels:alerts.editorSaveError.description",
    )
  })

  it("keeps an uncertain editor mutation visible as a page alert after the editor closes", () => {
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

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "managedSiteChannels:alerts.partialMutation.title",
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
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
    rerender(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    expect(screen.getByText(nativeRow.name)).toBeVisible()
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

  it("keeps editor shell behavior aligned between legacy and native routes", () => {
    legacyFixtureScenario.current = "editor"
    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    const legacyDialog = screen.queryByRole("dialog")
    const legacyEditor = {
      hasDialog: Boolean(legacyDialog),
      hasTextbox: Boolean(
        legacyDialog && within(legacyDialog).queryByRole("textbox"),
      ),
    }
    cleanup()

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
    installNativeControllers({ mutation: { editor, editorMode: "create" } })
    configureNativePreferences(SITE_TYPES.AXON_HUB)
    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.AXON_HUB}
        onReplaceRouteQuery={vi.fn()}
      />,
    )

    const nativeDialog = screen.queryByRole("dialog")
    expect({
      hasDialog: Boolean(nativeDialog),
      hasTextbox: Boolean(
        nativeDialog && within(nativeDialog).queryByRole("textbox"),
      ),
    }).toEqual(legacyEditor)
  })

  it("keeps migration dialog behavior aligned between legacy and native routes", async () => {
    legacyFixtureScenario.current = "migration"
    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    const legacyMigration = Boolean(screen.queryByRole("dialog"))
    cleanup()

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
    configureNativePreferences(SITE_TYPES.CLAUDE_CODE_HUB)
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
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    )

    expect(Boolean(screen.queryByRole("dialog"))).toBe(legacyMigration)
  })

  it("keeps focused search recovery aligned between legacy and native routes", async () => {
    const user = userEvent.setup()
    legacyFixtureScenario.current = "focus"
    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.NEW_API}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    await user.click(screen.getByRole("button", { name: "legacy:clearSearch" }))
    const legacyFocused =
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput) ===
      document.activeElement
    cleanup()

    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB)
    installNativeControllers()
    configureNativePreferences(SITE_TYPES.CLAUDE_CODE_HUB)
    render(
      <ManagedSiteChannelsRoute
        siteType={SITE_TYPES.CLAUDE_CODE_HUB}
        routeParams={{ search: "Native" }}
        onReplaceRouteQuery={vi.fn()}
      />,
    )
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.clearSearch",
      }),
    )
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput) ===
        document.activeElement,
    ).toBe(legacyFocused)
  })

  it("renders a controlled integration failure without falling back when a native registration is missing", () => {
    const axonHubDefinition = definitionRegistry.getAccountSiteDefinition(
      SITE_TYPES.AXON_HUB,
    )
    expect(axonHubDefinition?.managedResource).toBeDefined()
    vi.spyOn(definitionRegistry, "getAccountSiteDefinition").mockReturnValue({
      ...axonHubDefinition!,
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      managedResource: {
        ...axonHubDefinition!.managedResource!,
        mode: MANAGED_RESOURCE_MODES.NativeResource,
      },
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
    expect(legacyRender).not.toHaveBeenCalled()
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
    expect(legacyRender).not.toHaveBeenCalled()
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
        name: "managedSiteChannels:table.columns.models",
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
    expect(legacyRender).not.toHaveBeenCalled()
  })

  it("keeps controller callback identities stable across route rerenders", () => {
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
    const secondOptions = useListController.mock.calls.at(-1)?.[0]

    expect(secondOptions.onUnsupportedSearch).toBe(
      firstOptions.onUnsupportedSearch,
    )
    expect(secondOptions.resolveLabel).toBe(firstOptions.resolveLabel)

    secondOptions.onUnsupportedSearch()
    expect(onReplaceRouteQuery).toHaveBeenCalledWith({
      nativeView: "expanded",
      search: undefined,
    })
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

  it("requires both adapter and product policy create capability", () => {
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB, [])
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
      screen.queryByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton),
    ).toBeNull()
  })

  it("enables the native row migration action only when policy and targets allow it", async () => {
    const user = userEvent.setup()
    installNativeDefinition(SITE_TYPES.CLAUDE_CODE_HUB, [
      MANAGED_RESOURCE_PRODUCT_ACTIONS.Migrate,
    ])
    installNativeControllers()
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
    const submit = vi.fn()
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
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
          section: "basic",
          order: 2,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.type.label"),
          renderer: "select",
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
          section: "connection",
          order: 1,
          resolveLabel: (t: TFunction) => t("channelDialog:fields.key.label"),
          renderer: "secret",
        },
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
          section: "models",
          order: 1,
          resolveLabel: (t: TFunction) =>
            t("channelDialog:fields.models.label"),
          renderer: "multi-select",
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

  it("opens the shared migration dialog shell from native migration mode", async () => {
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
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    )

    expect(screen.getByRole("dialog")).toBeVisible()
    expect(
      screen.getByText("managedSiteChannels:migration.title"),
    ).toBeVisible()
  })

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

  it("uses the shared controlled configuration recovery state", async () => {
    const user = userEvent.setup()
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
    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("preserves a native channel deep link until the user changes filters", async () => {
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
    expect(
      screen.getByText("managedSiteChannels:table.emptyFiltered"),
    ).toBeVisible()
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
