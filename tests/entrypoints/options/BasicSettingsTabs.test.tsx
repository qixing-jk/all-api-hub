import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import CheckinRedeemTab from "~/entrypoints/options/pages/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeemTab"
import WebAiApiCheckTab from "~/entrypoints/options/pages/BasicSettings/components/WebAiApiCheckTab"

vi.mock(
  "~/entrypoints/options/pages/BasicSettings/components/tabs/CheckinRedeem/AutoCheckinSettings",
  () => ({
    default: () => <div data-testid="auto-checkin-settings" />,
  }),
)

vi.mock(
  "~/entrypoints/options/pages/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings",
  () => ({
    default: () => <div data-testid="redemption-assist-settings" />,
  }),
)

vi.mock(
  "~/entrypoints/options/pages/BasicSettings/components/WebAiApiCheckSettings",
  () => ({
    default: () => <div data-testid="web-ai-api-check-settings" />,
  }),
)

describe("BasicSettings tab layout", () => {
  it("keeps WebAiApiCheck out of CheckinRedeemTab", () => {
    render(<CheckinRedeemTab />)

    expect(screen.getByTestId("auto-checkin-settings")).toBeInTheDocument()
    expect(screen.getByTestId("redemption-assist-settings")).toBeInTheDocument()
    expect(
      screen.queryByTestId("web-ai-api-check-settings"),
    ).not.toBeInTheDocument()
  })

  it("renders WebAiApiCheckSettings inside WebAiApiCheckTab", () => {
    render(<WebAiApiCheckTab />)

    expect(screen.getByTestId("web-ai-api-check-settings")).toBeInTheDocument()
    expect(
      screen.queryByTestId("auto-checkin-settings"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("redemption-assist-settings"),
    ).not.toBeInTheDocument()
  })
})
