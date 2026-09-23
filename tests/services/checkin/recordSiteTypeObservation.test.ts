import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { recordSiteTypeObservationForResult } from "~/services/checkin/autoCheckin/recordSiteTypeObservation"
import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import {
  SITE_TYPE_MISMATCH_OUTCOMES,
  type SiteTypeCheck,
} from "~/services/siteDetection/siteTypeMismatch"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const { record, clear } = vi.hoisted(() => ({
  record: vi.fn(),
  clear: vi.fn(),
}))
vi.mock("~/services/siteDetection/siteTypeObservations", () => ({
  siteTypeObservations: { record, clear },
}))

const ACCOUNT = {
  id: "account-1",
  site_url: "https://stored.example.invalid",
  site_type: SITE_TYPES.NEW_API,
}

const RUN_BYPASS = createAutomaticProtectionBypassExecution(
  PROTECTION_BYPASS_FEATURES.Checkin,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
  TEMP_WINDOW_REQUEST_SOURCES.Background,
)

const buildSkippedResult = (
  reasonCode: AutoCheckinSkipReason,
): CheckinAccountResult => ({
  accountId: ACCOUNT.id,
  accountName: "Account",
  status: CHECKIN_RESULT_STATUS.SKIPPED,
  reasonCode,
  timestamp: 1,
})

const MISMATCH = {
  storedSiteType: SITE_TYPES.NEW_API,
  suggestedSiteType: SITE_TYPES.VELOERA,
}

const MISMATCH_CHECK: SiteTypeCheck = {
  outcome: SITE_TYPE_MISMATCH_OUTCOMES.Mismatch,
  mismatch: MISMATCH,
}

describe("recordSiteTypeObservationForResult", () => {
  it("records the type the site resolves to for a failure the stored type explains", async () => {
    const checkMismatch = vi.fn().mockResolvedValue(MISMATCH_CHECK)
    const result = buildSkippedResult(
      AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    )

    await recordSiteTypeObservationForResult(ACCOUNT, result, { checkMismatch })

    expect(checkMismatch).toHaveBeenCalledWith({
      siteUrl: ACCOUNT.site_url,
      storedSiteType: ACCOUNT.site_type,
    })
    expect(record).toHaveBeenCalledWith({
      accountId: ACCOUNT.id,
      mismatch: MISMATCH,
    })
    expect(clear).not.toHaveBeenCalled()
  })

  it("probes under the run's bypass context", async () => {
    const checkMismatch = vi.fn().mockResolvedValue(MISMATCH_CHECK)

    await recordSiteTypeObservationForResult(
      ACCOUNT,
      buildSkippedResult(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE),
      { checkMismatch, protectionBypassExecution: RUN_BYPASS },
    )

    expect(checkMismatch).toHaveBeenCalledWith({
      siteUrl: ACCOUNT.site_url,
      storedSiteType: ACCOUNT.site_type,
      protectionBypassExecution: RUN_BYPASS,
    })
  })

  it("retires the record once the site agrees with the stored type", async () => {
    const checkMismatch = vi
      .fn()
      .mockResolvedValue({ outcome: SITE_TYPE_MISMATCH_OUTCOMES.Agrees })

    await recordSiteTypeObservationForResult(
      ACCOUNT,
      buildSkippedResult(AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE),
      { checkMismatch },
    )

    expect(clear).toHaveBeenCalledWith(ACCOUNT.id)
    expect(record).not.toHaveBeenCalled()
  })

  it("keeps the record when the reading resolves to nothing", async () => {
    const checkMismatch = vi
      .fn()
      .mockResolvedValue({ outcome: SITE_TYPE_MISMATCH_OUTCOMES.Undetermined })

    await recordSiteTypeObservationForResult(
      ACCOUNT,
      buildSkippedResult(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE),
      { checkMismatch },
    )

    expect(record).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it("leaves failures with their own cause alone", async () => {
    const checkMismatch = vi.fn().mockResolvedValue(MISMATCH_CHECK)
    const result = buildSkippedResult(
      AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    )

    await recordSiteTypeObservationForResult(ACCOUNT, result, { checkMismatch })

    expect(checkMismatch).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it("does not probe a result that carries no skip reason", async () => {
    const checkMismatch = vi.fn().mockResolvedValue(MISMATCH_CHECK)
    const result: CheckinAccountResult = {
      accountId: ACCOUNT.id,
      accountName: "Account",
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      timestamp: 1,
    }

    await recordSiteTypeObservationForResult(ACCOUNT, result, { checkMismatch })

    expect(checkMismatch).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it("never fails the result when the probe breaks", async () => {
    const checkMismatch = vi.fn().mockRejectedValue(new Error("probe down"))

    await expect(
      recordSiteTypeObservationForResult(
        ACCOUNT,
        buildSkippedResult(AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER),
        { checkMismatch },
      ),
    ).resolves.toBeUndefined()
    expect(record).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })
})
