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
} from "~/services/productAnalytics/events"

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

vi.mock("~/services/models/utils/modelProviders", () => ({
  getProviderConfig: () => ({
    icon: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
    bgColor: "bg-slate-100",
    color: "text-slate-700",
  }),
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
      model={
        {
          model_name: "per-call-model",
          quota_type: quotaType,
        } as any
      }
      isAvailableForUser={true}
      handleCopyModelName={vi.fn()}
      showPricingMetadata={true}
      showAvailabilityBadge={false}
    />,
  )
}

describe("ModelItemHeader", () => {
  it("declares controlled analytics metadata for row action buttons", () => {
    render(
      <ModelItemHeader
        model={
          {
            model_name: "gpt-private-model",
            quota_type: 0,
          } as any
        }
        isAvailableForUser={true}
        handleCopyModelName={vi.fn()}
        showPricingMetadata={true}
        showAvailabilityBadge={false}
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
})
