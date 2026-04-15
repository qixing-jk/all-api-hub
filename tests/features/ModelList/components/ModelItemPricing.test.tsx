import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ModelItemDescription } from "~/features/ModelList/components/ModelItem/ModelItemDescription"
import { ModelItemPerCallPricingView } from "~/features/ModelList/components/ModelItem/ModelItemPerCallPricingView"
import { PriceView } from "~/features/ModelList/components/ModelItem/ModelItemPicingView"
import { ModelItemPricing } from "~/features/ModelList/components/ModelItem/ModelItemPricing"

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
      t: (key: string) => key,
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
        />,
      )

      expect(screen.getByText("USD:1.25/M")).toBeInTheDocument()
      expect(screen.getByText("ratio")).toBeInTheDocument()
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
        />,
      )

      expect(screen.getByText("perCall")).toBeInTheDocument()
      expect(screen.getByText("USD:6")).toBeInTheDocument()
      expect(screen.queryByText("ratio")).toBeNull()
    })

    it("omits the pricing body when a per-call model has no computed per-call price", () => {
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
        />,
      )

      expect(screen.queryByText("perCall")).toBeNull()
      expect(screen.queryByText("ratio")).toBeNull()
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
          showsOptimalGroup={true}
        />,
      )

      expect(screen.getByText("ratio")).toBeInTheDocument()
      expect(screen.getByText("optimalGroup")).toBeInTheDocument()
      expect(screen.getByText("optimalGroup")).toHaveAttribute(
        "title",
        "optimalGroupLowestPriceWithinBillingMode",
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
          showsOptimalGroup={true}
        />,
      )

      expect(screen.getByText("optimalGroup")).toHaveAttribute(
        "title",
        "optimalGroupWithinSelectedGroups",
      )
      expect(screen.queryByText("ratio")).toBeNull()
    })
  })
})
