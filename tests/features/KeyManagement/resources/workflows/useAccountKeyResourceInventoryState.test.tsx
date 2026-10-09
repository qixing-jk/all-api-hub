import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAccountKeyResourceInventoryState } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceInventoryState"
import { useAccountKeyResourceRouteState } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRouteState"
import type { AccountKeyScope } from "~/services/apiAdapters/contracts/accountKeyResource"

const first: AccountKeyScope = {
  scopeKey: "first",
  routeKey: "first",
  displayName: "First",
  isDefault: false,
}
const preferred: AccountKeyScope = {
  scopeKey: "preferred",
  routeKey: "preferred",
  displayName: "Preferred",
  isDefault: true,
}

describe("scope inventory selection", () => {
  it.each([
    { name: "default scope", scopes: [first, preferred], expected: preferred },
    { name: "first available scope", scopes: [first], expected: first },
    { name: "empty inventory", scopes: [], expected: null },
  ])(
    "accepts $name when no scope has been selected",
    ({ scopes, expected }) => {
      const { result } = renderHook(() => {
        const routing = useAccountKeyResourceRouteState({ accounts: [] })
        return useAccountKeyResourceInventoryState({
          mode: "single",
          selectedAccount: "account",
          routing,
        })
      })
      act(() =>
        result.current.acceptScopeInventory(
          {
            accountId: "account",
            siteType: SITE_TYPES.NEW_API,
            scopeKey: "first",
            routeKey: "first",
          },
          scopes,
        ),
      )
      expect(result.current.selectedScope).toEqual(expected)
      expect(result.current.scopes).toEqual(scopes)
    },
  )
})
