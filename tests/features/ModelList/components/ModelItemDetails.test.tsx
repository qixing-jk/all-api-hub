import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ModelItemDetails } from "~/features/ModelList/components/ModelItem/ModelItemDetails"
import { render, screen } from "~~/tests/test-utils/render"

const { formatPriceMock, getEndpointTypesTextMock, isTokenBillingTypeMock } =
  vi.hoisted(() => ({
    formatPriceMock: vi.fn(),
    getEndpointTypesTextMock: vi.fn(),
    isTokenBillingTypeMock: vi.fn(),
  }))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { group?: string; ratio?: number }) => {
        if (key === "groupRatioTooltip" && options?.group) {
          return `${key}:${options.group}:${options.ratio}`
        }

        return options?.group ? `${key}:${options.group}` : key
      },
    }),
  }
})

vi.mock("~/components/ui", () => ({
  Badge: ({
    children,
    onClick,
    variant,
    className,
  }: {
    children: React.ReactNode
    onClick?: () => void
    variant?: string
    className?: string
  }) =>
    onClick ? (
      <button
        type="button"
        data-variant={variant}
        className={className}
        onClick={onClick}
      >
        {children}
      </button>
    ) : (
      <span data-variant={variant} className={className}>
        {children}
      </span>
    ),
}))

vi.mock("~/components/Tooltip", () => ({
  default: ({
    children,
    content,
  }: {
    children: React.ReactNode
    content: React.ReactNode
  }) => (
    <div data-tooltip-content={typeof content === "string" ? content : ""}>
      {children}
    </div>
  ),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => ({}),
}))

vi.mock("~/services/models/utils/modelPricing", () => ({
  formatPrice: (...args: unknown[]) => formatPriceMock(...args),
  getEndpointTypesText: (...args: unknown[]) =>
    getEndpointTypesTextMock(...args),
  isTokenBillingType: (...args: unknown[]) => isTokenBillingTypeMock(...args),
}))

describe("ModelItemDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    formatPriceMock.mockImplementation(
      (price: number, currency: string) => `${currency}:${price}`,
    )
    getEndpointTypesTextMock.mockImplementation(
      (endpointTypes?: string[]) => endpointTypes?.join(", ") ?? "not-provided",
    )
    isTokenBillingTypeMock.mockImplementation(
      (quotaType: number) => quotaType === 0,
    )
  })

  it("renders nothing when every details section is disabled", () => {
    const { container } = render(
      <ModelItemDetails
        model={
          {
            enable_groups: ["default"],
            supported_endpoint_types: ["chat"],
            quota_type: 0,
          } as any
        }
        calculatedPrice={
          {
            inputUSD: 1,
            outputUSD: 2,
            inputCNY: 7,
            outputCNY: 14,
          } as any
        }
        showEndpointTypes={false}
        groupRatios={{}}
        effectiveGroup="default"
        showGroupDetails={false}
        showPricingDetails={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("shows available groups and only allows switching away from the current group", async () => {
    const user = userEvent.setup()
    const onGroupClick = vi.fn()

    render(
      <ModelItemDetails
        model={
          {
            enable_groups: ["default", "vip"],
            supported_endpoint_types: ["chat", "embeddings"],
            quota_type: 1,
          } as any
        }
        calculatedPrice={
          {
            inputUSD: 1,
            outputUSD: 2,
            inputCNY: 7,
            outputCNY: 14,
          } as any
        }
        showEndpointTypes={true}
        groupRatios={{ default: 1, vip: 2 }}
        effectiveGroup="default"
        showGroupDetails={true}
        showPricingDetails={false}
        onGroupClick={onGroupClick}
      />,
    )

    expect(await screen.findByText("availableGroups")).toBeInTheDocument()
    expect(screen.getByText("endpointType")).toBeInTheDocument()
    expect(screen.getByText("chat, embeddings")).toBeInTheDocument()

    const currentGroup = screen.getByText("default")
    expect(currentGroup).toHaveAttribute("data-variant", "default")
    expect(currentGroup.closest("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "groupRatioTooltip:default:1",
    )
    expect(currentGroup.tagName).toBe("SPAN")

    const vipGroup = screen.getByRole("button", { name: "vip" })
    expect(vipGroup).toHaveAttribute("data-variant", "secondary")
    expect(vipGroup.closest("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "groupRatioTooltip:vip:2\nclickSwitchGroup:vip",
    )

    await user.click(vipGroup)

    expect(onGroupClick).toHaveBeenCalledWith("vip")
  })

  it("renders endpoint fallback text and suppresses pricing details for non-token billing models", async () => {
    render(
      <ModelItemDetails
        model={
          {
            enable_groups: ["default"],
            supported_endpoint_types: undefined,
            quota_type: 2,
          } as any
        }
        calculatedPrice={
          {
            inputUSD: 1,
            outputUSD: 2,
            inputCNY: 7,
            outputCNY: 14,
          } as any
        }
        showEndpointTypes={true}
        groupRatios={{}}
        effectiveGroup="default"
        showGroupDetails={false}
        showPricingDetails={true}
      />,
    )

    expect(await screen.findByText("not-provided")).toBeInTheDocument()
    expect(screen.queryByText("detailedPricing")).toBeNull()
    expect(isTokenBillingTypeMock).toHaveBeenCalledWith(2)
  })

  it("shows detailed token pricing when pricing details are enabled for token-billing models", async () => {
    render(
      <ModelItemDetails
        model={
          {
            enable_groups: ["default"],
            supported_endpoint_types: ["chat"],
            quota_type: 0,
          } as any
        }
        calculatedPrice={
          {
            inputUSD: 1.25,
            outputUSD: 2.5,
            inputCNY: 8.75,
            outputCNY: 17.5,
          } as any
        }
        showEndpointTypes={false}
        groupRatios={{}}
        effectiveGroup="default"
        showGroupDetails={false}
        showPricingDetails={true}
      />,
    )

    expect(await screen.findByText("detailedPricing")).toBeInTheDocument()
    expect(screen.getByText("input1MTokens")).toBeInTheDocument()
    expect(screen.getByText("output1MTokens")).toBeInTheDocument()
    expect(screen.getByText("USD: USD:1.25")).toBeInTheDocument()
    expect(screen.getByText("CNY: CNY:8.75")).toBeInTheDocument()
    expect(screen.getByText("USD: USD:2.5")).toBeInTheDocument()
    expect(screen.getByText("CNY: CNY:17.5")).toBeInTheDocument()
    expect(formatPriceMock).toHaveBeenCalledTimes(4)
  })

  it("falls back to a 1x tooltip when group ratios are missing", async () => {
    render(
      <ModelItemDetails
        model={
          {
            enable_groups: ["beta"],
            supported_endpoint_types: [],
            quota_type: 1,
          } as any
        }
        calculatedPrice={
          {
            inputUSD: 1,
            outputUSD: 2,
            inputCNY: 7,
            outputCNY: 14,
          } as any
        }
        showEndpointTypes={false}
        groupRatios={{}}
        effectiveGroup="beta"
        showGroupDetails={true}
        showPricingDetails={false}
      />,
    )

    expect(await screen.findByText("beta")).toHaveAttribute(
      "data-variant",
      "default",
    )
    expect(
      screen.getByText("beta").closest("[data-tooltip-content]"),
    ).toHaveAttribute("data-tooltip-content", "groupRatioTooltip:beta:1")
  })
})
