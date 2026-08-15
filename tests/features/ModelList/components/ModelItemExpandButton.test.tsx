import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ModelItemExpandButton } from "~/features/ModelList/components/ModelItem/ModelItemExpandButton"
import { render, screen } from "~~/tests/test-utils/render"

describe("ModelItemExpandButton", () => {
  it("exposes both collapsed and expanded states while remaining actionable", async () => {
    const user = userEvent.setup()
    const onToggleExpand = vi.fn()
    const { rerender } = render(
      <ModelItemExpandButton
        isExpanded={false}
        onToggleExpand={onToggleExpand}
      />,
    )

    const button = await screen.findByRole("button")
    expect(button).toHaveAttribute("aria-expanded", "false")

    await user.click(button)
    expect(onToggleExpand).toHaveBeenCalledTimes(1)

    rerender(
      <ModelItemExpandButton
        isExpanded={true}
        onToggleExpand={onToggleExpand}
      />,
    )

    expect(await screen.findByRole("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })
})
