import { describe, expect, it } from "vitest"

import {
  classifyAutoCheckinError,
  getCheckInMethodUnknownReason,
} from "~/services/checkin/autoCheckin/errors"

const withStatus = (statusCode: number) =>
  Object.assign(new Error(`Request failed with ${statusCode}`), { statusCode })

describe("auto-checkin error classification", () => {
  it.each([
    ["identity_mismatch", "identity_mismatch"],
    ["account_missing", "credential_persistence_failed"],
    ["write_failed", "credential_persistence_failed"],
  ])(
    "preserves Sub2API credential outcome %s in a selected probe",
    (status, expected) => {
      const error = Object.assign(new Error("credential update failed"), {
        result: { status },
      })
      expect(getCheckInMethodUnknownReason(error)).toBe(expected)
    },
  )

  it.each([
    [401, "authentication_required"],
    [403, "permission_denied"],
    [408, "timeout"],
    [500, "source_unavailable"],
  ] as const)("maps HTTP %s to %s", (statusCode, expected) => {
    const error = withStatus(statusCode)

    expect(classifyAutoCheckinError(error)).toBe(expected)
    expect(getCheckInMethodUnknownReason(error)).toBe(expected)
  })
})
