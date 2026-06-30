import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import { ControlPanel } from "~/features/ModelList/components/ControlPanel"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import {
  DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
  MODEL_LIST_VERIFICATION_RESULT_FILTERS,
} from "~/features/ModelList/verificationResultFilters"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"

const { trackProductAnalyticsActionCompletedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionCompletedMock: vi.fn(),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    trackProductAnalyticsActionCompleted:
      trackProductAnalyticsActionCompletedMock,
  }
})

vi.mock("~/components/ui", () => ({
  Alert: ({
    title,
    description,
    children,
    variant: _variant,
    compact: _compact,
    ...props
  }: React.PropsWithChildren<{
    title?: string
    description?: string
    variant?: string
    compact?: boolean
  }>) => (
    <section role="alert" {...props}>
      <div>{title}</div>
      <div>{description}</div>
      {children}
    </section>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    leftIcon: _leftIcon,
    analyticsAction: _analyticsAction,
    variant: _variant,
    size: _size,
    ...props
  }: React.PropsWithChildren<
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      leftIcon?: React.ReactNode
      analyticsAction?: unknown
      variant?: string
      size?: string
    }
  >) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.PropsWithChildren<object>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CompactMultiSelect: ({
    options,
    selected,
    onChange,
    placeholder,
    size = "sm",
  }: {
    options: Array<{ value: string; label: string }>
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    size?: string
  }) => (
    <div data-size={size} data-testid={placeholder}>
      {options.map((option) => (
        <label key={option.value}>
          {option.label}
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...selected, option.value]
                  : selected.filter((value) => value !== option.value),
              )
            }}
          />
        </label>
      ))}
    </div>
  ),
  FormField: ({
    label,
    children,
    className,
  }: React.PropsWithChildren<{ label: string; className?: string }>) => (
    <label data-testid={`field-${label}`} className={className}>
      {label}
      {children}
    </label>
  ),
  Input: ({
    value,
    onChange,
    placeholder,
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input value={value} onChange={onChange} placeholder={placeholder} />
  ),
  Label: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  SearchableSelect: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
  }) => (
    <select
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Switch: ({
    checked,
    onChange,
  }: {
    checked: boolean
    onChange: (checked: boolean) => void
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  ),
}))

const CAPABILITIES: ModelManagementSourceCapabilities = {
  supportsPricing: true,
  supportsRatioDisplay: true,
  supportsGroupFiltering: true,
  supportsAccountSummary: false,
  supportsTokenCompatibility: true,
  supportsCredentialVerification: true,
  supportsBatchCredentialVerification: true,
  supportsCliVerification: true,
}

const ACCOUNT_SOURCE = {
  kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
  value: "account:account-1",
  account: { id: "account-1", name: "Account One" },
  capabilities: CAPABILITIES,
} as any

const ALL_ACCOUNTS_SOURCE = {
  kind: MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
  value: ALL_ACCOUNTS_SOURCE_VALUE,
  capabilities: {
    ...CAPABILITIES,
    supportsAccountSummary: true,
    supportsCredentialVerification: false,
  },
} as any

function renderControlPanel(
  overrides: Partial<React.ComponentProps<typeof ControlPanel>> = {},
) {
  const props: React.ComponentProps<typeof ControlPanel> = {
    selectedSource: ACCOUNT_SOURCE,
    sourceCapabilities: CAPABILITIES,
    selectedSourceValue: "account:account-1",
    setSelectedSourceValue: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    sortMode: MODEL_LIST_SORT_MODES.DEFAULT,
    setSortMode: vi.fn(),
    selectedVerificationResults: DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
    setSelectedVerificationResults: vi.fn(),
    selectedBillingMode: MODEL_LIST_BILLING_MODES.TOKEN_BASED,
    setSelectedBillingMode: vi.fn(),
    selectedGroups: ["vip"],
    setSelectedGroups: vi.fn(),
    availableGroups: ["vip"],
    pricingData: { group_ratio: { vip: 1 } },
    showRealPrice: false,
    setShowRealPrice: vi.fn(),
    showRatioColumn: false,
    setShowRatioColumn: vi.fn(),
    showEndpointTypes: false,
    setShowEndpointTypes: vi.fn(),
    totalModels: 2,
    filteredModels: [{ model: { model_name: "gpt-test" } }],
    getFilteredResultCount: vi.fn(() => 7),
    ...overrides,
  }

  render(<ControlPanel {...props} />)

  return props
}

