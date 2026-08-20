import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type {
  ManagedChannelsCallbacks,
  ManagedChannelsDeleteState,
  ManagedChannelsLabels,
  ManagedChannelsPresentationState,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import { ManagedSiteChannelsView } from "~/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView"
import { compareManagedSiteChannelStatusValues } from "~/features/ManagedSiteChannels/presentation/useManagedSiteChannelsTable"
import { MANAGED_SITE_CHANNELS_TEST_IDS } from "~/features/ManagedSiteChannels/testIds"

const rows = [
  {
    rowKey: "opaque:first",
    testToken: "Example primary",
    displayIdentifier: "101",
    displayIdentifierSort: 101,
    name: "Example primary",
    baseURL: "https://primary.example.invalid/v1",
    searchText:
      "101 Example primary https://primary.example.invalid/v1 default",
    cells: {
      type: { kind: "text" as const, value: "OpenAI", sortValue: "OpenAI" },
      models: { kind: "text" as const, value: "2", sortValue: 2 },
      group: {
        kind: "groups" as const,
        values: ["default"],
        sortValue: "default",
      },
      status: {
        kind: "status" as const,
        value: "Enabled",
        sortValue: 1,
        tone: "success" as const,
      },
      priority: { kind: "text" as const, value: "3", sortValue: 3 },
      weight: { kind: "text" as const, value: "2", sortValue: 2 },
    },
    capabilities: { canEdit: true, canDelete: true },
  },
]

const labels: ManagedChannelsLabels = {
  searchPlaceholder: "Search channels...",
  clearSearch: "Clear search",
  refresh: "Refresh",
  cancelRefresh: "Cancel refresh",
  status: "Status",
  statusLabel: "Filter by status",
  columns: "Columns",
  toggleColumns: "Toggle columns",
  migrateSelected: "Migrate selected",
  migrateFiltered: "Migrate filtered",
  deleteSelected: "Delete selected",
  syncSelected: "Sync selected",
  addChannel: "Add channel",
  loading: "Loading",
  emptyFiltered: "No matches",
  emptyNoChannels: "No channels",
  rowsPerPage: "Rows per page",
  paginationSummary: (start, end, total) => `${start}-${end} of ${total}`,
  noEntries: "No entries",
  paginationPrev: "Previous page",
  paginationNext: "Next page",
  selectAll: "Select all",
  selectRow: "Select row",
  statusLabels: { "1": "Enabled" },
  settings: "Settings",
  configurationRequired: "Configuration required",
  goToSettings: "Go to settings",
  deleteTitle: "Delete channel",
  deleteTitlePlural: "Delete channels",
  deleteDescription: "Confirm deletion",
  deleteCancel: "Cancel",
  deleteConfirm: "Delete",
  deleting: "Deleting",
  deleteResultsTitle: "Delete results",
  deleteRefreshRequired: "Refresh before deleting again.",
  deleteRefreshAction: "Refresh channels",
  deleteResultStatusLabels: {
    success: "Deleted",
    failed: "Failed",
    uncertain: "Uncertain",
  },
  migrationBeta: "Beta",
  enterMigrationMode: "Enter migration mode",
  exitMigrationMode: "Exit migration mode",
  rowActions: {
    trigger: "Open actions",
    edit: "Edit",
    view: "View",
    migrate: "Migrate",
    sync: "Sync",
    syncing: "Syncing",
    openSync: "Open sync",
    filters: "Filters",
    delete: "Delete",
  },
}

const columns = [
  {
    id: "select" as const,
    label: "",
    renderer: "select" as const,
    canHide: false,
    defaultVisible: true,
    visible: true,
    extension: { kind: "legacy-common" as const },
  },
  {
    id: "id" as const,
    label: "ID",
    renderer: "identifier" as const,
    accessor: { kind: "displayIdentifier" as const },
    routeFilter: { kind: "exact" as const, queryKey: "channelId" as const },
    canHide: true,
    defaultVisible: true,
    visible: true,
    sort: {
      accessor: { kind: "displayIdentifierSort" as const },
      defaultDirection: "desc" as const,
      missing: "last" as const,
    },
    size: 40,
    extension: { kind: "legacy-common" as const },
  },
  {
    id: "name" as const,
    label: "Name",
    renderer: "channel" as const,
    accessor: { kind: "name" as const },
    canHide: false,
    defaultVisible: true,
    visible: true,
    sort: {
      accessor: { kind: "name" as const },
      defaultDirection: "asc" as const,
      missing: "last" as const,
    },
    size: 300,
    extension: { kind: "legacy-common" as const },
  },
  ...(["type", "models", "group", "priority", "weight"] as const).map((id) => ({
    id,
    label: id[0].toUpperCase() + id.slice(1),
    renderer: "value" as const,
    accessor: { kind: "cell" as const, key: id },
    canHide: true,
    defaultVisible: true,
    visible: true,
    sort: {
      accessor: { kind: "cellSortValue" as const, key: id },
      defaultDirection: "asc" as const,
      missing: "last" as const,
    },
    extension: { kind: "legacy-common" as const },
  })),
  {
    id: "status" as const,
    label: "Status",
    renderer: "value" as const,
    accessor: { kind: "cell" as const, key: "status" },
    canHide: true,
    defaultVisible: true,
    visible: true,
    sort: {
      accessor: { kind: "cellSortValue" as const, key: "status" },
      defaultDirection: "asc" as const,
      missing: "last" as const,
    },
    facet: { kind: "status" as const },
    extension: { kind: "legacy-common" as const },
  },
  {
    id: "actions" as const,
    label: "Actions",
    renderer: "actions" as const,
    canHide: false,
    defaultVisible: true,
    visible: true,
    extension: { kind: "legacy-common" as const },
  },
]

const createState = (
  overrides: Partial<ManagedChannelsPresentationState> = {},
): ManagedChannelsPresentationState => ({
  rows,
  routeQuery: {},
  siteTypeValue: "legacy",
  siteTypeOptions: [
    { value: "legacy", label: "Legacy" },
    { value: "native", label: "Native" },
  ],
  selectedRowKeys: {},
  sorting: [{ id: "id", desc: true }],
  searchValue: "",
  channelIdFilterValue: "",
  statusFilterValues: [],
  pagination: { pageIndex: 0, pageSize: 10 },
  total: rows.length,
  isLoading: false,
  isRefreshing: false,
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
  ...overrides,
})

const createCallbacks = (
  overrides: Partial<ManagedChannelsCallbacks> = {},
): ManagedChannelsCallbacks => ({
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
  onSync: vi.fn().mockResolvedValue(undefined),
  onOpenSync: vi.fn().mockResolvedValue(undefined),
  onFilters: vi.fn(),
  onDeleteSelected: vi.fn(),
  onSyncSelected: vi.fn().mockResolvedValue(undefined),
  onDeleteConfirm: vi.fn(),
  onDeleteCancel: vi.fn(),
  ...overrides,
})

const commonProps = {
  capabilities: {
    canCreate: true,
    canRefresh: true,
    canDeleteSelected: true,
    canSyncSelected: true,
    canToggleMigration: true,
    canMigrateSelected: true,
    canMigrateFiltered: true,
    hasMigrationTargets: true,
  },
  labels,
  title: "Channels management",
  description: "Manage channels",
  configurationMissingDescription: "Configure a managed site",
  siteTypeLabel: "Site type",
}

describe("ManagedSiteChannelsView", () => {
  it("keeps the legacy filter dialog outside the shared presentation import boundary", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView.tsx",
      ),
      "utf8",
    )

    expect(source).not.toMatch(/(?:from|import\()[^\n]*ChannelFilterDialog/)
  })

  it("renders the legacy filter slot but omits the filter action for a native fixture", async () => {
    const user = userEvent.setup()
    const legacyRow = {
      ...rows[0],
      capabilities: { ...rows[0].capabilities, canFilter: true },
    }
    const { rerender } = render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({ rows: [legacyRow] })}
        callbacks={createCallbacks()}
        filterDialog={<div>Legacy filter dialog</div>}
      />,
    )

    expect(screen.getByText("Legacy filter dialog")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Open actions" }))
    expect(screen.getByRole("menuitem", { name: "Filters" })).toBeVisible()
    await user.keyboard("{Escape}")

    rerender(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          siteTypeValue: "native",
          rows: [
            {
              ...legacyRow,
              capabilities: { ...legacyRow.capabilities, canFilter: false },
            },
          ],
        })}
        callbacks={createCallbacks()}
      />,
    )

    expect(screen.queryByText("Legacy filter dialog")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Open actions" }))
    expect(screen.queryByRole("menuitem", { name: "Filters" })).toBeNull()
  })

  it("renders controlled shell actions and preserves unrelated route query fields", async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const onReplaceRouteQuery = vi.fn()
    const onSettings = vi.fn()
    const onSiteTypeChange = vi.fn()

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          routeQuery: { channelId: "101", nativeView: "compact" },
        })}
        callbacks={createCallbacks({
          onSearchChange,
          onReplaceRouteQuery,
          onSettings,
          onSiteTypeChange,
        })}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Settings" }))
    expect(onSettings).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("combobox", { name: "Site type" }))
    await user.click(screen.getByRole("option", { name: "Native" }))
    expect(onSiteTypeChange).toHaveBeenCalledWith("native")

    await user.type(screen.getByPlaceholderText("Search channels..."), "x")
    expect(onSearchChange).toHaveBeenLastCalledWith("x")
    expect(onReplaceRouteQuery).toHaveBeenLastCalledWith({
      channelId: undefined,
      nativeView: "compact",
      search: "x",
    })
  })

  it("routes the controlled configuration recovery action", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({ isConfigurationMissing: true })}
        callbacks={createCallbacks({ onRefresh })}
      />,
    )

    expect(
      screen.getByText("common:status.configurationRequired"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("keeps a refreshing toolbar action available for cancellation", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({ isRefreshing: true })}
        callbacks={createCallbacks({ onRefresh })}
      />,
    )

    const cancelRefreshButton = screen.getByRole("button", {
      name: "Cancel refresh",
    })
    expect(cancelRefreshButton).toBeEnabled()
    expect(cancelRefreshButton).toHaveAttribute("aria-busy", "true")

    await user.click(cancelRefreshButton)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it("keeps toolbar order and common columns while emitting opaque row keys", async () => {
    const user = userEvent.setup()
    const onSelectedRowKeysChange = vi.fn()
    const callbacks = createCallbacks({ onSelectedRowKeysChange })

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState()}
        callbacks={callbacks}
      />,
    )

    const toolbarButtons = screen.getAllByRole("button")
    expect(
      toolbarButtons.findIndex((button) =>
        button.textContent?.includes("Delete selected"),
      ),
    ).toBeLessThan(
      toolbarButtons.findIndex((button) =>
        button.textContent?.includes("Add channel"),
      ),
    )
    expect(screen.getByRole("columnheader", { name: "ID" })).toBeVisible()
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeVisible()
    expect(screen.getByRole("columnheader", { name: "Type" })).toBeVisible()
    expect(screen.getByRole("columnheader", { name: "Models" })).toBeVisible()
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeVisible()

    await user.click(screen.getByRole("checkbox", { name: "Select row" }))
    expect(onSelectedRowKeysChange).toHaveBeenCalledWith({
      "opaque:first": true,
    })
    expect(screen.queryByText("opaque:first")).toBeNull()
  })

  it("filters by display fields only after the controller updates state", async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const callbacks = createCallbacks({ onSearchChange })
    const { rerender } = render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState()}
        callbacks={callbacks}
      />,
    )

    await user.type(
      screen.getByPlaceholderText("Search channels..."),
      "missing",
    )
    expect(onSearchChange).toHaveBeenLastCalledWith("g")
    expect(screen.getByText("Example primary")).toBeVisible()

    rerender(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({ searchValue: "missing" })}
        callbacks={callbacks}
      />,
    )
    expect(screen.getByText("No matches")).toBeVisible()
    expect(screen.queryByText("opaque:first")).toBeNull()
  })

  it("applies an exact route filter through the declared native value accessor", async () => {
    const user = userEvent.setup()
    const onMigrateFiltered = vi.fn()
    const nativeRows = [
      {
        ...rows[0],
        rowKey: "opaque:native-12",
        name: "Channel twelve",
        cells: {
          ...rows[0].cells,
          "newApi.id": { kind: "text" as const, value: "12", sortValue: 12 },
        },
      },
      {
        ...rows[0],
        rowKey: "opaque:native-112",
        name: "Channel one hundred twelve",
        cells: {
          ...rows[0].cells,
          "newApi.id": {
            kind: "text" as const,
            value: "112",
            sortValue: 112,
          },
        },
      },
    ]
    const nativeColumns = columns.map((column) =>
      column.id === "id"
        ? {
            ...column,
            renderer: "value" as const,
            accessor: { kind: "cell" as const, key: "newApi.id" },
          }
        : column,
    )

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          rows: nativeRows,
          total: nativeRows.length,
          columns: nativeColumns,
          channelIdFilterValue: "12",
          migrationMode: true,
        })}
        callbacks={createCallbacks({ onMigrateFiltered })}
      />,
    )

    expect(screen.getByText("Channel twelve")).toBeVisible()
    expect(screen.queryByText("Channel one hundred twelve")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Migrate filtered" }))
    expect(onMigrateFiltered).toHaveBeenCalledWith(["opaque:native-12"])
  })

  it("emits controlled selection changes without keeping private state", async () => {
    const user = userEvent.setup()
    const onSelectedRowKeysChange = vi.fn()
    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState()}
        callbacks={createCallbacks({ onSelectedRowKeysChange })}
      />,
    )

    const checkbox = screen.getByRole("checkbox", { name: "Select row" })
    await user.click(checkbox)
    expect(onSelectedRowKeysChange).toHaveBeenCalledWith({
      "opaque:first": true,
    })
    expect(checkbox).not.toBeChecked()
  })

  it("keeps duplicate names independently selected by opaque row key across rename", async () => {
    const user = userEvent.setup()
    const onSelectedRowKeysChange = vi.fn()
    const duplicateRows = [
      {
        ...rows[0],
        rowKey: "opaque:duplicate-a",
        testToken: "safe-token-a",
        name: "Duplicate name",
      },
      {
        ...rows[0],
        rowKey: "opaque:duplicate-b",
        testToken: "safe-token-b",
        name: "Duplicate name",
      },
    ]
    const callbacks = createCallbacks({ onSelectedRowKeysChange })
    const { rerender } = render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          rows: duplicateRows,
          total: duplicateRows.length,
        })}
        callbacks={callbacks}
      />,
    )

    const duplicateBodyRows = screen
      .getAllByRole("row")
      .filter((row) => row.textContent?.includes("Duplicate name"))
    await user.click(
      within(duplicateBodyRows[0]).getByRole("checkbox", {
        name: "Select row",
      }),
    )
    expect(onSelectedRowKeysChange).toHaveBeenLastCalledWith({
      "opaque:duplicate-a": true,
    })

    rerender(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          rows: [
            { ...duplicateRows[0], name: "Renamed duplicate" },
            duplicateRows[1],
          ],
          total: duplicateRows.length,
          selectedRowKeys: { "opaque:duplicate-a": true },
        })}
        callbacks={callbacks}
      />,
    )

    const renamedRow = screen.getByText("Renamed duplicate").closest("tr")
    const remainingDuplicateRow = screen
      .getByText("Duplicate name")
      .closest("tr")
    expect(renamedRow).toBeTruthy()
    expect(remainingDuplicateRow).toBeTruthy()
    expect(
      within(renamedRow!).getByRole("checkbox", { name: "Select row" }),
    ).toBeChecked()
    expect(
      within(remainingDuplicateRow!).getByRole("checkbox", {
        name: "Select row",
      }),
    ).not.toBeChecked()
  })

  it("preserves controlled selection across client-side pages", async () => {
    const user = userEvent.setup()
    const onSelectedRowKeysChange = vi.fn()
    const onPaginationChange = vi.fn()
    const pagedRows = [
      { ...rows[0], rowKey: "opaque:page-one", name: "Page one" },
      { ...rows[0], rowKey: "opaque:page-two", name: "Page two" },
    ]
    const callbacks = createCallbacks({
      onPaginationChange,
      onSelectedRowKeysChange,
    })
    const { rerender } = render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          rows: pagedRows,
          total: pagedRows.length,
          pagination: { pageIndex: 0, pageSize: 1 },
          sorting: [{ id: "name", desc: false }],
        })}
        callbacks={callbacks}
      />,
    )

    await user.click(screen.getByRole("checkbox", { name: "Select row" }))
    expect(onSelectedRowKeysChange).toHaveBeenLastCalledWith({
      "opaque:page-one": true,
    })
    await user.click(screen.getByRole("button", { name: "Next page" }))
    expect(onPaginationChange).toHaveBeenLastCalledWith({
      pageIndex: 1,
      pageSize: 1,
    })

    rerender(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          rows: pagedRows,
          total: pagedRows.length,
          pagination: { pageIndex: 1, pageSize: 1 },
          sorting: [{ id: "name", desc: false }],
          selectedRowKeys: { "opaque:page-one": true },
        })}
        callbacks={callbacks}
      />,
    )

    expect(screen.getByText("Page two")).toBeVisible()
    expect(screen.getByText("2-2 of 2")).toBeVisible()
    await user.click(screen.getByRole("checkbox", { name: "Select row" }))
    expect(onSelectedRowKeysChange).toHaveBeenLastCalledWith({
      "opaque:page-one": true,
      "opaque:page-two": true,
    })
  })

  it("renders page-size options and emits the controlled selection", async () => {
    const user = userEvent.setup()
    const onPaginationChange = vi.fn()

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({ pagination: { pageIndex: 3, pageSize: 10 } })}
        callbacks={createCallbacks({ onPaginationChange })}
      />,
    )

    await user.click(screen.getByRole("combobox", { name: labels.rowsPerPage }))
    await user.click(screen.getByRole("option", { name: "25" }))

    expect(onPaginationChange).toHaveBeenCalledWith({
      pageIndex: 0,
      pageSize: 25,
    })
  })

  it("renders ordered bulk-delete outcomes and blocks uncertain replay until refresh", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const deleteResultLabels: ManagedChannelsLabels = {
      ...labels,
      deleteResultsTitle: "Delete results",
      deleteRefreshRequired: "Refresh before deleting again.",
      deleteRefreshAction: "Refresh channels",
      deleteResultStatusLabels: {
        success: "Deleted",
        failed: "Failed",
        uncertain: "Uncertain",
      },
    }
    const deleteState: ManagedChannelsDeleteState = {
      isOpen: true,
      isWorking: false,
      rowKeys: ["opaque:first"],
      results: [
        {
          rowKey: "opaque:success",
          displayLabel: "Example success",
          status: "success",
          resultKey: "deleted",
        },
        {
          rowKey: "opaque:failed",
          displayLabel: "Example failed",
          status: "failed",
          resultKey: "rejected",
        },
        {
          rowKey: "opaque:uncertain",
          displayLabel: "Example uncertain",
          status: "uncertain",
          resultKey: "transport-lost",
        },
      ],
      requiresRefresh: true,
    }

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        labels={deleteResultLabels}
        state={createState({
          selectedRowKeys: { "opaque:first": true },
          deleteState,
        })}
        callbacks={createCallbacks({ onRefresh })}
      />,
    )

    const resultRegion = screen.getByRole("status", {
      name: "Delete results",
    })
    expect(
      within(resultRegion)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Example successDeleted",
      "Example failedFailed",
      "Example uncertainUncertain",
    ])
    expect(
      within(resultRegion).getByText("Refresh before deleting again."),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Delete selected" }),
    ).toBeDisabled()
    expect(
      screen.queryByTestId("managed-site-channels-delete-confirm-button"),
    ).toBeNull()

    await user.click(screen.getByRole("button", { name: "Open actions" }))
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull()
    await user.keyboard("{Escape}")
    await user.click(
      within(resultRegion).getByRole("button", { name: "Refresh channels" }),
    )
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("renders a controlled delete failure without implying refresh recovery", () => {
    const onRefresh = vi.fn()

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          deleteState: {
            isOpen: false,
            isWorking: false,
            rowKeys: [],
            results: [],
            requiresRefresh: false,
            failure: {
              category: "Delete failed",
              message: "Refresh the channels and try again.",
            },
          },
        })}
        callbacks={createCallbacks({ onRefresh })}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Delete failed")
    expect(alert).toHaveTextContent("Refresh the channels and try again.")
    expect(
      within(alert).queryByRole("button", { name: "Refresh channels" }),
    ).toBeNull()
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it("renders one refresh action when delete results and a failure coexist", () => {
    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          deleteState: {
            isOpen: false,
            isWorking: false,
            rowKeys: [],
            results: [
              {
                rowKey: "opaque:uncertain",
                displayLabel: "Example uncertain",
                status: "uncertain",
                resultKey: "transport-lost",
              },
            ],
            requiresRefresh: true,
            failure: {
              category: "Delete state uncertain",
              message: "Refresh before continuing.",
            },
          },
        })}
        callbacks={createCallbacks()}
      />,
    )

    expect(
      screen.getAllByRole("button", { name: "Refresh channels" }),
    ).toHaveLength(1)
    expect(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Refresh channels",
      }),
    ).toBeVisible()
  })

  it("offers delete failure refresh recovery only when a fresh read is required", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          deleteState: {
            isOpen: false,
            isWorking: false,
            rowKeys: [],
            results: [],
            requiresRefresh: true,
            failure: {
              category: "Delete state uncertain",
              message: "Refresh before continuing.",
            },
          },
        })}
        callbacks={createCallbacks({ onRefresh })}
      />,
    )

    const alert = screen.getByRole("alert")
    await user.click(
      within(alert).getByRole("button", { name: "Refresh channels" }),
    )
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it("makes native create and row actions visibly unavailable while a fresh read is required", () => {
    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          isResourceInteractionBlocked: true,
          deleteState: {
            isOpen: false,
            isWorking: false,
            rowKeys: [],
            results: [],
            requiresRefresh: true,
          },
        })}
        callbacks={createCallbacks()}
      />,
    )

    expect(screen.getByRole("button", { name: "Add channel" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Open actions" })).toBeNull()
    expect(
      screen.getByRole("button", { name: "Delete selected" }),
    ).toBeDisabled()
  })

  it("uses registry visibility, sort missing order, status facet, and safe native extension cells", async () => {
    const user = userEvent.setup()
    const onStatusFilterChange = vi.fn()
    const extensionColumn = {
      id: "native-latency",
      label: "Latency",
      renderer: "value" as const,
      accessor: { kind: "cell" as const, key: "latency" },
      canHide: true,
      defaultVisible: false,
      visible: true,
      sort: {
        accessor: { kind: "cellSortValue" as const, key: "latency" },
        defaultDirection: "asc" as const,
        missing: "last" as const,
      },
      extension: { kind: "native" as const, namespace: "example" },
    }
    const extensionRows = [
      {
        ...rows[0],
        rowKey: "opaque:missing",
        testToken: "Missing latency",
        name: "Missing latency",
        cells: { ...rows[0].cells },
      },
      {
        ...rows[0],
        rowKey: "opaque:fast",
        testToken: "Fast channel",
        name: "Fast channel",
        cells: {
          ...rows[0].cells,
          latency: { kind: "text" as const, value: "12 ms", sortValue: 12 },
        },
      },
    ]

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        state={createState({
          rows: extensionRows,
          total: extensionRows.length,
          columns: [
            ...columns.map((column) =>
              column.id === "group" ? { ...column, visible: false } : column,
            ),
            extensionColumn,
          ],
          sorting: [{ id: "native-latency", desc: false }],
        })}
        callbacks={createCallbacks({ onStatusFilterChange })}
      />,
    )

    expect(screen.queryByRole("columnheader", { name: "Group" })).toBeNull()
    expect(
      screen.getByRole("columnheader", { name: "Latency" }),
    ).toHaveAttribute("data-column-extension", "native")
    expect(
      screen.getByRole("columnheader", { name: "Latency" }),
    ).toHaveAttribute("data-column-namespace", "example")
    expect(screen.getByText("12 ms")).toBeVisible()
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Fast channel")
    expect(screen.getAllByRole("row")[2]).toHaveTextContent("Missing latency")

    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.statusFilterTrigger),
    )
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }))
    expect(onStatusFilterChange).toHaveBeenCalledWith(["1"])
  })

  it("labels unmapped status facets accessibly and filters by their value", async () => {
    const user = userEvent.setup()
    const onStatusFilterChange = vi.fn()
    const statusRows = [
      "10",
      "enabled",
      "2",
      "future-status",
      "auto-disabled",
    ].map((status, index) => ({
      ...rows[0],
      rowKey: `opaque:status-${status}`,
      testToken: `Status ${index}`,
      name: `Status ${index}`,
      cells: {
        ...rows[0].cells,
        status: {
          kind: "status" as const,
          value: status,
          sortValue: status,
          tone: "default" as const,
        },
      },
    }))

    render(
      <ManagedSiteChannelsView
        {...commonProps}
        labels={{
          ...labels,
          statusLabels: {
            "2": "Two",
            "10": "Ten",
            "auto-disabled": "Auto disabled",
            enabled: "Enabled",
          },
        }}
        state={createState({ rows: statusRows, total: statusRows.length })}
        callbacks={createCallbacks({ onStatusFilterChange })}
      />,
    )

    await user.click(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.statusFilterTrigger),
    )
    const unknownStatus = screen.getByRole("checkbox", {
      name: "future-status",
    })

    expect(unknownStatus).toBeVisible()
    await user.click(unknownStatus)
    expect(onStatusFilterChange).toHaveBeenCalledWith(["future-status"])
  })

  it("sorts numeric status facets before provider-owned text values", () => {
    const values = ["10", "enabled", "2", "future-status", "auto-disabled"]

    expect(values.sort(compareManagedSiteChannelStatusValues)).toEqual([
      "2",
      "10",
      "auto-disabled",
      "enabled",
      "future-status",
    ])
  })
})
