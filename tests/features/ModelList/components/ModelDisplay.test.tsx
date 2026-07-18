import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { ModelDisplay } from "~/features/ModelList/components/ModelDisplay"
import {
  MODEL_GROUP_ACCESS_STATES,
  resolveActiveModelGroupContext,
  resolveModelGroupContext,
} from "~/features/ModelList/groupContext"
import type { CalculatedModelItem } from "~/features/ModelList/hooks/useFilteredModels"
import {
  createAccountSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import type { CalculatedPrice } from "~/services/models/utils/modelPricing"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"

const { mockTotalListHeightChanged, modelItemSpy } = vi.hoisted(() => ({
  mockTotalListHeightChanged: {
    current: undefined as undefined | ((height: number) => void),
  },
  modelItemSpy: vi.fn(),
}))

const TEST_IDS = vi.hoisted(() => ({
  emptyState: "empty-state",
  virtuoso: "virtuoso",
  virtuosoList: "virtuoso-list",
  virtuosoItem: "virtuoso-item",
  modelItem: "model-item",
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
    <div data-testid={TEST_IDS.emptyState}>{title}</div>
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
      <div data-testid={TEST_IDS.virtuoso} className={className} style={style}>
        <List data-testid={TEST_IDS.virtuosoList}>
          {data.map((item, index) => (
            <Item
              data-testid={TEST_IDS.virtuosoItem}
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
        data-testid={TEST_IDS.modelItem}
        data-model-id={props.model.model_name}
        data-exchange-rate={String(props.exchangeRate)}
        data-effective-group={props.effectiveGroup ?? ""}
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
            props.onVerifyModel?.(
              props.source,
              props.model.model_name,
              props.effectiveGroup
                ? [props.effectiveGroup]
                : props.model.enable_groups,
            )
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

const ACCOUNT_FIXTURE: DisplaySiteData = {
  id: "account-1",
  name: "Account One",
  username: "example-user",
  balance: { USD: 10, CNY: 80 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://account.example.invalid",
  token: "example-token",
  userId: "example-user-id",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
}

const PROFILE_FIXTURE: ApiCredentialProfile = {
  id: "profile-1",
  name: "Reusable Profile",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://profile.example.invalid",
  apiKey: "example-key",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}

const ACCOUNT_SOURCE = createAccountSource(ACCOUNT_FIXTURE)
const PROFILE_SOURCE = createProfileSource(PROFILE_FIXTURE)

type CalculatedModelOverrides = {
  model?: Partial<ModelPricing>
  calculatedPrice?: Partial<
    Extract<CalculatedPrice, { priceAvailability?: "available" }>
  >
  source?: CalculatedModelItem["source"]
  effectiveGroup?: string
  resolvedVendor?: CalculatedModelItem["resolvedVendor"]
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

  const source = overrides.source ?? ACCOUNT_SOURCE
  const groupRatios = Object.fromEntries(
    model.enable_groups.map((group, index) => [group, index + 1]),
  )
  const groupContext = resolveModelGroupContext({
    groupSemantics: source.groupSemantics,
    model,
    usableGroup: Object.fromEntries(
      model.enable_groups.map((group) => [group, true]),
    ),
    groupRatios,
  })
  const activeGroupContext = resolveActiveModelGroupContext({
    context: groupContext,
    effectiveGroup: overrides.effectiveGroup,
  })

  if (
    overrides.effectiveGroup &&
    !activeGroupContext.actionGroups.includes(overrides.effectiveGroup)
  ) {
    throw new Error(
      `Effective group is not actionable for this fixture: ${overrides.effectiveGroup}`,
    )
  }

  return {
    model,
    calculatedPrice,
    source,
    groupRatios,
    groupContext,
    activeGroupContext,
    effectiveGroup: overrides.effectiveGroup,
    resolvedVendor: overrides.resolvedVendor ?? { state: "unknown" },
  }
}

function getRenderedModelItem(modelId: string) {
  const item = screen
    .getAllByTestId(TEST_IDS.modelItem)
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

  it("passes each calculated row's resolved vendor to ModelItem unchanged", () => {
    const resolvedVendor = {
      state: "resolved",
      kind: "known",
      key: "known:anthropic",
      knownId: "anthropic",
      label: "Anthropic",
      source: "publisher-evidence",
    } as const
    const item = createCalculatedModel({
      model: { model_name: "gpt-4o-mini" },
      resolvedVendor,
    })

    render(
      <ModelDisplay
        models={[item]}
        verificationSummariesByKey={{}}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={false}
        handleGroupClick={vi.fn()}
      />,
    )

    const renderedProps = modelItemSpy.mock.calls.at(-1)?.[0]
    expect(renderedProps.resolvedVendor).toBe(resolvedVendor)
  })

  it("shows an empty state when no filtered models are available", () => {
    render(
      <ModelDisplay
        models={[]}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        handleGroupClick={vi.fn()}
      />,
    )

    expect(screen.getByTestId(TEST_IDS.emptyState)).toHaveTextContent(
      "modelList:noMatchingModels",
    )
    expect(screen.queryByTestId(TEST_IDS.virtuoso)).not.toBeInTheDocument()
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
        handleGroupClick={vi.fn()}
      />,
    )

    const virtualList = screen.getByTestId(TEST_IDS.virtuoso)
    const listContainer = virtualList.parentElement

    act(() => {
      mockTotalListHeightChanged.current?.(144)
    })

    expect(listContainer).toHaveStyle({ height: "144px" })
  })

  it("caps the virtual model list container with responsive CSS max-height", () => {
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
        handleGroupClick={vi.fn()}
      />,
    )

    const virtualList = screen.getByTestId(TEST_IDS.virtuoso)
    const listContainer = virtualList.parentElement

    act(() => {
      mockTotalListHeightChanged.current?.(10_000)
    })

    expect(listContainer).toHaveStyle({
      height: "10000px",
    })
    expect(listContainer).toHaveClass("max-h-[70vh]")
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
        handleGroupClick={vi.fn()}
      />,
    )

    const [firstItem, lastItem] = screen.getAllByTestId(TEST_IDS.virtuosoItem)

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
        handleGroupClick={handleGroupClick}
        displayCapabilities={{ canVerify: true } as any}
      />,
    )

    const [accountItem, defaultRateItem] = screen.getAllByTestId(
      TEST_IDS.modelItem,
    )

    expect(accountItem).toHaveAttribute("data-source-kind", "account")
    expect(accountItem).toHaveAttribute("data-exchange-rate", "8")
    expect(accountItem).toHaveAttribute("data-effective-group", "vip")
    expect(accountItem).toHaveAttribute("data-summary-status", "success")

    const firstRowProps = modelItemSpy.mock.calls[0]?.[0]
    expect(firstRowProps.groupContext).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["default", "vip"],
      usableGroups: ["default", "vip"],
      priceableGroups: ["default", "vip"],
    })
    expect(firstRowProps.activeGroupContext).toEqual({
      activeUsableGroups: ["default", "vip"],
      activePriceableGroups: ["default", "vip"],
      actionGroups: ["vip"],
    })

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

    expect(onVerifyModel).toHaveBeenCalledWith(ACCOUNT_SOURCE, "gpt-4o-mini", [
      "vip",
    ])
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

  it("uses profile verification summaries without inventing group selection for profile-backed items", () => {
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
            source: PROFILE_SOURCE,
          }),
        ]}
        verificationSummariesByKey={{
          [profileSummaryKey]: { status: "failed" } as any,
        }}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={false}
        handleGroupClick={vi.fn()}
      />,
    )

    expect(screen.getByTestId(TEST_IDS.modelItem)).toHaveAttribute(
      "data-source-kind",
      "profile",
    )
    expect(screen.getByTestId(TEST_IDS.modelItem)).toHaveAttribute(
      "data-effective-group",
      "",
    )
    expect(screen.getByTestId(TEST_IDS.modelItem)).toHaveAttribute(
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
        handleGroupClick={vi.fn()}
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
        handleGroupClick={vi.fn()}
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
        handleGroupClick={vi.fn()}
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
        handleGroupClick={vi.fn()}
      />,
    )

    rerender(
      <ModelDisplay
        models={readdedModels}
        verificationSummariesByKey={{}}
        showRealPrice={true}
        showRatioColumn={true}
        showEndpointTypes={true}
        handleGroupClick={vi.fn()}
      />,
    )

    expect(getRenderedModelItem("gpt-4o-mini")).toHaveAttribute(
      "data-expanded",
      "false",
    )
  })
})
