import { describe, expect, it } from "vitest"

import { Button } from "~/src/components/ui/button"
import { render, screen } from "~/tests/test-utils/render"

describe("Button", () => {
  it("renders leftIcon when not loading", async () => {
    render(<Button leftIcon={<span data-testid="left-icon" />}>Save</Button>)

    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("left-icon")).toBeInTheDocument()
    expect(
      screen.queryByRole("status", { name: "Loading" }),
    ).not.toBeInTheDocument()
  })

  it("replaces leftIcon with Spinner when loading", async () => {
    render(
      <Button loading leftIcon={<span data-testid="left-icon" />}>
        Save
      </Button>,
    )

    expect(
      await screen.findByRole("button", { name: /Save/ }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("left-icon")).not.toBeInTheDocument()
    expect(screen.getAllByRole("status", { name: "Loading" })).toHaveLength(1)
  })

  it("renders Spinner when loading without leftIcon", async () => {
    render(<Button loading>Save</Button>)

    expect(
      await screen.findByRole("button", { name: /Save/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("status", { name: "Loading" })).toHaveLength(1)
  })
})
