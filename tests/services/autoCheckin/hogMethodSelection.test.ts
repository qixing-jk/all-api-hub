import { afterEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { getSiteCheckInDisplayState } from "~/features/AccountManagement/checkInStatus"
import { buildAutoCheckinAccountSnapshot } from "~/services/checkin/autoCheckin/accountSnapshot"
import {
  inspectCheckInMethods,
  mergeCheckInDiscoveryResults,
} from "~/services/checkin/autoCheckin/domain"
import {
  getCheckInMethodPresentationMetadata,
  getCheckInMethodStatusPeriodKey,
} from "~/services/checkin/autoCheckin/providers/registry"
import type { CheckInConfig, CheckInMethodStatus } from "~/types/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const ordinary = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
const hog = AUTO_CHECKIN_METHOD_IDS.HogDailyLottery
const known = (
  availability: "enabled" | "disabled",
  observedAt = Date.now(),
): Extract<CheckInMethodStatus, { outcome: "known" }> => ({
  outcome: "known",
  availability,
  today: "not_checked",
  evidence: { source: "probe", observedAt },
})
const config = (): CheckInConfig => ({
  automaticExecutionEnabled: true,
  selection: { mode: "automatic", methodId: ordinary },
  methodKnowledge: { methods: {} },
})
const matched = () => ({
  outcome: "matched" as const,
  evidence: { source: "probe" as const, observedAt: Date.now() },
})

describe("Hog method choice and period", () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ["enabled", "enabled", ordinary],
    ["disabled", "enabled", hog],
    ["disabled", undefined, hog],
    ["disabled", "disabled", ordinary],
  ] as const)(
    "chooses safely with standard=%s and lottery=%s",
    (standard, lottery, expected) => {
      const merged = mergeCheckInDiscoveryResults({
        config: config(),
        candidateMethodIds: [ordinary, hog],
        detections: { [ordinary]: matched(), [hog]: matched() },
        statuses: {
          [ordinary]: known(standard),
          ...(lottery ? { [hog]: known(lottery) } : {}),
        },
        completedAt: Date.now(),
      })
      expect(merged.selection).toMatchObject({ methodId: expected })
      expect(
        inspectCheckInMethods({
          config: merged,
          candidateMethodIds: [ordinary, hog],
        }).decision,
      ).toMatchObject({ outcome: "resolved", methodId: expected })
      // A public marker alone has never claimed that rewards are enabled.
      if (!lottery)
        expect(merged.methodKnowledge.methods[hog]?.status).toBeUndefined()
    },
  )
  it("does not replace an explicitly manual selection", () => {
    const current = config()
    current.selection = { mode: "manual", methodId: ordinary }
    const merged = mergeCheckInDiscoveryResults({
      config: current,
      candidateMethodIds: [ordinary, hog],
      detections: { [ordinary]: matched(), [hog]: matched() },
      statuses: { [ordinary]: known("disabled") },
      completedAt: Date.now(),
    })
    expect(merged.selection).toEqual(current.selection)
  })
  it("expires execution cache at Shanghai midnight while ordinary methods keep the caller day", () => {
    const before = Date.parse("2026-11-24T15:59:59Z")
    const after = Date.parse("2026-11-24T16:00:01Z")
    const current = config()
    current.selection = { mode: "automatic", methodId: hog }
    current.methodKnowledge.methods[hog] = {
      detection: matched(),
      status: {
        ...known("enabled", before),
        outcome: "known",
        today: "checked",
      },
    }
    expect(
      inspectCheckInMethods({
        config: current,
        candidateMethodIds: [hog],
        now: after,
        timeZone: "UTC",
      }).executionEligibility,
    ).toMatchObject({ eligible: true })
    current.selection = { mode: "automatic", methodId: ordinary }
    current.methodKnowledge.methods[ordinary] = {
      ...current.methodKnowledge.methods[hog]!,
      detection: matched(),
    }
    expect(
      inspectCheckInMethods({
        config: current,
        candidateMethodIds: [ordinary],
        now: after,
        timeZone: "UTC",
      }).executionEligibility,
    ).toMatchObject({ eligible: false, skipReason: "already_checked" })
    expect(getCheckInMethodStatusPeriodKey(ordinary, after)).toBeUndefined()
  })
  it("expires the snapshot and account-list status with the same protocol period", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T16:00:01Z"))
    const current = buildSiteAccount({
      site_url: "https://fapi.leileihog.top",
      site_type: SITE_TYPES.NEW_API,
      checkIn: {
        automaticExecutionEnabled: true,
        selection: { mode: "automatic", methodId: hog },
        methodKnowledge: {
          methods: {
            [hog]: {
              detection: matched(),
              status: {
                outcome: "known",
                availability: "enabled",
                today: "checked",
                evidence: {
                  source: "probe",
                  observedAt: Date.parse("2026-11-24T15:59:59Z"),
                },
              },
            },
          },
        },
      },
    })
    expect(
      buildAutoCheckinAccountSnapshot(current, "fixture").isCheckedInToday,
    ).toBeUndefined()
    expect(
      getSiteCheckInDisplayState({
        checkIn: current.checkIn,
        siteType: current.site_type,
        baseUrl: current.site_url,
      }),
    ).toMatchObject({ kind: "outdated" })
  })
  it("names the optional activity as a free daily draw", () => {
    expect(getCheckInMethodPresentationMetadata(hog)).toMatchObject({
      labelKey: "methods.freeDailyDraw.name",
      sourceName: "Hog API Gateway",
    })
  })
})
