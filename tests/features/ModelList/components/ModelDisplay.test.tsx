import { render, screen } from "@testing-library/react"
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

const { modelItemSpy } = vi.hoisted(() => ({
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
    data,
    itemContent,
    components,
  }: {
    data: any[]
    itemContent: (index: number, item: any) => React.ReactNode
    components?: { Item?: React.ComponentType<any> }
  }) => {
    const Item = components?.Item ?? ((props: any) => <div {...props} />)

    return (
      <div data-testid="virtuoso">
        {data.map((item, index) => (
          <Item key={`${item.model.model_name}-${index}`}>
            {itemContent(index, item)}
          </Item>
        ))}
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
      >
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

describe("ModelDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
