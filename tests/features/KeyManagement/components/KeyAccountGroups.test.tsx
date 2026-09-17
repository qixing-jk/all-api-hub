import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { KeyAccountGroups } from "~/features/KeyManagement/components/KeyAccountGroups"

describe("KeyAccountGroups", () => {
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
