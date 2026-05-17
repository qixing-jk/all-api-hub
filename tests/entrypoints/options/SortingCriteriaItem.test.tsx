import { describe, expect, it, vi } from "vitest"

import { SortingCriteriaItem } from "~/features/BasicSettings/components/tabs/AccountManagement/SortingPrioritySettings/SortingCriteriaItem"
import { SortingCriteriaType } from "~/types/sorting"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

describe("SortingCriteriaItem", () => {
  it("lets priority controls wrap below text in narrow settings cards", () => {
    const { container } = render(
      <SortingCriteriaItem
        item={{
          id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
          label: "Custom check-in URL priority with longer localized copy",
          description:
            "Long descriptions should remain readable instead of being squeezed by the priority badge and switch.",
          priority: 8,
          enabled: true,
        }}
        onToggleEnabled={vi.fn()}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const card = container.querySelector(
      `#sorting-criteria-${SortingCriteriaType.CUSTOM_CHECK_IN_URL}`,
    )
    expect(card).toHaveClass("[container-type:inline-size]")

    const label = screen.getByText(
      "Custom check-in URL priority with longer localized copy",
    )
    expect(label).toHaveClass("break-words")
    expect(label).not.toHaveClass("truncate")

    const contentRow = label.closest("[data-sorting-criteria-row]")
    expect(contentRow).toHaveClass(
      "flex-col",
      "[@container(min-width:42rem)]:flex-row",
    )

    const controls = screen.getByText(/settings:sorting.priority/).parentElement
    expect(controls).toHaveClass(
      "w-full",
      "flex-wrap",
      "[@container(min-width:42rem)]:w-auto",
    )
  })
})
