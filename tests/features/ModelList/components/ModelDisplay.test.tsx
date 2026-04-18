import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import { ModelDisplay } from "~/features/ModelList/components/ModelDisplay"
import type { CalculatedModelItem } from "~/features/ModelList/hooks/useFilteredModels"
import type { ModelPricing } from "~/services/apiService/common/type"
import type { CalculatedPrice } from "~/services/models/utils/modelPricing"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"

const { mockTotalListHeightChanged, modelItemSpy } = vi.hoisted(() => ({
  mockTotalListHeightChanged: {
    current: undefined as undefined | ((height: number) => void),
  },
  modelItemSpy: vi.fn(),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => `modelList:${key}`,
    }),
  }
})

vi.mock("~/components/ui", () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}))

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    className,
    data,
    itemContent,
    computeItemKey,
    components,
    style,
    totalListHeightChanged,
  }: {
    className?: string
    data: any[]
    itemContent: (index: number, item: any) => React.ReactNode
    computeItemKey?: (index: number, item: any) => React.Key
    components?: {
      Item?: React.ComponentType<any>
      List?: React.ComponentType<any>
    }
    style?: React.CSSProperties
    totalListHeightChanged?: (height: number) => void
  }) => {
    const Item = components?.Item ?? ((props: any) => <div {...props} />)
    const List = components?.List ?? ((props: any) => <div {...props} />)
    mockTotalListHeightChanged.current = totalListHeightChanged

    return (
      <div data-testid="virtuoso" className={className} style={style}>
        <List data-testid="virtuoso-list">
          {data.map((item, index) => (
            <Item
              data-testid="virtuoso-item"
              key={
                computeItemKey?.(index, item) ??
                `${item.model.model_name}-${index}`
              }
            >
              {itemContent(index, item)}
            </Item>
          ))}
        </List>
      </div>
    )
  },
}))

vi.mock("~/features/ModelList/components/ModelItem", () => ({
  default: (props: any) => {
    modelItemSpy(props)

    return (
      <div
        data-testid="model-item"
        data-model-id={props.model.model_name}
        data-exchange-rate={String(props.exchangeRate)}
        data-effective-group={props.effectiveGroup ?? ""}
        data-selected-groups={props.selectedGroups.join(",")}
        data-all-groups={String(props.isAllGroupsMode)}
        data-summary-status={props.verificationSummary?.status ?? "none"}
        data-source-kind={props.source.kind}
        data-expanded={String(props.isExpanded ?? false)}
      >
        <button type="button" onClick={props.onToggleExpand}>
          toggle-{props.model.model_name}
        </button>
        <button
          type="button"
          onClick={() =>
            props.onVerifyModel?.(props.source, props.model.model_name)
          }
        >
          verify-{props.model.model_name}
        </button>
        <button
          type="button"
          onClick={() =>
            props.onVerifyCliSupport?.(props.source, props.model.model_name)
          }
        >
          verify-cli-{props.model.model_name}
        </button>
        {props.source.kind === "account" ? (
          <button
            type="button"
            onClick={() =>
              props.onOpenModelKeyDialog?.(
                props.source.account,
                props.model.model_name,
                props.model.enable_groups,
              )
            }
          >
            key-{props.model.model_name}
          </button>
        ) : null}
      </div>
    )
  },
}))

const ACCOUNT_SOURCE = {
  kind: "account",
  account: {
    id: "account-1",
    name: "Account One",
    balance: {
      USD: 10,
      CNY: 80,
    },
  },
} as any

const PROFILE_SOURCE = {
  kind: "profile",
  profile: {
    id: "profile-1",
    name: "Reusable Profile",
  },
} as any

type CalculatedModelOverrides = {
  model?: Partial<ModelPricing>
  calculatedPrice?: Partial<CalculatedPrice>
  source?: CalculatedModelItem["source"]
  effectiveGroup?: string
}

function requireHistoryTarget(
  target: ApiVerificationHistoryTarget | null,
): ApiVerificationHistoryTarget {
  if (!target) {
    throw new Error("Expected verification history target to be created")
  }

  return target
}

const createCalculatedModel = (
  overrides: CalculatedModelOverrides,
): CalculatedModelItem => {
  const model: ModelPricing = {
    model_name: "gpt-4o-mini",
    model_description: "Test model",
    quota_type: 0,
    model_ratio: 1,
    model_price: 0,
    owner_by: "test-owner",
    completion_ratio: 1,
    enable_groups: ["default", "vip"],
    supported_endpoint_types: ["chat"],
    ...(overrides.model ?? {}),
  }

  const calculatedPrice: CalculatedPrice = {
    inputUSD: 1,
    outputUSD: 2,
    inputCNY: 7,
    outputCNY: 14,
    ...(overrides.calculatedPrice ?? {}),
  }

  return {
    model,
    calculatedPrice,
    source: overrides.source ?? ACCOUNT_SOURCE,
    groupRatios: { default: 1, vip: 2 },
    effectiveGroup: overrides.effectiveGroup,
  }
}

