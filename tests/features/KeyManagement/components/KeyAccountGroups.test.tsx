import { render, screen } from "@testing-library/react"
import { VirtuosoMockContext } from "react-virtuoso"
import { describe, expect, it } from "vitest"

import { KeyAccountGroups } from "~/features/KeyManagement/components/KeyAccountGroups"

describe("KeyAccountGroups", () => {
  it("mounts a bounded viewport for a large inventory and updates visible data", async () => {
    const groups = Array.from({ length: 100 }, (_, index) => ({
      account: { id: `account-${index}` },
    }))
    const view = (items: typeof groups) => (
      <VirtuosoMockContext.Provider
        value={{ viewportHeight: 300, itemHeight: 64 }}
      >
        <KeyAccountGroups
          groups={items}
          hasNavigationTarget={false}
          renderGroup={({ account }) => <button>{account.id}</button>}
        />
      </VirtuosoMockContext.Provider>
    )
    const { rerender } = render(view(groups))
    expect(
      await screen.findByRole("button", { name: "account-0" }),
    ).toBeVisible()
    expect(screen.getAllByRole("button").length).toBeLessThan(20)
    expect(screen.queryByRole("button", { name: "account-99" })).toBeNull()
    rerender(view(groups.slice(1)))
    expect(
      await screen.findByRole("button", { name: "account-1" }),
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: "account-0" })).toBeNull()
  })

  it.each([
    { count: 20, hasNavigationTarget: false },
    { count: 100, hasNavigationTarget: true },
  ])(
    "keeps every row reachable for $count accounts with navigation target $hasNavigationTarget",
    ({ count, hasNavigationTarget }) => {
      const groups = Array.from({ length: count }, (_, index) => ({
        account: { id: `account-${index}` },
      }))
      render(
        <KeyAccountGroups
          groups={groups}
          hasNavigationTarget={hasNavigationTarget}
          renderGroup={({ account }) => <button>{account.id}</button>}
        />,
      )
      expect(screen.getAllByRole("button")).toHaveLength(count)
      expect(
        screen.getByRole("button", {
          name: `account-${count - 1}`,
        }),
      ).toBeVisible()
    },
  )
})
