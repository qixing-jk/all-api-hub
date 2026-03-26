import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountList from "~/features/AccountManagement/components/AccountList"
import { SiteHealthStatus } from "~/types"
import { buildDisplaySiteData, buildTag } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

const {
  mockUseAccountDataContext,
  mockUseUserPreferencesContext,
  handleAddAccountClickMock,
  handleDeleteAccountMock,
} = vi.hoisted(() => ({
  mockUseAccountDataContext: vi.fn(),
  mockUseUserPreferencesContext: vi.fn(),
  handleAddAccountClickMock: vi.fn(),
  handleDeleteAccountMock: vi.fn(),
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
    Card: ({ children }: any) => <div>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>,
    CardList: ({ children }: any) => <div>{children}</div>,
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
  "~/features/AccountManagement/components/AccountList/SortableAccountListItem",
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
function createAccountDataContextValue() {
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
  }
}

describe("AccountList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUserPreferencesContext.mockReturnValue({
      showTodayCashflow: true,
    })
    mockUseAccountDataContext.mockReturnValue(createAccountDataContextValue())
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
})
