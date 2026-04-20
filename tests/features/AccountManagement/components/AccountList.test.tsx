import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AccountList from "~/features/AccountManagement/components/AccountList"
import { SiteHealthStatus } from "~/types"
import { buildDisplaySiteData, buildTag } from "~~/tests/test-utils/factories"
import { act, render, screen } from "~~/tests/test-utils/render"

const {
  mockUseAccountDataContext,
  mockUseUserPreferencesContext,
  handleAddAccountClickMock,
  handleDeleteAccountMock,
  handleDeleteAccountsMock,
  handleSetAccountsDisabledMock,
  dndState,
  sortableKeyboardCoordinatesMock,
  useSensorMock,
  useSortableMock,
} = vi.hoisted(() => ({
  mockUseAccountDataContext: vi.fn(),
  mockUseUserPreferencesContext: vi.fn(),
  handleAddAccountClickMock: vi.fn(),
  handleDeleteAccountMock: vi.fn(),
  handleDeleteAccountsMock: vi.fn(),
  handleSetAccountsDisabledMock: vi.fn(),
  dndState: {
    onDragEnd: undefined as ((event: any) => void) | undefined,
  },
  sortableKeyboardCoordinatesMock: vi.fn(),
  useSensorMock: vi.fn(),
  useSortableMock: vi.fn(),
}))

const idleCallbackState = {
  callback: null as
    | ((deadline: { didTimeout: boolean; timeRemaining: () => number }) => void)
    | null,
  handle: 0,
}

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd: (event: any) => void
  }) => {
    dndState.onDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: useSensorMock,
  useSensors: () => [],
}))

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (array: any[], from: number, to: number) => {
    const next = array.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  },
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  sortableKeyboardCoordinates: sortableKeyboardCoordinatesMock,
  verticalListSortingStrategy: vi.fn(),
  useSortable: (options: any) => {
    useSortableMock(options)
    return {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }
  },
}))

vi.mock("~/components/ui", () => {
  const MockInput = React.forwardRef<HTMLInputElement, any>(function MockInput(
    { leftIcon, rightIcon, ...props },
    ref,
  ) {
    return (
      <div>
        {leftIcon}
        <input ref={ref} {...props} />
        {rightIcon}
      </div>
    )
  })

  const MockTagFilter = ({ mode, options, value, onChange, allLabel }: any) => {
    const isSingleMode = mode === "single"

    const handleAllClick = () => {
      onChange(isSingleMode ? null : [])
    }

    const handleOptionClick = (optionValue: string) => {
      if (isSingleMode) {
        onChange(value === optionValue ? null : optionValue)
        return
      }

      const current = Array.isArray(value) ? value : []
      onChange(
        current.includes(optionValue)
          ? current.filter((item) => item !== optionValue)
          : [...current, optionValue],
      )
    }

    return (
      <div
        data-testid={isSingleMode ? "single-tag-filter" : "multi-tag-filter"}
      >
        <button type="button" onClick={handleAllClick}>
          {allLabel}
        </button>
        {options.map((option: any) => (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => handleOptionClick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    )
  }

  return {
    Button: ({ children, loading, leftIcon, rightIcon, ...props }: any) => (
      <button type="button" {...props}>
        {!loading && leftIcon}
        {children}
        {rightIcon}
      </button>
    ),
    Card: ({ children }: any) => <div>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>,
    CardList: ({ children }: any) => <div>{children}</div>,
    Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        {...props}
      />
    ),
    DestructiveConfirmDialog: ({
      isOpen,
      title,
      description,
      confirmLabel,
      cancelLabel,
      onConfirm,
      onClose,
      details,
    }: any) =>
      isOpen ? (
        <div>
          <div>{title}</div>
          <div>{description}</div>
          {details}
          <button type="button" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      ) : null,
    EmptyState: ({ title }: any) => <div>{title}</div>,
    IconButton: ({ children, ...props }: any) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    Input: MockInput,
    TagFilter: MockTagFilter,
  }
})

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => mockUseUserPreferencesContext(),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleDeleteAccount: handleDeleteAccountMock,
    handleDeleteAccounts: handleDeleteAccountsMock,
    handleSetAccountsDisabled: handleSetAccountsDisabledMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => mockUseAccountDataContext(),
}))

vi.mock("~/hooks/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({
    handleAddAccountClick: handleAddAccountClickMock,
  }),
}))

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsDesktop: () => false,
  useIsSmallScreen: () => false,
}))

vi.mock(
  "~/features/AccountManagement/components/AccountList/AccountListItem",
  () => ({
    default: ({ site }: any) => (
      <div data-testid="account-row">{site.name}</div>
    ),
  }),
)

