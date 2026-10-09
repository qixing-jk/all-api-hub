import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { inspectCheckInMutationAdmission } from "~/services/checkin/autoCheckin/execution/checkInMutationAdmission"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("check-in mutation admission", () => {
  it("rejects a captured provider after another supported method is selected", async () => {
    const captured = "denxio:daily-checkin"
    const selected = "sub2api-pro:daily-checkin"
    const expectedAccount = buildSiteAccount({
      site_type: SITE_TYPES.SUB2API,
      checkIn: {
        automaticExecutionEnabled: true,
        selection: { mode: "manual", methodId: captured },
        methodKnowledge: {
          methods: {
            [captured]: {
              detection: {
                outcome: "matched",
                evidence: { source: "compatibility_registration" },
              },
            },
            [selected]: {
              detection: {
                outcome: "matched",
                evidence: { source: "compatibility_registration" },
              },
            },
          },
        },
      },
    })
    const registration = autoCheckinMethodRegistry.resolveById(captured)
    if (!registration) throw new Error("Expected Denxio provider registration")
    const getReadiness = vi.fn(() => ({ ready: true as const }))
    const account: typeof expectedAccount = {
      ...expectedAccount,
      checkIn: {
        ...expectedAccount.checkIn,
        selection: { mode: "manual", methodId: selected },
      },
    }
    await expect(
      inspectCheckInMutationAdmission({
        expectedAccount,
        account,
        registration: {
          ...registration,
          provider: { ...registration.provider, getReadiness },
        },
        globalAutomaticExecutionEnabled: true,
      }),
    ).resolves.toEqual({ eligible: false, reason: "method_not_matched" })
    expect(getReadiness).not.toHaveBeenCalled()
  })
})
