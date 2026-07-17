import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ModelItemDescription } from "~/features/ModelList/components/ModelItem/ModelItemDescription"
import { ModelItemPerCallPricingView } from "~/features/ModelList/components/ModelItem/ModelItemPerCallPricingView"
import { PriceView } from "~/features/ModelList/components/ModelItem/ModelItemPicingView"
import { ModelItemPricing } from "~/features/ModelList/components/ModelItem/ModelItemPricing"
import { MODEL_LIST_GROUP_SELECTION_SCOPES } from "~/features/ModelList/groupSelectionScopes"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"

const { formatPriceCompactMock, isTokenBillingTypeMock } = vi.hoisted(() => ({
  formatPriceCompactMock: vi.fn(
    (price: number, currency?: string) => `${currency}:${price}`,
  ),
  isTokenBillingTypeMock: vi.fn(),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        options?: {
          group?: string
        },
      ) => (options?.group ? `${key}:${options.group}` : key),
    }),
  }
})

vi.mock("~/services/models/utils/modelPricing", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/models/utils/modelPricing")
    >()

  return {
    ...actual,
    formatPriceCompact: (price: number, currency?: string) =>
      formatPriceCompactMock(price, currency),
    isTokenBillingType: (quotaType: number) =>
      isTokenBillingTypeMock(quotaType),
  }
})

const createCalculatedPrice = (overrides?: Record<string, unknown>) =>
  ({
    inputUSD: 1.25,
    inputCNY: 9,
    outputUSD: 2.5,
    outputCNY: 18,
    perCallPrice: 3,
    ...overrides,
  }) as any

const createModel = (overrides?: Record<string, unknown>) =>
  ({
    model_name: "gpt-4o-mini",
    model_description: "Fast multimodal model",
    quota_type: 0,
    model_ratio: 3,
    ...overrides,
  }) as any

