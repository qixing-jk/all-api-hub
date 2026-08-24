import { describe, expect, it } from "vitest"

import {
  classifyAutoCheckinError,
  getCheckInMethodUnknownReason,
} from "~/services/checkin/autoCheckin/errors"

const withStatus = (statusCode: number) =>
  Object.assign(new Error(`Request failed with ${statusCode}`), { statusCode })

describe("auto-checkin error classification", () => {
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
