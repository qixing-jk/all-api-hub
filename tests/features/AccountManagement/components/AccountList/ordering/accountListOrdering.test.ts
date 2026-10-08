import { describe, expect, it } from "vitest"

import {
  groupAccountListResults,
  orderAccountsByDisplayOrder,
} from "~/features/AccountManagement/components/AccountList/ordering/accountListOrdering"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

/** Renders the given accounts the way the account list renders them. */
function buildDisplayItems(
  accounts: Array<ReturnType<typeof buildDisplaySiteData>>,
) {
  return groupAccountListResults(
    accounts.map((account) => ({ account })),
    new Set<string>(),
  )
}

const buildAccount = (id: string, overrides = {}) =>
  buildDisplaySiteData({ id, name: id, ...overrides })

describe("orderAccountsByDisplayOrder", () => {
  it("follows the rendered list instead of the incoming order", () => {
    const disabled = buildAccount("disabled", { disabled: true })
    const enabled = buildAccount("enabled")
    const displayItems = buildDisplayItems([disabled, enabled])

    expect(displayItems.map((item) => item.result.account.id)).toEqual([
      "enabled",
      "disabled",
    ])
    expect(
      orderAccountsByDisplayOrder([disabled, enabled], displayItems).map(
        (account) => account.id,
      ),
    ).toEqual(["enabled", "disabled"])
  })

  it("keeps selections hidden by the current search or filters at the end", () => {
    const hidden = buildAccount("hidden")
    const renderable = buildAccount("renderable")

    expect(
      orderAccountsByDisplayOrder(
        [hidden, renderable],
        buildDisplayItems([renderable]),
      ).map((account) => account.id),
    ).toEqual(["renderable", "hidden"])
  })

  it("keeps the incoming order for accounts the list does not render", () => {
    const first = buildAccount("first")
    const second = buildAccount("second")

    expect(
      orderAccountsByDisplayOrder([first, second], buildDisplayItems([])).map(
        (account) => account.id,
      ),
    ).toEqual(["first", "second"])
  })

  it("does not mutate the incoming selection", () => {
    const alpha = buildAccount("alpha")
    const beta = buildAccount("beta")
    const selected = [beta, alpha]

    orderAccountsByDisplayOrder(selected, buildDisplayItems([alpha, beta]))

    expect(selected.map((account) => account.id)).toEqual(["beta", "alpha"])
  })
})
