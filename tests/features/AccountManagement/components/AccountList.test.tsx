import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountList from "~/features/AccountManagement/components/AccountList"
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
    balance: { USD: 12, CNY: 0 },
  })
  const disabledBeta = buildDisplaySiteData({
    id: "disabled-beta",
    name: "Disabled Beta",
    disabled: true,
    tagIds: ["team-a"],
    tags: ["Team A"],
    balance: { USD: 34, CNY: 0 },
  })
  const enabledGamma = buildDisplaySiteData({
    id: "enabled-gamma",
    name: "Enabled Gamma",
    disabled: false,
    tagIds: ["team-b"],
    tags: ["Team B"],
    balance: { USD: 56, CNY: 0 },
  })

  return {
    sortedData: [enabledAlpha, disabledBeta, enabledGamma],
    displayData: [enabledAlpha, disabledBeta, enabledGamma],
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

    expect(screen.getAllByTestId("account-row")).toHaveLength(3)

    await user.click(
      screen.getByRole("button", { name: "common:status.enabled" }),
    )

    expect(screen.getAllByTestId("account-row")).toHaveLength(2)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.getByText("Enabled Gamma")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.getByText("common:total: 2")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Team A" }))

    expect(screen.getAllByTestId("account-row")).toHaveLength(1)
    expect(screen.getByText("Enabled Alpha")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Enabled Gamma")).not.toBeInTheDocument()
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
})
