import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type React from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelItem from "~/features/ModelList/components/ModelItem"
import { MODEL_LIST_GROUP_SELECTION_SCOPES } from "~/features/ModelList/groupSelectionScopes"
import type { ModelPricing } from "~/services/apiService/common/type"
import type { CalculatedPrice } from "~/services/models/utils/modelPricing"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { createTab } from "~/utils/browser/browserApi"

const { loggerWarnSpy } = vi.hoisted(() => ({
  loggerWarnSpy: vi.fn(),
}))

const { trackProductAnalyticsActionStartedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/browser/browserApi", () => ({
  createTab: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnSpy,
    error: vi.fn(),
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        options?: { group?: string; name?: string; remainingCount?: number },
      ) => {
        if (options?.group) {
          return options.remainingCount
            ? `${key}:${options.group}+${options.remainingCount}`
            : `${key}:${options.group}`
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
  ModelItemHeader: ({
    model,
    trailingContent,
    onOpenKeyDialog,
    onVerifyApi,
    onVerifyCliSupport,
    groupSummary,
  }: {
    model: { model_name: string }
    trailingContent?: React.ReactNode
    onOpenKeyDialog?: () => void
    onVerifyApi?: () => void
    onVerifyCliSupport?: () => void
    groupSummary?: {
      label: string
      overflowCount?: number
      title: string
    }
  }) => (
    <div>
      {model.model_name}
      {groupSummary ? (
        <span title={groupSummary.title}>
          {groupSummary.label}
          {typeof groupSummary.overflowCount === "number"
            ? `+${groupSummary.overflowCount}`
            : ""}
        </span>
      ) : null}
      {onOpenKeyDialog ? (
        <button type="button" onClick={onOpenKeyDialog}>
          key
        </button>
      ) : null}
      {onVerifyApi ? (
        <button type="button" onClick={onVerifyApi}>
          verify-api
        </button>
      ) : null}
      {onVerifyCliSupport ? (
        <button type="button" onClick={onVerifyCliSupport}>
          verify-cli
        </button>
      ) : null}
      {trailingContent ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
          {trailingContent}
        </div>
      ) : null}
    </div>
  ),
}))

vi.mock(
  "~/features/ModelList/components/ModelItem/ModelItemDescription",
  () => ({
    ModelItemDescription: () => <div data-testid="model-description" />,
  }),
)

vi.mock("~/features/ModelList/components/ModelItem/ModelItemPricing", () => ({
  ModelItemPricing: ({
    showPricing,
    showRatioColumn,
  }: {
    showPricing: boolean
    showRatioColumn: boolean
  }) => (
    <div
      data-testid="model-pricing"
      data-show-pricing={String(showPricing)}
      data-show-ratio-column={String(showRatioColumn)}
    />
  ),
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
      analyticsAction,
    }: {
      isExpanded: boolean
      onToggleExpand: () => void
      analyticsAction?: unknown
    }) => (
      <button
        type="button"
        data-testid="expand-button"
        data-expanded={String(isExpanded)}
        data-analytics-action={JSON.stringify(analyticsAction)}
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
        supportsRatioDisplay: true,
        supportsGroupFiltering: true,
        supportsAccountSummary: false,
        supportsTokenCompatibility: false,
        supportsCredentialVerification: false,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: false,
      },
    } as any,
  }
}

