import { describe, expect, it, vi } from "vitest"

import { GroupSelection } from "~/entrypoints/options/pages/KeyManagement/components/AddTokenDialog/TokenForm/GroupSelection"
import { fireEvent, render, screen, within } from "~/tests/test-utils/render"

describe("GroupSelection", () => {
  it("renders group options with the group identifier in the label", async () => {
    const handleSelectChange = vi.fn()

    render(
      <GroupSelection
        group="level1"
        handleSelectChange={handleSelectChange}
        groups={{
          level1: { desc: "Default Group", ratio: 1 },
          level3: { desc: "User Group", ratio: 1.5 },
        }}
      />,
    )

    const combo = await screen.findByRole("combobox")
    expect(combo).toHaveTextContent("level1 - Default Group")

    fireEvent.click(combo)

    const dropdown = await screen.findByRole("dialog")
    expect(
      within(dropdown).getByText(
        "level1 - Default Group (keyManagement:dialog.groupRate 1)",
      ),
    ).toBeInTheDocument()
    expect(
      within(dropdown).getByText(
        "level3 - User Group (keyManagement:dialog.groupRate 1.5)",
      ),
    ).toBeInTheDocument()
  })

  it("avoids duplicating description when it matches the group identifier", async () => {
    render(
      <GroupSelection
        group="level2"
        handleSelectChange={() => {}}
        groups={{
          level2: { desc: "level2", ratio: 1 },
        }}
      />,
    )

    const combo = await screen.findByRole("combobox")
    fireEvent.click(combo)

    const dropdown = await screen.findByRole("dialog")
    expect(
      within(dropdown).getByText("level2 (keyManagement:dialog.groupRate 1)"),
    ).toBeInTheDocument()
  })
})
