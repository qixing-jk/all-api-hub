import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelItem from "~/features/ModelList/components/ModelItem"
import type { ModelPricing } from "~/services/apiService/common/type"
import type { CalculatedPrice } from "~/services/models/utils/modelPricing"

const { loggerWarnSpy } = vi.hoisted(() => ({
  loggerWarnSpy: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnSpy,
    error: vi.fn(),
  }),
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
    ModelItemExpandButton: ({
      isExpanded,
      onToggleExpand,
    }: {
      isExpanded: boolean
      onToggleExpand: () => void
    }) => (
      <button
        type="button"
        data-testid="expand-button"
        data-expanded={String(isExpanded)}
        onClick={onToggleExpand}
      >
        expand
      </button>
    ),
  }),
)

function createDefaultProps() {
  const model: ModelPricing = {
    model_name: "gpt-4o-mini",
    model_description: "Fast model",
    quota_type: 0,
    model_ratio: 1,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: ["vip"],
    supported_endpoint_types: [],
  } as ModelPricing

  const calculatedPrice: CalculatedPrice = {
    inputUSD: 1,
    outputUSD: 2,
    inputCNY: 7,
    outputCNY: 14,
  } as CalculatedPrice

  return {
    model,
    calculatedPrice,
    exchangeRate: 7,
    showRealPrice: false,
    showRatioColumn: false,
    showEndpointTypes: false,
    groupRatios: {},
    selectedGroups: [],
    availableGroups: [],
    source: {
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
    } as any,
  }
}

describe("ModelItem", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back to the default group label when an unavailable model has no selected or effective group", () => {
    render(<ModelItem {...createDefaultProps()} />)

    expect(screen.getByText("clickSwitchGroup:default")).toBeInTheDocument()
    expect(screen.getByText("availableGroups: vip")).toBeInTheDocument()
  })

  it("does not mark rows as unavailable in all-accounts scope when account-level filtering already resolved eligibility", () => {
    render(
      <ModelItem
        {...createDefaultProps()}
        groupSelectionScope="all-accounts"
        isGroupSelectionInteractive={false}
      />,
    )

    expect(screen.queryByText("clickSwitchGroup:default")).toBeNull()
    expect(screen.queryByText("availableGroups: vip")).toBeNull()
  })

  it("uses internal expansion state when expansion props are omitted", async () => {
    const user = userEvent.setup()

    render(<ModelItem {...createDefaultProps()} />)

    expect(screen.queryByTestId("model-details")).not.toBeInTheDocument()
    expect(screen.getByTestId("expand-button")).toHaveAttribute(
      "data-expanded",
      "false",
    )

    await user.click(screen.getByTestId("expand-button"))

    expect(screen.getByTestId("model-details")).toBeInTheDocument()
    expect(screen.getByTestId("expand-button")).toHaveAttribute(
      "data-expanded",
      "true",
    )
  })

  it("treats expansion as controlled only when both props are provided", async () => {
    const user = userEvent.setup()
    const onToggleExpand = vi.fn()
    const { rerender } = render(
      <ModelItem
        {...createDefaultProps()}
        isExpanded={false}
        onToggleExpand={onToggleExpand}
      />,
    )

    await user.click(screen.getByTestId("expand-button"))

    expect(onToggleExpand).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("model-details")).not.toBeInTheDocument()
    expect(screen.getByTestId("expand-button")).toHaveAttribute(
      "data-expanded",
      "false",
    )

    rerender(
      <ModelItem
        {...createDefaultProps()}
        isExpanded={true}
        onToggleExpand={onToggleExpand}
      />,
    )

    expect(screen.getByTestId("model-details")).toBeInTheDocument()
    expect(screen.getByTestId("expand-button")).toHaveAttribute(
      "data-expanded",
      "true",
    )
  })

  it.each([
    {
      name: "isExpanded without onToggleExpand",
      props: { isExpanded: true },
      expectedCallbackCalls: 0,
    },
    {
      name: "onToggleExpand without isExpanded",
      props: { onToggleExpand: vi.fn() },
      expectedCallbackCalls: 0,
    },
  ])(
    "warns and falls back to uncontrolled expansion for %s",
    async ({ props, expectedCallbackCalls }) => {
      const user = userEvent.setup()

      render(<ModelItem {...createDefaultProps()} {...props} />)

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        "ModelItem expects isExpanded and onToggleExpand to be provided together. Falling back to uncontrolled expansion state.",
        {
          controlledIsExpandedProvided: "isExpanded" in props,
          onToggleExpandProvided: "onToggleExpand" in props,
        },
      )

      await user.click(screen.getByTestId("expand-button"))

      expect(screen.getByTestId("model-details")).toBeInTheDocument()
      expect(screen.getByTestId("expand-button")).toHaveAttribute(
        "data-expanded",
        "true",
      )

      if ("onToggleExpand" in props) {
        expect(props.onToggleExpand).toHaveBeenCalledTimes(
          expectedCallbackCalls,
        )
      }
    },
  )
})
