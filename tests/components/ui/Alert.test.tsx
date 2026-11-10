import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Alert } from "~/components/ui/Alert"
import { render, screen } from "~~/tests/test-utils/render"

describe("Alert", () => {
  it("makes an iconless alert action available beside its message", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <Alert
        showIcon={false}
        description="Connection failed"
        action={<button onClick={onRetry}>Retry</button>}
      />,
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection failed",
    )
    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByRole("alert")).not.toHaveClass(
      "grid-cols-[auto_minmax(0,1fr)]",
    )
  })
  it("renders compact alerts with a stable icon and content grid", async () => {
    render(
      <Alert
        compact
        variant="warning"
        description="Save the draft before testing the connection."
      />,
    )

    const alert = await screen.findByRole("alert")
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

  it("aligns the default alert icon and content in the same flow", async () => {
    render(<Alert variant="info" description="Standard notice" />)

    const alert = await screen.findByRole("alert")

    expect(alert).toHaveClass(
      "grid",
      "grid-cols-[auto_minmax(0,1fr)]",
      "items-start",
      "gap-x-3",
    )
    expect(alert).not.toHaveClass("[&>svg]:absolute")
    expect(alert).not.toHaveClass("[&>svg+div]:translate-y-[-3px]")
  })

  it("keeps iconless alerts as a full-width block", async () => {
    render(
      <Alert showIcon={false} variant="info" description="Text only notice" />,
    )

    const alert = await screen.findByRole("alert")

    expect(alert).toHaveClass("block")
    expect(alert).not.toHaveClass("grid")
    expect(alert).toHaveTextContent("Text only notice")
  })
})