function getRenderedModelItem(modelId: string) {
  const item = screen
    .getAllByTestId("model-item")
    .find((element) => element.getAttribute("data-model-id") === modelId)

  if (!item) {
    throw new Error(`Model item not found: ${modelId}`)
  }

  return item
}

describe("ModelDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTotalListHeightChanged.current = undefined
  })

  it("shows an empty state when no filtered models are available", () => {
    render(
      <ModelDisplay
        models={[]}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default"]}
      />,
    )

    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "modelList:noMatchingModels",
    )
    expect(screen.queryByTestId("virtuoso")).not.toBeInTheDocument()
  })

  it("shrinks the virtual model list container to measured content height", () => {
    render(
      <ModelDisplay
        models={[
          createCalculatedModel({
            model: { model_name: "gpt-4o-mini" },
          }),
        ]}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default"]}
      />,
    )

    const virtualList = screen.getByTestId("virtuoso")
    const listContainer = virtualList.parentElement

    act(() => {
      mockTotalListHeightChanged.current?.(144)
    })

    expect(listContainer).toHaveStyle({ height: "144px" })
  })

  it("caps the virtual model list container to the viewport height limit", () => {
    render(
      <ModelDisplay
        models={[
          createCalculatedModel({
            model: { model_name: "gpt-4o-mini" },
          }),
          createCalculatedModel({
            model: { model_name: "claude-3-5-sonnet" },
          }),
        ]}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default"]}
      />,
    )

    const virtualList = screen.getByTestId("virtuoso")
    const listContainer = virtualList.parentElement

    act(() => {
      mockTotalListHeightChanged.current?.(10_000)
    })

    expect(listContainer).toHaveStyle({
      height: `${window.innerHeight * 0.7}px`,
    })
  })

  it("uses consistent virtual row spacing without adding row margin", () => {
    render(
      <ModelDisplay
        models={[
          createCalculatedModel({
            model: { model_name: "gpt-4o-mini" },
          }),
          createCalculatedModel({
            model: { model_name: "claude-3-5-sonnet" },
          }),
        ]}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default"]}
      />,
    )

    const [firstItem, lastItem] = screen.getAllByTestId("virtuoso-item")

    expect(firstItem).not.toHaveClass("my-3")
    expect(firstItem).not.toHaveClass("first:mt-0")
    expect(lastItem).not.toHaveClass("my-3")
    expect(firstItem).toHaveClass("pb-3")
    expect(lastItem).toHaveClass("pb-3")
  })

  it("derives account exchange rates, group mode, and account verification summaries for rendered model cards", async () => {
    const user = userEvent.setup()
    const onVerifyModel = vi.fn()
    const onVerifyCliSupport = vi.fn()
    const onOpenModelKeyDialog = vi.fn()
    const handleGroupClick = vi.fn()
    const accountSummaryTarget = requireHistoryTarget(
      createAccountModelVerificationHistoryTarget("account-1", "gpt-4o-mini"),
    )
    const accountSummaryKey =
      serializeVerificationHistoryTarget(accountSummaryTarget)

    render(
      <ModelDisplay
        models={[
          createCalculatedModel({
            effectiveGroup: "vip",
          }),
          createCalculatedModel({
            model: {
              model_name: "gemini-1.5-pro",
              enable_groups: ["default"],
            },
            effectiveGroup: "default",
            source: {
              ...ACCOUNT_SOURCE,
              account: {
                ...ACCOUNT_SOURCE.account,
                id: "account-2",
                balance: { USD: 0, CNY: 60 },
              },
            },
          }),
        ]}
        verificationSummariesByKey={{
          [accountSummaryKey]: { status: "success" } as any,
        }}
        onVerifyModel={onVerifyModel}
        onVerifyCliSupport={onVerifyCliSupport}
        onOpenModelKeyDialog={onOpenModelKeyDialog}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={handleGroupClick}
        availableGroups={["default", "vip"]}
        displayCapabilities={{ canVerify: true } as any}
      />,
    )

    const [accountItem, defaultRateItem] = screen.getAllByTestId("model-item")

    expect(accountItem).toHaveAttribute("data-source-kind", "account")
    expect(accountItem).toHaveAttribute("data-exchange-rate", "8")
    expect(accountItem).toHaveAttribute("data-effective-group", "vip")
    expect(accountItem).toHaveAttribute("data-selected-groups", "")
    expect(accountItem).toHaveAttribute("data-all-groups", "true")
    expect(accountItem).toHaveAttribute("data-summary-status", "success")

    expect(defaultRateItem).toHaveAttribute(
      "data-exchange-rate",
      String(UI_CONSTANTS.EXCHANGE_RATE.DEFAULT),
    )
    expect(defaultRateItem).toHaveAttribute("data-summary-status", "none")

    await user.click(screen.getByRole("button", { name: "verify-gpt-4o-mini" }))
    await user.click(
      screen.getByRole("button", { name: "verify-cli-gpt-4o-mini" }),
    )
    await user.click(screen.getByRole("button", { name: "key-gpt-4o-mini" }))

    expect(onVerifyModel).toHaveBeenCalledWith(ACCOUNT_SOURCE, "gpt-4o-mini")
    expect(onVerifyCliSupport).toHaveBeenCalledWith(
      ACCOUNT_SOURCE,
      "gpt-4o-mini",
    )
    expect(onOpenModelKeyDialog).toHaveBeenCalledWith(
      ACCOUNT_SOURCE.account,
      "gpt-4o-mini",
      ["default", "vip"],
    )
    expect(handleGroupClick).not.toHaveBeenCalled()
  })

  it("uses profile verification summaries and preserves non-all group selection for profile-backed items", () => {
    const profileSummaryTarget = requireHistoryTarget(
      createProfileModelVerificationHistoryTarget(
        "profile-1",
        "claude-3-5-sonnet",
      ),
    )
    const profileSummaryKey =
      serializeVerificationHistoryTarget(profileSummaryTarget)

    render(
      <ModelDisplay
        models={[
          createCalculatedModel({
            model: {
              model_name: "claude-3-5-sonnet",
              enable_groups: ["vip"],
            },
            effectiveGroup: "vip",
            source: PROFILE_SOURCE,
          }),
        ]}
        verificationSummariesByKey={{
          [profileSummaryKey]: { status: "failed" } as any,
        }}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={false}
        selectedGroups={["vip"]}
        handleGroupClick={vi.fn()}
        availableGroups={["vip"]}
      />,
    )

    expect(screen.getByTestId("model-item")).toHaveAttribute(
      "data-source-kind",
      "profile",
    )
    expect(screen.getByTestId("model-item")).toHaveAttribute(
      "data-effective-group",
      "vip",
    )
    expect(screen.getByTestId("model-item")).toHaveAttribute(
      "data-all-groups",
      "false",
    )
    expect(screen.getByTestId("model-item")).toHaveAttribute(
      "data-summary-status",
      "failed",
    )
    expect(
      screen.queryByRole("button", { name: "key-claude-3-5-sonnet" }),
    ).not.toBeInTheDocument()
  })

  it("preserves expanded state for the same model across refreshed model data", async () => {
    const user = userEvent.setup()
    const initialModels = [
      createCalculatedModel({}),
      createCalculatedModel({
        model: {
          model_name: "gemini-1.5-pro",
          enable_groups: ["default"],
        },
      }),
    ]
    const refreshedModels = [
      createCalculatedModel({
        model: {
          model_name: "gemini-1.5-pro",
          enable_groups: ["default"],
        },
        calculatedPrice: {
          inputUSD: 3,
        },
      }),
      createCalculatedModel({
        calculatedPrice: {
          inputUSD: 4,
        },
      }),
    ]

    const { rerender } = render(
      <ModelDisplay
        models={initialModels}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default", "vip"]}
      />,
    )

    await user.click(screen.getByRole("button", { name: "toggle-gpt-4o-mini" }))

    expect(getRenderedModelItem("gpt-4o-mini")).toHaveAttribute(
      "data-expanded",
      "true",
    )

    rerender(
      <ModelDisplay
        models={refreshedModels}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default", "vip"]}
      />,
    )

    expect(getRenderedModelItem("gpt-4o-mini")).toHaveAttribute(
      "data-expanded",
      "true",
    )
    expect(
      screen.getByRole("button", { name: "toggle-gpt-4o-mini" }),
    ).toBeInTheDocument()
  })

  it("clears expanded state when a model is removed and later re-added", async () => {
    const user = userEvent.setup()
    const initialModels = [
      createCalculatedModel({}),
      createCalculatedModel({
        model: {
          model_name: "gemini-1.5-pro",
          enable_groups: ["default"],
        },
      }),
    ]
    const modelsWithoutExpandedRow = [
      createCalculatedModel({
        model: {
          model_name: "gemini-1.5-pro",
          enable_groups: ["default"],
        },
      }),
    ]
    const readdedModels = [
      createCalculatedModel({
        calculatedPrice: {
          inputUSD: 4,
        },
      }),
      createCalculatedModel({
        model: {
          model_name: "gemini-1.5-pro",
          enable_groups: ["default"],
        },
      }),
    ]

    const { rerender } = render(
      <ModelDisplay
        models={initialModels}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default", "vip"]}
      />,
    )

    await user.click(screen.getByRole("button", { name: "toggle-gpt-4o-mini" }))

    expect(getRenderedModelItem("gpt-4o-mini")).toHaveAttribute(
      "data-expanded",
      "true",
    )

    rerender(
      <ModelDisplay
        models={modelsWithoutExpandedRow}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default", "vip"]}
      />,
    )

    rerender(
      <ModelDisplay
        models={readdedModels}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        selectedGroups={[]}
        handleGroupClick={vi.fn()}
        availableGroups={["default", "vip"]}
      />,
    )

    expect(getRenderedModelItem("gpt-4o-mini")).toHaveAttribute(
      "data-expanded",
      "false",
    )
  })
})
