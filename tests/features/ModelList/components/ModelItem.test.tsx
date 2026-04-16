import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import ModelItem from "~/features/ModelList/components/ModelItem"

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { group?: string; name?: string }) => {
        if (options?.group) {
          return `${key}:${options.group}`
        }
        if (options?.name) {
          return `${key}:${options.name}`
        }
        return key
      },
    }),
  }
})

vi.mock("~/features/ModelList/components/ModelItem/ModelItemHeader", () => ({
  ModelItemHeader: ({ model }: { model: { model_name: string } }) => (
    <div>{model.model_name}</div>
  ),
}))

vi.mock(
  "~/features/ModelList/components/ModelItem/ModelItemDescription",
  () => ({
    ModelItemDescription: () => <div data-testid="model-description" />,
  }),
)

vi.mock("~/features/ModelList/components/ModelItem/ModelItemPricing", () => ({
  ModelItemPricing: () => <div data-testid="model-pricing" />,
}))

vi.mock("~/features/ModelList/components/ModelItem/ModelItemDetails", () => ({
  ModelItemDetails: () => <div data-testid="model-details" />,
}))

vi.mock(
  "~/features/ModelList/components/ModelItem/ModelItemExpandButton",
  () => ({
    ModelItemExpandButton: () => <button type="button">expand</button>,
  }),
)

describe("ModelItem", () => {
  it("falls back to the default group label when an unavailable model has no selected or effective group", () => {
    render(
      <ModelItem
        model={
          {
            model_name: "gpt-4o-mini",
            model_description: "Fast model",
            quota_type: 0,
            model_ratio: 1,
            model_price: 0,
            completion_ratio: 1,
            enable_groups: ["vip"],
            supported_endpoint_types: [],
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
        exchangeRate={7}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={false}
        groupRatios={{}}
        selectedGroups={[]}
        availableGroups={[]}
        source={
          {
            kind: "account",
            account: {
              id: "account-1",
              name: "Account One",
            },
            capabilities: {
              supportsPricing: true,
              supportsGroupFiltering: true,
              supportsAccountSummary: false,
              supportsTokenCompatibility: false,
              supportsCredentialVerification: false,
              supportsCliVerification: false,
            },
          } as any
        }
      />,
    )

    expect(screen.getByText("clickSwitchGroup:default")).toBeInTheDocument()
    expect(screen.getByText("availableGroups: vip")).toBeInTheDocument()
  })
})
