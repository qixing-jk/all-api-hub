import React from "react"
import { describe, expect, it } from "vitest"

import { TagFilter } from "~/components/ui"
import { fireEvent, render, screen, within } from "~/tests/test-utils/render"

/**
 * Renders the TagFilter component in multi-select mode for interaction tests.
 */
function renderMultipleMode() {
  const Wrapper = () => {
    const [value, setValue] = React.useState<string[]>([])

    return (
      <TagFilter
        options={[
          { value: "group-a", label: "Group A" },
          { value: "group-b", label: "Group B" },
        ]}
        allLabel="All"
        value={value}
        onChange={setValue}
      />
    )
  }

  return render(<Wrapper />)
}

/**
 * Renders the TagFilter component in single-select mode for interaction tests.
 */
function renderSingleMode() {
  const Wrapper = () => {
    const [value, setValue] = React.useState<string | null>(null)

    return (
      <TagFilter
        mode="single"
        options={[
          { value: "group-a", label: "Group A" },
          { value: "group-b", label: "Group B" },
        ]}
        allLabel="All"
        value={value}
        onChange={setValue}
      />
    )
  }

  return render(<Wrapper />)
}

describe("TagFilter", () => {
  it("supports multiple selection and toggling tags", async () => {
    renderMultipleMode()

    const allButton = await screen.findByRole("button", { name: /All/i })
    const groupAButton = await screen.findByRole("button", { name: /Group A/i })
    const groupBButton = await screen.findByRole("button", { name: /Group B/i })

    expect(allButton).toHaveAttribute("aria-pressed", "true")
    expect(groupAButton).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(groupAButton)
    expect(allButton).toHaveAttribute("aria-pressed", "false")
    expect(groupAButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(groupBButton)
    expect(groupAButton).toHaveAttribute("aria-pressed", "true")
    expect(groupBButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(groupAButton)
    expect(groupAButton).toHaveAttribute("aria-pressed", "false")
    expect(groupBButton).toHaveAttribute("aria-pressed", "true")
  })

  it("supports single selection mode", async () => {
    renderSingleMode()

    const allButton = await screen.findByRole("button", { name: /All/i })
    const groupAButton = await screen.findByRole("button", { name: /Group A/i })
    const groupBButton = await screen.findByRole("button", { name: /Group B/i })

    expect(allButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(groupAButton)
    expect(allButton).toHaveAttribute("aria-pressed", "false")
    expect(groupAButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(groupBButton)
    expect(groupAButton).toHaveAttribute("aria-pressed", "false")
    expect(groupBButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(groupBButton)
    expect(allButton).toHaveAttribute("aria-pressed", "true")
    expect(groupBButton).toHaveAttribute("aria-pressed", "false")
  })

  it("expands overflow tags inline by default", async () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState<string[]>([])

      return (
        <TagFilter
          options={[
            { value: "tag-1", label: "Tag 1" },
            { value: "tag-2", label: "Tag 2" },
            { value: "tag-3", label: "Tag 3" },
            { value: "tag-4", label: "Tag 4" },
            { value: "tag-5", label: "Tag 5" },
          ]}
          value={value}
          onChange={setValue}
          maxVisible={3}
        />
      )
    }

    render(<Wrapper />)

    const moreButton = await screen.findByRole("button", { name: /More/i })
    expect(moreButton).toBeInTheDocument()
    expect(screen.queryByText("Tag 4")).not.toBeInTheDocument()
    expect(screen.queryByText("Tag 5")).not.toBeInTheDocument()

    fireEvent.click(moreButton)

    expect(await screen.findByText("Tag 4")).toBeInTheDocument()
    expect(await screen.findByText("Tag 5")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /More/i }),
    ).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()
  })

  it("keeps overflow tags in a popover when overflowDisplay='popover'", async () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState<string[]>([])

      return (
        <TagFilter
          options={[
            { value: "tag-1", label: "Tag 1" },
            { value: "tag-2", label: "Tag 2" },
            { value: "tag-3", label: "Tag 3" },
            { value: "tag-4", label: "Tag 4" },
            { value: "tag-5", label: "Tag 5" },
          ]}
          value={value}
          onChange={setValue}
          maxVisible={3}
          overflowDisplay="popover"
        />
      )
    }

    render(<Wrapper />)

    const moreButton = await screen.findByRole("button", { name: /More/i })
    expect(moreButton).toBeInTheDocument()
    expect(screen.queryByText("Tag 4")).not.toBeInTheDocument()
    expect(screen.queryByText("Tag 5")).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()

    fireEvent.click(moreButton)

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]',
    )
    expect(popoverContent).not.toBeNull()

    const { getByText } = within(popoverContent as HTMLElement)
    expect(getByText("Tag 4")).toBeInTheDocument()
    expect(getByText("Tag 5")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /More/i })).toBeInTheDocument()
  })
})
