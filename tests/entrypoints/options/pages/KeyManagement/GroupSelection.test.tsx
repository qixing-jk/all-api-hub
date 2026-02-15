import { beforeAll, describe, expect, it, vi } from "vitest"

import { GroupSelection } from "~/entrypoints/options/pages/KeyManagement/components/AddTokenDialog/TokenForm/GroupSelection"
import keyManagementEn from "~/locales/en/keyManagement.json"
import uiEn from "~/locales/en/ui.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { fireEvent, render, screen, within } from "~/tests/test-utils/render"

describe("GroupSelection", () => {
  beforeAll(() => {
    testI18n.addResourceBundle("en", "ui", uiEn, true, true)
    testI18n.addResourceBundle(
      "en",
      "keyManagement",
      keyManagementEn,
      true,
      true,
    )
  })

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
      within(dropdown).getByText("level1 - Default Group (Rate: 1)"),
    ).toBeInTheDocument()
    expect(
      within(dropdown).getByText("level3 - User Group (Rate: 1.5)"),
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
    expect(within(dropdown).getByText("level2 (Rate: 1)")).toBeInTheDocument()
  })
})