describe("ControlPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("enables price comparison with one prominent action", async () => {
    const user = userEvent.setup()
    const props = renderControlPanel({
      onBatchVerifyModels: vi.fn(),
    })

    const copyButton = screen.getByRole("button", { name: "copyAllNames" })
    const comparisonButton = screen.getByRole("button", {
      name: "comparison.cta",
    })
    const batchVerifyButton = screen.getByRole("button", {
      name: "batchVerify.actions.open",
    })

    expect(
      copyButton.compareDocumentPosition(batchVerifyButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      batchVerifyButton.compareDocumentPosition(comparisonButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await user.click(comparisonButton)

    expect(props.setSelectedSourceValue).toHaveBeenCalledWith(
      ALL_ACCOUNTS_SOURCE_VALUE,
    )
    expect(props.setSortMode).toHaveBeenCalledWith(
      MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
    )
    expect(props.setSelectedBillingMode).toHaveBeenCalledWith(
      MODEL_LIST_BILLING_MODES.ALL,
    )
    expect(props.setSelectedGroups).toHaveBeenCalledWith([])
    expect(props.setShowRealPrice).toHaveBeenCalledWith(true)
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnableModelPriceComparison,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: expect.objectContaining({
          filterCount: 1,
        }),
      }),
    )
  })

  it("counts the existing search term when enabling price comparison", async () => {
    const user = userEvent.setup()
    renderControlPanel({
      searchTerm: "gpt",
    })

    await user.click(screen.getByRole("button", { name: "comparison.cta" }))

    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnableModelPriceComparison,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: expect.objectContaining({
          filterCount: 2,
        }),
      }),
    )
  })

  it("hides the prompt when price comparison is already active", () => {
    renderControlPanel({
      selectedSource: ALL_ACCOUNTS_SOURCE,
      selectedSourceValue: ALL_ACCOUNTS_SOURCE_VALUE,
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
      selectedGroups: [],
      showRealPrice: true,
    })

    expect(
      screen.queryByRole("button", { name: "comparison.cta" }),
    ).not.toBeInTheDocument()
  })

  it("does not show the prompt when pricing is unavailable", () => {
    renderControlPanel({
      sourceCapabilities: {
        ...CAPABILITIES,
        supportsPricing: false,
      },
    })

    expect(
      screen.queryByRole("button", { name: "comparison.cta" }),
    ).not.toBeInTheDocument()
  })

  it("keeps verification latency sorting available when pricing is unavailable", () => {
    renderControlPanel({
      sourceCapabilities: {
        ...CAPABILITIES,
        supportsPricing: false,
      },
    })

    const sortSelect = screen.getByLabelText("sortBy")
    expect(sortSelect).toHaveTextContent("sortOptions.default")
    expect(sortSelect).toHaveTextContent("sortOptions.verificationLatencyAsc")
    expect(sortSelect).not.toHaveTextContent("sortOptions.priceAsc")
    expect(sortSelect).not.toHaveTextContent("sortOptions.priceDesc")
  })

  it("offers latest verification latency sorting and result status filters", async () => {
    const user = userEvent.setup()
    const props = renderControlPanel()

    await user.selectOptions(
      screen.getByLabelText("sortBy"),
      MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC,
    )
    expect(props.setSortMode).toHaveBeenCalledWith(
      MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC,
    )

    await user.click(screen.getByLabelText("verificationResults.filters.fail"))
    expect(props.setSelectedVerificationResults).toHaveBeenCalledWith([
      MODEL_LIST_VERIFICATION_RESULT_FILTERS.PASS,
      MODEL_LIST_VERIFICATION_RESULT_FILTERS.UNVERIFIED,
    ])
  })

  it("keeps verification result filters interactive when the setter is omitted", async () => {
    const user = userEvent.setup()

    renderControlPanel({
      setSelectedVerificationResults: undefined,
    })

    await user.click(screen.getByLabelText("verificationResults.filters.fail"))

    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterModelList,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
      }),
    )
  })

  it("keeps the search field usable when all top filters are visible", () => {
    renderControlPanel()

    expect(screen.getByTestId("model-list-filter-row")).toHaveClass(
      "lg:flex-wrap",
    )
    expect(screen.getByTestId("field-searchModels")).toHaveClass(
      "min-w-[16rem]",
    )
    expect(screen.getByTestId("allGroups")).toHaveAttribute(
      "data-size",
      "default",
    )
    expect(screen.getByTestId("verificationResults.all")).toHaveAttribute(
      "data-size",
      "default",
    )
  })
})
