import { CSS, type Transform } from "@dnd-kit/utilities"
import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AccountList from "~/features/AccountManagement/components/AccountList"
import * as inviteLinkCopyWorkflow from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSelectionCheckboxTestId,
} from "~/features/AccountManagement/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { SiteHealthStatus } from "~/types"
import { buildDisplaySiteData, buildTag } from "~~/tests/test-utils/factories"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

type SortableMockState = {
  attributes: Record<string, unknown>
  listeners: Record<string, unknown>
  setNodeRef: ReturnType<typeof vi.fn>
  setActivatorNodeRef: ReturnType<typeof vi.fn>
  transform: Transform | null
  transition: string | undefined
  isDragging: boolean
}

const TEST_IDS = vi.hoisted(() => ({
  dndContext: "dnd-context",
  sortableContext: "sortable-context",
  singleTagFilter: "single-tag-filter",
  multiTagFilter: "multi-tag-filter",
  accountRow: "account-row",
  accountFilterBar: "account-filter-bar",
}))

const {
  mockUseAccountDataContext,
  mockUseUserPreferencesContext,
  handleAddAccountClickMock,
  handleDeleteAccountMock,
  handleDeleteAccountsMock,
  fetchDisplayAccountInviteLinkMock,
  handleSetAccountsDisabledMock,
  startProductAnalyticsActionMock,
  clipboardWriteTextMock,
  toastErrorMock,
  toastSuccessMock,
  trackProductAnalyticsActionStartedMock,
  trackProductAnalyticsActionCompletedMock,
  canFetchDisplayAccountInviteLinkMock,
  dndState,
  sortableKeyboardCoordinatesMock,
  sortableReturnState,
  useSensorMock,
  useSortableMock,
} = vi.hoisted(() => ({
  mockUseAccountDataContext: vi.fn(),
  mockUseUserPreferencesContext: vi.fn(),
  handleAddAccountClickMock: vi.fn(),
  handleDeleteAccountMock: vi.fn(),
  handleDeleteAccountsMock: vi.fn(),
  fetchDisplayAccountInviteLinkMock: vi.fn(),
  handleSetAccountsDisabledMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  clipboardWriteTextMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  trackProductAnalyticsActionCompletedMock: vi.fn(),
  canFetchDisplayAccountInviteLinkMock: vi.fn(),
  dndState: {
    onDragEnd: undefined as ((event: any) => void) | undefined,
  },
  sortableKeyboardCoordinatesMock: vi.fn(),
  sortableReturnState: {
    current: {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    } as SortableMockState,
  },
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
    return <div data-testid={TEST_IDS.dndContext}>{children}</div>
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
    <div data-testid={TEST_IDS.sortableContext}>{children}</div>
  ),
  sortableKeyboardCoordinates: sortableKeyboardCoordinatesMock,
  verticalListSortingStrategy: vi.fn(),
  useSortable: (options: any) => {
    useSortableMock(options)
    return sortableReturnState.current
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
        data-testid={
          isSingleMode ? TEST_IDS.singleTagFilter : TEST_IDS.multiTagFilter
        }
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
    EmptyState: ({ title, action }: any) => (
      <div>
        <div>{title}</div>
        {action ? (
          <button type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
    ),
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

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()
  return {
    ...actual,
    startProductAnalyticsAction: startProductAnalyticsActionMock,
    trackProductAnalyticsActionStarted: trackProductAnalyticsActionStartedMock,
    trackProductAnalyticsActionCompleted:
      trackProductAnalyticsActionCompletedMock,
  }
})

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsDesktop: () => false,
  useIsSmallScreen: () => false,
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  canFetchDisplayAccountInviteLink: (...args: unknown[]) =>
    canFetchDisplayAccountInviteLinkMock(...args),
  fetchDisplayAccountInviteLink: (...args: unknown[]) =>
    fetchDisplayAccountInviteLinkMock(...args),
}))