describe("Model item pricing and description", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    formatPriceCompactMock.mockImplementation(
      (price: number, currency?: string) => `${currency}:${price}`,
    )
    isTokenBillingTypeMock.mockReturnValue(true)
  })

  describe("ModelItemDescription", () => {
    it("renders nothing when the model has no description", () => {
      const { container } = render(
        <ModelItemDescription
          model={createModel({ model_description: "" })}
          isAvailableForUser={true}
        />,
      )

      expect(container).toBeEmptyDOMElement()
    })

    it("renders the description with availability-aware styling and tooltip text", () => {
      render(
        <ModelItemDescription
          model={createModel({
            model_description: "Reasoning tuned for coding",
          })}
          isAvailableForUser={false}
        />,
      )

      const description = screen.getByText("Reasoning tuned for coding")
      expect(description).toHaveAttribute("title", "Reasoning tuned for coding")
      expect(description).toHaveClass("text-gray-400")
    })

    it("uses the available styling when the model is accessible to the user", () => {
      render(
        <ModelItemDescription
          model={createModel({ model_description: "Available to this group" })}
          isAvailableForUser={true}
        />,
      )

      expect(screen.getByText("Available to this group")).toHaveClass(
        "text-gray-600",
      )
    })
  })

  describe("PriceView", () => {
    it("formats token-billing prices in USD and appends the per-million suffix", () => {
      render(
        <PriceView
          calculatedPrice={createCalculatedPrice()}
          showRealPrice={false}
          tokenBillingType={true}
          isAvailableForUser={true}
          formatPriceCompact={formatPriceCompactMock}
        />,
      )

      expect(screen.getByText("input")).toBeInTheDocument()
      expect(screen.getByText("output")).toBeInTheDocument()
      expect(screen.getByText("USD:1.25/M")).toHaveClass("text-blue-600")
      expect(screen.getByText("USD:2.5/M")).toHaveClass("text-green-600")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(1.25, "USD")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(2.5, "USD")
    })

    it("formats real prices in CNY without token suffixes and dims unavailable models", () => {
      render(
        <PriceView
          calculatedPrice={createCalculatedPrice()}
          showRealPrice={true}
          tokenBillingType={false}
          isAvailableForUser={false}
          formatPriceCompact={formatPriceCompactMock}
        />,
      )

      expect(screen.getByText("CNY:9")).toHaveClass("text-gray-500")
      expect(screen.getByText("CNY:18")).toHaveClass("text-gray-500")
      expect(screen.queryByText("CNY:9/M")).toBeNull()
      expect(formatPriceCompactMock).toHaveBeenCalledWith(9, "CNY")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(18, "CNY")
    })
  })

  describe("ModelItemPerCallPricingView", () => {
    it("renders numeric per-call prices in the selected currency", () => {
      render(
        <ModelItemPerCallPricingView
          perCallPrice={4}
          isAvailableForUser={true}
          exchangeRate={7}
          showRealPrice={true}
          tokenBillingType={false}
        />,
      )

      expect(screen.getByText("CNY:28")).toHaveClass("text-purple-600")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(28, "CNY")
    })

    it("renders object per-call prices through the shared input and output view", () => {
      render(
        <ModelItemPerCallPricingView
          perCallPrice={{ input: 0.2, output: 0.5 }}
          isAvailableForUser={false}
          exchangeRate={10}
          showRealPrice={false}
          tokenBillingType={false}
        />,
      )

      expect(screen.getByText("USD:0.2")).toHaveClass("text-gray-500")
      expect(screen.getByText("USD:0.5")).toHaveClass("text-gray-500")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(0.2, "USD")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(0.5, "USD")
    })

    it("falls back to zero for falsy numeric per-call prices and dims unavailable models", () => {
      render(
        <ModelItemPerCallPricingView
          perCallPrice={0}
          isAvailableForUser={false}
          exchangeRate={10}
          showRealPrice={false}
          tokenBillingType={false}
        />,
      )

      expect(screen.getByText("USD:0")).toHaveClass("text-gray-500")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(0, "USD")
    })

    it("falls back to zero when showing real-currency per-call prices", () => {
      render(
        <ModelItemPerCallPricingView
          perCallPrice={0}
          isAvailableForUser={true}
          exchangeRate={10}
          showRealPrice={true}
          tokenBillingType={false}
        />,
      )

      expect(screen.getByText("CNY:0")).toHaveClass("text-purple-600")
      expect(formatPriceCompactMock).toHaveBeenCalledWith(0, "CNY")
    })
  })

  describe("ModelItemPricing", () => {
    it("returns nothing when pricing is hidden", () => {
      const { container } = render(
        <ModelItemPricing
          model={createModel()}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={false}
          showRatioColumn={true}
          isAvailableForUser={true}
          groupRatios={{}}
        />,
      )

      expect(container).toBeEmptyDOMElement()
    })

    it("renders token billing prices and ratio metadata when enabled", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({ model_ratio: 3.5 })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={false}
          groupRatios={{}}
        />,
      )

      expect(screen.getByText("USD:1.25/M")).toBeInTheDocument()
      expect(screen.getByText("modelRatio")).toBeInTheDocument()
      expect(screen.getByText("3.5x")).toHaveClass("text-gray-500")
    })

    it("uses the active ratio styling for available token-billing models", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({ model_ratio: 2 })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          groupRatios={{}}
        />,
      )

      expect(screen.getByText("2x")).toHaveClass("text-gray-900")
    })

    it("renders per-call pricing when the model charges per request", () => {
      isTokenBillingTypeMock.mockReturnValue(false)

      render(
        <ModelItemPricing
          model={createModel({ quota_type: 2 })}
          calculatedPrice={createCalculatedPrice({ perCallPrice: 6 })}
          exchangeRate={5}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={false}
          isAvailableForUser={true}
          groupRatios={{}}
        />,
      )

      expect(screen.getByText("perCall")).toBeInTheDocument()
      expect(screen.getByText("USD:6")).toBeInTheDocument()
      expect(screen.queryByText("modelRatio")).not.toBeInTheDocument()
    })

    it("renders explicit zero per-call prices instead of treating them as missing", () => {
      isTokenBillingTypeMock.mockReturnValue(false)

      render(
        <ModelItemPricing
          model={createModel({ quota_type: 2 })}
          calculatedPrice={createCalculatedPrice({ perCallPrice: 0 })}
          exchangeRate={5}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={false}
          isAvailableForUser={true}
          groupRatios={{}}
        />,
      )

      expect(screen.getByText("perCall")).toBeInTheDocument()
      expect(screen.getByText("USD:0")).toBeInTheDocument()
      expect(screen.queryByText("modelRatio")).not.toBeInTheDocument()
    })

    it("renders the optimal-group indicator beside ratio metadata and uses title-only explanation for the lowest price", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({ model_ratio: 2 })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          isLowestPrice={true}
          effectiveGroup="vip"
          groupRatios={{ vip: 2 }}
          showsOptimalGroup={true}
        />,
      )

      expect(screen.getByText("modelRatio")).toBeInTheDocument()
      expect(screen.getByText("optimalGroup:vip (2x)")).toBeInTheDocument()
      expect(screen.getByText("optimalGroup:vip (2x)")).toHaveAttribute(
        "title",
        "optimalGroupLowestPriceWithinBillingMode:vip (2x)",
      )
      expect(screen.queryByText("lowestPrice")).toBeNull()
    })

    it("uses the selected-group explanation when showing an auto-picked group without a lowest-price badge", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({ model_ratio: 2 })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={false}
          isAvailableForUser={true}
          isLowestPrice={false}
          effectiveGroup="vip"
          groupRatios={{ vip: 2 }}
          showsOptimalGroup={true}
        />,
      )

      expect(screen.getByText("optimalGroup:vip (2x)")).toHaveAttribute(
        "title",
        "optimalGroupWithinSelectedGroups:vip (2x)",
      )
      expect(screen.queryByText("modelRatio")).not.toBeInTheDocument()
    })

    it("uses account-filter copy for all-accounts lowest-price metadata", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({ model_ratio: 2 })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={false}
          isAvailableForUser={true}
          isLowestPrice={true}
          effectiveGroup="vip"
          groupRatios={{ vip: 2 }}
          showsOptimalGroup={true}
          groupSelectionScope={MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS}
        />,
      )

      expect(screen.getByText("optimalGroup:vip (2x)")).toHaveAttribute(
        "title",
        "optimalGroupLowestPriceWithinAccountFilters:vip (2x)",
      )
    })

    it("shows a lowest-price badge for rows without group semantics", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({ model_ratio: 0 })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={false}
          isAvailableForUser={true}
          isLowestPrice={true}
          groupRatios={{}}
          groupSelectionScope={MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS}
        />,
      )

      expect(screen.getByText("lowestPrice")).toHaveAttribute(
        "title",
        "lowestPriceWithinAccountFilters",
      )
      expect(screen.queryByText(/^optimalGroup:/)).toBeNull()
    })

    it("shows unavailable pricing metadata without formatting a zero price or ratio", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({
            model_ratio: 0,
            completion_ratio: 0,
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.NONE,
              precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
              unavailable_reason:
                MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
            },
          })}
          calculatedPrice={createCalculatedPrice({
            inputUSD: 0,
            inputCNY: 0,
            outputUSD: 0,
            outputCNY: 0,
          })}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          groupRatios={{}}
        />,
      )

      expect(
        screen.getByText("unavailablePriceReasons.modelListOnly"),
      ).toBeInTheDocument()
      expect(screen.queryByText("USD:0/M")).toBeNull()
      expect(screen.queryByText("CNY:0/M")).toBeNull()
      expect(screen.queryByText("0x")).toBeNull()
      expect(formatPriceCompactMock).not.toHaveBeenCalled()
    })

    it("shows the key-group unavailable reason when Sub2API group resolution is missing", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({
            model_name: "example-runtime-model",
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.NONE,
              precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
              unavailable_reason:
                MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN,
            },
          })}
          calculatedPrice={createCalculatedPrice({
            priceAvailability: "unavailable",
            unavailableReason:
              MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN,
          })}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          groupRatios={{}}
        />,
      )

      expect(
        screen.getByText("unavailablePriceReasons.keyGroupUnknown"),
      ).toBeInTheDocument()
      expect(formatPriceCompactMock).not.toHaveBeenCalled()
    })

    it("uses generic unavailable copy when pricing has no specific reason", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.NONE,
              precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            },
          })}
          calculatedPrice={createCalculatedPrice({
            priceAvailability: "unavailable",
            unavailableReason: undefined,
          })}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          groupRatios={{}}
        />,
      )

      expect(
        screen.getByText("unavailablePriceReasons.pricingSourceUnavailable"),
      ).toBeInTheDocument()
      expect(formatPriceCompactMock).not.toHaveBeenCalled()
    })

    it("uses no-usable-group copy without claiming a multiplier is missing", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel()}
          calculatedPrice={createCalculatedPrice({
            priceAvailability: "unavailable",
            unavailableReason: MODEL_UNAVAILABLE_PRICE_REASONS.NO_USABLE_GROUP,
          })}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={false}
          groupRatios={{}}
        />,
      )

      expect(screen.getByText("noUsableGroupsForModel")).toBeInTheDocument()
      expect(
        screen.queryByText("unavailablePriceReasons.groupRatioUnavailable"),
      ).not.toBeInTheDocument()
      expect(formatPriceCompactMock).not.toHaveBeenCalled()
    })

    it("labels estimated Sub2API prices with short source text", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({
            model_ratio: 0,
            completion_ratio: 0,
            token_price_usd_per_million: {
              input: 0.25,
              output: 1,
            },
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
              precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
              source_date: "2026-06-14",
            },
          })}
          calculatedPrice={createCalculatedPrice({
            inputUSD: 0.25,
            inputCNY: 1.75,
            outputUSD: 1,
            outputCNY: 7,
          })}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={false}
          isAvailableForUser={true}
          groupRatios={{ default: 1 }}
        />,
      )

      expect(screen.getByText("estimatedPrice")).toHaveAttribute(
        "title",
        "estimatedPriceTitle",
      )
      expect(screen.getByText("estimatedPrice")).toHaveClass("shrink-0")
      expect(screen.getByText("USD:0.25/M")).toBeInTheDocument()
      expect(screen.queryByText("official-rate-estimate")).toBeNull()
      expect(screen.queryByText("2026-06-14")).toBeNull()
    })

    it("shows the effective group ratio for estimated Sub2API prices", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({
            model_ratio: 0,
            completion_ratio: 0,
            token_price_usd_per_million: {
              input: 0.25,
              output: 1,
            },
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
              precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
            },
          })}
          calculatedPrice={createCalculatedPrice({
            inputUSD: 0.25,
            inputCNY: 1.75,
            outputUSD: 1,
            outputCNY: 7,
          })}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          effectiveGroup="vip"
          groupRatios={{ vip: 2 }}
        />,
      )

      expect(screen.getByText("groupRatio")).toBeInTheDocument()
      expect(screen.getByText("2x")).toBeInTheDocument()
      expect(screen.queryByText("0x")).toBeNull()
    })

    it("does not label an estimated model ratio as a group ratio without an effective group", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({
            model_ratio: 0,
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
              precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
            },
          })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          groupRatios={{ default: 1 }}
        />,
      )

      expect(screen.getByText("modelRatio")).toBeInTheDocument()
      expect(screen.queryByText("groupRatio")).not.toBeInTheDocument()
    })

    it("explains an unavailable estimated group multiplier without rendering an undefined ratio", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({
            model_ratio: 0,
            completion_ratio: 0,
            token_price_usd_per_million: {
              input: 0.25,
              output: 1,
            },
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
              precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
            },
          })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={true}
          isAvailableForUser={true}
          effectiveGroup="vip"
          groupRatios={{}}
        />,
      )

      expect(
        screen.getByText("unavailablePriceReasons.groupRatioUnavailable"),
      ).toBeInTheDocument()
      expect(screen.queryByText("groupRatio")).not.toBeInTheDocument()
      expect(screen.queryByText("undefinedx")).not.toBeInTheDocument()
    })

    it("uses account-filter copy for all-accounts auto-picked groups", () => {
      isTokenBillingTypeMock.mockReturnValue(true)

      render(
        <ModelItemPricing
          model={createModel({ model_ratio: 2 })}
          calculatedPrice={createCalculatedPrice()}
          exchangeRate={7}
          showRealPrice={false}
          showPricing={true}
          showRatioColumn={false}
          isAvailableForUser={true}
          isLowestPrice={false}
          effectiveGroup="vip"
          groupRatios={{ vip: 2 }}
          showsOptimalGroup={true}
          groupSelectionScope={MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS}
        />,
      )

      expect(screen.getByText("optimalGroup:vip (2x)")).toHaveAttribute(
        "title",
        "optimalGroupWithinAccountFilters:vip (2x)",
      )
    })
  })
})