describe("ModelItem", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("falls back to the default group label when an unavailable model has no selected or effective group", () => {
    render(<ModelItem {...createDefaultProps()} />)

    expect(
      screen.getByText("clickSwitchGroup:default (1x)"),
    ).toBeInTheDocument()
    expect(screen.getByText("availableGroups: vip (1x)")).toBeInTheDocument()
  })

  it("does not mark rows as unavailable in all-accounts scope when account-level filtering already resolved eligibility", () => {
    render(
      <ModelItem
        {...createDefaultProps()}
        groupSelectionScope={MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS}
        isGroupSelectionInteractive={false}
      />,
    )

    expect(
      screen.queryByText("clickSwitchGroup:default (1x)"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("availableGroups: vip (1x)"),
    ).not.toBeInTheDocument()
  })

  it("summarizes model groups in the row header without showing availability status", () => {
    const props = createDefaultProps()

    render(
      <ModelItem
        {...props}
        model={{
          ...props.model,
          enable_groups: ["default", "vip", "private"],
        }}
        groupRatios={{
          default: 1,
          vip: 2,
          private: 3,
        }}
        selectedGroups={[]}
        availableGroups={["default", "vip", "private"]}
      />,
    )

    const groupSummary = screen.getByText("default (1x)+2")
    expect(groupSummary).toHaveAttribute(
      "title",
      "availableGroups: default (1x), vip (2x), private (3x)",
    )
    expect(screen.queryByText("available")).not.toBeInTheDocument()
  })

  it("suppresses the ratio column when either the row or display capabilities do not support ratios", () => {
    const props = createDefaultProps()

    render(
      <ModelItem
        {...props}
        showRatioColumn={true}
        source={{
          ...props.source,
          capabilities: {
            ...props.source.capabilities,
            supportsRatioDisplay: false,
          },
        }}
      />,
    )

    expect(screen.getByTestId("model-pricing")).toHaveAttribute(
      "data-show-ratio-column",
      "false",
    )
  })

  it("suppresses pricing when display capabilities disable account pricing", () => {
    render(
      <ModelItem
        {...createDefaultProps()}
        displayCapabilities={{
          supportsPricing: false,
          supportsRatioDisplay: true,
          supportsGroupFiltering: true,
          supportsAccountSummary: true,
          supportsTokenCompatibility: true,
          supportsCredentialVerification: true,
          supportsBatchCredentialVerification: true,
          supportsCliVerification: true,
        }}
      />,
    )

    expect(screen.getByTestId("model-pricing")).toHaveAttribute(
      "data-show-pricing",
      "false",
    )
  })

  it("keeps row-level account actions available when an aggregate display source disables them", async () => {
    const user = userEvent.setup()
    const onOpenModelKeyDialog = vi.fn()
    const onVerifyModel = vi.fn()
    const onVerifyCliSupport = vi.fn()
    const props = createDefaultProps()

    render(
      <ModelItem
        {...props}
        source={{
          ...props.source,
          capabilities: {
            ...props.source.capabilities,
            supportsTokenCompatibility: true,
            supportsCredentialVerification: true,
            supportsCliVerification: true,
          },
        }}
        displayCapabilities={{
          supportsPricing: true,
          supportsRatioDisplay: true,
          supportsGroupFiltering: true,
          supportsAccountSummary: true,
          supportsTokenCompatibility: false,
          supportsCredentialVerification: false,
          supportsBatchCredentialVerification: true,
          supportsCliVerification: false,
        }}
        onOpenModelKeyDialog={onOpenModelKeyDialog}
        onVerifyModel={onVerifyModel}
        onVerifyCliSupport={onVerifyCliSupport}
        effectiveGroup="vip"
      />,
    )

    await user.click(screen.getByRole("button", { name: "key" }))
    await user.click(screen.getByRole("button", { name: "verify-api" }))
    await user.click(screen.getByRole("button", { name: "verify-cli" }))

    expect(onOpenModelKeyDialog).toHaveBeenCalledWith(
      props.source.account,
      props.model.model_name,
      ["vip"],
    )
    expect(onVerifyModel).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "account" }),
      props.model.model_name,
      ["vip"],
    )
    expect(onVerifyCliSupport).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "account" }),
      props.model.model_name,
    )
  })

  it("omits empty model group context from account verification actions", async () => {
    const user = userEvent.setup()
    const onOpenModelKeyDialog = vi.fn()
    const onVerifyModel = vi.fn()
    const props = createDefaultProps()

    render(
      <ModelItem
        {...props}
        model={{
          ...props.model,
          enable_groups: [],
        }}
        source={{
          ...props.source,
          capabilities: {
            ...props.source.capabilities,
            supportsTokenCompatibility: true,
            supportsCredentialVerification: true,
          },
        }}
        displayCapabilities={{
          supportsPricing: true,
          supportsRatioDisplay: true,
          supportsGroupFiltering: true,
          supportsAccountSummary: true,
          supportsTokenCompatibility: true,
          supportsCredentialVerification: true,
          supportsBatchCredentialVerification: true,
          supportsCliVerification: false,
        }}
        selectedGroups={[]}
        availableGroups={[]}
        onOpenModelKeyDialog={onOpenModelKeyDialog}
        onVerifyModel={onVerifyModel}
      />,
    )

    await user.click(screen.getByRole("button", { name: "key" }))
    await user.click(screen.getByRole("button", { name: "verify-api" }))

    expect(onOpenModelKeyDialog).toHaveBeenCalledWith(
      props.source.account,
      props.model.model_name,
      undefined,
    )
    expect(onVerifyModel).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "account" }),
      props.model.model_name,
      undefined,
    )
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
    expect(screen.getByTestId("expand-button")).toHaveAttribute(
      "data-analytics-action",
      JSON.stringify({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleModelDetails,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    )
  })

  it("keeps source controls in the header trailing area", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"))
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(
      <ModelItem
        {...createDefaultProps()}
        source={{
          ...createDefaultProps().source,
          account: {
            ...createDefaultProps().source.account,
            baseUrl: "https://api.example.com",
          },
        }}
      />,
    )

    const sourceBadge = screen
      .getByText("Account One · api.example.com")
      .closest("[data-slot]")
    expect(sourceBadge).toHaveClass("max-w-full", "min-w-0")
    expect(sourceBadge?.parentElement).toHaveClass(
      "flex-wrap",
      "items-center",
      "sm:ml-auto",
    )
    expect(sourceBadge).toHaveAttribute("title", "https://api.example.com")
    expect(
      screen.getByRole("button", { name: "actions.copySiteUrl" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "actions.openSite" }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "actions.openSite" }))
    expect(createTab).toHaveBeenCalledWith("https://api.example.com/", true)

    await user.click(
      screen.getByRole("button", { name: "actions.copySiteUrl" }),
    )
    expect(writeText).toHaveBeenCalledWith("https://api.example.com")
    expect(toast.error).toHaveBeenCalledWith("messages.copyFailed")
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

  it("suppresses expansion prop mismatch warnings in custom production build modes", () => {
    vi.stubEnv("MODE", "staging")
    vi.stubEnv("PROD", true)

    render(<ModelItem {...createDefaultProps()} isExpanded={true} />)

    expect(loggerWarnSpy).not.toHaveBeenCalled()
  })
})