vi.mock(
  "~/features/AccountManagement/components/AccountList/AccountListItem",
  () => ({
    default: ({ site }: any) => (
      <div data-testid={TEST_IDS.accountRow}>{site.name}</div>
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
      <div data-testid={TEST_IDS.accountFilterBar}>
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
    clearSortConfig: vi.fn(),
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

async function renderBulkInviteLinkSelection(
  accounts: Array<ReturnType<typeof buildDisplaySiteData>>,
  selectedIds = accounts.map((account) => account.id),
) {
  mockUseAccountDataContext.mockReturnValue(
    createAccountDataContextValue({
      sortedData: accounts,
      displayData: accounts,
      tags: [],
      tagCountsById: {},
    }),
  )

  const user = userEvent.setup()
  const renderResult = render(<AccountList />)

  await user.click(screen.getByRole("button", { name: "account:bulk.manage" }))
  for (const accountId of selectedIds) {
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId(accountId),
      ),
    )
  }

  return {
    ...renderResult,
    copyInviteLinks: async () =>
      user.click(
        screen.getByRole("button", {
          name: "account:bulk.copyInviteLinks",
        }),
      ),
    user,
  }
}

describe("AccountList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dndState.onDragEnd = undefined
    idleCallbackState.callback = null
    idleCallbackState.handle = 0
    sortableReturnState.current = {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }
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
    canFetchDisplayAccountInviteLinkMock.mockImplementation(
      (account: { siteType?: string }) => account.siteType === "new-api",
    )
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      async (account: { id: string; baseUrl: string }) =>
        `${account.baseUrl}/register?aff=${account.id}`,
    )
    clipboardWriteTextMock.mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({
        writeText: clipboardWriteTextMock,
      }),
    })
    mockUseUserPreferencesContext.mockReturnValue({
      showTodayCashflow: true,
    })
    mockUseAccountDataContext.mockReturnValue(createAccountDataContextValue())
    startProductAnalyticsActionMock.mockImplementation((context) => {
      trackProductAnalyticsActionStartedMock(context)
      return {
        complete: (
          result: unknown = PRODUCT_ANALYTICS_RESULTS.Success,
          options: Record<string, unknown> = {},
        ) => {
          trackProductAnalyticsActionCompletedMock({
            ...context,
            result,
            ...options,
          })
        },
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

    expect(screen.queryByText("account:emptyState")).not.toBeInTheDocument()
  })

  it("tracks the empty-state create-account action before opening the dialog", async () => {
    const user = userEvent.setup()
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [],
        displayData: [],
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:addFirstAccount" }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(handleAddAccountClickMock).toHaveBeenCalledTimes(1)
  })

  it("renders the created-time sort control", () => {
    render(<AccountList />)

    expect(
      screen.getByRole("button", {
        name: "account:list.sort account:list.header.createdAt",
      }),
    ).toBeInTheDocument()
  })

  it("shows a clear sort action when field sorting is active", async () => {
    const user = userEvent.setup()
    const clearSortConfig = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        clearSortConfig,
        sortField: "name",
        sortOrder: "asc",
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:list.clearSort" }),
    )

    expect(clearSortConfig).toHaveBeenCalledTimes(1)
  })

  it("hides the clear sort action when field sorting has been cleared", () => {
    const clearSortConfig = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        clearSortConfig,
        sortField: null,
        sortOrder: "asc",
      }),
    )

    render(<AccountList />)

    expect(
      screen.queryByRole("button", { name: "account:list.clearSort" }),
    ).not.toBeInTheDocument()
    expect(clearSortConfig).not.toHaveBeenCalled()
  })

  it("hides the clear sort action while search mode is active", () => {
    const clearSortConfig = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        clearSortConfig,
        sortField: "name",
        sortOrder: "asc",
      }),
    )

    render(<AccountList initialSearchQuery="Alpha" />)

    expect(
      screen.queryByRole("button", { name: "account:list.clearSort" }),
    ).not.toBeInTheDocument()
    expect(clearSortConfig).not.toHaveBeenCalled()
  })

  it("auto-loads dnd during idle time after the first render settles", async () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isManualSortFeatureEnabled: true,
      }),
    )

    render(<AccountList />)

    expect(screen.queryByTestId(TEST_IDS.dndContext)).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(TEST_IDS.sortableContext),
    ).not.toBeInTheDocument()
    expect(useSortableMock).not.toHaveBeenCalled()

    await act(async () => {
      idleCallbackState.callback?.({
        didTimeout: false,
        timeRemaining: () => 50,
      })
    })

    expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
    expect(screen.getByTestId(TEST_IDS.sortableContext)).toBeInTheDocument()
    expect(useSensorMock).toHaveBeenCalledWith(expect.any(Function))
    expect(useSensorMock).toHaveBeenCalledWith(expect.any(Function), {
      coordinateGetter: sortableKeyboardCoordinatesMock,
    })
    expect(useSortableMock).toHaveBeenCalledTimes(4)
  })

  it("falls back to timeout-based dnd loading when requestIdleCallback is unavailable", async () => {
    vi.stubGlobal("requestIdleCallback", undefined)
    vi.useFakeTimers()
    try {
      mockUseAccountDataContext.mockReturnValue(
        createAccountDataContextValue({
          isManualSortFeatureEnabled: true,
        }),
      )

      render(<AccountList />)

      expect(screen.queryByTestId(TEST_IDS.dndContext)).not.toBeInTheDocument()

      await act(async () => {
        await vi.runOnlyPendingTimersAsync()
      })

      vi.useRealTimers()
      expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
      expect(screen.getByTestId(TEST_IDS.sortableContext)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("cancels the pending idle callback when the list unmounts before dnd preload runs", () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isManualSortFeatureEnabled: true,
      }),
    )

    const { unmount } = render(<AccountList />)

    unmount()

    expect(globalThis.cancelIdleCallback).toHaveBeenCalledWith(1)
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

    expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
    expect(screen.getByTestId(TEST_IDS.sortableContext)).toBeInTheDocument()
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

    expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
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

  it("reorders only the visible subset after filters are applied", async () => {
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
      screen.getByRole("button", { name: "common:status.enabled" }),
    )

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(3)

    await user.click(
      screen.getAllByRole("button", {
        name: "account:list.dragHandle",
      })[0],
    )

    expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
    expect(dndState.onDragEnd).toBeTypeOf("function")

    dndState.onDragEnd?.({
      active: { id: "enabled-alpha" },
      over: { id: "enabled-gamma" },
    })

    expect(handleReorder).toHaveBeenCalledWith([
      "enabled-gamma",
      "enabled-alpha",
      "unsynced-delta",
    ])
  })

  it("tracks completed manual reorder with aggregate metadata only", async () => {
    const user = userEvent.setup()
    const handleReorder = vi.fn().mockResolvedValue(undefined)

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

    expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
    expect(dndState.onDragEnd).toBeTypeOf("function")

    dndState.onDragEnd?.({
      active: { id: "enabled-alpha" },
      over: { id: "enabled-gamma" },
    })

    await waitFor(() => {
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ReorderAccounts,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          itemCount: 4,
        },
      })
    })
    const completionPayload =
      trackProductAnalyticsActionCompletedMock.mock.calls[0][0]
    expect(completionPayload).not.toHaveProperty("accountIds")
    expect(completionPayload).not.toHaveProperty("fromAccountId")
    expect(completionPayload).not.toHaveProperty("toAccountId")
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

    expect(screen.queryByTestId(TEST_IDS.dndContext)).not.toBeInTheDocument()
    expect(useSortableMock).not.toHaveBeenCalled()

    unmount()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    expect(
      screen.queryByRole("button", { name: "account:list.dragHandle" }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId(TEST_IDS.dndContext)).not.toBeInTheDocument()
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

    expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
    expect(screen.getByTestId(TEST_IDS.sortableContext)).toBeInTheDocument()

    rerender(<AccountList initialSearchQuery="Alpha" />)

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Alpha")
      expect(screen.queryByTestId(TEST_IDS.dndContext)).not.toBeInTheDocument()
      expect(
        screen.queryByTestId(TEST_IDS.sortableContext),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "account:list.dragHandle" }),
      ).toBeDisabled()
    })
  })

  it("applies sortable dragging styles when dnd-kit marks a row as dragging", async () => {
    const user = userEvent.setup()

    sortableReturnState.current = {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: { x: 8, y: 12, scaleX: 1, scaleY: 1 },
      transition: "transform 150ms ease",
      isDragging: true,
    }

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

    expect(await screen.findByTestId(TEST_IDS.dndContext)).toBeInTheDocument()
    expect(screen.getByTestId(TEST_IDS.sortableContext)).toBeInTheDocument()
    expect(useSortableMock).toHaveBeenCalled()

    const sortableHandle = screen.getAllByRole("button", {
      name: "account:list.dragHandle",
    })[0]
    const sortableWrapper = sortableHandle.closest("div[style]")

    expect(sortableWrapper).toHaveClass("relative", "z-10")
    expect(sortableWrapper).toHaveStyle({
      transform: CSS.Transform.toString(sortableReturnState.current.transform),
      transition: sortableReturnState.current.transition,
    })
  })

  it("filters accounts by enabled state and combines with tag filters", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(4)

    await user.click(
      screen.getByRole("button", { name: "common:status.enabled" }),
    )

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(3)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.getByText("Unsynced Delta")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 3")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Team A" }))

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(1)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Enabled Gamma")).not.toBeInTheDocument()
    expect(screen.queryByText("Unsynced Delta")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()
  })

  it("links disabled filter with search results", async () => {
    const user = userEvent.setup()

    render(<AccountList initialSearchQuery="beta" />)

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(1)
    expect(screen.getByText("Disabled Beta")).toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:status.enabled" }),
    )

    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId(TEST_IDS.accountRow)).toHaveLength(0)
    expect(screen.getByText("account:search.noResults")).toBeInTheDocument()
    expect(screen.getByText("common:total: 0")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:status.disabled" }),
    )

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(1)
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

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(2)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Unsynced Delta")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "account:healthStatus.warning" }),
    )

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(1)
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

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(1)
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
        name: "account:filter.checkIn.not-checked-in",
      }),
    )

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(1)
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.queryByText("Enabled Alpha")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 1")).toBeInTheDocument()
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

  it("shows filtered balance, consumption, and income totals for visible accounts", async () => {
    const user = userEvent.setup()
    const includedAccount = buildDisplaySiteData({
      id: "included",
      name: "Included Account",
      disabled: false,
      balance: { USD: 10, CNY: 70 },
      todayConsumption: { USD: 1, CNY: 7 },
      todayIncome: { USD: 2, CNY: 14 },
    })
    const incomeOptOutAccount = buildDisplaySiteData({
      id: "income-opt-out",
      name: "Income Opt Out",
      disabled: false,
      balance: { USD: 20, CNY: 140 },
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 4, CNY: 28 },
      excludeFromTodayIncome: true,
    })
    const disabledAccount = buildDisplaySiteData({
      id: "disabled",
      name: "Disabled Account",
      disabled: true,
      balance: { USD: 100, CNY: 700 },
      todayConsumption: { USD: 100, CNY: 700 },
      todayIncome: { USD: 100, CNY: 700 },
    })

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [includedAccount, incomeOptOutAccount, disabledAccount],
        displayData: [includedAccount, incomeOptOutAccount, disabledAccount],
        tags: [],
        tagCountsById: {},
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "common:status.enabled" }),
    )

    expect(screen.getAllByTestId(TEST_IDS.accountRow)).toHaveLength(2)
    expect(screen.getByText("Included Account")).toBeInTheDocument()
    expect(screen.getByText("Income Opt Out")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Account")).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "account:filteredTotals.balance: USD 30.00 / CNY 210.00",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "account:filteredTotals.consumption: USD 4.00 / CNY 28.00",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("account:filteredTotals.income: USD 2.00 / CNY 14.00"),
    ).toBeInTheDocument()
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

  it("tracks entering and exiting bulk mode without per-selection telemetry", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnterAccountBulkMode,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    trackProductAnalyticsActionStartedMock.mockClear()
    trackProductAnalyticsActionCompletedMock.mockClear()

    await user.click(screen.getAllByRole("checkbox")[0])
    await user.click(
      screen.getAllByRole("button", { name: "account:bulk.exit" })[0],
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExitAccountBulkMode,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledTimes(1)
    expect(trackProductAnalyticsActionCompletedMock).not.toHaveBeenCalled()
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

  it("tracks confirmed bulk delete with aggregate counts only", async () => {
    const user = userEvent.setup()
    handleDeleteAccountsMock.mockResolvedValueOnce({
      deletedCount: 1,
      deletedIds: ["enabled-alpha"],
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
    await user.click(await screen.findByRole("checkbox"))
    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteSelected" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.deleteConfirmAction" }),
    )

    const expectedContext = {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    }
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith(
      expectedContext,
    )
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      ...expectedContext,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: {
        itemCount: 2,
        selectedCount: 2,
        successCount: 1,
        failureCount: 1,
      },
    })
    const completionPayload =
      trackProductAnalyticsActionCompletedMock.mock.calls[0][0]
    expect(completionPayload).not.toHaveProperty("durationMs")
    expect(completionPayload).not.toHaveProperty("error")
    expect(completionPayload).not.toHaveProperty("message")
    expect(completionPayload).not.toHaveProperty("accountIds")
  })

  it("tracks bulk disable persistence with aggregate counts only", async () => {
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
    await user.click(await screen.findByRole("checkbox"))
    await user.click(
      screen.getByRole("button", { name: "account:bulk.disableSelected" }),
    )

    const expectedContext = {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DisableSelectedAccounts,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    }
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith(
      expectedContext,
    )
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      ...expectedContext,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: {
        itemCount: 2,
        selectedCount: 2,
        successCount: 1,
        failureCount: 1,
      },
    })
    const completionPayload =
      trackProductAnalyticsActionCompletedMock.mock.calls[0][0]
    expect(completionPayload).not.toHaveProperty("durationMs")
    expect(completionPayload).not.toHaveProperty("error")
    expect(completionPayload).not.toHaveProperty("message")
    expect(completionPayload).not.toHaveProperty("accountIds")
  })

  it("reports unsupported invite-link copy when no selected account supports it", async () => {
    const user = userEvent.setup()

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )
    await user.click(screen.getAllByRole("checkbox")[0])

    expect(
      screen.getByRole("button", { name: "account:bulk.copyInviteLinks" }),
    ).toBeEnabled()
    await user.click(
      screen.getByRole("button", { name: "account:bulk.copyInviteLinks" }),
    )

    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).not.toHaveBeenCalled()
      expect(clipboardWriteTextMock).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:bulk.copyInviteLinksUnsupported",
      )
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
        insights: {
          itemCount: 0,
          selectedCount: 1,
          successCount: 0,
          failureCount: 0,
          skippedCount: 1,
        },
      })
    })
  })

  it("copies invite links for supported selected accounts", async () => {
    const user = userEvent.setup()
    const inviteA = buildDisplaySiteData({
      id: "invite-a",
      name: "Invite A",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-a.example.com",
    })
    const inviteB = buildDisplaySiteData({
      id: "invite-b",
      name: "Invite B",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-b.example.com",
    })

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [inviteA, inviteB],
        displayData: [inviteA, inviteB],
        tags: [],
        tagCountsById: {},
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-a"),
      ),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-b"),
      ),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.copyInviteLinks" }),
    )

    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(2)
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "invite-a" }),
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      )
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "invite-b" }),
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      )
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:bulk.copyInviteLinksSuccess",
      )
      expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: 2,
          selectedCount: 2,
          successCount: 2,
          failureCount: 0,
          skippedCount: 0,
        },
      })
    })
  })

  it("prevents same-turn re-entry when bulk invite-link copy starts", async () => {
    const user = userEvent.setup()
    const pendingAccount = buildDisplaySiteData({
      id: "invite-reentry",
      name: "Invite Re-entry",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-reentry.example.invalid",
    })
    let resolveInviteLink: ((value: string) => void) | undefined
    const pendingInviteLink = new Promise<string>((resolve) => {
      resolveInviteLink = resolve
    })

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [pendingAccount],
        displayData: [pendingAccount],
        tags: [],
        tagCountsById: {},
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-reentry"),
      ),
    )
    const bulkCopyButton = screen.getByRole("button", {
      name: "account:bulk.copyInviteLinks",
    })
    fetchDisplayAccountInviteLinkMock.mockImplementationOnce(() => {
      bulkCopyButton.click()
      return pendingInviteLink
    })

    await user.click(bulkCopyButton)
    await act(async () => {
      resolveInviteLink?.(
        "https://invite-reentry.example.invalid/register?aff=invite-reentry",
      )
    })

    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(1)
    })
    expect(
      trackProductAnalyticsActionStartedMock.mock.calls.filter(
        ([context]) =>
          context.actionId ===
          PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
      ),
    ).toHaveLength(1)
  })

  it("shows a copying state while invite-link requests are pending", async () => {
    const user = userEvent.setup()
    const pendingAccount = buildDisplaySiteData({
      id: "invite-pending",
      name: "Invite Pending",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-pending.example.com",
    })
    let resolveInviteLink: ((value: string) => void) | undefined
    fetchDisplayAccountInviteLinkMock.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveInviteLink = resolve
        }),
    )

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [pendingAccount],
        displayData: [pendingAccount],
        tags: [],
        tagCountsById: {},
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-pending"),
      ),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.copyInviteLinks" }),
    )

    expect(
      screen.getByRole("button", { name: "common:status.copying" }),
    ).toBeDisabled()

    await act(async () => {
      resolveInviteLink?.(
        "https://invite-pending.example.com/register?aff=invite-pending",
      )
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "account:bulk.copyInviteLinks" }),
      ).toBeEnabled()
    })
  })

  it("tracks a cancelled invite-link copy when the account list unmounts", async () => {
    const pendingAccount = buildDisplaySiteData({
      id: "invite-cancelled",
      name: "Invite Cancelled",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-cancelled.example.invalid",
    })
    let resolveInviteLink: ((value: string) => void) | undefined
    fetchDisplayAccountInviteLinkMock.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveInviteLink = resolve
        }),
    )

    const { copyInviteLinks, unmount } = await renderBulkInviteLinkSelection([
      pendingAccount,
    ])

    await copyInviteLinks()
    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(1)
    })

    unmount()
    await act(async () => {
      resolveInviteLink?.(
        "https://invite-cancelled.example.invalid/register?aff=invite-cancelled",
      )
    })

    await waitFor(() => {
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Cancelled,
        insights: {
          itemCount: 1,
          selectedCount: 1,
          successCount: 0,
          failureCount: 0,
          skippedCount: 0,
        },
      })
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("reports partial invite-link copy when the selection mixes supported and unsupported accounts", async () => {
    const user = userEvent.setup()
    const supported = buildDisplaySiteData({
      id: "invite-supported",
      name: "Invite Supported",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-supported.example.com",
    })
    const unsupported = buildDisplaySiteData({
      id: "invite-unsupported",
      name: "Invite Unsupported",
      disabled: false,
      siteType: "one-api",
      baseUrl: "https://invite-unsupported.example.com",
    })

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [supported, unsupported],
        displayData: [supported, unsupported],
        tags: [],
        tagCountsById: {},
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-supported"),
      ),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-unsupported"),
      ),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.copyInviteLinks" }),
    )

    expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(1)
    expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "invite-supported" }),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "account:bulk.copyInviteLinksPartialSuccess",
    )
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      insights: {
        itemCount: 1,
        selectedCount: 2,
        successCount: 1,
        failureCount: 0,
        skippedCount: 1,
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
      },
    })
  })

  it("reports partial invite-link copy when one supported account fetch fails", async () => {
    const successfulAccount = buildDisplaySiteData({
      id: "invite-success",
      name: "Invite Success",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-success.example.invalid",
    })
    const failedAccount = buildDisplaySiteData({
      id: "invite-failure",
      name: "Invite Failure",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-failure.example.invalid",
    })
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      async (account: { id: string; baseUrl: string }) => {
        if (account.id === "invite-failure") {
          throw new Error("invite link unavailable")
        }
        return `${account.baseUrl}/register?aff=${account.id}`
      },
    )

    const { copyInviteLinks } = await renderBulkInviteLinkSelection([
      successfulAccount,
      failedAccount,
    ])

    await copyInviteLinks()

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:bulk.copyInviteLinksPartialSuccess",
      )
    })
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: {
        itemCount: 2,
        selectedCount: 2,
        successCount: 1,
        failureCount: 1,
        skippedCount: 0,
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
      },
    })
  })

  it("reports failed invite-link copy when every supported account fetch fails", async () => {
    const user = userEvent.setup()
    const inviteA = buildDisplaySiteData({
      id: "invite-fail-a",
      name: "Invite Fail A",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-fail-a.example.com",
    })
    const inviteB = buildDisplaySiteData({
      id: "invite-fail-b",
      name: "Invite Fail B",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-fail-b.example.com",
    })
    fetchDisplayAccountInviteLinkMock.mockRejectedValue(
      new Error("invite link unavailable"),
    )

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [inviteA, inviteB],
        displayData: [inviteA, inviteB],
        tags: [],
        tagCountsById: {},
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-fail-a"),
      ),
    )
    await user.click(
      screen.getByTestId(
        getAccountManagementSelectionCheckboxTestId("invite-fail-b"),
      ),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.copyInviteLinks" }),
    )

    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(2)
      expect(clipboardWriteTextMock).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:bulk.copyInviteLinksFailed",
      )
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: 2,
          selectedCount: 2,
          successCount: 0,
          failureCount: 2,
          skippedCount: 0,
        },
      })
    })
  })

  it("reports an unexpected invite-link workflow failure", async () => {
    const account = buildDisplaySiteData({
      id: "invite-unexpected-failure",
      name: "Invite Unexpected Failure",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://invite-unexpected-failure.example.invalid",
    })

    const workflowError = new Error("unexpected invite-link workflow failure")
    vi.spyOn(
      inviteLinkCopyWorkflow,
      "runInviteLinkCopyWorkflow",
    ).mockRejectedValueOnce(workflowError)
    const { copyInviteLinks } = await renderBulkInviteLinkSelection([account])

    await copyInviteLinks()

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:bulk.copyInviteLinksFailed",
      )
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: {
        itemCount: 1,
        selectedCount: 1,
        successCount: 0,
        failureCount: 1,
        skippedCount: 0,
      },
    })
  })

  it("reports failed invite-link copy when clipboard writing fails", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({
        writeText: clipboardWriteTextMock,
      }),
    })
    const clipboardFailureAccount = buildDisplaySiteData({
      id: "clipboard-fail",
      name: "Clipboard Fail",
      disabled: false,
      siteType: "new-api",
      baseUrl: "https://clipboard-fail.example.com",
    })
    clipboardWriteTextMock.mockRejectedValueOnce(
      new Error("clipboard unavailable"),
    )

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        sortedData: [clipboardFailureAccount],
        displayData: [clipboardFailureAccount],
        tags: [],
        tagCountsById: {},
      }),
    )

    render(<AccountList />)

    await user.click(
      screen.getByRole("button", { name: "account:bulk.manage" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:bulk.selectVisible" }),
    )
    const copyInviteLinksButton = screen.getByRole("button", {
      name: "account:bulk.copyInviteLinks",
    })
    await waitFor(() => {
      expect(copyInviteLinksButton).toBeEnabled()
    })
    await user.click(copyInviteLinksButton)

    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(1)
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        "Clipboard Fail: https://clipboard-fail.example.com/register?aff=clipboard-fail",
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:bulk.copyInviteLinksClipboardFailed",
      )
      expect(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.inviteLinkManualCopyTextarea,
        ),
      ).toHaveValue(
        "Clipboard Fail: https://clipboard-fail.example.com/register?aff=clipboard-fail",
      )
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
        insights: {
          itemCount: 1,
          selectedCount: 1,
          successCount: 1,
          failureCount: 0,
          skippedCount: 0,
        },
      })
    })

    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(
        screen.queryByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.inviteLinkManualCopyTextarea,
        ),
      ).not.toBeInTheDocument()
    })
  })
})
