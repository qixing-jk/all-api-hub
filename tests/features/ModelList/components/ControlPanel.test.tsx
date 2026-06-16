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
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/events"

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
  CompactMultiSelect: () => <div data-testid="group-filter" />,
  FormField: ({
    label,
    children,
  }: React.PropsWithChildren<{ label: string }>) => (
    <label>
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

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

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
})
