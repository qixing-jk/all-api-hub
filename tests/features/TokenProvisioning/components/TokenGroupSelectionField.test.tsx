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

  it("keeps allowed groups first and sorts unavailable groups by name", async () => {
    render(
      <TokenGroupSelectionField
        group="vip"
        onChange={() => {}}
        groups={{
          zeta: { desc: "Zeta", ratio: 1 },
          vip: { desc: "VIP", ratio: 2 },
          alpha: { desc: "Alpha", ratio: 1 },
        }}
        allowedGroups={["vip"]}
      />,
    )

    fireEvent.click(await screen.findByRole("combobox"))

    const options = within(await screen.findByRole("dialog")).getAllByRole(
      "option",
    )
    const optionValues = options.map((option) =>
      option.getAttribute("data-value"),
    )

    expect(optionValues).toEqual(
      expect.arrayContaining(["vip", "alpha", "zeta"]),
    )
    expect(optionValues[0]).toBe("vip")
    expect(optionValues.indexOf("alpha")).toBeLessThan(
      optionValues.indexOf("zeta"),
    )
  })
})
