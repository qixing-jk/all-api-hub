import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import { VerificationStatusBadge } from "~/components/dialogs/VerifyApiDialog/VerificationStatusBadge"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("lucide-react", () => ({
  CircleCheck: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="check-circle-icon" {...props} />
  ),
  CircleX: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="x-circle-icon" {...props} />
  ),
}))

vi.mock("~/components/ui", () => ({
  Badge: ({
    children,
    size,
    variant,
  }: {
    children: React.ReactNode
    size?: string
    variant?: string
  }) => (
    <div data-size={size} data-variant={variant}>
      {children}
    </div>
  ),
}))

describe("VerificationStatusBadge", () => {
  it("renders the pass state with the success badge and icon", () => {
    render(<VerificationStatusBadge status="pass" />)

    const passLabel = screen.getByText("verifyDialog.status.pass")
    const passBadge = passLabel.closest("[data-variant]")

    expect(screen.getByText("verifyDialog.status.pass")).toBeInTheDocument()
    expect(screen.getByTestId("check-circle-icon")).toBeInTheDocument()
    expect(passBadge).toHaveAttribute("data-variant", "success")
    expect(passBadge).toHaveAttribute("data-size", "sm")
  })

  it.each([
    ["unsupported", "verifyDialog.status.unsupported"],
    ["unverified", "verifyDialog.status.unverified"],
  ] as const)("renders the %s outline state", (status, label) => {
    render(<VerificationStatusBadge status={status} />)

    const badgeLabel = screen.getByText(label)

    expect(badgeLabel).toBeInTheDocument()
    expect(badgeLabel.closest("[data-variant]")).toHaveAttribute(
      "data-variant",
      "outline",
    )
    expect(screen.queryByTestId("check-circle-icon")).not.toBeInTheDocument()
    expect(screen.queryByTestId("x-circle-icon")).not.toBeInTheDocument()
  })

  it("renders the fallback failure state with the destructive badge and icon", () => {
    render(<VerificationStatusBadge status="fail" />)

    const failLabel = screen.getByText("verifyDialog.status.fail")

    expect(screen.getByText("verifyDialog.status.fail")).toBeInTheDocument()
    expect(screen.getByTestId("x-circle-icon")).toBeInTheDocument()
    expect(failLabel.closest("[data-variant]")).toHaveAttribute(
      "data-variant",
      "destructive",
    )
  })
})

describe("ProbeStatusBadge", () => {
  it("forwards the probe result status to the shared badge", () => {
    render(
      <ProbeStatusBadge
        result={{
          id: "models",
          status: "unsupported",
          latencyMs: 0,
          summary: "Not supported",
        }}
      />,
    )

    const unsupportedLabel = screen.getByText("verifyDialog.status.unsupported")

    expect(unsupportedLabel).toBeInTheDocument()
    expect(unsupportedLabel.closest("[data-variant]")).toHaveAttribute(
      "data-variant",
      "outline",
    )
  })
})
