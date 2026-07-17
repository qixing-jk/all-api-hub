import userEvent from "@testing-library/user-event"
import React, { type ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ModelItemDetails } from "~/features/ModelList/components/ModelItem/ModelItemDetails"
import { MODEL_GROUP_ACCESS_STATES } from "~/features/ModelList/groupContext"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
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
    asChild = false,
    variant,
    size: _size,
    ...props
  }: React.PropsWithChildren<{
    asChild?: boolean
    variant?: string
    size?: string
  }> &
    React.HTMLAttributes<HTMLElement>) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(
        children as React.ReactElement<Record<string, unknown>>,
        { ...props, "data-variant": variant },
      )
    }

    return (
      <span data-variant={variant} {...props}>
        {children}
      </span>
    )
  },
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

const baseProps: ComponentProps<typeof ModelItemDetails> = {
  model: {
    enable_groups: ["default", "vip"],
    supported_endpoint_types: ["chat", "embeddings"],
    quota_type: 1,
  } as any,
  calculatedPrice: {
    inputUSD: 1,
    outputUSD: 2,
    inputCNY: 7,
    outputCNY: 14,
  } as any,
  showEndpointTypes: false,
  groupRatios: { default: 1, vip: 2 },
  groupContext: {
    accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
    supportedGroups: ["default", "vip"],
    usableGroups: ["default"],
    priceableGroups: ["default"],
  },
  showGroupDetails: true,
  showPricingDetails: false,
}

function renderDetails(
  overrides: Partial<ComponentProps<typeof ModelItemDetails>> = {},
) {
  return render(<ModelItemDetails {...baseProps} {...overrides} />)
}

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
    const { container } = renderDetails({
      showGroupDetails: false,
      showEndpointTypes: false,
      showPricingDetails: false,
    })

    expect(container).toBeEmptyDOMElement()
  })

  it("renders usable groups as actions and supported-only groups as read-only badges", async () => {
    const user = userEvent.setup()
    const onGroupClick = vi.fn()
    renderDetails({ onGroupClick })

    expect(screen.getByText("currentUsableGroups")).toBeInTheDocument()
    expect(screen.getByText("siteSupportedGroups")).toBeInTheDocument()

    const usableGroup = screen.getByRole("button", {
      name: "clickSwitchGroup:default (1x)",
    })
    expect(usableGroup).toHaveAttribute("data-variant", "secondary")
    expect(usableGroup).toHaveTextContent("default (1x)")
    expect(usableGroup).toHaveAccessibleDescription(
      /groupRatioTooltip:default:1\s+clickSwitchGroup:default \(1x\)/,
    )

    const supportedOnlyGroup = screen.getByText("vip")
    expect(supportedOnlyGroup.tagName).toBe("SPAN")
    expect(
      screen.queryByRole("button", { name: "vip" }),
    ).not.toBeInTheDocument()
    expect(supportedOnlyGroup.closest("[data-tooltip-content]")).toBeNull()

    await user.click(usableGroup)
    expect(onGroupClick).toHaveBeenCalledWith("default")
  })

  it("keeps the selected usable group read-only", () => {
    renderDetails({ effectiveGroup: "default", onGroupClick: vi.fn() })

    expect(screen.getByText("default (1x)")).toHaveAttribute(
      "data-variant",
      "default",
    )
    expect(
      screen.queryByRole("button", { name: "default (1x)" }),
    ).not.toBeInTheDocument()
  })

  it("keeps an unpriced usable group keyboard-operable without inventing a ratio", async () => {
    const user = userEvent.setup()
    const onGroupClick = vi.fn()
    renderDetails({
      model: { ...baseProps.model, enable_groups: ["vip"] },
      groupRatios: {},
      groupContext: {
        accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
        supportedGroups: ["vip"],
        usableGroups: ["vip"],
        priceableGroups: [],
      },
      onGroupClick,
    })

    const vipGroup = screen.getByRole("button", {
      name: "clickSwitchGroup:vip",
    })
    expect(screen.queryByText("vip (1x)")).not.toBeInTheDocument()
    expect(vipGroup).toHaveTextContent("vip")
    expect(vipGroup).toHaveAccessibleDescription(
      /groupRatioUnavailable\s+clickSwitchGroup:vip/,
    )

    await user.tab()
    expect(vipGroup).toHaveFocus()
    await user.keyboard("{Enter}")
    await user.keyboard(" ")
    expect(onGroupClick).toHaveBeenNthCalledWith(1, "vip")
    expect(onGroupClick).toHaveBeenNthCalledWith(2, "vip")
  })

  it("hides group UI for not-applicable sources even when raw groups exist", () => {
    const { container } = renderDetails({
      groupContext: {
        accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
        supportedGroups: ["default", "vip"],
        usableGroups: [],
        priceableGroups: [],
      },
      showGroupDetails: true,
    })

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText("currentUsableGroups")).not.toBeInTheDocument()
    expect(screen.queryByText("siteSupportedGroups")).not.toBeInTheDocument()
  })

  it("renders endpoint fallback text without token pricing for per-call models", () => {
    renderDetails({
      model: {
        ...baseProps.model,
        supported_endpoint_types: undefined,
        quota_type: 2,
      } as any,
      showGroupDetails: false,
      showEndpointTypes: true,
      showPricingDetails: true,
    })

    expect(screen.getByText("not-provided")).toBeInTheDocument()
    expect(screen.queryByText("detailedPricing")).not.toBeInTheDocument()
  })

  it("renders detailed token prices when available", () => {
    renderDetails({
      model: { ...baseProps.model, quota_type: 0 },
      calculatedPrice: {
        inputUSD: 1.25,
        outputUSD: 2.5,
        inputCNY: 8.75,
        outputCNY: 17.5,
      } as any,
      showGroupDetails: false,
      showPricingDetails: true,
    })

    expect(screen.getByText("detailedPricing")).toBeInTheDocument()
    expect(screen.getByText("USD: USD:1.25")).toBeInTheDocument()
    expect(screen.getByText("CNY: CNY:17.5")).toBeInTheDocument()
    expect(formatPriceMock).toHaveBeenCalledTimes(4)
  })

  it("shows an unavailable-price explanation instead of zero details", () => {
    renderDetails({
      model: {
        ...baseProps.model,
        quota_type: 0,
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      },
      calculatedPrice: {
        priceAvailability: "unavailable",
        unavailableReason:
          MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
      } as any,
      showGroupDetails: false,
      showPricingDetails: true,
    })

    expect(
      screen.getByText("unavailablePriceReasons.officialPriceMissing"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^USD:/)).not.toBeInTheDocument()
    expect(formatPriceMock).not.toHaveBeenCalled()
  })

  it("uses model unavailable metadata before the calculated-price fallback", () => {
    renderDetails({
      model: {
        ...baseProps.model,
        quota_type: 0,
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        },
      },
      calculatedPrice: {
        priceAvailability: "unavailable",
        unavailableReason:
          MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
      } as any,
      showGroupDetails: false,
      showPricingDetails: true,
    })

    expect(
      screen.getByText("unavailablePriceReasons.modelListOnly"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("unavailablePriceReasons.officialPriceMissing"),
    ).not.toBeInTheDocument()
  })

  it("uses model unavailable metadata even when calculated prices are available", () => {
    renderDetails({
      model: {
        ...baseProps.model,
        quota_type: 0,
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
        },
      },
      showGroupDetails: false,
      showPricingDetails: true,
    })

    expect(
      screen.getByText("unavailablePriceReasons.pricingSourceUnavailable"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^USD:/)).not.toBeInTheDocument()
  })
})
