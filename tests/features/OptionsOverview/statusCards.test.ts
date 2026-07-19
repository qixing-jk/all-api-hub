import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { buildStatusCards } from "~/features/OptionsOverview/statusCards"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"

const completeRequestCoverage = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
  completeCount: 2,
  partialCount: 0,
  eligibleCount: 2,
  legacyUnclassifiedCount: 0,
} as const

describe("overview status cards", () => {
  it("builds top-row cards with values, severity, and navigation targets", () => {
    expect(
      buildStatusCards({
        enabledAccountCount: 2,
        profileCount: 1,
        attentionCount: 3,
        todayRequests: 12,
        todayRequestsCoverage: completeRequestCoverage,
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
        coverage: completeRequestCoverage,
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
        todayRequestsCoverage: completeRequestCoverage,
      }).map((card) => [card.id, card.value, card.severity]),
    ).toEqual([
      ["accounts", "0", "warning"],
      ["profiles", "0", "info"],
      ["todayUsage", "0", "info"],
      ["attention", "0", "success"],
    ])
  })

  it("preserves partial request coverage and does not turn unavailable requests into zero", () => {
    const partialCoverage = {
      ...completeRequestCoverage,
      status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
      completeCount: 1,
      partialCount: 1,
    } as const
    const unavailableCoverage = {
      ...completeRequestCoverage,
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      completeCount: 0,
    } as const

    expect(
      buildStatusCards({
        enabledAccountCount: 1,
        profileCount: 0,
        attentionCount: 0,
        todayRequests: 5,
        todayRequestsCoverage: partialCoverage,
      }).find((card) => card.id === "todayUsage"),
    ).toMatchObject({ value: "5", coverage: partialCoverage })

    expect(
      buildStatusCards({
        enabledAccountCount: 1,
        profileCount: 0,
        attentionCount: 0,
        todayRequests: 999,
        todayRequestsCoverage: unavailableCoverage,
      }).find((card) => card.id === "todayUsage"),
    ).toMatchObject({ value: "—", coverage: unavailableCoverage })
  })
})
