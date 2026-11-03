import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { AccountModelGroupSelect } from "~/features/ModelList/groups/AccountModelGroupSelect"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { selected: number; total: number }) =>
      params ? `${params.selected}/${params.total}` : `modelList:${key}`,
  }),
}))

it.each([
  { excluded: ["c"], expected: "modelList:allAccountGroups (2)", title: "2/2" },
  { excluded: ["a", "b", "c"], expected: "0/0", title: "0/0" },
])(
  "shows the selected count when no single group describes the selection: $expected",
  ({ excluded, expected, title }) => {
    render(
      <AccountModelGroupSelect
        groups={["a", "b", "c"]}
        excludedGroups={excluded}
        groupRatios={{ a: 1, b: 2, c: 3 }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("combobox")).toHaveTextContent(expected)
    expect(screen.getByRole("combobox")).toHaveAttribute("title", title)
  },
)

it.each([
  { groups: ["default"], excludedGroups: [] },
  { groups: ["default", "vip"], excludedGroups: ["vip"] },
])(
  "shows the only eligible group as a non-interactive badge",
  ({ groups, excludedGroups }) => {
    render(
      <AccountModelGroupSelect
        groups={groups}
        excludedGroups={excludedGroups}
        groupRatios={{ default: 1 }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(screen.getByText("default (1x)")).toBeVisible()
  },
)

it("shows how many model groups are included by all groups", () => {
  render(
    <AccountModelGroupSelect
      groups={["a", "b"]}
      excludedGroups={[]}
      groupRatios={{ a: 1, b: 3 }}
      onChange={vi.fn()}
    />,
  )
  expect(screen.getByRole("combobox")).toHaveTextContent(
    "modelList:allAccountGroups (2)",
  )
})

it("selects one account group and restores all groups", async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const props = {
    groups: ["a", "b"],
    excludedGroups: [],
    groupRatios: { a: 1, b: 3 },
    onChange,
  }
  const view = render(<AccountModelGroupSelect {...props} />)
  await user.click(screen.getByRole("combobox"))
  await user.click(screen.getByRole("option", { name: "b (3x)" }))
  expect(onChange).toHaveBeenLastCalledWith("b")
  view.rerender(<AccountModelGroupSelect {...props} selectedGroup="b" />)
  expect(screen.getByRole("combobox")).toHaveAttribute("title", "1/2")
  await user.click(screen.getByRole("combobox"))
  await user.click(
    screen.getByRole("option", { name: "modelList:allAccountGroups (2)" }),
  )
  expect(onChange).toHaveBeenLastCalledWith(undefined)
})
