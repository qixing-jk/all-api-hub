import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WorkflowTransitionButton } from "~/components/ui"

describe("WorkflowTransitionButton", () => {
  it("renders the default workflow transition icon", () => {
    const { container } = render(
      <WorkflowTransitionButton>Open manager</WorkflowTransitionButton>,
    )

    expect(screen.getByRole("button", { name: "Open manager" })).toBeVisible()
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("allows callers to override the trailing icon", () => {
    const { container } = render(
      <WorkflowTransitionButton
        rightIcon={<span data-testid="custom-icon">custom</span>}
      >
        Open manager
      </WorkflowTransitionButton>,
    )

    expect(screen.getByTestId("custom-icon")).toHaveTextContent("custom")
    expect(container.querySelector("svg")).toBeNull()
  })
})
