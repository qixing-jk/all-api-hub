import { describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { refreshAutoCheckinAccountSnapshots } from "~/services/checkin/autoCheckin/accountSnapshot"
import { AuthTypeEnum } from "~/types"
import type { AutoCheckinAccountSnapshot } from "~/types/autoCheckin"
import {
  buildCheckInConfig,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

describe("current check-in readiness", () => {
  const account = buildSiteAccount({
    site_type: SITE_TYPES.NEW_API,
    checkIn: buildCheckInConfig({
      automaticExecutionEnabled: true,
      selection: {
        mode: "manual",
        methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      },
      methodKnowledge: {
        methods: {
          [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 1 },
            },
          },
        },
      },
    }),
  })
  const old: AutoCheckinAccountSnapshot = {
    accountId: account.id,
    accountName: "Old name",
    siteType: SITE_TYPES.NEW_API,
    detectionEnabled: false,
    autoCheckinEnabled: true,
    providerAvailable: false,
    skipReason: "no_selected_method",
    lastResult: {
      accountId: account.id,
      accountName: "Old name",
      status: "skipped",
      timestamp: 1,
      reasonCode: "no_selected_method",
    },
  }
  it("refreshes readiness after selecting a method without rewriting execution history", () => {
    const [updated] = refreshAutoCheckinAccountSnapshots([old], [account])
    expect(updated?.detectionEnabled).toBe(true)
    expect(updated?.providerAvailable).toBe(true)
    expect(updated?.skipReason).toBeUndefined()
    expect(updated?.lastResult).toEqual(old.lastResult)
    expect(old.detectionEnabled).toBe(false)
  })
  it.each([
    { accessToken: "test-token", providerAvailable: true },
    { accessToken: "", providerAvailable: false },
  ])(
    "keeps checked-today eligibility separate from credential readiness ($providerAvailable)",
    ({ accessToken, providerAvailable }) => {
      const checked = structuredClone(account)
      checked.authType = AuthTypeEnum.AccessToken
      checked.account_info.access_token = accessToken
      checked.checkIn.selection = {
        mode: "automatic",
        methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      }
      checked.checkIn.methodKnowledge.methods[
        AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
      ]!.status = {
        outcome: "known",
        availability: "enabled",
        today: "checked",
        evidence: { source: "probe", observedAt: Date.now() },
      }

      const [snapshot] = refreshAutoCheckinAccountSnapshots([old], [checked])

      expect(snapshot).toMatchObject({
        detectionEnabled: true,
        providerAvailable,
        isCheckedInToday: true,
        skipReason: "already_checked_today",
        lastResult: old.lastResult,
      })
    },
  )
  it("shows the latest disabled intent while keeping deleted-account history", () => {
    const [updated] = refreshAutoCheckinAccountSnapshots(
      [old],
      [
        {
          ...account,
          checkIn: { ...account.checkIn, automaticExecutionEnabled: false },
        },
      ],
    )
    expect(updated?.autoCheckinEnabled).toBe(false)
    expect(updated?.skipReason).toBe("auto_checkin_disabled")
    expect(refreshAutoCheckinAccountSnapshots([old], [])).toEqual([old])
  })

  it.each(["probe", "execution"] as const)(
    "lets the batch reconsider ChatflowsAI after its cached %s period ends",
    (source) => {
      const methodId = AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn
      const checked = structuredClone(account)
      checked.site_type = SITE_TYPES.SUB2API
      checked.authType = AuthTypeEnum.AccessToken
      checked.account_info.id = "42"
      checked.account_info.access_token = "example-token"
      checked.checkIn = buildCheckInConfig({
        automaticExecutionEnabled: true,
        selection: { mode: "automatic", methodId },
        methodKnowledge: {
          methods: {
            [methodId]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: 1 },
              },
              status: {
                outcome: "known",
                availability: "enabled",
                today: "checked",
                evidence: {
                  source,
                  observedAt: Date.parse("2026-11-24T03:59:00Z"),
                },
              },
            },
          },
        },
      })
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse("2026-11-24T03:59:30Z"))
      try {
        expect(
          refreshAutoCheckinAccountSnapshots([old], [checked])[0],
        ).toMatchObject({
          providerAvailable: true,
          skipReason: "already_checked_today",
          isCheckedInToday: true,
        })
        clock.mockReturnValue(Date.parse("2026-11-24T04:01:00Z"))
        const refreshed = refreshAutoCheckinAccountSnapshots(
          [old],
          [checked],
        )[0]
        expect(refreshed?.providerAvailable).toBe(true)
        expect(refreshed?.skipReason).toBeUndefined()
        expect(refreshed?.isCheckedInToday).toBeUndefined()
      } finally {
        clock.mockRestore()
      }
    },
  )
  it("keeps readiness blocked when global automatic execution is disabled", () => {
    const [updated] = refreshAutoCheckinAccountSnapshots(
      [old],
      [account],
      {},
      false,
    )
    expect(updated?.detectionEnabled).toBe(true)
    expect(updated?.skipReason).toBe("auto_checkin_disabled")
  })

  it.each([
    CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
    CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration,
  ])("projects known check-in status from %s evidence", (source) => {
    const checked = structuredClone(account)
    checked.checkIn.methodKnowledge.methods[
      AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
    ]!.status = {
      outcome: "known",
      today: "checked",
      evidence:
        source === "probe"
          ? { source, observedAt: Date.now() }
          : { source, legacyDayKey: "2026-10-05" },
    }
    const [snapshot] = refreshAutoCheckinAccountSnapshots([old], [checked])
    expect(snapshot?.isCheckedInToday).toBe(true)
    expect(snapshot?.lastCheckInDate).toBe(
      source === CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
        ? "2026-10-05"
        : undefined,
    )
    expect(snapshot?.lastResult).toEqual(old.lastResult)
  })
})
