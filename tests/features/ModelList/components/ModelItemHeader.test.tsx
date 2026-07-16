import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { ModelItemHeader } from "~/features/ModelList/components/ModelItem/ModelItemHeader"
import { resolveProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock(
  "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary",
  () => ({
    VerificationHistorySummary: () => (
      <div data-testid="verification-history-summary" />
    ),
  }),
)

vi.mock("@heroicons/react/24/outline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@heroicons/react/24/outline")>()
  const CpuChipIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg role="img" data-publisher-icon="generic" {...props} />
  )

  return { ...actual, CpuChipIcon }
})

vi.mock("@lobehub/icons/es/Anthropic/components/Mono", () => ({
  default: ({
    size,
    ...props
  }: React.SVGProps<SVGSVGElement> & { size?: string | number }) => (
    <svg
      role="img"
      data-publisher-icon="Anthropic-mono"
      data-size={size}
      {...props}
    />
  ),
}))

vi.mock("~/services/models/utils/modelPricing", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/models/utils/modelPricing")
    >()

  return {
    ...actual,
    getBillingModeText: (quotaType: number) =>
      quotaType === 0 ? "ui:billing.tokenBased" : "ui:billing.perCall",
  }
})

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...actual,
    IconButton: ({ analyticsAction, children, ...props }: any) => {
      const scope = useProductAnalyticsScope()
      const resolvedAction = resolveProductAnalyticsActionContext(
        analyticsAction,
        scope,
      )

      return (
        <button
          type="button"
          data-analytics-action={
            resolvedAction
              ? `${resolvedAction.featureId}:${resolvedAction.actionId}:${resolvedAction.surfaceId}:${resolvedAction.entrypoint}`
              : undefined
          }
          {...props}
        >
          {children}
        </button>
      )
    },
  }
})

function renderModelItemHeader(quotaType: number) {
  render(
    <ModelItemHeader
      resolvedVendor={{ state: "unknown" }}
      model={
        {
          model_name: "per-call-model",
          quota_type: quotaType,
        } as any
      }
      isAvailableForUser={true}
      handleCopyModelName={vi.fn()}
      showPricingMetadata={true}
    />,
  )
}

describe("ModelItemHeader", () => {
  it("uses the supplied resolved vendor instead of reclassifying the model name", () => {
    const resolvedVendor = {
      state: "resolved",
      kind: "known",
      key: "known:anthropic",
      knownId: "anthropic",
      label: "Anthropic",
      source: "publisher-evidence",
    } as const

    render(
      <ModelItemHeader
        resolvedVendor={resolvedVendor}
        model={{ model_name: "gpt-4o-mini", quota_type: 0 } as any}
        isAvailableForUser={true}
        handleCopyModelName={vi.fn()}
        showPricingMetadata={false}
      />,
    )

    const heading = screen.getByRole("heading", { name: "gpt-4o-mini" })
    expect(heading).toBeVisible()
    const decorativeIcon = screen.getByRole("img", { hidden: true })
    expect(decorativeIcon).toHaveAttribute(
      "data-publisher-icon",
      "Anthropic-mono",
    )
    expect(decorativeIcon).toHaveAttribute("data-size", "16")
    expect(decorativeIcon).toHaveAttribute("aria-hidden", "true")
    const badgeSurface = decorativeIcon.closest(
      '[data-slot="model-vendor-badge"]',
    )
    expect(badgeSurface).toHaveClass("rounded-full")
    expect(badgeSurface?.parentElement).toBe(heading.parentElement)
    expect(screen.queryAllByRole("img")).toHaveLength(0)
  })

  it("declares controlled analytics metadata for row action buttons", () => {
    render(
      <ModelItemHeader
        resolvedVendor={{ state: "unknown" }}
        model={
          {
            model_name: "gpt-private-model",
            quota_type: 0,
          } as any
        }
        isAvailableForUser={true}
        handleCopyModelName={vi.fn()}
        showPricingMetadata={true}
        onOpenKeyDialog={vi.fn()}
        onVerifyApi={vi.fn()}
        onVerifyCliSupport={vi.fn()}
      />,
    )

    const modelListAction = (actionId: string) =>
      `${PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}:${actionId}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`

    expect(
      screen.getByRole("button", {
        name: "modelList:actions.copyModelName",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      modelListAction(PRODUCT_ANALYTICS_ACTION_IDS.CopyModelName),
    )
    expect(
      screen.getByRole("button", {
        name: "modelList:actions.keyForModel",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      modelListAction(PRODUCT_ANALYTICS_ACTION_IDS.OpenModelKeyDialog),
    )
    expect(
      screen.getByRole("button", {
        name: "modelList:actions.verifyApi",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      modelListAction(PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi),
    )
    expect(
      screen.getByRole("button", {
        name: "modelList:actions.verifyCliSupport",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      modelListAction(PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelCliSupport),
    )
  })

  it("uses the default billing badge variant for quota_type 2 models", () => {
    renderModelItemHeader(2)

    const billingBadge = screen.getByText("ui:billing.perCall")
    expect(billingBadge).toBeInTheDocument()
    expect(billingBadge).toHaveClass("bg-primary/10")
    expect(billingBadge).not.toHaveClass("bg-secondary")
  })

  it("keeps the model name in a shrinkable first-line cluster", () => {
    renderModelItemHeader(0)

    const modelName = screen.getByText("per-call-model")
    expect(modelName).toHaveClass("min-w-0", "flex-1", "truncate")
    expect(modelName.parentElement).toHaveClass(
      "min-w-0",
      "flex-[1_1_10rem]",
      "items-center",
    )
  })

  it("renders available groups as neutral metadata instead of availability status", () => {
    render(
      <ModelItemHeader
        resolvedVendor={{ state: "unknown" }}
        model={
          {
            model_name: "gpt-private-model",
            quota_type: 0,
          } as any
        }
        isAvailableForUser={true}
        handleCopyModelName={vi.fn()}
        showPricingMetadata={true}
        groupSummary={{
          label: "default (1x)",
          overflowCount: 1,
          title: "modelList:availableGroups: default (1x), vip (2x)",
        }}
      />,
    )

    const groupBadge = screen.getByText("default (1x)").closest("[data-slot]")
    expect(groupBadge).toBeInTheDocument()
    expect(groupBadge).toHaveAttribute(
      "title",
      "modelList:availableGroups: default (1x), vip (2x)",
    )
    expect(groupBadge).toHaveAttribute(
      "aria-label",
      "modelList:availableGroups: default (1x), vip (2x)",
    )
    expect(groupBadge).toHaveClass("bg-secondary")
    const overflowCount = screen.getByText("+1")
    expect(overflowCount).toHaveClass(
      "shrink-0",
      "rounded-full",
      "bg-current/10",
      "px-1.5",
      "text-[0.85em]",
      "tabular-nums",
    )
    expect(screen.queryByText("modelList:available")).not.toBeInTheDocument()
  })

  it("omits the count adornment for single-group summaries", () => {
    render(
      <ModelItemHeader
        resolvedVendor={{ state: "unknown" }}
        model={
          {
            model_name: "gpt-private-model",
            quota_type: 0,
          } as any
        }
        isAvailableForUser={true}
        handleCopyModelName={vi.fn()}
        showPricingMetadata={true}
        groupSummary={{
          label: "default (1x)",
          title: "modelList:availableGroups: default (1x)",
        }}
      />,
    )

    expect(screen.getByText("default (1x)")).toBeInTheDocument()
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
  })
})
