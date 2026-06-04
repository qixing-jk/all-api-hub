import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { buildStatusCards } from "~/features/OptionsOverview/statusCards"

describe("overview status cards", () => {
  it("builds top-row cards with values, severity, and navigation targets", () => {
    expect(
      buildStatusCards({
        enabledAccountCount: 2,
        profileCount: 1,
        attentionCount: 3,
        todayRequests: 12,
      }),
    ).toEqual([
      {
        id: "accounts",
        value: "2",
        severity: "success",
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: undefined,
        },
      },
      {
        id: "profiles",
        value: "1",
        severity: "success",
        target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
      },
      {
        id: "todayUsage",
        value: "12",
        severity: "success",
        target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
      },
      {
        id: "attention",
        value: "3",
        severity: "warning",
      },
    ])
  })

  it("uses setup-oriented severities when counts are empty", () => {
    expect(
      buildStatusCards({
        enabledAccountCount: 0,
        profileCount: 0,
        attentionCount: 0,
        todayRequests: 0,
      }).map((card) => [card.id, card.value, card.severity]),
    ).toEqual([
      ["accounts", "0", "warning"],
      ["profiles", "0", "info"],
      ["todayUsage", "0", "info"],
      ["attention", "0", "success"],
    ])
  })
})