vi.mock("~/features/AccountManagement/components/CopyKeyDialog", () => ({
  default: () => null,
}))

vi.mock("~/features/AccountManagement/components/DelAccountDialog", () => ({
  default: () => null,
}))

vi.mock("~/features/AccountManagement/components/NewcomerSupportCard", () => ({
  NewcomerSupportCard: () => null,
}))

vi.mock(
  "~/features/AccountManagement/components/AccountList/AccountFilterBar",
  () => ({
    default: ({
      disabledOptions,
      siteTypeOptions,
      refreshOptions,
      checkInOptions,
      onDisabledChange,
      onSiteTypeChange,
      onRefreshChange,
      onCheckInChange,
    }: any) => (
      <div data-testid="account-filter-bar">
        {disabledOptions.map((option: any) => (
          <button
            key={`disabled-${option.value}`}
            type="button"
            data-count={option.count}
            onClick={() => onDisabledChange(option.value)}
          >
            {option.label}
          </button>
        ))}
        {siteTypeOptions.map((option: any) => (
          <button
            key={`site-type-${option.value}`}
            type="button"
            data-count={option.count}
            onClick={() => onSiteTypeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
        {refreshOptions.map((option: any) => (
          <button
            key={`refresh-${option.value}`}
            type="button"
            data-count={option.count}
            onClick={() => onRefreshChange(option.value)}
          >
            {option.label}
          </button>
        ))}
        {checkInOptions.map((option: any) => (
          <button
            key={`check-in-${option.value}`}
            type="button"
            data-count={option.count}
            onClick={() => onCheckInChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    ),
  }),
)

/**
 * Creates an account data context value for tests.
 */
function createAccountDataContextValue(
  overrides: Record<string, unknown> = {},
) {
  const enabledAlpha = buildDisplaySiteData({
    id: "enabled-alpha",
    name: "Enabled Alpha",
    disabled: false,
    tagIds: ["team-a"],
    tags: ["Team A"],
    siteType: "one-api",
    health: { status: SiteHealthStatus.Healthy },
    last_sync_time: 1700000000000,
    checkIn: {
      enableDetection: true,
      siteStatus: {
        isCheckedInToday: true,
        lastDetectedAt: Date.now(),
      },
    },
    balance: { USD: 12, CNY: 0 },
  })
  const disabledBeta = buildDisplaySiteData({
    id: "disabled-beta",
    name: "Disabled Beta",
    disabled: true,
    tagIds: ["team-a"],
    tags: ["Team A"],
    siteType: "new-api",
    health: { status: SiteHealthStatus.Error },
    last_sync_time: 1700000001000,
    checkIn: {
      enableDetection: true,
      siteStatus: {
        isCheckedInToday: true,
        lastDetectedAt: Date.now() - 24 * 60 * 60 * 1000,
      },
    },
    balance: { USD: 34, CNY: 0 },
  })
  const enabledGamma = buildDisplaySiteData({
    id: "enabled-gamma",
    name: "Enabled Gamma",
    disabled: false,
    tagIds: ["team-b"],
    tags: ["Team B"],
    siteType: "one-api",
    health: { status: SiteHealthStatus.Warning },
    last_sync_time: 1700000002000,
    checkIn: {
      enableDetection: true,
      siteStatus: {
        isCheckedInToday: false,
        lastDetectedAt: Date.now(),
      },
    },
    balance: { USD: 56, CNY: 0 },
  })
  const unsyncedDelta = buildDisplaySiteData({
    id: "unsynced-delta",
    name: "Unsynced Delta",
    disabled: false,
    tagIds: ["team-b"],
    tags: ["Team B"],
    siteType: "sub2api",
    health: { status: SiteHealthStatus.Unknown },
    last_sync_time: undefined,
    checkIn: {
      enableDetection: false,
      customCheckIn: {
        url: "",
        isCheckedInToday: false,
      },
    },
    balance: { USD: 78, CNY: 0 },
  })

  return {
    sortedData: [enabledAlpha, disabledBeta, enabledGamma, unsyncedDelta],
    displayData: [enabledAlpha, disabledBeta, enabledGamma, unsyncedDelta],
    isInitialLoad: false,
    handleSort: vi.fn(),
    sortField: "name",
    sortOrder: "asc",
    handleReorder: vi.fn(),
    tags: [
      buildTag({ id: "team-a", name: "Team A" }),
      buildTag({ id: "team-b", name: "Team B" }),
    ],
    tagCountsById: {
      "team-a": 2,
      "team-b": 1,
    },
    isManualSortFeatureEnabled: false,
    detectedAccount: null,
    ...overrides,
  }
}

describe("AccountList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dndState.onDragEnd = undefined
    idleCallbackState.callback = null
    idleCallbackState.handle = 0
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: NonNullable<typeof idleCallbackState.callback>) => {
        idleCallbackState.callback = callback
        idleCallbackState.handle += 1
        return idleCallbackState.handle
      }),
    )
    vi.stubGlobal("cancelIdleCallback", vi.fn())
    handleDeleteAccountsMock.mockResolvedValue({
      deletedCount: 0,
      deletedIds: [],
    })
    handleSetAccountsDisabledMock.mockResolvedValue({
      updatedCount: 0,
      updatedIds: [],
    })
    mockUseUserPreferencesContext.mockReturnValue({
      showTodayCashflow: true,
    })
    mockUseAccountDataContext.mockReturnValue(createAccountDataContextValue())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows a loading skeleton instead of the empty state during the initial load", () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [],
        displayData: [],
        isInitialLoad: true,
      }),
    )

    render(<AccountList />)

    expect(screen.getByText("common:status.loading")).toBeInTheDocument()
    expect(screen.queryByText("account:emptyState")).not.toBeInTheDocument()
  })

  it("renders the created-time sort control", () => {
    render(<AccountList />)

    expect(
      screen.getByRole("button", {
        name: "account:list.sort account:list.header.createdAt",
      }),
    ).toBeInTheDocument()
  })

  it("auto-loads dnd during idle time after the first render settles", async () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isManualSortFeatureEnabled: true,
      }),
    )

    render(<AccountList />)

    expect(screen.queryByTestId("dnd-context")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sortable-context")).not.toBeInTheDocument()
    expect(useSortableMock).not.toHaveBeenCalled()

    await act(async () => {
      idleCallbackState.callback?.({
        didTimeout: false,
        timeRemaining: () => 50,
      })
    })

    expect(await screen.findByTestId("dnd-context")).toBeInTheDocument()
    expect(screen.getByTestId("sortable-context")).toBeInTheDocument()
    expect(useSensorMock).toHaveBeenCalledWith(expect.any(Function))
    expect(useSensorMock).toHaveBeenCalledWith(expect.any(Function), {
      coordinateGetter: sortableKeyboardCoordinatesMock,
    })
    expect(useSortableMock).toHaveBeenCalledTimes(4)
  })

  it("uses the drag handle as a manual fallback before idle loading finishes", async () => {
    const user = userEvent.setup()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isManualSortFeatureEnabled: true,
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getAllByRole("button", {
        name: "account:list.dragHandle",
      })[0],
    )

    expect(await screen.findByTestId("dnd-context")).toBeInTheDocument()
    expect(screen.getByTestId("sortable-context")).toBeInTheDocument()
    expect(useSortableMock).toHaveBeenCalledTimes(4)
  })

  it("keeps the existing reorder flow after dnd activation", async () => {
    const user = userEvent.setup()
    const handleReorder = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isManualSortFeatureEnabled: true,
        handleReorder,
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getAllByRole("button", {
        name: "account:list.dragHandle",
      })[0],
    )

    expect(await screen.findByTestId("dnd-context")).toBeInTheDocument()
    expect(dndState.onDragEnd).toBeTypeOf("function")

    dndState.onDragEnd?.({
      active: { id: "enabled-alpha" },
      over: { id: "enabled-gamma" },
    })

    expect(handleReorder).toHaveBeenCalledWith([
      "disabled-beta",
      "enabled-gamma",
      "enabled-alpha",
      "unsynced-delta",
    ])
  })

  it("does not activate dnd from disabled search handles or bulk mode", async () => {
    const user = userEvent.setup()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isManualSortFeatureEnabled: true,
      }),
    )

    const { unmount } = render(<AccountList initialSearchQuery="Alpha" />)

    const searchHandle = screen.getByRole("button", {
      name: "account:list.dragHandle",
    })
    expect(searchHandle).toBeDisabled()

    await user.click(searchHandle)

    expect(screen.queryByTestId("dnd-context")).not.toBeInTheDocument()
    expect(useSortableMock).not.toHaveBeenCalled()

    unmount()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    expect(
      screen.queryByRole("button", { name: "account:list.dragHandle" }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId("dnd-context")).not.toBeInTheDocument()
    expect(useSortableMock).not.toHaveBeenCalled()
  })

  it("falls back to non-sortable rows when search disables drag after dnd is ready", async () => {
    const user = userEvent.setup()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isManualSortFeatureEnabled: true,
      }),
    )

    const { rerender } = render(<AccountList />)

    await user.click(
      screen.getAllByRole("button", {
        name: "account:list.dragHandle",
      })[0],
    )

    expect(await screen.findByTestId("dnd-context")).toBeInTheDocument()
    expect(screen.getByTestId("sortable-context")).toBeInTheDocument()

    rerender(<AccountList initialSearchQuery="Alpha" />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    expect(screen.queryByTestId("dnd-context")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sortable-context")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "account:list.dragHandle" }),
    ).toBeDisabled()
  })

  it("filters accounts by enabled state and combines with tag filters", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    expect(screen.getAllByTestId("account-row")).toHaveLength(4)

    await user.click(
      screen.getByRole("button", { name: "common:status.enabled" }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(3)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.getByText("Unsynced Delta")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 3")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Team A" }))

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Enabled Gamma")).not.toBeInTheDocument()
    expect(screen.queryByText("Unsynced Delta")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()
  })

  it("links disabled filter with search results", async () => {
    const user = userEvent.setup()

    render(<AccountList initialSearchQuery="beta" />)

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Disabled Beta")).toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:status.enabled" }),
    )

    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("account-row")).toHaveLength(0)
    expect(screen.getByText("account:search.noResults")).toBeInTheDocument()
    expect(screen.getByText("common:total: 0")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:status.disabled" }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Disabled Beta")).toBeInTheDocument()
    expect(
      screen.queryByText("account:search.noResults"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()
  })

  it("filters accounts by site type and refresh status together", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(screen.getByRole("button", { name: "one-api" }))

    expect(screen.getAllByTestId("account-row")).toHaveLength(2)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Unsynced Delta")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "account:healthStatus.warning" }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.queryByText("Enabled Alpha")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()
  })

  it("filters unsynced accounts by refresh status", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", {
        name: "account:filter.refresh.neverSynced",
      }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Unsynced Delta")).toBeInTheDocument()
    expect(screen.queryByText("Enabled Alpha")).not.toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Enabled Gamma")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()
  })

  it("filters accounts by check-in status", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", {
        name: "account:filter.checkIn.checked-in",
      }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Enabled Gamma")).not.toBeInTheDocument()
    expect(screen.queryByText("Unsynced Delta")).not.toBeInTheDocument()
  })

  it("filters accounts by outdated check-in status", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", {
        name: "account:filter.checkIn.outdated",
      }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Disabled Beta")).toBeInTheDocument()
    expect(screen.queryByText("Enabled Alpha")).not.toBeInTheDocument()
    expect(screen.queryByText("Enabled Gamma")).not.toBeInTheDocument()
    expect(screen.queryByText("Unsynced Delta")).not.toBeInTheDocument()
  })

  it("filters accounts by not-checked-in status", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", {
        name: "account:filter.checkIn.not-checked-in",
      }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.queryByText("Enabled Alpha")).not.toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Unsynced Delta")).not.toBeInTheDocument()
  })

  it("filters accounts by unsupported check-in status", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", {
        name: "account:filter.checkIn.unsupported",
      }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Unsynced Delta")).toBeInTheDocument()
    expect(screen.queryByText("Enabled Alpha")).not.toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Enabled Gamma")).not.toBeInTheDocument()
  })

  it("updates faceted select counts based on other active filters", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    expect(
      screen.getByRole("button", { name: "account:healthStatus.warning" }),
    ).toHaveAttribute("data-count", "1")

    await user.click(screen.getByRole("button", { name: "Team A" }))

    expect(
      screen.getByRole("button", { name: "account:healthStatus.warning" }),
    ).toHaveAttribute("data-count", "0")
    expect(screen.getByRole("button", { name: "one-api" })).toHaveAttribute(
      "data-count",
      "1",
    )
  })

  it("keeps site-type options visible when search narrows counts to zero", () => {
    render(<AccountList initialSearchQuery="beta" />)

    expect(screen.getByRole("button", { name: "one-api" })).toHaveAttribute(
      "data-count",
      "0",
    )
    expect(screen.getByRole("button", { name: "new-api" })).toHaveAttribute(
      "data-count",
      "1",
    )
  })

  it("keeps selections across search changes for bulk disable", async () => {
    const user = userEvent.setup()
    handleSetAccountsDisabledMock.mockResolvedValueOnce({
      updatedCount: 2,
      updatedIds: ["enabled-alpha", "enabled-gamma"],
    })

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    await user.click(screen.getAllByRole("checkbox")[0])

    await user.clear(screen.getByPlaceholderText("account:search.placeholder"))
    await user.type(
      screen.getByPlaceholderText("account:search.placeholder"),
      "Gamma",
    )

    expect(await screen.findByText("Enabled Gamma")).toBeInTheDocument()
    await user.click(screen.getAllByRole("checkbox")[0])
    await user.click(
      screen.getByRole("button", { name: "account:bulk.disableSelected" }),
    )

    expect(handleSetAccountsDisabledMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "enabled-alpha" }),
        expect.objectContaining({ id: "enabled-gamma" }),
      ]),
      true,
    )
  })

  it("clears only the currently visible selections during bulk mode", async () => {
    const user = userEvent.setup()
    handleSetAccountsDisabledMock.mockResolvedValueOnce({
      updatedCount: 1,
      updatedIds: ["enabled-alpha"],
    })

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    await user.click(screen.getAllByRole("checkbox")[0])

    const searchInput = screen.getByPlaceholderText(
      "account:search.placeholder",
    )
    await user.clear(searchInput)
    await user.type(searchInput, "Gamma")

    expect(await screen.findByText("Enabled Gamma")).toBeInTheDocument()
    await user.click(screen.getAllByRole("checkbox")[0])
    await user.click(
      screen.getByRole("button", { name: "account:bulk.clearVisible" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.disableSelected" }),
    )

    expect(handleSetAccountsDisabledMock).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "enabled-alpha" })],
      true,
    )
  })

  it("keeps remaining selection when bulk disable only partially succeeds", async () => {
    const user = userEvent.setup()
    handleSetAccountsDisabledMock
      .mockResolvedValueOnce({
        updatedCount: 1,
        updatedIds: ["enabled-alpha"],
      })
      .mockResolvedValueOnce({
        updatedCount: 1,
        updatedIds: ["enabled-gamma"],
      })

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    await user.click(screen.getAllByRole("checkbox")[0])

    const searchInput = screen.getByPlaceholderText(
      "account:search.placeholder",
    )
    await user.clear(searchInput)
    await user.type(searchInput, "Gamma")

    expect(await screen.findByText("Enabled Gamma")).toBeInTheDocument()
    await user.click(screen.getAllByRole("checkbox")[0])
    await user.click(
      screen.getByRole("button", { name: "account:bulk.disableSelected" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.disableSelected" }),
    )

    expect(handleSetAccountsDisabledMock).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({ id: "enabled-alpha" }),
        expect.objectContaining({ id: "enabled-gamma" }),
      ]),
      true,
    )
    expect(handleSetAccountsDisabledMock).toHaveBeenNthCalledWith(
      2,
      [expect.objectContaining({ id: "enabled-gamma" })],
      true,
    )
  })

  it("shows a bulk delete confirmation and deletes all selected accounts", async () => {
    const user = userEvent.setup()
    handleDeleteAccountsMock.mockResolvedValueOnce({
      deletedCount: 2,
      deletedIds: ["enabled-alpha", "enabled-gamma"],
    })

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    await user.click(screen.getAllByRole("checkbox")[0])

    const searchInput = screen.getByPlaceholderText(
      "account:search.placeholder",
    )
    await user.clear(searchInput)
    await user.type(searchInput, "Gamma")

    expect(await screen.findByText("Enabled Gamma")).toBeInTheDocument()
    await user.click(screen.getAllByRole("checkbox")[0])
    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteSelected" }),
    )

    expect(
      screen.getByText("account:bulk.deleteConfirmTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByText((content) =>
        content.includes("account:bulk.deleteHiddenSelectedHint"),
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteConfirmAction" }),
    )

    expect(handleDeleteAccountsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: "enabled-alpha" }),
      expect.objectContaining({ id: "enabled-gamma" }),
    ])
  })

  it("keeps remaining selection when bulk delete only partially succeeds", async () => {
    const user = userEvent.setup()
    handleDeleteAccountsMock
      .mockResolvedValueOnce({
        deletedCount: 1,
        deletedIds: ["enabled-alpha"],
      })
      .mockResolvedValueOnce({
        deletedCount: 1,
        deletedIds: ["enabled-gamma"],
      })

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    await user.click(screen.getAllByRole("checkbox")[0])

    const searchInput = screen.getByPlaceholderText(
      "account:search.placeholder",
    )
    await user.clear(searchInput)
    await user.type(searchInput, "Gamma")

    expect(await screen.findByText("Enabled Gamma")).toBeInTheDocument()
    await user.click(screen.getAllByRole("checkbox")[0])
    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteSelected" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteConfirmAction" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteSelected" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteConfirmAction" }),
    )

    expect(handleDeleteAccountsMock).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({ id: "enabled-alpha" }),
        expect.objectContaining({ id: "enabled-gamma" }),
      ]),
    )
    expect(handleDeleteAccountsMock).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ id: "enabled-gamma" }),
    ])
  })
})
