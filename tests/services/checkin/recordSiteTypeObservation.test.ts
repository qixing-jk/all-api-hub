import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { recordSiteTypeObservationForResult } from "~/services/checkin/autoCheckin/recordSiteTypeObservation"
import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const { record } = vi.hoisted(() => ({ record: vi.fn() }))
vi.mock("~/services/siteDetection/siteTypeObservations", () => ({
  siteTypeObservations: { record },
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

describe("recordSiteTypeObservationForResult", () => {
  it("records the type the site resolves to for a failure the stored type explains", async () => {
    const resolveMismatch = vi.fn().mockResolvedValue(MISMATCH)
    const result = buildSkippedResult(
      AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    )

    await recordSiteTypeObservationForResult(ACCOUNT, result, {
      resolveMismatch,
    })

    expect(resolveMismatch).toHaveBeenCalledWith({
      siteUrl: ACCOUNT.site_url,
      storedSiteType: ACCOUNT.site_type,
    })
    expect(record).toHaveBeenCalledWith({
      accountId: ACCOUNT.id,
      mismatch: MISMATCH,
    })
  })

  it("probes under the run's bypass context", async () => {
    const resolveMismatch = vi.fn().mockResolvedValue(MISMATCH)

    await recordSiteTypeObservationForResult(
      ACCOUNT,
      buildSkippedResult(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE),
      { resolveMismatch, protectionBypassExecution: RUN_BYPASS },
    )

    expect(resolveMismatch).toHaveBeenCalledWith({
      siteUrl: ACCOUNT.site_url,
      storedSiteType: ACCOUNT.site_type,
      protectionBypassExecution: RUN_BYPASS,
    })
  })

  it("leaves failures with their own cause alone", async () => {
    const resolveMismatch = vi.fn().mockResolvedValue(MISMATCH)
    const result = buildSkippedResult(
      AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    )

    await recordSiteTypeObservationForResult(ACCOUNT, result, {
      resolveMismatch,
    })

    expect(resolveMismatch).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })

  it("does not probe a result that carries no skip reason", async () => {
    const resolveMismatch = vi.fn().mockResolvedValue(MISMATCH)
    const result: CheckinAccountResult = {
      accountId: ACCOUNT.id,
      accountName: "Account",
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      timestamp: 1,
    }

    await recordSiteTypeObservationForResult(ACCOUNT, result, {
      resolveMismatch,
    })

    expect(resolveMismatch).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })

  it("records nothing when the site still resolves to the stored type", async () => {
    const resolveMismatch = vi.fn().mockResolvedValue(null)

    await recordSiteTypeObservationForResult(
      ACCOUNT,
      buildSkippedResult(AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER),
      { resolveMismatch },
    )

    expect(record).not.toHaveBeenCalled()
  })

  it("never fails the result when the probe breaks", async () => {
    const resolveMismatch = vi.fn().mockRejectedValue(new Error("probe down"))

    await expect(
      recordSiteTypeObservationForResult(
        ACCOUNT,
        buildSkippedResult(AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER),
        { resolveMismatch },
      ),
    ).resolves.toBeUndefined()
    expect(record).not.toHaveBeenCalled()
  })
})
