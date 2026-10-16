import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import {
  classifySiblingStatusDto,
  getCheckInFamilyDiscriminators,
  SIBLING_DTO_VERDICTS,
  SIBLING_STATUS_DTO_DISCRIMINATORS,
} from "~/services/apiService/sub2api/checkin/siblingStatusContracts"

const CLAWHUD_DTO = {
  enabled: true,
  checked_in_today: true,
  today_amount: 1.14,
  total_count: 1,
  total_amount: 1.14,
}
const FREE_API_DTO = {
  enabled: true,
  checked_in_today: false,
  min_amount: 1,
  max_amount: 999,
}
const GENIUS_DTO = {
  enabled: true,
  today_checked_in: false,
  recent_records: [],
}

describe("sibling status DTO discriminators", () => {
  it("declares exactly the methods sharing the user checkin status family", () => {
    expect(
      SIBLING_STATUS_DTO_DISCRIMINATORS.map((entry) => entry.methodId).sort(),
    ).toEqual([
      "clawhud:daily-checkin",
      "freeapi:daily-checkin",
      "genius-programmer:daily-checkin",
    ])
  })

  it("keeps every entry on the shared user checkin path family", () => {
    expect(
      new Set(getCheckInFamilyDiscriminators().map((entry) => entry.endpoint)),
    ).toEqual(new Set(["/api/v1/user/checkin", "/api/v1/user/checkin/status"]))
    expect(
      getCheckInFamilyDiscriminators(
        AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn,
      ),
    ).toHaveLength(1)
  })

  it.each([
    [
      AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn,
      FREE_API_DTO,
      SIBLING_DTO_VERDICTS.Own,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
      CLAWHUD_DTO,
      SIBLING_DTO_VERDICTS.Own,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
      GENIUS_DTO,
      SIBLING_DTO_VERDICTS.Own,
    ],
    // The Genius Programmer fork answers today_checked_in; the other two
    // deployments answer checked_in_today. Each side must read the other as a
    // contract served elsewhere, not as a malformed probe.
    [
      AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn,
      GENIUS_DTO,
      SIBLING_DTO_VERDICTS.Foreign,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
      GENIUS_DTO,
      SIBLING_DTO_VERDICTS.Foreign,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
      FREE_API_DTO,
      SIBLING_DTO_VERDICTS.Foreign,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
      CLAWHUD_DTO,
      SIBLING_DTO_VERDICTS.Foreign,
    ],
    // A payload that carries only the shared checked_in_today names matches
    // neither discriminating fingerprint, so it stays unknown: the table
    // cannot claim it belongs elsewhere.
    [
      AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn,
      { enabled: true, checked_in_today: false },
      SIBLING_DTO_VERDICTS.Unknown,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
      { enabled: true, checked_in_today: false },
      SIBLING_DTO_VERDICTS.Unknown,
    ],
  ] as const)("classifies %s against %j as %s", (methodId, data, verdict) => {
    expect(classifySiblingStatusDto(methodId, data)).toBe(verdict)
  })

  it.each([
    [AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn, { enabled: true }],
    [AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn, { checked_in_today: false }],
    [
      AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
      { enabled: "true", checked_in_today: false },
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
      { today_checked_in: false },
    ],
  ] as const)(
    "keeps an unrecognized %s payload unknown: %j",
    (methodId, data) => {
      expect(classifySiblingStatusDto(methodId, data)).toBe(
        SIBLING_DTO_VERDICTS.Unknown,
      )
    },
  )

  it("never classifies an unregistered method", () => {
    expect(
      classifySiblingStatusDto(
        AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
        FREE_API_DTO,
      ),
    ).toBe(SIBLING_DTO_VERDICTS.Unknown)
    expect(classifySiblingStatusDto(undefined, GENIUS_DTO)).toBe(
      SIBLING_DTO_VERDICTS.Unknown,
    )
  })

  it("requires a discriminator not to match its owner's sibling sample", () => {
    // The sample documents a payload the entry must NOT claim as its own; a
    // table entry that swallowed it would erase the distinction it exists for.
    for (const entry of getCheckInFamilyDiscriminators()) {
      expect(entry.ownDtoMatches(entry.siblingDtoSample)).toBe(false)
    }
  })
})
