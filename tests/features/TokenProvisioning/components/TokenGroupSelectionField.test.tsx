import { describe, expect, it, vi } from "vitest"

import { TokenGroupSelectionField } from "~/features/TokenProvisioning/components/TokenGroupSelectionField"
import { fireEvent, render, screen, within } from "~~/tests/test-utils/render"

describe("TokenGroupSelectionField", () => {
  it("renders group options with the group identifier in the label", async () => {
    const handleSelectChange = vi.fn()

    render(
      <TokenGroupSelectionField
        group="level1"
        onChange={handleSelectChange}
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
      <TokenGroupSelectionField
        group="level2"
        onChange={() => {}}
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
