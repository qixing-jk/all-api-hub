import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Alert } from "~/components/ui/Alert"

describe("Alert", () => {
  it("renders compact alerts with a stable icon and content grid", () => {
    render(
      <Alert
        compact
        variant="warning"
        description="Save the draft before testing the connection."
      />,
    )

    const alert = screen.getByRole("alert")
    const icon = alert.querySelector("svg")

    expect(alert).toHaveClass("grid")
    expect(alert).toHaveClass("grid-cols-[auto_minmax(0,1fr)]")
    expect(alert).toHaveClass("items-start")
    expect(alert).toHaveClass("gap-x-3", "gap-y-density-3")
    expect(icon).toHaveClass("shrink-0")
    expect(icon).toHaveClass("mt-0.5")
    expect(alert).toHaveTextContent(
      "Save the draft before testing the connection.",
    )
  })

  it("aligns the default alert icon and content in the same flow", () => {
    render(<Alert variant="info" description="Standard notice" />)

    const alert = screen.getByRole("alert")

    expect(alert).toHaveClass(
      "grid",
      "grid-cols-[auto_minmax(0,1fr)]",
      "items-start",
      "gap-x-3",
    )
    expect(alert).not.toHaveClass("[&>svg]:absolute")
    expect(alert).not.toHaveClass("[&>svg+div]:translate-y-[-3px]")
  })

  it("keeps iconless alerts as a full-width block", () => {
    render(
      <Alert showIcon={false} variant="info" description="Text only notice" />,
    )

    const alert = screen.getByRole("alert")

    expect(alert).toHaveClass("block")
    expect(alert).not.toHaveClass("grid")
    expect(alert).toHaveTextContent("Text only notice")
  })
})
