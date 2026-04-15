import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { ModelItemHeader } from "~/features/ModelList/components/ModelItem/ModelItemHeader"

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
    getBillingModeText: () => "billing-mode-per-call",
  }
})

describe("ModelItemHeader", () => {
  it("uses the default billing badge variant for quota_type 2 models", () => {
    render(
      <ModelItemHeader
        model={
          {
            model_name: "per-call-model",
            quota_type: 2,
          } as any
        }
        isAvailableForUser={true}
        handleCopyModelName={vi.fn()}
        showPricingMetadata={true}
        showAvailabilityBadge={false}
      />,
    )

    expect(screen.getByText("billing-mode-per-call")).toBeInTheDocument()
  })
})
