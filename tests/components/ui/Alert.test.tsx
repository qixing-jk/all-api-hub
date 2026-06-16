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
    expect(alert).toHaveClass("gap-3")
    expect(icon).toHaveClass("shrink-0")
    expect(icon).toHaveClass("mt-0.5")
    expect(alert).toHaveTextContent(
      "Save the draft before testing the connection.",
    )
  })

  it("keeps the default alert layout unchanged", () => {
    render(<Alert variant="info" description="Standard notice" />)

    const alert = screen.getByRole("alert")

    expect(alert).toHaveClass("relative")
    expect(alert).toHaveClass("[&>svg]:absolute")
    expect(alert).toHaveClass("[&>svg+div]:translate-y-[-3px]")
  })
})
